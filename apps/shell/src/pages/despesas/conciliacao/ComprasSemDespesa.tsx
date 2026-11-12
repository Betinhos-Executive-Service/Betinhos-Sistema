import { useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Field, Input, SegmentedControl, Select } from '@betinhos/ui'
import { SearchX } from 'lucide-react'
import { abaDe, filtrar, FILTROS_VAZIOS, type Filtros } from './domain/regras'
import type { useConciliacao } from './useConciliacao'
import { TransacoesCards, TransacoesTabela } from './components/TransacoesLista'

type SubFila = 'revisar' | 'ignoradas'
const VAZIO: Record<SubFila, string> = { revisar: 'Nada para revisar neste filtro.', ignoradas: 'Nenhuma compra ignorada neste filtro.' }

type Props = { data: ReturnType<typeof useConciliacao>; mobile: boolean; onOpen: (id: string) => void; onRefresh: () => void }

/** Compras do cartão que ainda não têm despesa (Para revisar) e as ignoradas; as ações ficam no TransacaoDrawer. */
export function ComprasSemDespesa({ data, mobile, onOpen, onRefresh }: Props) {
  const [sub, setSub] = useState<SubFila>('revisar')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)

  const porSub = useMemo(() => {
    const m: Record<SubFila, typeof data.transacoes> = { revisar: [], ignoradas: [] }
    for (const t of filtrar(data.transacoes, filtros)) {
      const aba = abaDe(t.situacao)
      if (aba === 'revisar' || aba === 'ignoradas') m[aba].push(t)
    }
    return m
  }, [data.transacoes, filtros])
  const cartaoOpcoes = useMemo(() => data.cartoes.map((c) => ({ value: c.id, label: c.nome })), [data.cartoes])
  const motoristaOpcoes = useMemo(() => {
    const ids = new Set([...data.transacoes.map((t) => t.motoristaId), ...data.cartoes.map((c) => c.motoristaId)])
    return data.motoristas.filter((m) => ids.has(m.id)).map((m) => ({ value: m.id, label: m.nome }))
  }, [data.transacoes, data.cartoes, data.motoristas])
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }))
  const comFiltro = Object.values(filtros).some(Boolean)
  const list = porSub[sub]

  const empty = <EmptyState align="start" icon={<SearchX size={36} />} title={VAZIO[sub]} action={comFiltro ? <Button variant="secondary" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button> : undefined} />
  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar as compras do cartão" action={<Button variant="secondary" onClick={onRefresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <TransacoesTabela list={[]} onOpen={() => undefined} loading />
  } else if (mobile) {
    body = list.length ? <TransacoesCards list={list} onOpen={onOpen} /> : <div className="surface">{empty}</div>
  } else {
    body = <TransacoesTabela list={list} onOpen={onOpen} empty={empty} footer={<span className="cc-num">{list.length} de {data.transacoes.length} transações</span>} />
  }

  return (
    <>
      <div role="toolbar" aria-label="Filtros das compras sem despesa" className="cc-filtros">
        <SegmentedControl aria-label="Situação da compra" value={sub} onChange={setSub}
          options={[{ value: 'revisar', label: `Para revisar${data.loaded ? ` (${porSub.revisar.length})` : ''}` }, { value: 'ignoradas', label: `Ignoradas${data.loaded ? ` (${porSub.ignoradas.length})` : ''}` }]} />
        <Field label="Cartão" className="cc-filtro"><Select options={cartaoOpcoes} value={filtros.cartaoId} placeholder="Todos" searchable={false} onChange={(v) => set('cartaoId', v)} /></Field>
        <Field label="Motorista" className="cc-filtro"><Select options={motoristaOpcoes} value={filtros.motoristaId} placeholder="Todos" onChange={(v) => set('motoristaId', v)} /></Field>
        <Field label="Compra de" className="cc-filtro cc-filtro--data"><Input type="date" value={filtros.de} onChange={(e) => set('de', e.target.value)} /></Field>
        <Field label="até" className="cc-filtro cc-filtro--data"><Input type="date" value={filtros.ate} onChange={(e) => set('ate', e.target.value)} /></Field>
        {comFiltro ? <Button variant="ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button> : null}
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={onRefresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
    </>
  )
}

export const contarSemDespesa = (list: { situacao: number | null }[]) => list.filter((t) => abaDe(t.situacao) === 'revisar').length
