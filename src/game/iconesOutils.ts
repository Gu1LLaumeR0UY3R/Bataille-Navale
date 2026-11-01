// Pictogrammes de secours des outils (tracés SVG 24 × 24, au trait), utilisés tant que l'image d'aperçu
// de l'outil n'existe pas. Décoratifs : le nom de l'outil est toujours écrit à côté.
import type { IdentifiantOutil } from './outils.ts'

export const ICONES_OUTILS: Record<IdentifiantOutil, string[]> = {
    sonar: [
        'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
        'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10',
        'M12 12l6-5',
    ],
    brouilleur: [
        'M12 20V11', 'M8 20h8',
        'M12 7.6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8',
        'M7.6 6.6a6 6 0 0 0 0 6.8', 'M16.4 6.6a6 6 0 0 1 0 6.8',
        'M4.6 4.2a10 10 0 0 0 0 11.6', 'M19.4 4.2a10 10 0 0 1 0 11.6',
    ],
    bouee: [
        'M12 3v4', 'M8 8h8l1.5 9h-11z', 'M7.2 12.5h9.6',
        'M3 20.5c2.2-1.6 3.8-1.6 6 0s3.8 1.6 6 0 3.8-1.6 6 0',
    ],
    drone: [
        'M10 11h4v3h-4z',
        'M10 11L6.5 7.5', 'M14 11l3.5-3.5', 'M10 14l-3.5 3.5', 'M14 14l3.5 3.5',
        'M3.5 6.5h6', 'M14.5 6.5h6', 'M3.5 18h6', 'M14.5 18h6',
    ],
}
