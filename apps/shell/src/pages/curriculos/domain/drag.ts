export const DRAG_THRESHOLD = 6

/** Clique vira arrasto só depois de 6 px, para não roubar o clique que abre o card. */
export const passedThreshold = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_THRESHOLD

/** Etapa de destino; null quando soltou fora de coluna ou na própria coluna. */
export const resolveDrop = (from: number, target: number | null) => (target == null || target === from ? null : target)

/** Deslocamento inicial do FLIP: de onde o card foi solto até a posição nova. */
export const settleDelta = (from: { left: number; top: number }, to: { left: number; top: number }) => ({ x: from.left - to.left, y: from.top - to.top })
