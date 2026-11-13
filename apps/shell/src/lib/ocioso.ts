/** Adia trabalho que não é da primeira pintura para quando o navegador estiver ocioso. Devolve o cancelamento. */
export function quandoOcioso(tarefa: () => void, timeout = 3000) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(tarefa, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(tarefa, 0)
  return () => window.clearTimeout(id)
}
