import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, Input, MetricCard, SearchBox, SegmentedControl, Select, useToast, type MenuAction } from '@betinhos/ui'
import { AlertTriangle, Ban, Clock, Download, RotateCcw, SearchX, UserX } from 'lucide-react'
import { downloadCsv, toCsv } from '../../../app/csv'
import { SelectionBar, useRowSelection } from '../../../app/Selecao'
import { useQueryFilters, useQueryTexto } from '../../../nav/queryState'
import { filtrosCodec } from './domain/url'
import { formatMoney } from '../../pagantes/domain/messages'
import { dateKey } from '../../operacional/domain/time'
import {
  abaDe, CANAIS, canalLabel, CSV_CABECALHO, csvLinhas, filtrar, FILTROS_VAZIOS, MOTIVO_REABERTA, ordenar, ORDENS, resumoRevisar, SITUACAO,
  situacaoLabel, SITUACOES_REVISAR, type Filtros, type Ordem,
} from './domain/regras'
import { message, type Source } from './data/source'
import type { Transacao } from './domain/types'
import type { useConciliacao } from './useConciliacao'
import { TransacoesCards, TransacoesTabela } from './components/TransacoesLista'
import { MotivoIgnorar } from './components/MotivoIgnorar'

type SubFila = 'revisar' | 'ignoradas'
const VAZIO: Record<SubFila, string> = { revisar: 'Nada para revisar neste filtro.', ignoradas: 'Nenhuma compra ignorada neste filtro.' }

type Props = { data: ReturnType<typeof useConciliacao>; source: Source; mobile: boolean; onOpen: (id: string) => void; onRefresh: () => void }

const SITUACAO_ICONE: Record<number, ReactNode> = {
  [SITUACAO.pendente]: <Clock size={20} />, [SITUACAO.semMotorista]: <UserX size={20} />, [SITUACAO.divergencia]: <AlertTriangle size={20} />,
}
const SITUACAO_HINT: Record<number, string> = {
  [SITUACAO.pendente]: 'casar ou ignorar', [SITUACAO.semMotorista]: 'vincular o cartão', [SITUACAO.divergencia]: 'conferir a cobrança',
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

type Lote = { acao: 'ignorar' | 'reabrir'; rows: Transacao[] } | null

/** Compras do cartão que ainda não têm despesa (Para revisar) e as ignoradas; as ações de uma compra ficam no TransacaoDrawer. */
export function ComprasSemDespesa({ data, source, mobile, onOpen, onRefresh }: Props) {
  const toast = useToast()
  const [subUrl, setSub] = useQueryTexto('cc-sub', 'revisar')
  const sub: SubFila = subUrl === 'ignoradas' ? 'ignoradas' : 'revisar'
  const [ordemUrl, setOrdem] = useQueryTexto('cc-ordem', 'recentes')
  const ordem: Ordem = ORDENS.some((o) => o.value === ordemUrl) ? ordemUrl as Ordem : 'recentes'
  const [filtros, setFiltros] = useQueryFilters(filtrosCodec)

  // Contagens e resumo ignoram o filtro de situação: o cartão clicado continua mostrando o total das outras.
  const semSituacao = useMemo(() => filtrar(data.transacoes, { ...filtros, situacao: null }), [data.transacoes, filtros])
  const porSub = useMemo(() => {
    const m: Record<SubFila, Transacao[]> = { revisar: [], ignoradas: [] }
    for (const t of semSituacao) {
      const aba = abaDe(t.situacao)
      if (aba === 'revisar' || aba === 'ignoradas') m[aba].push(t)
    }
    return m
  }, [semSituacao])
  const resumo = useMemo(() => resumoRevisar(porSub.revisar), [porSub.revisar])
  const list = useMemo(() => ordenar(filtros.situacao == null ? porSub[sub] : porSub[sub].filter((t) => t.situacao === filtros.situacao), ordem), [porSub, sub, filtros.situacao, ordem])
  const totalLista = useMemo(() => list.reduce((s, t) => s + t.valor, 0), [list])

  const cartaoOpcoes = useMemo(() => data.cartoes.map((c) => ({ value: c.id, label: c.nome })), [data.cartoes])
  const motoristaOpcoes = useMemo(() => {
    const ids = new Set([...data.transacoes.map((t) => t.motoristaId), ...data.cartoes.map((c) => c.motoristaId)])
    return data.motoristas.filter((m) => ids.has(m.id)).map((m) => ({ value: m.id, label: m.nome }))
  }, [data.transacoes, data.cartoes, data.motoristas])
  const canalOpcoes = CANAIS.map((c) => ({ value: String(c), label: canalLabel(c) }))
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros({ ...filtros, [k]: v })
  const comFiltro = Object.values(filtros).some((v) => v != null && v !== '')
  const limpar = () => setFiltros(FILTROS_VAZIOS)
  const trocarSub = (s: SubFila) => { setSub(s); sel.clear(); if (s === 'ignoradas' && filtros.situacao != null) set('situacao', null) }

  const sel = useRowSelection(list)
  const selecting = !mobile && sel.rows.length > 0

  // ---------- Lote: ignorar (Para revisar) ou reabrir (Ignoradas), uma gravação por vez ----------
  const [lote, setLote] = useState<Lote>(null)
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const [gravando, setGravando] = useState(false)
  const abrirLote = (acao: 'ignorar' | 'reabrir', rows: Transacao[]) => { setMotivo(''); setErroMotivo(null); setLote({ acao, rows }) }

  async function gravarLote() {
    if (!lote || gravando) return
    const texto = motivo.trim()
    if (lote.acao === 'ignorar' && !texto) { setErroMotivo('Diga por que estas compras não precisam de despesa.'); return }
    setGravando(true)
    const falhas: string[] = []
    for (const t of lote.rows) {
      try {
        if (lote.acao === 'ignorar') {
          await source.ignorar(t, texto)
          data.upsertTransacao({ ...t, situacao: SITUACAO.ignorada, motivo: texto })
        } else {
          await source.reabrir(t)
          data.upsertTransacao({ ...t, situacao: SITUACAO.pendente, motivo: MOTIVO_REABERTA })
        }
      } catch (reason) {
        falhas.push(`${t.estabelecimento || t.descricao}: ${message(reason)}`)
      }
    }
    setGravando(false)
    setLote(null)
    sel.clear()
    const ok = lote.rows.length - falhas.length
    const feito = lote.acao === 'ignorar' ? 'ignorada' : 'reaberta'
    if (ok) toast({ tone: 'success', message: `${plural(ok, `compra ${feito}`, `compras ${feito}s`)}.` })
    if (falhas.length) toast({ tone: 'danger', message: `Não foi possível gravar ${plural(falhas.length, 'compra', 'compras')}. ${falhas.slice(0, 3).join(' · ')}` })
  }

  const exportar = (rows: Transacao[]) => {
    downloadCsv(`compras-${sub === 'revisar' ? 'sem-despesa' : 'ignoradas'}-${dateKey(new Date())}.csv`, toCsv(CSV_CABECALHO, csvLinhas(rows)))
  }
  const bulkActions = (rows: Transacao[]): MenuAction[] => [
    sub === 'revisar'
      ? { id: 'ignorar', label: rows.length === 1 ? 'Ignorar' : `Ignorar ${rows.length}`, icon: <Ban size={16} />, disabled: gravando, onSelect: () => abrirLote('ignorar', rows) }
      : { id: 'reabrir', label: rows.length === 1 ? 'Reabrir' : `Reabrir ${rows.length}`, icon: <RotateCcw size={16} />, disabled: gravando, onSelect: () => abrirLote('reabrir', rows) },
    { id: 'exportar', label: 'Exportar seleção', icon: <Download size={16} />, onSelect: () => exportar(rows) },
  ]

  const empty = <EmptyState align="start" icon={<SearchX size={36} />} title={VAZIO[sub]} action={comFiltro ? <Button variant="secondary" onClick={limpar}>Limpar filtros</Button> : undefined} />
  const footer = <span className="cc-num">{plural(list.length, 'compra', 'compras')} · {formatMoney(totalLista)}</span>
  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar as compras do cartão" action={<Button variant="secondary" onClick={onRefresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <TransacoesTabela list={[]} onOpen={() => undefined} loading />
  } else if (mobile) {
    body = list.length ? <><TransacoesCards list={list} onOpen={onOpen} /><p className="cc-muted">{footer}</p></> : <div className="surface">{empty}</div>
  } else {
    body = <TransacoesTabela list={list} onOpen={onOpen} empty={empty} footer={footer} selection={sel.selection} bulkActions={(rows) => bulkActions(sel.targets(rows))} />
  }

  return (
    <>
      <div role="toolbar" aria-label="Filtros das compras sem despesa">
        <div {...sel.bar}>
          {selecting ? <SelectionBar count={sel.rows.length} onClear={sel.clear} actions={bulkActions(sel.rows)} /> : (
            <div className="cc-filtros">
              <SegmentedControl aria-label="Situação da compra" value={sub} onChange={trocarSub}
                options={[{ value: 'revisar', label: `Para revisar${data.loaded ? ` (${porSub.revisar.length})` : ''}` }, { value: 'ignoradas', label: `Ignoradas${data.loaded ? ` (${porSub.ignoradas.length})` : ''}` }]} />
              <SearchBox className="cc-busca" value={filtros.busca} onChange={(v) => set('busca', v)} placeholder="Buscar por estabelecimento, motorista, cartão ou placa" aria-label="Buscar compras" />
              <Button variant="secondary" icon={<Download size={16} />} disabled={!list.length} onClick={() => exportar(list)}>Exportar</Button>
            </div>
          )}
        </div>
        <div className="cc-filtros">
          <Field label="Cartão" className="cc-filtro"><Select options={cartaoOpcoes} value={filtros.cartaoId} placeholder="Todos" searchable={false} onChange={(v) => set('cartaoId', v)} /></Field>
          <Field label="Motorista" className="cc-filtro"><Select options={motoristaOpcoes} value={filtros.motoristaId} placeholder="Todos" onChange={(v) => set('motoristaId', v)} /></Field>
          <Field label="Canal" className="cc-filtro cc-filtro--curto"><Select options={canalOpcoes} value={filtros.canal == null ? null : String(filtros.canal)} placeholder="Todos" searchable={false} onChange={(v) => set('canal', v == null ? null : Number(v))} /></Field>
          <Field label="Compra de" className="cc-filtro cc-filtro--data"><Input type="date" value={filtros.de} onChange={(e) => set('de', e.target.value)} /></Field>
          <Field label="até" className="cc-filtro cc-filtro--data"><Input type="date" value={filtros.ate} onChange={(e) => set('ate', e.target.value)} /></Field>
          <Field label="Ordem" className="cc-filtro cc-filtro--curto"><Select options={ORDENS} value={ordem} searchable={false} clearable={false} onChange={(v) => setOrdem(v ?? 'recentes')} /></Field>
          {comFiltro ? <Button variant="ghost" onClick={limpar}>Limpar filtros</Button> : null}
        </div>
      </div>
      {sub === 'revisar' && !(data.error && !data.loaded) ? (
        <div className="dp-kpis"><div className="dp-kpis__grid cc-resumo">
          {SITUACOES_REVISAR.map((s) => {
            const r = resumo.get(s)!
            return (
              <button key={s} type="button" className="dp-kpi" aria-pressed={filtros.situacao === s} onClick={() => set('situacao', filtros.situacao === s ? null : s)}>
                <MetricCard icon={SITUACAO_ICONE[s]} tone={s === SITUACAO.pendente ? 'warning' : 'danger'} label={situacaoLabel(s)} value={formatMoney(r.total)}
                  hint={`${plural(r.qtd, 'compra', 'compras')} · ${SITUACAO_HINT[s]}`} loading={!data.loaded} />
              </button>
            )
          })}
        </div></div>
      ) : null}
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={onRefresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      <Dialog open={lote != null} onClose={() => !gravando && setLote(null)}
        title={lote?.acao === 'ignorar' ? `Ignorar ${plural(lote.rows.length, 'compra', 'compras')}?` : `Reabrir ${plural(lote?.rows.length ?? 0, 'compra', 'compras')}?`}
        actions={<>
          <Button variant="secondary" disabled={gravando} onClick={() => setLote(null)}>Cancelar</Button>
          <Button loading={gravando} onClick={() => void gravarLote()}>{lote?.acao === 'ignorar' ? 'Ignorar compras' : 'Reabrir compras'}</Button>
        </>}>
        {lote?.acao === 'ignorar' ? (
          <div className="cc-form">
            <p className="cc-texto">{formatMoney(lote.rows.reduce((s, t) => s + t.valor, 0))} no total. O mesmo motivo vai para todas.</p>
            <MotivoIgnorar value={motivo} disabled={gravando} error={erroMotivo} onChange={(v) => { setMotivo(v); setErroMotivo(null) }} />
          </div>
        ) : 'Elas voltam para Para revisar como Pendente.'}
      </Dialog>
    </>
  )
}

export const contarSemDespesa = (list: { situacao: number | null }[]) => list.filter((t) => abaDe(t.situacao) === 'revisar').length
