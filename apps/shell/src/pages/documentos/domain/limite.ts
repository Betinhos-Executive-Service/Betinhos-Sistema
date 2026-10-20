/**
 * Fila com no máximo `n` tarefas em andamento ao mesmo tempo (ex.: listagens do SharePoint de um checklist).
 * As demais esperam na ordem de chegada; falha de uma tarefa libera a vaga e só rejeita a própria promessa.
 */
export function criarLimite(n: number) {
  let ativas = 0
  const fila: (() => void)[] = []
  const proxima = () => {
    if (ativas >= n) return
    const iniciar = fila.shift()
    if (iniciar) { ativas++; iniciar() }
  }
  return function limite<T>(tarefa: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      fila.push(() => { tarefa().then(resolve, reject).finally(() => { ativas--; proxima() }) })
      proxima()
    })
  }
}

export type Limite = ReturnType<typeof criarLimite>
