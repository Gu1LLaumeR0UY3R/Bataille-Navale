// Vérification sans GPU : pour chaque case, on projette son centre à l'écran,
// puis on relance la détection de case depuis ce pixel. On doit retrouver la même case.
//   pnpm check:picking

import {
    createArcRotateCamera,
    enableOrthographicCamera,
    getEffectiveAspectRatio,
    getViewMatrix,
    getViewProjectionMatrix,
    projectWorldToScreen,
    resolveCameraViewport,
} from '@babylonjs/lite'
import { caseVersMonde } from '../src/engine/boardGeometry.ts'
import { ecranVersCase } from '../src/engine/cellPicking.ts'
import { TAILLE_GRILLE } from '../src/game/types.ts'

const target = { x: 0, y: 0, z: 0 }
const cameras = {
    'inclinée (perspective)': createArcRotateCamera(-Math.PI / 2, 1.0, 16, target),
    'dessus (orthographique)': (() => {
        const c = createArcRotateCamera(-Math.PI / 2, 0.0001, 20, target)
        enableOrthographicCamera(c, { halfHeight: 5.5 })
        return c
    })(),
}

let failures = 0
for (const [name, camera] of Object.entries(cameras)) {
    for (const [w, h] of [[600, 600], [900, 500]] as const) {
        const view = getViewMatrix(camera)
        const vp = getViewProjectionMatrix(camera, getEffectiveAspectRatio(camera, w, h))
        const options = { viewport: resolveCameraViewport(camera, w, h), backingWidth: w, backingHeight: h, cssWidth: w, cssHeight: h }
        let bad = 0
        for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
            for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
                const position = caseVersMonde({ colonne, ligne })
                const point = projectWorldToScreen({ x: position.x, y: 0, z: position.z }, view, vp, options)
                const caseTrouvee = ecranVersCase(camera, point.cssX, point.cssY, w, h)
                if (!caseTrouvee || caseTrouvee.colonne !== colonne || caseTrouvee.ligne !== ligne) bad++
            }
        }
        failures += bad
        console.log(`${bad === 0 ? 'OK ' : 'KO '} ${name}, canvas ${w}x${h} : ${TAILLE_GRILLE * TAILLE_GRILLE - bad}/${TAILLE_GRILLE * TAILLE_GRILLE} cases retrouvées`)
    }
}

// Repère d'orientation : la case (0,0) doit être en haut à gauche de l'écran.
{
    const camera = cameras['inclinée (perspective)']
    const view = getViewMatrix(camera)
    const vp = getViewProjectionMatrix(camera, 1)
    const options = { viewport: resolveCameraViewport(camera, 600, 600), backingWidth: 600, backingHeight: 600, cssWidth: 600, cssHeight: 600 }
    const position = caseVersMonde({ colonne: 0, ligne: 0 })
    const point = projectWorldToScreen({ x: position.x, y: 0, z: position.z }, view, vp, options)
    const ok = point.cssX < 300 && point.cssY < 300
    if (!ok) failures++
    console.log(`${ok ? 'OK ' : 'KO '} la case (0,0) est à l'écran en (${point.cssX.toFixed(0)}, ${point.cssY.toFixed(0)}) : haut-gauche attendu`)
}

if (failures > 0) throw new Error(`${failures} vérification(s) en échec`)
