// Porte de Tela Planner/src/selectScroll.js (sem mudança de comportamento).
export function preservePanelScroll(
  panel: { scrollTop: number } | null | undefined,
  fallbackScrollTop: number,
  onChange: () => void,
  schedule: (callback: () => void) => void,
): number {
  const scrollTop = panel?.scrollTop ?? fallbackScrollTop
  onChange()
  schedule(() => {
    if (panel) panel.scrollTop = scrollTop
  })
  return scrollTop
}
