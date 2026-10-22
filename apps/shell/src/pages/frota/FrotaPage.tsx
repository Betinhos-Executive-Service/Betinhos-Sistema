import { RefreshCw } from 'lucide-react'
import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Alert, Button, StatusBadge, Tabs, ToastProvider, useShellHeader } from '@betinhos/ui'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import type { FrotaAba } from '../../nav/menu'
import { lerOpcao } from '../../nav/queryState'
import { patchHashQuery, useHashQuery } from '../../nav/useHashRoute'
import { FichaVeiculo } from './components/FichaVeiculo'
import { RegistroDrawer } from './components/RegistroDrawer'
import { Carregando, ViewGate } from './components/Ui'
import { todaySP } from './data/dates'
import { createFrotaSource } from './data/hostSource'
import { EMPTY_DATA, type Classificacao, type DataSource } from './data/source'
import type { Kind, TableKey } from './data/types'
import { errorMessage } from './data/xrm'
import { createDocsSource, type DocsSource } from '../documentos/data/source'
import { Indicadores } from './views/Indicadores'
import { Pendencias } from './views/Pendencias'
import { PlanoPreventivo } from './views/PlanoPreventivo'
import { Registros } from './views/Registros'
import { Veiculos } from './views/Veiculos'
import { useFrotaCarga } from './useFrotaCarga'
import './frota.css'

const MOCK_HOST: Host = { mode: 'mock' }
/** Só quem abre a aba Infrações baixa o código dela. */
const Infracoes = lazy(() => import('../infracoes/InfracoesPage').then((m) => ({ default: m.Infracoes })))

export type Tab = FrotaAba

/** Cada visão é um item do menu Frota (`nav/menu.ts`); aqui ficam o título e as tabelas que ela exige. */
const TABS: { id: Tab; label: string; tables: TableKey[] }[] = [
  { id: 'pendencias', label: 'Pendências', tables: ['manutencoes', 'multas', 'colisoes'] },
  { id: 'veiculos', label: 'Veículos', tables: ['veiculos', 'manutencoes', 'multas', 'colisoes'] },
  { id: 'manutencoes', label: 'Manutenções', tables: ['manutencoes'] },
  { id: 'multas', label: 'Multas', tables: ['multas'] },
  { id: 'colisoes', label: 'Colisões', tables: ['colisoes'] },
  { id: 'indicadores', label: 'Indicadores', tables: ['manutencoes', 'multas', 'infracoes'] },
  { id: 'plano', label: 'Plano preventivo', tables: ['planoPreventivo'] },
]
type SubMultas = 'multas' | 'infracoes'
/** Páginas de lista não usam `PageHeader` (DS §11.2): o seletor de visão faz o papel de título. */
const LISTAS: readonly Tab[] = ['veiculos', 'manutencoes', 'multas', 'colisoes']

const KINDS: readonly Kind[] = ['manutencao', 'multa', 'colisao']
/** Parâmetros dos filtros e gavetas das listas; trocar Multas ↔ Infrações apaga todos, para o filtro de uma não vazar para a outra. */
const FILTROS_DAS_VISOES = ['q', 'f', 'status', 'tipo', 'veiculo', 'pessoa', 'categoria', 'de', 'ate', 'filtro', 'fde', 'fate', 'ver', 'editar', 'novo'] as const

/** A visão vem do item do menu (`#/frota-veiculos`); ficha, registro e sub-aba vivem na query: `?ficha=<id>&registro=multa:<id>&sub=infracoes`. */
function useFrotaRota(tab: Tab) {
  const query = useHashQuery()
  const sub = lerOpcao<SubMultas>(query, 'sub', ['multas', 'infracoes'], 'multas')
  const veiculo = query.get('ficha') || null
  const [kind, id] = (query.get('registro') ?? '').split(':')
  const registro = KINDS.find((item) => item === kind) && id ? { kind: kind as Kind, id } : null
  const secao = query.get('secao') === 'preventivas' ? ('preventivas' as const) : null
  return { tab, sub, veiculo, registro, secao }
}
const abrirSub = (sub: SubMultas) => patchHashQuery({ sub: sub === 'multas' ? null : sub, ficha: null, registro: null, secao: null, ...Object.fromEntries(FILTROS_DAS_VISOES.map((chave) => [chave, null])) })

export function FrotaPage({ host, aba = 'pendencias' }: { host: Host; aba?: Tab }) {
  const [state] = useState(() => {
    try { return { source: createFrotaSource(host), error: null } } catch (reason) { return { source: null, error: errorMessage(reason) } }
  })
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
  return (
    <ToastProvider>
      {state.source ? <Frota source={state.source} docs={docs} host={host} aba={aba} /> : (
        <PageLayout eyebrow="Frota" title="Frota">
          <Alert tone="danger" title="Não foi possível abrir a Frota">{state.error}. Abra o Sistema Betinhos pelo Dataverse.</Alert>
        </PageLayout>
      )}
    </ToastProvider>
  )
}

/** Página com a fonte já resolvida; exportada para os testes. */
export function Frota({ source, docs, host, aba = 'pendencias' }: { source: DataSource; docs?: DocsSource | null; host?: Host; aba?: Tab }) {
  const { result, setResult, loading, fatal, reload } = useFrotaCarga(source)
  const route = useFrotaRota(aba)
  const registro = route.registro
  const setRegistro = (next: { kind: Kind; id: string } | null) => patchHashQuery({ registro: next ? `${next.kind}:${next.id}` : null })
  const today = todaySP()

  /** Aplica a classificação de uma manutenção sem recarregar todas as tabelas. */
  const aplicarClassificacao = useCallback((id: string, c: Classificacao) => {
    setResult((prev) => prev && { ...prev, data: { ...prev.data, manutencoes: prev.data.manutencoes.map((m) => (m.id === id ? { ...m, servicos: c.servicos, categorias: c.categorias, origemClassificacao: c.origem, confiancaIa: c.confianca } : m)) } })
  }, [])

  const data = result?.data ?? EMPTY_DATA
  const errors = result?.errors ?? {}
  const tab = TABS.find((item) => item.id === route.tab)!
  const onOpen = (kind: Kind, id: string) => setRegistro({ kind, id })
  const onOpenVeiculo = (id: string, secao?: 'preventivas') => patchHashQuery({ registro: null, ficha: id, secao: secao ?? null })
  const onReload = () => void reload()

  const refreshButton = useMemo(() => (
    <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Recarregar a frota" loading={loading} onClick={() => void reload()} />
  ), [loading, reload])
  useShellHeader({ title: tab.label, actions: refreshButton })

  let body
  if (loading && !result) body = <Carregando />
  else if (fatal) body = <Alert tone="danger" title="Não foi possível carregar a frota" action={<Button variant="secondary" size="compact" onClick={onReload}>Tentar de novo</Button>}>{fatal}</Alert>
  else body = (
    <ViewGate errors={errors} tables={tab.tables} onRetry={onReload}>
      {route.tab === 'pendencias' && <Pendencias data={data} errors={errors} today={today} onOpen={onOpen} onOpenVeiculo={onOpenVeiculo} />}
      {route.tab === 'veiculos' && <Veiculos data={data} today={today} source={source} host={host} onOpenVeiculo={onOpenVeiculo} />}
      {route.tab === 'manutencoes' && <Registros key="manutencoes" kinds={['manutencao']} data={data} source={source} host={host} onOpen={onOpen} onReload={onReload} />}
      {route.tab === 'multas' && route.sub === 'multas' && <Registros key="multas" kinds={['multa']} data={data} source={source} host={host} onOpen={onOpen} onReload={onReload} />}
      {route.tab === 'colisoes' && <Registros key="colisoes" kinds={['colisao']} data={data} source={source} host={host} onOpen={onOpen} onReload={onReload} />}
      {route.tab === 'indicadores' && <Indicadores data={data} errors={errors} today={today} />}
      {route.tab === 'plano' && <PlanoPreventivo data={data} source={source} onReload={onReload} />}
    </ViewGate>
  )

  const conteudo = (
    <>
      <div className="frota">
        {route.tab === 'multas' ? (
          <Tabs aria-label="Multas e infrações" tabs={[{ value: 'multas', label: 'Multas' }, { value: 'infracoes', label: 'Infrações' }]} value={route.sub} onChange={abrirSub}>
            {route.sub === 'infracoes' ? <Suspense fallback={<Carregando />}><Infracoes host={host ?? MOCK_HOST} embutido /></Suspense> : body}
          </Tabs>
        ) : body}
      </div>

      {result && !fatal && route.veiculo && !registro ? <FichaVeiculo errors={errors} source={source} docs={docs} id={route.veiculo} secao={route.secao} data={data} today={today} onClose={() => patchHashQuery({ ficha: null, secao: null, fde: null, fate: null })} onOpen={onOpen} onReload={onReload} /> : null}
      {registro ? <RegistroDrawer key={`${registro.kind}-${registro.id}`} source={source} kind={registro.kind} id={registro.id} data={data} onClose={() => setRegistro(null)} onChanged={onReload} onClassificado={aplicarClassificacao} onOpenVeiculo={onOpenVeiculo} /> : null}
    </>
  )
  if (LISTAS.includes(route.tab)) return <div className="page page--full frota-page">{conteudo}</div>
  return (
    <PageLayout
      className="frota-page"
      eyebrow="Frota"
      title={tab.label}
      meta={<StatusBadge tone={source.mode === 'mock' ? 'neutral' : 'info'} dot>{source.mode === 'mock' ? 'Dados de exemplo' : `Ambiente ${source.envLabel}`}</StatusBadge>}
    >
      {conteudo}
    </PageLayout>
  )
}
