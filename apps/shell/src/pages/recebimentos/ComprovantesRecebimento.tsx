import { useEffect, useState } from 'react'
import { Alert, Button } from '@betinhos/ui'
import { BrandLoader } from '../../app/BrandLoader'
import { ComprovantesGaleria } from '../../lib/comprovantes/Galeria'
import { formatDate } from '../pagantes/domain/messages'
import { agruparPorServico, metaRecebimento, ordenar, type Recebimento } from './domain'
import type { RecebimentosSource } from './source'

type Estado = { lista: Recebimento[] } | { erro: string } | null
/** Serviço para o título do grupo (o `ServicoOp` das fichas da OP e do Pagante). */
export type ServicoDoGrupo = { id: string; codigo: string; data: Date | null; destino: string }

/** Comprovantes dos serviços, recarregados quando muda o conjunto de ids. */
export function useRecebimentos(source: RecebimentosSource, reservaIds: string[]) {
  const chave = reservaIds.join('|')
  const [estado, setEstado] = useState<Estado>(null)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let vivo = true
    setEstado(null)
    source.carregar(chave ? chave.split('|') : []).then(
      (lista) => { if (vivo) setEstado({ lista: ordenar(lista) }) },
      (erro) => { if (vivo) setEstado({ erro: erro instanceof Error ? erro.message : String(erro) }) },
    )
    return () => { vivo = false }
  }, [source, chave, tentativa])
  return { estado, recarregar: () => setTentativa((n) => n + 1) }
}

/** "4 comprovantes · 2 serviços" para o cabeçalho da seção; vazio enquanto carrega ou com erro. */
export function resumoRecebimentos(estado: Estado) {
  if (!estado || 'erro' in estado) return ''
  const n = estado.lista.length
  if (!n) return 'nenhum'
  const servicos = new Set(estado.lista.map((r) => r.reservaId)).size
  return `${n} ${n === 1 ? 'comprovante' : 'comprovantes'} · ${servicos} ${servicos === 1 ? 'serviço' : 'serviços'}`
}

type ListaProps = ReturnType<typeof useRecebimentos> & {
  source: RecebimentosSource
  /** Com serviços, um grupo por serviço (na ordem recebida) sob um título com ID, data e destino. */
  servicos?: ServicoDoGrupo[]
}

/** Galeria dos comprovantes que o motorista enviou ao receber; carregando, erro com nova tentativa e vazio. */
export function ListaRecebimentos({ estado, recarregar, source, servicos }: ListaProps) {
  if (estado == null) return <BrandLoader variant="inline" size="sm" label="Carregando comprovantes" text="Carregando comprovantes…" />
  if ('erro' in estado) {
    return (
      <Alert tone="danger" title="Não foi possível carregar os comprovantes">
        {estado.erro} <Button variant="ghost" size="compact" onClick={recarregar}>Tentar de novo</Button>
      </Alert>
    )
  }
  if (!estado.lista.length) return <p className="cmp-vazio">Nenhum comprovante enviado pelo motorista.</p>
  if (!servicos) return <ComprovantesGaleria anexos={estado.lista} ler={source.arquivo} meta={metaRecebimento} />
  const grupos = agruparPorServico(servicos, estado.lista)
  const titulos = new Map(grupos.map(({ servico: s }) => [s.id.toLowerCase(), [s.codigo || 'Serviço sem ID', formatDate(s.data), s.destino || 'Sem destino'].join(' · ')]))
  return (
    <ComprovantesGaleria
      anexos={grupos.flatMap((g) => g.comprovantes)}
      ler={source.arquivo}
      meta={metaRecebimento}
      grupo={(r) => ({ chave: r.reservaId, titulo: titulos.get(r.reservaId) })}
    />
  )
}

/** Comprovantes de um ou mais serviços, sem grupos (ficha do Geral). */
export function ComprovantesRecebimento({ source, reservaIds }: { source: RecebimentosSource; reservaIds: string[] }) {
  return <ListaRecebimentos {...useRecebimentos(source, reservaIds)} source={source} />
}
