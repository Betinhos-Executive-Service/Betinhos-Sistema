import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecebimentosSource } from './source'

/** Contagem de comprovantes por serviço (ids das reservas) ou, com `por: 'op'`, por OP (soma dos serviços), sem bloquear a lista.
 * Cada lote novo de ids consulta só os que chegaram; `versao` nova (Atualizar) conta todos de novo, mantendo o valor anterior
 * até o novo chegar. `lidos`: ids com contagem conhecida (quem filtra por ela sabe o que ainda falta). Falha tira do cache
 * e `tentar` repete. */
export function useContagemRecebimentos(source: RecebimentosSource, ids: string[], por: 'servico' | 'op' = 'servico', versao = 0) {
  const [contagem, setContagem] = useState<Map<string, number>>(new Map())
  const [lidos, setLidos] = useState<ReadonlySet<string>>(new Set())
  const [falhou, setFalhou] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const pedidos = useRef(new Map<string, number>())
  useEffect(() => {
    const novos = ids.map((id) => id.toLowerCase()).filter((id) => pedidos.current.get(id) !== versao)
    if (!novos.length) return
    novos.forEach((id) => pedidos.current.set(id, versao))
    const contar = por === 'op' ? source.contarPorOp : source.contar
    // Resposta de uma versão já substituída (Atualizar no meio da consulta) não sobrescreve a nova.
    const atuais = () => novos.filter((id) => pedidos.current.get(id) === versao)
    contar(novos).then(
      (found) => {
        const ok = atuais()
        if (!ok.length) return
        // O agregado não devolve quem ficou sem comprovante: limpa o valor antigo antes de gravar o novo.
        setContagem((cur) => {
          if (!found.size && !ok.some((id) => cur.has(id))) return cur
          const next = new Map(cur)
          for (const id of ok) next.delete(id)
          for (const [id, n] of found) next.set(id, n)
          return next
        })
        setLidos((cur) => (ok.every((id) => cur.has(id)) ? cur : new Set([...cur, ...ok])))
        setFalhou(false)
      },
      () => {
        const ok = atuais()
        if (!ok.length) return
        ok.forEach((id) => pedidos.current.delete(id))
        setFalhou(true)
      },
    )
  }, [source, ids, por, versao, tentativa])
  const tentar = useCallback(() => { setFalhou(false); setTentativa((t) => t + 1) }, [])
  return { contagem, lidos, falhou, tentar }
}
