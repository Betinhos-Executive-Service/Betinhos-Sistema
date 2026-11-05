import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Field, Input, Select, StatusBadge, Tabs, ToastProvider, useShellHeader } from '@betinhos/ui'
import { CreditCard, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { abaDe, filtrar, FILTROS_VAZIOS, type Aba, type Filtros } from './domain/regras'
import type { Transacao } from './domain/types'
import { useConciliacao } from './useConciliacao'
import { TransacoesCards, TransacoesTabela } from './components/TransacoesLista'
import { TransacaoDrawer } from './components/TransacaoDrawer'
import { CartaoDrawer, CartoesLista, type CartaoTarget } from './components/Cartoes'
import './conciliacao-cartao.css'

type AbaTela = Aba | 'cartoes'
const ABAS: { value: Aba; label: string }[] = [
  { value: 'revisar', label: 'Para revisar' },
  { value: 'aguardando', label: 'Aguardando motorista' },
  { value: 'conciliadas', label: 'Conciliadas' },
  { value: 'ignoradas', label: 'Ignoradas' },
]
const VAZIO: Record<Aba, string> = {
  revisar: 'Nada para revisar neste filtro.',
  aguardando: 'Nenhuma transação esperando o motorista.',
  conciliadas: 'Nenhuma transação conciliada neste filtro.',
  ignoradas: 'Nenhuma transação ignorada neste filtro.',
}

export function ConciliacaoCartaoPage({ host }: { host: Host }) {
  return <ToastProvider><Conciliacao host={host} /></ToastProvider>
}

function Conciliacao({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const data = useConciliacao(source)
  const mobile = useMedia('(max-width: 820px)')
  const [aba, setAba] = useState<AbaTela>('revisar')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [cartaoTarget, setCartaoTarget] = useState<CartaoTarget>(null)

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar conciliação" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Conciliação do cartão', actions: headerActions })

  const filtradas = useMemo(() => filtrar(data.transacoes, filtros), [data.transacoes, filtros])
  const porAba = useMemo(() => {
    const m: Record<Aba, Transacao[]> = { revisar: [], aguardando: [], conciliadas: [], ignoradas: [] }
    for (const t of filtradas) m[abaDe(t.situacao)].push(t)
    return m
  }, [filtradas])
  const tabs = [...ABAS.map((a) => ({ ...a, badge: data.loaded ? porAba[a.value].length : undefined })), { value: 'cartoes' as const, label: 'Cartões', badge: data.loaded ? data.cartoes.length : undefined }]

  const cartaoOpcoes = useMemo(() => data.cartoes.map((c) => ({ value: c.id, label: c.nome })), [data.cartoes])
  const motoristaOpcoes = useMemo(() => {
    const ids = new Set([...data.transacoes.map((t) => t.motoristaId), ...data.cartoes.map((c) => c.motoristaId)])
    return data.motoristas.filter((m) => ids.has(m.id)).map((m) => ({ value: m.id, label: m.nome }))
  }, [data.transacoes, data.cartoes, data.motoristas])
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }))
  const comFiltro = Object.values(filtros).some(Boolean)

  const aberta = abertaId ? data.transacoes.find((t) => t.id === abertaId) ?? null : null
  const cadastrarDe = (t: Transacao) => {
    setAbertaId(null)
    setCartaoTarget({ mode: 'create', inicial: { conta: t.conta, final: t.final, inicio: t.dataCompra } })
  }

  const list = aba === 'cartoes' ? [] : porAba[aba]
  const empty = useMemo(() => (aba === 'cartoes' ? null
    : <EmptyState align="start" icon={<SearchX size={36} />} title={VAZIO[aba]} action={comFiltro ? <Button variant="secondary" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button> : undefined} />), [aba, comFiltro])
  const footer = useMemo(() => <span className="cc-num">{list.length} de {data.transacoes.length} transações</span>, [list.length, data.transacoes.length])

  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar a conciliação" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <TransacoesTabela list={[]} onOpen={() => undefined} loading />
  } else if (aba === 'cartoes') {
    body = data.cartoes.length
      ? <CartoesLista list={data.cartoes} mobile={mobile} onOpen={(id) => setCartaoTarget({ mode: 'edit', id })} />
      : <EmptyState className="surface" align="start" icon={<CreditCard size={36} />} title="Nenhum cartão cadastrado." action={<Button icon={<Plus size={16} />} onClick={() => setCartaoTarget({ mode: 'create' })}>Novo cartão</Button>}>Cadastre o cartão com a conta do banco, o final e o motorista que o usa.</EmptyState>
  } else {
    body = mobile
      ? (list.length ? <TransacoesCards list={list} onOpen={setAbertaId} /> : <div className="surface">{empty}</div>)
      : <TransacoesTabela list={list} onOpen={setAbertaId} empty={empty} footer={footer} />
  }

  return (
    <div className="page cc-page">
      <Tabs tabs={tabs} value={aba} onChange={setAba} aria-label="Situação da conciliação" />
      <div role="toolbar" aria-label="Filtros da conciliação" className="cc-filtros">
        {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        {aba === 'cartoes' ? (
          <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={() => setCartaoTarget({ mode: 'create' })}>Novo cartão</Button>
        ) : (
          <>
            <Field label="Cartão" className="cc-filtro"><Select options={cartaoOpcoes} value={filtros.cartaoId} placeholder="Todos" searchable={false} onChange={(v) => set('cartaoId', v)} /></Field>
            <Field label="Motorista" className="cc-filtro"><Select options={motoristaOpcoes} value={filtros.motoristaId} placeholder="Todos" onChange={(v) => set('motoristaId', v)} /></Field>
            <Field label="Compra de" className="cc-filtro cc-filtro--data"><Input type="date" value={filtros.de} onChange={(e) => set('de', e.target.value)} /></Field>
            <Field label="até" className="cc-filtro cc-filtro--data"><Input type="date" value={filtros.ate} onChange={(e) => set('ate', e.target.value)} /></Field>
            {comFiltro ? <Button variant="ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button> : null}
          </>
        )}
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      <TransacaoDrawer transacao={aberta} cartoes={data.cartoes} source={source} onClose={() => setAbertaId(null)} onSaved={data.upsertTransacao} onCadastrarCartao={cadastrarDe} />
      <CartaoDrawer target={cartaoTarget} onClose={() => setCartaoTarget(null)} cartoes={data.cartoes} motoristas={data.motoristas} source={source} onSaved={data.upsertCartao} />
    </div>
  )
}
