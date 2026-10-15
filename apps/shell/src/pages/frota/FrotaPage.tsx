import { RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, StatusBadge, Tabs, ToastProvider, useShellHeader } from '@betinhos/ui'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
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
import { buildPendencias } from './domain/pendencias'
import { Indicadores } from './views/Indicadores'
import { Pendencias } from './views/Pendencias'
import { Registros } from './views/Registros'
import { Veiculos } from './views/Veiculos'
import { useFrotaCarga } from './useFrotaCarga'
import './frota.css'

export type Tab = 'pendencias' | 'veiculos' | 'manutencoes' | 'ocorrencias' | 'indicadores'

const TABS: { id: Tab; label: string; tables: TableKey[] }[] = [
  { id: 'pendencias', label: 'Pendências', tables: ['manutencoes', 'multas', 'colisoes'] },
  { id: 'veiculos', label: 'Veículos', tables: ['veiculos', 'manutencoes', 'multas', 'colisoes'] },
  { id: 'manutencoes', label: 'Manutenções', tables: ['manutencoes'] },
  { id: 'ocorrencias', label: 'Multas e colisões', tables: ['multas', 'colisoes', 'infracoes'] },
  { id: 'indicadores', label: 'Indicadores', tables: ['manutencoes', 'multas', 'infracoes'] },
]

const KINDS: readonly Kind[] = ['manutencao', 'multa', 'colisao']
/** Parâmetros dos filtros das visões; sair de uma aba apaga todos, para o filtro de uma não vazar para a outra. */
const FILTROS_DAS_VISOES = ['q', 'status', 'tipo', 'veiculo', 'pessoa', 'categoria', 'de', 'ate', 'filtro', 'fde', 'fate'] as const

/** Aba, ficha do veículo e registro aberto vivem na URL: `#/frota?aba=veiculos&ficha=<id>&registro=multa:<id>` (pendências é a aba padrão). */
function useFrotaRota() {
  const query = useHashQuery()
  const tab = lerOpcao(query, 'aba', TABS.map((item) => item.id), 'pendencias')
  const veiculo = query.get('ficha') || null
  const [kind, id] = (query.get('registro') ?? '').split(':')
  const registro = KINDS.find((item) => item === kind) && id ? { kind: kind as Kind, id } : null
  return { tab, veiculo, registro }
}
const abrirAba = (tab: Tab) => patchHashQuery({ aba: tab === 'pendencias' ? null : tab, ficha: null, registro: null, ...Object.fromEntries(FILTROS_DAS_VISOES.map((chave) => [chave, null])) })

export function FrotaPage({ host }: { host: Host }) {
  const [state] = useState(() => {
    try { return { source: createFrotaSource(host), error: null } } catch (reason) { return { source: null, error: errorMessage(reason) } }
  })
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
  return (
    <ToastProvider>
      {state.source ? <Frota source={state.source} docs={docs} /> : (
        <PageLayout eyebrow="Frota" title="Frota">
          <Alert tone="danger" title="Não foi possível abrir a Frota">{state.error}. Abra o Sistema Betinhos pelo Dataverse.</Alert>
        </PageLayout>
      )}
    </ToastProvider>
  )
}

/** Página com a fonte já resolvida; exportada para os testes. */
export function Frota({ source, docs }: { source: DataSource; docs?: DocsSource | null }) {
  const { result, setResult, loading, fatal, reload } = useFrotaCarga(source)
  const route = useFrotaRota()
  const registro = route.registro
  const setRegistro = (next: { kind: Kind; id: string } | null) => patchHashQuery({ registro: next ? `${next.kind}:${next.id}` : null })
  const today = todaySP()

  /** Aplica a classificação de uma manutenção sem recarregar todas as tabelas. */
  const aplicarClassificacao = useCallback((id: string, c: Classificacao) => {
    setResult((prev) => prev && { ...prev, data: { ...prev.data, manutencoes: prev.data.manutencoes.map((m) => (m.id === id ? { ...m, servicos: c.servicos, categorias: c.categorias, origemClassificacao: c.origem, confiancaIa: c.confianca } : m)) } })
  }, [])

  const data = result?.data ?? EMPTY_DATA
  const errors = result?.errors ?? {}
  const pendentes = useMemo(() => buildPendencias(data, today).length, [data, today])
  const tab = TABS.find((item) => item.id === route.tab)!
  const onOpen = (kind: Kind, id: string) => setRegistro({ kind, id })
  const onOpenVeiculo = (id: string) => patchHashQuery({ registro: null, ficha: id })
  const onReload = () => void reload()

  const refreshButton = useMemo(() => (
    <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Recarregar a frota" loading={loading} onClick={() => void reload()} />
  ), [loading, reload])
  useShellHeader({ actions: refreshButton })

  let body
  if (loading && !result) body = <Carregando />
  else if (fatal) body = <Alert tone="danger" title="Não foi possível carregar a frota" action={<Button variant="secondary" size="compact" onClick={onReload}>Tentar de novo</Button>}>{fatal}</Alert>
  else body = (
    <ViewGate errors={errors} tables={tab.tables} onRetry={onReload}>
      {route.tab === 'pendencias' && <Pendencias data={data} today={today} onOpen={onOpen} />}
      {route.tab === 'veiculos' && <Veiculos data={data} today={today} source={source} onOpenVeiculo={onOpenVeiculo} />}
      {route.tab === 'manutencoes' && <Registros key="manutencoes" kinds={['manutencao']} data={data} source={source} onOpen={onOpen} onReload={onReload} />}
      {route.tab === 'ocorrencias' && <Registros key="ocorrencias" kinds={['multa', 'colisao']} data={data} source={source} onOpen={onOpen} onReload={onReload} />}
      {route.tab === 'indicadores' && <Indicadores data={data} today={today} />}
    </ViewGate>
  )

  return (
    <PageLayout
      className="frota-page"
      title="Frota"
      meta={<StatusBadge tone={source.mode === 'mock' ? 'neutral' : 'info'} dot>{source.mode === 'mock' ? 'Dados de exemplo' : `Ambiente ${source.envLabel}`}</StatusBadge>}
    >
      <div className="frota">
        <Tabs
          aria-label="Visões da frota"
          tabs={TABS.map((item) => ({ value: item.id, label: item.label, badge: item.id === 'pendencias' && pendentes > 0 ? pendentes : undefined }))}
          value={route.tab}
          onChange={abrirAba}
        >
          {body}
        </Tabs>
      </div>

      {result && !fatal && route.veiculo && !registro ? <FichaVeiculo errors={errors} source={source} docs={docs} id={route.veiculo} data={data} today={today} onClose={() => patchHashQuery({ ficha: null, fde: null, fate: null })} onOpen={onOpen} onReload={onReload} /> : null}
      {registro ? <RegistroDrawer key={`${registro.kind}-${registro.id}`} source={source} kind={registro.kind} id={registro.id} data={data} onClose={() => setRegistro(null)} onChanged={onReload} onClassificado={aplicarClassificacao} onOpenVeiculo={onOpenVeiculo} /> : null}
    </PageLayout>
  )
}
