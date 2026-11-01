import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Grid, MetricCard, SearchBox, Select, StatusBadge, Tabs, ToastProvider, ViewBar, useShellHeader, type FilterOption } from '@betinhos/ui'
import { Droplets, Fuel, Gauge, RefreshCw, SearchX, Tag, Upload } from 'lucide-react'
import type { Host } from '../../host'
import { filterRows } from '../../app/filterRows'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { useListView } from '../../app/useListView'
import { useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { detectarAnomalias } from './domain/anomalias'
import { gerarAlertas, gerarDicas, montarContextoIA, type Proposta } from './domain/dicas'
import { fmtKmPorLitro, fmtLitros, fmtMes, fmtMoeda, fmtPrecoLitro } from './domain/formato'
import { cobertaPorExtrato } from './domain/importacao'
import { chaveVeiculo, filtrar, kmPorLitroPorAbastecimento, mesesDisponiveis, resumoPorMotorista, resumoPorVeiculo, totais, trechos } from './domain/indicadores'
import { COLUMNS, SORT, TELA, builtinViews, fields as listFields, readLinha, sortLinhas, textoBusca, type Linha } from './domain/lista'
import { useAbastecimento } from './useAbastecimento'
import { AbastecimentosCards, AbastecimentosTable } from './components/AbastecimentosList'
import { ImportarDrawer } from './components/ImportarDrawer'
import { Anomalias, DicasAlertas, PainelVeiculos, Pendencias } from './components/Paineis'
import '../pagantes/pagantes.css'
import './abastecimento.css'

export function AbastecimentoPage({ host }: { host: Host }) {
  return <ToastProvider><Abastecimento host={host} /></ToastProvider>
}

const ABAS = ['veiculos', 'lista', 'anomalias', 'dicas', 'pendencias'] as const
type Aba = (typeof ABAS)[number]
const isAba = (v: string): v is Aba => (ABAS as readonly string[]).includes(v)
/** Carrega os últimos 13 meses: o km/l do mês atual precisa do abastecimento anterior e o histórico do veículo pede alguns meses. */
const MESES_CARGA = 13
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
/** O Select do DS trata valor vazio como "sem escolha": a opção "Todos os meses" precisa de um valor próprio. */
const TODOS = 'todos'
const badge = (n: number) => (n ? <span className="ab-contagem">{n}</span> : undefined)

function Abastecimento({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const since = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - MESES_CARGA, 1); d.setHours(0, 0, 0, 0); return d }, [])
  const data = useAbastecimento(source, since)

  const [abaUrl, setAba] = useQueryTexto('aba', 'veiculos')
  const aba: Aba = isAba(abaUrl) ? abaUrl : 'veiculos'
  const [mes, setMes] = useQueryTexto('mes')
  const [motoristaId, setMotorista] = useQueryTexto('motorista')
  const [veiculoChave, setVeiculo] = useQueryTexto('veiculo')
  const [query, setQuery] = useQueryTexto('q')
  const q = useDebouncedText(query)
  const [importando, setImportando] = useState(false)

  // Despesas do App que o extrato já cobre saem da conta; as demais entram como origem "App".
  const { lista, cobertas } = useMemo(() => {
    const extratos = data.abastecimentos.filter((a) => a.origem !== 'app')
    const app = data.abastecimentos.filter((a) => a.origem === 'app')
    const soApp = app.filter((a) => !cobertaPorExtrato(a, extratos))
    return { lista: [...extratos, ...soApp], cobertas: app.length - soApp.length }
  }, [data.abastecimentos])
  const ts = useMemo(() => trechos(lista), [lista])
  const kmPorLitro = useMemo(() => kmPorLitroPorAbastecimento(ts), [ts])
  const filtrados = useMemo(() => filtrar(lista, { mes: mes || null, motoristaId: motoristaId || null, veiculoId: veiculoChave || null }), [lista, mes, motoristaId, veiculoChave])
  const tot = useMemo(() => totais(filtrados, ts), [filtrados, ts])
  const porVeiculo = useMemo(() => resumoPorVeiculo(filtrados, ts, data.veiculos), [filtrados, ts, data.veiculos])
  const porMotorista = useMemo(() => resumoPorMotorista(filtrados, ts), [filtrados, ts])
  // Anomalias usam o histórico inteiro como referência e só então respeitam o filtro.
  const anomalias = useMemo(() => { const ids = new Set(filtrados.map((a) => a.id)); return detectarAnomalias(lista, ts, data.veiculos).filter((an) => ids.has(an.abastecimento.id)) }, [lista, ts, data.veiculos, filtrados])
  const alertas = useMemo(() => gerarAlertas(anomalias), [anomalias])
  const dicas = useMemo(() => gerarDicas({ lista: filtrados, ts, motoristas: porMotorista, veiculos: porVeiculo }), [filtrados, ts, porMotorista, porVeiculo])
  const pendentes = useMemo(() => lista.filter((a) => !a.veiculoId && a.origem !== 'app').sort((a, b) => b.data.getTime() - a.data.getTime()), [lista])
  const existentes = useMemo(() => new Set(lista.map((a) => a.chave).filter(Boolean)), [lista])

  const meses = useMemo(() => [{ value: TODOS, label: 'Todos os meses' }, ...mesesDisponiveis(lista).map((m) => ({ value: m, label: fmtMes(m) }))], [lista])
  const motoristasOp = useMemo<FilterOption[]>(() => data.motoristas.filter((m) => m.ativo || lista.some((a) => a.motoristaId === m.id)).map((m) => ({ value: m.id, label: m.ativo ? m.nome : `${m.nome} (desligado)` })), [data.motoristas, lista])
  const veiculosOp = useMemo<FilterOption[]>(() => {
    const vistos = new Map<string, string>()
    for (const a of lista) if (!vistos.has(chaveVeiculo(a))) vistos.set(chaveVeiculo(a), a.placa || 'Sem placa')
    return [...vistos.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [lista])

  // Lista detalhada no padrão de visões (useListView): filtros em `f=`, visões prontas por origem.
  const linhas = useMemo<Linha[]>(() => filtrados.map((a) => ({ ...a, kmPorLitro: kmPorLitro.get(a.id) ?? null, veiculoChave: chaveVeiculo(a), motoristaChave: a.motoristaId ?? `nome:${a.motorista}` })), [filtrados, kmPorLitro])
  const fields = useMemo(() => listFields(veiculosOp, motoristasOp), [veiculosOp, motoristasOp])
  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({ host, tela: TELA, columns: COLUMNS, defaultSort: SORT, defaultName: 'Abastecimentos', fields, ready: data.loaded, builtins: builtinViews })
  const index = useMemo(() => keywordIndex<Linha>(textoBusca), [])
  const visiveis = useMemo(() => {
    const sorted = extra.sort(sortLinhas(linhas, view.config.sort), view.config.sort, (a) => a.id)
    const filtered = filterRows(sorted, filters, allFields, extra.read(readLinha, (a) => a.id))
    const words = searchWords(q)
    return words.length ? filtered.filter((a) => index.matches(a, words)) : filtered
  }, [linhas, view.config.sort, filters, allFields, extra, q, index])
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort, mes, motoristaId, veiculoChave }), [filters, q, view.config.sort, mes, motoristaId, veiculoChave])
  const { slice, more, loadMore } = useLazySlice(visiveis, lazyKey)

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const abrirImportar = () => setImportando(true)
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar abastecimentos" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Abastecimento', actions: headerActions })

  const linkAlvo = useCallback((p: Proposta) => (p.alvo.id ? (p.alvo.entidade === 'cr40f_veiculos' ? `#/frota-veiculos?ver=${p.alvo.id}` : `#/funcionarios?ver=${p.alvo.id}`) : null), [])
  const contexto = useCallback(() => JSON.stringify(montarContextoIA(new Date(), porVeiculo, porMotorista, anomalias), null, 2), [porVeiculo, porMotorista, anomalias])
  const vincular = useCallback(async (id: string, veiculoId: string) => { await source.vincularVeiculo(id, veiculoId); data.vincular(id, veiculoId) }, [source, data.vincular])
  const limparTudo = () => { clearFilters(); setQuery(''); setMes(''); setMotorista(''); setVeiculo('') }
  const carregando = !data.loaded

  let corpo
  if (data.error && !data.loaded) {
    corpo = <Alert tone="danger" title="Não foi possível carregar os abastecimentos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (aba === 'veiculos') {
    corpo = carregando ? <AbastecimentosTable list={[]} loading /> : <PainelVeiculos veiculos={porVeiculo} motoristas={porMotorista} onVeiculo={(chave) => { setVeiculo(chave); setAba('lista') }} />
  } else if (aba === 'lista') {
    const footer = <span className="pg-num">{plural(visiveis.length, 'abastecimento', 'abastecimentos')} de {filtrados.length} no filtro</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum abastecimento com estes filtros" action={<Button variant="secondary" onClick={limparTudo}>Limpar filtros</Button>} />
    corpo = (
      <>
        <div role="toolbar" aria-label="Comandos da lista">
          <ViewBar view={view} columns={COLUMNS} catalog={extra.catalog} filters={data.loaded ? { fields: allFields } : undefined}>
            <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por placa, motorista, posto ou arquivo" aria-label="Buscar abastecimentos" />
          </ViewBar>
        </div>
        {mobile
          ? (visiveis.length ? <AbastecimentosCards list={slice} /> : <div className="surface">{empty}</div>)
          : <AbastecimentosTable list={slice} loading={carregando} view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} />
      </>
    )
  } else if (aba === 'anomalias') corpo = <Anomalias lista={anomalias} />
  else if (aba === 'dicas') corpo = <DicasAlertas alertas={alertas} dicas={dicas} contexto={contexto} linkAlvo={linkAlvo} />
  else corpo = <Pendencias lista={pendentes} veiculos={data.veiculos} onVincular={vincular} />

  return (
    <div className="page ab-page">
      <div role="toolbar" aria-label="Filtros de abastecimento" className="ab-toolbar">
        {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        <Select className="pg-filters__select" aria-label="Mês" searchable={false} clearable={false} options={meses} value={mes || TODOS} onChange={(v) => setMes(!v || v === TODOS ? '' : v)} />
        <Select className="pg-filters__select" aria-label="Motorista" options={motoristasOp} value={motoristaId || null} onChange={(v) => setMotorista(v ?? '')} placeholder="Todos os motoristas" />
        <Select className="pg-filters__select" aria-label="Veículo" options={veiculosOp} value={veiculoChave || null} onChange={(v) => setVeiculo(v ?? '')} placeholder="Todos os veículos" />
        <Button className="ab-toolbar__importar" icon={<Upload size={16} />} onClick={abrirImportar} disabled={!data.loaded}>Importar extrato</Button>
      </div>
      <Grid min={220}>
        <MetricCard icon={<Droplets size={20} />} label="Litros" value={fmtLitros(tot.litros)} hint={plural(tot.qtd, 'abastecimento', 'abastecimentos')} loading={carregando} />
        <MetricCard icon={<Fuel size={20} />} label="Gasto" value={fmtMoeda(tot.valor)} hint={cobertas ? plural(cobertas, 'despesa do App já no extrato', 'despesas do App já no extrato') : 'extratos e App'} loading={carregando} />
        <MetricCard icon={<Gauge size={20} />} label="km/l médio" value={fmtKmPorLitro(tot.kmPorLitro)} hint={tot.kmPorLitro == null ? 'sem odômetro em sequência' : 'entre abastecimentos com odômetro'} loading={carregando} />
        <MetricCard icon={<Tag size={20} />} label="Preço médio" value={fmtPrecoLitro(tot.precoMedio)} hint="gasto ÷ litros" loading={carregando} />
      </Grid>
      {data.aviso ? <Alert tone="warning" title="Totais só com os extratos">{data.aviso} Gasto, litros e km/l não incluem as despesas de combustível do App.</Alert> : null}
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A tela mostra os dados da carga anterior.</Alert> : null}
      <Tabs aria-label="Seções de abastecimento" value={aba} onChange={setAba} tabs={[
        { value: 'veiculos', label: 'Por veículo' },
        { value: 'lista', label: 'Abastecimentos', badge: badge(filtrados.length) },
        { value: 'anomalias', label: 'Anomalias', badge: badge(anomalias.length) },
        { value: 'dicas', label: 'Dicas e alertas', badge: badge(alertas.length + dicas.length) },
        { value: 'pendencias', label: 'Pendências', badge: badge(pendentes.length) },
      ]}>
        {corpo}
      </Tabs>
      <ImportarDrawer open={importando} onClose={() => setImportando(false)} source={source} veiculos={data.veiculos} motoristas={data.motoristas} existentes={existentes}
        onImportado={data.acrescentar} onVerPendencias={() => setAba('pendencias')} />
    </div>
  )
}
