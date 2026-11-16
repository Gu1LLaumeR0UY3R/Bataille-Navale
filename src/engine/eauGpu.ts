// Surface de l'eau calculée par le GPU.
//
// Avant, le processeur recalculait à chaque image la hauteur de ~8 000 points d'eau (houle, écume, impacts, normales)
// puis renvoyait trois ou quatre tampons au GPU, pour chaque grille : c'est ce qui rendait les vagues saccadées.
// Ici le maillage est fixe ; un shader (WGSL) déplace chaque point, recalcule sa normale, éclaire l'eau et dessine
// l'écume des crêtes. Le processeur ne fait plus que deux choses : donner l'heure et la liste des impacts en cours.
//
// La houle et la déformation des impacts reprennent EXACTEMENT les formules de vagues.ts et d'effets.ts
// (hauteurVague, hauteurImpacts) : les navires, marqueurs et feuilles d'écume, calculés sur le processeur,
// restent posés sur la même surface. Si l'une de ces formules change, il faut modifier l'autre.

import { createShaderMaterial, setShaderTexture, setShaderUniform, type ShaderMaterial, type ShaderUniformOption, type Texture2D } from '@babylonjs/lite'
import { amplitudeHoule, COMPOSANTES_HOULE } from './vagues.ts'

export type Couleur3 = [number, number, number]

export interface OptionsEauGpu {
    couleur: Couleur3
    /** Opacité de la surface (0,34 pour une eau translucide). */
    opacite: number
    agitation: number
    /** Hauteur moyenne de l'eau (y). */
    niveau: number
    /** Largeur du bloc d'eau (monde) : sert à placer la texture d'écume. */
    taille: number
    /** Lumières de la carte, pour éclairer l'eau comme le reste de la scène. */
    lumiere: {
        ciel: { couleur: Couleur3, intensite: number }
        soleil: { direction: Couleur3, couleur: Couleur3, intensite: number } | null
    }
    /** Texture de dentelle d'écume (blanc sur transparent), si disponible. */
    textureEcume: Texture2D | null
}

/** Impact en cours, tel que le fournit effets.ts. */
export interface ImpactGpu {
    x: number
    z: number
    age: number
    force: number
}

export const IMPACTS_GPU_MAX = 6
/** Nombre de fois que la texture d'écume se répète sur la surface de l'eau (plus grand = motif plus fin). */
const REPETITION_ECUME = 3.2

const f = (valeur: number): string => {
    const texte = valeur.toFixed(7)
    return texte
}

// --- WGSL : houle (identique à hauteurVague) --------------------------------------------------------------------
function wgslHoule(): string {
    const termes = COMPOSANTES_HOULE.map((onde, i) => `
    {
        let s = sin(${f(onde.kx)} * gx + ${f(onde.kz)} * gz - ${f(onde.omega)} * t + ${f(onde.phase)});
        let u = (1.0 + s) * 0.5;
        let forme = s * (1.0 - pointu) + pointu * 2.0 * (u * u - 0.375);
        let rafale = 0.8 + 0.2 * sin(0.11 * t * ${f(i + 1.7)} + ${f(i * 2.1)});
        h = h + ${f(onde.amplitude)} * rafale * forme;
    }`).join('')
    return `
fn houle(x: f32, z: f32, t: f32) -> f32 {
    let agit = shaderUniforms.params.x;
    let amplitude = shaderUniforms.params.y;
    let deformation = 0.4 + 1.1 * agit;
    let gx = x + deformation * sin(0.37 * z + 0.21 * t);
    let gz = z + deformation * sin(0.31 * x - 0.17 * t);
    let pointu = 0.35 + 0.65 * agit;
    var h = 0.0;
    ${termes}
    return amplitude * h;
}`
}

// --- WGSL : impacts (identique à hauteurImpacts) ----------------------------------------------------------------
const WGSL_IMPACT = `
fn impactHauteur(x: f32, z: f32, imp: vec4<f32>) -> f32 {
    let force = imp.w;
    if (force <= 0.0) { return 0.0; }
    let r = length(vec2<f32>(x - imp.x, z - imp.y));
    let a = imp.z;
    let cratere = -0.2 * exp(-(r * r) / 0.07) * exp(-a / 0.2);
    let rayonCouronne = 0.22 + 0.95 * pow(max(a, 0.0), 0.65);
    let largeurCouronne = 0.12 + 0.1 * a;
    let ecart = (r - rayonCouronne) / largeurCouronne;
    let couronne = 0.2 * exp(-a / 0.45) * exp(-ecart * ecart);
    let phaseColonne = clamp((a - 0.1) / 0.55, 0.0, 1.0);
    let colonne = 0.34 * sin(3.14159265 * phaseColonne) * exp(-(r * r) / 0.05);
    let devant = r - (1.5 * a + 0.35);
    var enveloppe = 1.0;
    if (devant > 0.0) { enveloppe = exp(-(devant * devant) / 0.06); }
    let ondes = 0.07 * exp(-a / 1.1) * exp(-r / 1.3) * cos(7.0 * (r - 1.5 * a)) * enveloppe;
    return force * (cratere + couronne + colonne + ondes);
}
fn impactsTotal(x: f32, z: f32) -> f32 {
    return impactHauteur(x, z, shaderUniforms.impact0) + impactHauteur(x, z, shaderUniforms.impact1)
        + impactHauteur(x, z, shaderUniforms.impact2) + impactHauteur(x, z, shaderUniforms.impact3)
        + impactHauteur(x, z, shaderUniforms.impact4) + impactHauteur(x, z, shaderUniforms.impact5);
}`

/** Sources WGSL de l'eau (sans le prélude que BabylonLite ajoute : VertexInput, shaderSystem, shaderUniforms). */
export function sourcesEauGpu(avecTextureEcume: boolean): { sommet: string, fragment: string, fonctions: string } {
    const fonctions = `${wgslHoule()}${WGSL_IMPACT}
fn hauteurTotale(x: f32, z: f32, t: f32) -> f32 {
    return houle(x, z, t) + impactsTotal(x, z);
}
fn lisse(v: f32) -> f32 {
    let t = clamp(v, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}`
    const structure = `struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vMonde: vec3<f32>,
    @location(1) vNormale: vec3<f32>,
    @location(2) vHoule: f32,
};`
    const sommet = `${fonctions}
${structure}
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let t = shaderUniforms.params.z;
    let x = input.position.x;
    let z = input.position.z;
    let h = hauteurTotale(x, z, t);
    // Normale par différences finies sur la hauteur.
    let e = 0.06;
    let hx = (hauteurTotale(x + e, z, t) - hauteurTotale(x - e, z, t)) / (2.0 * e);
    let hz = (hauteurTotale(x, z + e, t) - hauteurTotale(x, z - e, t)) / (2.0 * e);
    let n = normalize(vec3<f32>(-hx, 1.0, -hz));
    let pos = vec3<f32>(x, shaderUniforms.params.w + h, z);
    out.position = shaderSystem.projection * (shaderSystem.view * (shaderSystem.world * vec4<f32>(pos, 1.0)));
    out.vMonde = pos;
    out.vNormale = n;
    out.vHoule = houle(x, z, t);
    return out;
}`
    const echantillon = avecTextureEcume
        ? `let dentelleTex = textureSampleGrad(ecume, ecumeSampler, fract(uvEcume), duvx, duvy).a;`
        : `let dentelleTex = 1.0;`
    const fragment = `${fonctions}
${structure}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let t = shaderUniforms.params.z;
    let agit = shaderUniforms.params.x;
    // Coordonnées de la texture d'écume : elles dérivent lentement ; les dérivées sont prises AVANT fract()
    // pour que la texture ne montre pas de couture entre deux répétitions.
    let demi = shaderUniforms.mousse.w * 0.5;
    let uvEcume = (input.vMonde.xz + vec2<f32>(demi, demi)) / shaderUniforms.mousse.w * ${f(REPETITION_ECUME)} + vec2<f32>(t * 0.012, t * 0.007);
    let duvx = dpdx(uvEcume);
    let duvy = dpdy(uvEcume);
    ${echantillon}

    let n = normalize(input.vNormale);
    let versOeil = normalize(shaderSystem.cameraPosition - input.vMonde);
    let versSoleil = -normalize(shaderUniforms.soleilDir.xyz);
    let eclairementSoleil = max(dot(n, versSoleil), 0.0);
    // Éclairage : lumière du ciel (hémisphérique) + soleil, comme dans le reste de la scène.
    let ciel = shaderUniforms.ambiant.rgb * (0.5 + 0.5 * n.y);
    let lumiere = ciel + shaderUniforms.soleilCouleur.rgb * eclairementSoleil;
    var rgb = shaderUniforms.couleur.rgb * (lumiere + 0.25);
    let demiVecteur = normalize(versSoleil + versOeil);
    rgb = rgb + shaderUniforms.soleilCouleur.rgb * pow(max(dot(n, demiVecteur), 0.0), 60.0) * 0.18;
    var alpha = shaderUniforms.couleur.a;

    // Écume des crêtes : là où la houle dépasse un seuil de hauteur, avec des trous irréguliers.
    let intensite = lisse((agit - 0.1) / 0.45);
    let relative = input.vHoule / shaderUniforms.params.y;
    let seuil = 0.58 - 0.3 * agit;
    let crete = lisse((relative - seuil) / 0.38);
    let x = input.vMonde.x;
    let z = input.vMonde.z;
    let dentelle = 0.78 + 0.22 * sin(2.3 * x + 1.1 * t + sin(1.3 * z)) * sin(1.9 * z - 0.9 * t + sin(1.1 * x));
    let masque = clamp(crete * crete * dentelle * intensite * 3.4, 0.0, 1.0);
    let voile = masque * 0.3;
    let ecume = clamp(masque * 1.4, 0.0, 1.0) * dentelleTex * 0.9;
    let blanc = vec3<f32>(0.92, 0.97, 1.0) * (0.72 + 0.28 * eclairementSoleil);
    let part = clamp(voile + ecume, 0.0, 1.0);
    rgb = mix(rgb, blanc, part);
    alpha = mix(alpha, 0.92, clamp(ecume + voile * 0.8, 0.0, 1.0));
    return vec4<f32>(rgb, alpha);
}`
    return { sommet, fragment, fonctions }
}

/** Les uniforms du shader : décrits une seule fois, utilisés pour créer le matériau et par le test de validation. */
export function uniformsEauGpu(options: OptionsEauGpu): ShaderUniformOption[] {
    const soleil = options.lumiere.soleil
    const ciel = options.lumiere.ciel
    const impactNul = [0, 0, 0, 0]
    return [
        'world', 'view', 'projection', 'cameraPosition',
        { name: 'params', type: 'vec4<f32>' as const, defaultValue: [options.agitation, amplitudeHoule(options.agitation), 0, options.niveau] },
        { name: 'couleur', type: 'vec4<f32>' as const, defaultValue: [...options.couleur, options.opacite] },
        { name: 'soleilDir', type: 'vec4<f32>' as const, defaultValue: [...(soleil?.direction ?? [0, -1, 0]), 0] },
        { name: 'soleilCouleur', type: 'vec4<f32>' as const, defaultValue: soleil ? [soleil.couleur[0] * soleil.intensite, soleil.couleur[1] * soleil.intensite, soleil.couleur[2] * soleil.intensite, 0] : [0, 0, 0, 0] },
        { name: 'ambiant', type: 'vec4<f32>' as const, defaultValue: [ciel.couleur[0] * ciel.intensite, ciel.couleur[1] * ciel.intensite, ciel.couleur[2] * ciel.intensite, 0] },
        { name: 'mousse', type: 'vec4<f32>' as const, defaultValue: [0, 0, 0, options.taille] },
        ...Array.from({ length: IMPACTS_GPU_MAX }, (_, i) => ({ name: `impact${i}`, type: 'vec4<f32>' as const, defaultValue: impactNul })),
    ]
}

export interface EauGpu {
    materiau: ShaderMaterial
    /** À appeler à chaque image : donne l'heure et les impacts en cours au shader. */
    mettreAJour(temps: number, impacts: readonly ImpactGpu[]): void
}

export function creerMateriauEauGpu(options: OptionsEauGpu): EauGpu {
    const avecTexture = options.textureEcume !== null
    const { sommet, fragment } = sourcesEauGpu(avecTexture)
    const materiau = createShaderMaterial({
        name: 'eau_gpu',
        vertexSource: sommet,
        fragmentSource: fragment,
        attributes: ['position', 'normal', 'uv'],
        uniforms: uniformsEauGpu(options),
        samplers: avecTexture ? ['ecume'] : [],
        needAlphaBlending: true,
        blendMode: 'alpha',
        backFaceCulling: false,
    })
    if (options.textureEcume) setShaderTexture(materiau, 'ecume', options.textureEcume)
    const parametres = [options.agitation, amplitudeHoule(options.agitation), 0, options.niveau]
    const tampon = new Float32Array(4)
    return {
        materiau,
        mettreAJour(temps, impacts) {
            parametres[2] = temps
            setShaderUniform(materiau, 'params', parametres)
            for (let i = 0; i < IMPACTS_GPU_MAX; i++) {
                const impact = impacts[i]
                if (impact) {
                    tampon[0] = impact.x
                    tampon[1] = impact.z
                    tampon[2] = impact.age
                    tampon[3] = impact.force
                } else {
                    tampon.fill(0)
                }
                setShaderUniform(materiau, `impact${i}`, tampon)
            }
        },
    }
}
