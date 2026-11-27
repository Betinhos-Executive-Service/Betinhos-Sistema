import { useEffect, useState } from 'react'
import type { Source } from '../data/source'
import { tabelasParaMedir, type Previa, type Uso } from '../domain/previa'
import { paraPedido } from '../domain/perfis'
import type { PerfisPessoa } from '../domain/types'

const ESPERA_MS = 400

/** `chave` identifica o pedido: resposta de um rascunho antigo nunca vale para o atual. `uso` nulo = ainda medindo (o resumo pede confirmação de toda perda de tabela); com lista, tabela perdida fora dela (falha da medição vira `[]`) sai "não deu para medir". */
export type EstadoPrevia =
  | { chave: string; fase: 'carregando' }
  | { chave: string; fase: 'falhou'; mensagem: string }
  | { chave: string; fase: 'pronta'; previa: Previa; uso: Uso[] | null }

type Opcoes = { source: Source; pessoaId: string; rascunho: PerfisPessoa; retirarAmplo: boolean; ativo: boolean }

/** Prévia do que a pessoa deixa de ter: pedida a cada mudança do rascunho, com espera de 400 ms e cancelando o pedido anterior. */
export function usePrevia({ source, pessoaId, rascunho, retirarAmplo, ativo }: Opcoes): { chave: string; estado: EstadoPrevia | null } {
  const chave = `${pessoaId}|${JSON.stringify(paraPedido(rascunho))}|${retirarAmplo}`
  const [estado, setEstado] = useState<EstadoPrevia | null>(null)

  useEffect(() => {
    // Sem edição o estado velho sai: a mesma chave de antes de gravar não pode reaparecer com a prévia antiga.
    if (!ativo) { setEstado(null); return }
    const controle = new AbortController()
    const { signal } = controle
    const espera = setTimeout(async () => {
      try {
        const previa = await source.previa(pessoaId, rascunho, retirarAmplo, signal)
        if (signal.aborted) return
        const tabelas = tabelasParaMedir(previa)
        setEstado({ chave, fase: 'pronta', previa, uso: tabelas.length ? null : [] })
        if (!tabelas.length) return
        const uso = await source.uso(pessoaId, rascunho, retirarAmplo, tabelas, signal).catch((): Uso[] => [])
        if (!signal.aborted) setEstado({ chave, fase: 'pronta', previa, uso })
      } catch (reason) {
        if (!signal.aborted) setEstado({ chave, fase: 'falhou', mensagem: reason instanceof Error ? reason.message : String(reason) })
      }
    }, ESPERA_MS)
    return () => { clearTimeout(espera); controle.abort() }
    // `rascunho` entra pela chave; o objeto muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo, source])

  return { chave, estado: ativo && estado?.chave === chave ? estado : null }
}
