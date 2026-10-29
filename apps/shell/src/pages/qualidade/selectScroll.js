export function preservePanelScroll(
  panel,
  fallbackScrollTop,
  onChange,
  schedule,
) {
  const scrollTop = panel?.scrollTop ?? fallbackScrollTop;
  onChange();
  schedule(() => {
    if (panel) panel.scrollTop = scrollTop;
  });
  return scrollTop;
}
