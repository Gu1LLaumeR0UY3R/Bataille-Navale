// Fabrique public/modeles/ocean-anime.glb à partir de l'océan statique « Ocean » de Poly by Google.
// Ajoute au fichier des « morph targets » (formes de vagues) et une animation qui les fait glisser
// en boucle : l'animation vit DANS le .glb, aucun code d'animation à écrire dans le jeu.
//
//   pnpm generer:ocean
//
// Principe : une vague qui avance s'écrit sin(k·p + θ) = sin(k·p)·cos θ + cos(k·p)·sin θ.
// Deux formes fixes (sin et cos) dont les poids valent cos θ et sin θ donnent donc une vague
// qui se déplace quand θ croît. Deux trains de vagues → quatre formes.
import { readFileSync, writeFileSync } from 'node:fs';
const [entree, sortie] = process.argv.slice(2);
if (!entree || !sortie)
    throw new Error('Usage : generer-ocean-anime.ts <source.glb> <sortie.glb>');
// --- Réglages des vagues (unités du fichier source : l'océan fait environ 2000 de large) ---
const TRAINS = [
    { longueurOnde: 520, amplitude: 28, direction: [1, 0.4] },
    { longueurOnde: 340, amplitude: 16, direction: [-0.3, 1] },
];
const DUREE_BOUCLE = 6; // secondes ; la boucle est parfaite car les deux trains font un tour complet
const IMAGES_PAR_BOUCLE = 24;
// --- Lecture du .glb source ---
const source = readFileSync(entree);
const longueurJson = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + longueurJson).toString('utf8'));
const debutBin = 20 + longueurJson + 8;
const bin = source.subarray(debutBin);
function lire(indexAccesseur, composantes, type) {
    const acc = json.accessors[indexAccesseur];
    const vue = json.bufferViews[acc.bufferView];
    const decalage = (vue.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const n = acc.count * composantes;
    const sortieTab = type === 'f32' ? new Float32Array(n) : type === 'u16' ? new Uint16Array(n) : new Uint32Array(n);
    const taille = type === 'u16' ? 2 : 4;
    for (let i = 0; i < n; i++) {
        const o = decalage + i * taille;
        sortieTab[i] = type === 'f32' ? bin.readFloatLE(o) : type === 'u16' ? bin.readUInt16LE(o) : bin.readUInt32LE(o);
    }
    return sortieTab;
}
const primitive = json.meshes[0].primitives[0];
const positions = lire(primitive.attributes.POSITION, 3, 'f32');
const uv = lire(primitive.attributes.TEXCOORD_0, 2, 'f32');
const accIndices = json.accessors[primitive.indices];
const indices = lire(primitive.indices, 1, accIndices.componentType === 5123 ? 'u16' : 'u32');
const nbSommets = positions.length / 3;
// --- Normales (moyenne des faces voisines) ---
function calculerNormales(pos) {
    const normales = new Float32Array(pos.length);
    for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
        const u = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]);
        const v = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        for (const s of [a, b, c])
            for (let k = 0; k < 3; k++)
                normales[s * 3 + k] += n[k];
    }
    for (let s = 0; s < nbSommets; s++) {
        const l = Math.hypot(normales[s * 3], normales[s * 3 + 1], normales[s * 3 + 2]) || 1;
        for (let k = 0; k < 3; k++)
            normales[s * 3 + k] /= l;
    }
    return normales;
}
const normalesBase = calculerNormales(positions);
// Une surface vue du dessus doit avoir une normale vers le haut (+y) : on corrige l'orientation si besoin.
const moyenneY = normalesBase.reduce((somme, valeur, i) => (i % 3 === 1 ? somme + valeur : somme), 0) / nbSommets;
if (moyenneY < 0) {
    for (let i = 0; i < normalesBase.length; i++)
        normalesBase[i] *= -1;
    console.warn('Normales retournées (sens des faces du fichier source inversé).');
}
const signeNormales = moyenneY < 0 ? -1 : 1;
const cibles = [];
for (const train of TRAINS) {
    const k = (2 * Math.PI) / train.longueurOnde;
    const norme = Math.hypot(train.direction[0], train.direction[1]);
    const kx = (k * train.direction[0]) / norme;
    const kz = (k * train.direction[1]) / norme;
    for (const fonction of [Math.sin, Math.cos]) {
        const deltaPos = new Float32Array(positions.length);
        const deplacee = new Float32Array(positions);
        for (let s = 0; s < nbSommets; s++) {
            const dy = train.amplitude * fonction(kx * positions[s * 3] + kz * positions[s * 3 + 2]);
            deltaPos[s * 3 + 1] = dy;
            deplacee[s * 3 + 1] += dy;
        }
        const normalesDeplacees = calculerNormales(deplacee);
        const deltaNor = new Float32Array(positions.length);
        for (let i = 0; i < deltaNor.length; i++)
            deltaNor[i] = signeNormales * normalesDeplacees[i] - normalesBase[i];
        cibles.push({ deltaPos, deltaNor });
    }
}
// --- Animation des poids : (cos θ, sin θ) pour chaque train ---
const temps = new Float32Array(IMAGES_PAR_BOUCLE + 1);
const poids = new Float32Array((IMAGES_PAR_BOUCLE + 1) * cibles.length);
for (let image = 0; image <= IMAGES_PAR_BOUCLE; image++) {
    const t = (image / IMAGES_PAR_BOUCLE) * DUREE_BOUCLE;
    temps[image] = t;
    const theta = (2 * Math.PI * t) / DUREE_BOUCLE;
    TRAINS.forEach((_, train) => {
        poids[image * cibles.length + train * 2] = Math.cos(theta);
        poids[image * cibles.length + train * 2 + 1] = Math.sin(theta);
    });
}
// --- Assemblage du nouveau .glb ---
const morceaux = [];
const vues = [];
const accesseurs = [];
let octets = 0;
function ajouter(donnees, composante, type, cible, limites = false) {
    const tampon = Buffer.from(donnees.buffer, donnees.byteOffset, donnees.byteLength);
    const rempli = Buffer.concat([tampon, Buffer.alloc((4 - (tampon.length % 4)) % 4)]);
    vues.push({ buffer: 0, byteOffset: octets, byteLength: tampon.length, ...(cible ? { target: cible } : {}) });
    const nb = donnees.length / { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    const acc = { bufferView: vues.length - 1, componentType: composante, count: nb, type };
    if (limites) {
        const c = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
        const min = Array(c).fill(Infinity), max = Array(c).fill(-Infinity);
        for (let i = 0; i < donnees.length; i++) {
            min[i % c] = Math.min(min[i % c], donnees[i]);
            max[i % c] = Math.max(max[i % c], donnees[i]);
        }
        acc.min = min;
        acc.max = max;
    }
    accesseurs.push(acc);
    morceaux.push(rempli);
    octets += rempli.length;
    return accesseurs.length - 1;
}
const F32 = 5126, U16 = 5123, U32 = 5125;
const accPos = ajouter(positions, F32, 'VEC3', 34962, true);
const accNor = ajouter(normalesBase, F32, 'VEC3', 34962);
const accUv = ajouter(uv, F32, 'VEC2', 34962);
const accIdx = ajouter(indices, accIndices.componentType === 5123 ? U16 : U32, 'SCALAR', 34963);
const cibleAcc = cibles.map((c) => ({
    POSITION: ajouter(c.deltaPos, F32, 'VEC3', 34962, true),
    NORMAL: ajouter(c.deltaNor, F32, 'VEC3', 34962),
}));
const accTemps = ajouter(temps, F32, 'SCALAR', undefined, true);
const accPoids = ajouter(poids, F32, 'SCALAR', undefined);
const nouveauJson = {
    asset: { version: '2.0', generator: 'generer-ocean-anime.ts (morph targets ajoutés à l’océan de Poly by Google)' },
    scene: json.scene ?? 0,
    scenes: json.scenes,
    nodes: json.nodes,
    materials: json.materials,
    meshes: [{
            name: json.meshes[0].name ?? 'ocean',
            primitives: [{
                    attributes: { POSITION: accPos, NORMAL: accNor, TEXCOORD_0: accUv },
                    indices: accIdx,
                    material: primitive.material ?? 0,
                    mode: 4,
                    targets: cibleAcc,
                }],
            weights: cibles.map(() => 0),
        }],
    animations: [{
            name: 'vagues',
            samplers: [{ input: accTemps, output: accPoids, interpolation: 'LINEAR' }],
            channels: [{ sampler: 0, target: { node: json.nodes.findIndex((n) => n.mesh === 0), path: 'weights' } }],
        }],
    accessors: accesseurs,
    bufferViews: vues,
    buffers: [{ byteLength: octets }],
};
const jsonBuf = Buffer.from(JSON.stringify(nouveauJson), 'utf8');
const jsonRempli = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const binRempli = Buffer.concat(morceaux);
const entete = Buffer.alloc(12);
entete.write('glTF', 0, 'ascii');
entete.writeUInt32LE(2, 4);
entete.writeUInt32LE(12 + 8 + jsonRempli.length + 8 + binRempli.length, 8);
const enteteJson = Buffer.alloc(8);
enteteJson.writeUInt32LE(jsonRempli.length, 0);
enteteJson.write('JSON', 4, 'ascii');
const enteteBin = Buffer.alloc(8);
enteteBin.writeUInt32LE(binRempli.length, 0);
enteteBin.write('BIN\0', 4, 'latin1');
writeFileSync(sortie, Buffer.concat([entete, enteteJson, jsonRempli, enteteBin, binRempli]));
console.log(`OK : ${sortie} (${nbSommets} sommets, ${cibles.length} formes de vagues, boucle de ${DUREE_BOUCLE} s)`);
