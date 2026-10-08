import { useMemo, type ReactNode } from 'react'
import { EmptyState, Skeleton, type TableColumn } from '@betinhos/ui'
import { DatabaseZap, Inbox } from 'lucide-react'
import { filtrarServicos } from '../../domain/base'
import type { Contexto } from '../../domain/kpis'
import type { Apoio, Chip, Dados, Filtros } from '../../domain/types'
import { Chips } from '../KpiChip'
import { COLUNA_LARGA } from '../Linhas'

/* Peças comuns das abas Motoristas, Manutenções e Multas: linha de KPIs, contexto do recorte e células das listas. */

export type PropsAba = { dados: Dados | null; filtros: Filtros; now: Date; periodo: string }

/** Contexto do recorte (serviços filtrados) para os `calcular*` das abas; recalcula só quando dados, filtros ou relógio mudam. */
export function useContexto(dados: Dados | null, filtros: Filtros, now: Date): Contexto | null {
  return useMemo(() => (dados ? { todas: dados.reservas, rv: filtrarServicos(dados.reservas, filtros), f: filtros, now } : null), [dados, filtros, now])
}

export type TomKpi = 'action' | 'brand' | 'success' | 'warning'
export type KpiAba = {
  id: string
  rotulo: string
  /** null = s/dado (o conjunto da tabela não respondeu). */
  valor: string | null
  tom: TomKpi
  chips?: Chip[]
  apoio?: Apoio[]
}

/** Linha de KPIs da aba: borda superior na cor do indicador (`.dash-kpi`), valor e apoio; s/dado em texto quando o conjunto falhou. */
export function KpisAba({ itens, classe, rotulo, carregando = false }: { itens: KpiAba[]; classe: string; rotulo: string; carregando?: boolean }) {
  return (
    <section className={classe} aria-label={rotulo} aria-busy={carregando || undefined}>
      {itens.map((k) => (
        <article key={k.id} className={`dash-kpi dash-kpi--${k.tom}`} aria-label={k.rotulo}>
          <span className="dash-kpi__rotulo">{k.rotulo}</span>
          {carregando ? <>
            <Skeleton height={26} width="62%" />
            <Skeleton height={18} width="84%" />
            <span className="dash-sr">Carregando</span>
          </> : k.valor == null ? <>
            <strong className="dash-kpi__valor">—</strong>
            <div className="dash-kpi__extras"><span className="dash-chip dash-chip--neutro"><span className="dash-chip__texto">s/dado</span></span></div>
          </> : <>
            <strong className="dash-kpi__valor">{k.valor}</strong>
            {k.chips?.length || k.apoio?.length ? <div className="dash-kpi__extras"><Chips chips={k.chips} apoio={k.apoio} /></div> : null}
          </>}
        </article>
      ))}
    </section>
  )
}

/** Primeira carga: os KPIs da aba no formato final, ocupados e sem números. */
export function KpisCarregando({ rotulos, classe, rotulo }: { rotulos: string[]; classe: string; rotulo: string }) {
  return <KpisAba classe={classe} rotulo={rotulo} carregando itens={rotulos.map((r) => ({ id: r, rotulo: r, valor: '—', tom: 'brand' }))} />
}

/** Estado do bloco cujo conjunto não carregou: s/dado em texto, sem números provisórios. */
export const semDadoBloco = (fonte: string) => (
  <EmptyState compact icon={<DatabaseZap />} title="s/dado">{`${fonte} não respondeu nesta carga.`}</EmptyState>
)
export const vazio = (titulo: string) => <EmptyState compact icon={<Inbox />} title={titulo} />
export const forte = (texto: ReactNode) => <strong className="dash-forte">{texto}</strong>
/** Variante de duas colunas do celular: título da linha na 1ª e o restante, com rótulo inline, na 2ª. */
export const resto = <R,>(header: string, cell: TableColumn<R>['cell']): TableColumn<R> => ({ key: 'resto', header, width: COLUNA_LARGA, cell })
/** AAAA-MM-DD → dd/MM/yyyy ('' vira '—'). */
export const dataBR = (dia: string) => (dia ? dia.split('-').reverse().join('/') : '—')
