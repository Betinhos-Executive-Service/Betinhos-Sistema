import { useEffect, useRef, useState } from 'react'
import type { RecebimentosSource } from './source'

/** Contagem de comprovantes por serviço (ids das reservas) ou, com `por: 'op'`, por OP (soma dos serviços), sem bloquear a lista; falha só esconde o indicador.
 * Cada lote novo de ids consulta só os que chegaram; falha tira do cache para a próxima mudança tentar de novo. */
export function useContagemRecebimentos(source: RecebimentosSource, ids: string[], por: 'servico' | 'op' = 'servico') {
  const [contagem, setContagem] = useState<Map<string, number>>(new Map())
  const contados = useRef(new Set<string>())
  useEffect(() => {
    const novos = ids.map((id) => id.toLowerCase()).filter((id) => !contados.current.has(id))
    if (!novos.length) return
    novos.forEach((id) => contados.current.add(id))
    const contar = por === 'op' ? source.contarPorOp : source.contar
    contar(novos).then(
      (found) => {
        if (found.size) setContagem((cur) => { const next = new Map(cur); for (const [id, n] of found) next.set(id, n); return next })
      },
      () => novos.forEach((id) => contados.current.delete(id)),
    )
  }, [source, ids, por])
  return contagem
}
