import { useEffect, useRef, useState } from 'react'
import type { RecebimentosSource } from './source'

/** Contagem de comprovantes dos serviços, sem bloquear a lista; falha só esconde o indicador.
 * Cada lote novo de ids consulta só os que chegaram; falha tira do cache para a próxima mudança tentar de novo. */
export function useContagemRecebimentos(source: RecebimentosSource, ids: string[]) {
  const [contagem, setContagem] = useState<Map<string, number>>(new Map())
  const contados = useRef(new Set<string>())
  useEffect(() => {
    const novos = ids.map((id) => id.toLowerCase()).filter((id) => !contados.current.has(id))
    if (!novos.length) return
    novos.forEach((id) => contados.current.add(id))
    source.contar(novos).then(
      (found) => setContagem((cur) => { const next = new Map(cur); for (const id of novos) { const n = found.get(id); if (n) next.set(id, n); else next.delete(id) } return next }),
      () => novos.forEach((id) => contados.current.delete(id)),
    )
  }, [source, ids])
  return contagem
}
