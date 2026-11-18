import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, StatusBadge, ToastProvider, useShellHeader } from '@betinhos/ui'
import { CreditCard, Plus, RefreshCw } from 'lucide-react'
import type { Host } from '../../host'
import { useMedia } from '../operacional/useMedia'
import { createSource } from '../despesas/conciliacao/data/source'
import { useConciliacao } from '../despesas/conciliacao/useConciliacao'
import { CartaoDrawer, CartoesLista, type CartaoTarget } from './components/Cartoes'
import { BrandLoader } from '../../app/BrandLoader'
import '../despesas/conciliacao/conciliacao.css'

export function CartoesPage({ host }: { host: Host }) {
  return <ToastProvider><Cartoes host={host} /></ToastProvider>
}

/** Cartões corporativos: conta do Banco MCP, final e o motorista que usa o cartão em cada vigência. */
function Cartoes({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const data = useConciliacao(source, true)
  const mobile = useMedia('(max-width: 820px)')
  const [target, setTarget] = useState<CartaoTarget>(null)

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar cartões" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Cartões corporativos', actions: headerActions })

  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar os cartões" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <div className="surface"><BrandLoader variant="inline" label="Carregando cartões" text="Carregando cartões…" /></div>
  } else if (data.cartoes.length) {
    body = <CartoesLista list={data.cartoes} mobile={mobile} onOpen={(id) => setTarget({ mode: 'edit', id })} />
  } else {
    body = <EmptyState className="surface" align="start" icon={<CreditCard size={36} />} title="Nenhum cartão cadastrado." action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Novo cartão</Button>}>Cadastre o cartão com a conta do banco, o final e o motorista que o usa.</EmptyState>
  }

  return (
    <div className="page cc-page">
      <div role="toolbar" aria-label="Comandos de cartões" className="cc-filtros">
        {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={() => setTarget({ mode: 'create' })}>Novo cartão</Button>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      <CartaoDrawer target={target} onClose={() => setTarget(null)} cartoes={data.cartoes} motoristas={data.motoristas} source={source} onSaved={data.upsertCartao} />
    </div>
  )
}
