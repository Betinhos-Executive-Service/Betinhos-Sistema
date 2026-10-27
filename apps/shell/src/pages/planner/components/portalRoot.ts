/**
 * Destino dos portais do Planner: um contêiner `.planner-portal` no body, para o CSS escopado
 * (`planner.css`) alcançar drawers, menus e prévias que saem da árvore de `.planner-page`.
 */
export function plannerPortalRoot(): HTMLElement {
  let root = document.getElementById('planner-portal-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'planner-portal-root'
    root.className = 'planner-portal'
    document.body.appendChild(root)
  }
  return root
}
