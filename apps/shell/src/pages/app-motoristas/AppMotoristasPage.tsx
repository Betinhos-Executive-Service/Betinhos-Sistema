import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { hojeSaoPaulo } from '@betinhos/app-config'
import { Alert, Button, Dialog, Drawer, EmptyState, SearchBox, SegmentedControl, StatusBadge, ToastProvider, ViewBar, useShellHeader, useToast } from '@betinhos/ui'
import { RefreshCw, SearchX, ShieldOff, Smartphone } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { filterRows } from '../../app/filterRows'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { useAcessoConfigApp } from '../../app/useAcessoConfigApp'
import { useListView } from '../../app/useListView'
import { patchHashQuery, useHashQuery } from '../../nav/useHashRoute'
import { useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import type { Acesso } from './domain/acesso'
import { ABAS, escreverVer, lerAba, lerModo, lerMotorista, lerVer, type Aba, type Modo, type VerComo } from './domain/url'
import { MOTORISTA_COLUMNS, MOTORISTA_FIELDS, MOTORISTA_SORT, TELA, builtinViews, motoristaKeywordText, sortMotoristas } from './domain/lista'
import { configDoPreview, linhaDoTempo, ocultos as calcularOcultos, readMotorista, ROTULO_PERFIL } from './domain/regras'
import type { Motorista } from './domain/types'
import { useAppMotoristas } from './useAppMotoristas'
import { Historico } from './components/Historico'
import { MotoristaDrawer } from './components/MotoristaDrawer'
import { MotoristasCards, MotoristasTable } from './components/MotoristasLista'
import { BarraRascunho, MatrizPerfis } from './components/Perfis'
import { Preview } from './components/Preview'
import { PublicarDialog } from './components/PublicarDialog'
import './app-motoristas.css'

export function AppMotoristasPage({ host }: { host: Host }) {
  return <ToastProvider><AppMotoristas host={host} /></ToastProvider>
}

const ROTULO_ABA: Record<Aba, string> = { perfis: 'Perfis', motoristas: 'Motoristas', historico: 'Histórico' }

/** URL do App para o iframe: Dataverse monta pelo ambiente; o `pnpm dev` só tem preview com a variável opcional. */
function urlDoPreview(host: Host): string | null {
  if (host.mode === 'dataverse') return `${host.clientUrl}/WebResources/new_app-motoristas-v2?preview=1`
  return import.meta.env.VITE_APP_MOTORISTAS_PREVIEW_URL || null
}

function AppMotoristas({ host }: { host: Host }) {
  const acesso = useAcessoConfigApp()
  useShellHeader({ title: 'App Motoristas' })
  if (!acesso) return <div className="page"><div className="am-vazio" role="status">Verificando acesso…</div></div>
  if (!acesso.gestor) {
    return (
      <div className="page">
        <EmptyState className="surface" align="start" icon={<ShieldOff size={36} />} title="Sem acesso">
          A configuração do App Motoristas é do perfil Operacional – Gestor e do Administrador do Sistema.
        </EmptyState>
      </div>
    )
  }
  return <Tela host={host} acesso={acesso} />
}

function Tela({ host, acesso }: { host: Host; acesso: Acesso }) {
  const toast = useToast()
  const aviso = useCallback((tone: 'success' | 'danger' | 'info', message: string) => toast({ tone, message }), [toast])
  const source = useMemo(() => createSource(host), [host])
  const data = useAppMotoristas(source, aviso)
  const estreito = useMedia('(max-width: 1100px)')
  const mobile = useMedia('(max-width: 820px)')
  const size = mobile ? 'touch' : 'default'
  const hoje = useMemo(() => hojeSaoPaulo(new Date()), [])

  // Aba, "ver como", modo do preview e motorista aberto ficam na URL.
  const query = useHashQuery()
  const aba = lerAba(query)
  const ver = lerVer(query)
  const modo = lerModo(query)
  const motoristaId = lerMotorista(query)
  const irParaAba = (a: Aba) => patchHashQuery({ aba: a === 'perfis' ? null : a })
  const mudarVer = (v: VerComo) => { const valor = escreverVer(v); patchHashQuery({ ver: valor === 'perfil:proprio' ? null : valor }) }
  const mudarModo = (m: Modo) => patchHashQuery({ modo: m === 'rascunho' ? null : m })

  const [publicarAberto, setPublicarAberto] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [voltarPara, setVoltarPara] = useState<string | null>(null)
  const [previewAberto, setPreviewAberto] = useState(false)
  useEffect(() => { if (!estreito) setPreviewAberto(false) }, [estreito])

  const modoEfetivo: Modo = modo === 'publicado' && data.publicada ? 'publicado' : 'rascunho'
  const motoristaVer = ver.tipo === 'motorista' ? data.motoristas.find((m) => m.id === ver.id) ?? null : null
  const alvo = useMemo(() => (ver.tipo === 'motorista' && motoristaVer ? { tipo: 'motorista' as const, motorista: motoristaVer } : { tipo: 'perfil' as const, perfil: ver.tipo === 'perfil' ? ver.perfil : 'proprio' as const }), [ver, motoristaVer])
  const matrizDoModo = modoEfetivo === 'publicado' ? data.publicada?.matriz ?? null : data.matriz
  const configPreview = useMemo(() => configDoPreview(alvo, matrizDoModo, hoje, data.publicada?.numero ?? null), [alvo, matrizDoModo, hoje, data.publicada])
  const configPublicada = useMemo(() => (data.publicada ? configDoPreview(alvo, data.publicada.matriz, hoje, data.publicada.numero) : null), [alvo, data.publicada, hoje])
  const listaOcultos = useMemo(() => calcularOcultos(configPreview, modoEfetivo === 'rascunho' ? configPublicada : null), [configPreview, configPublicada, modoEfetivo])
  const rotuloAlvo = alvo.tipo === 'motorista' ? alvo.motorista.nome : `perfil ${ROTULO_PERFIL[alvo.perfil]}`
  const nomePreview = alvo.tipo === 'motorista' ? alvo.motorista.nome : `Motorista ${ROTULO_PERFIL[alvo.perfil]}`
  const preview = (
    <Preview url={urlDoPreview(host)} config={configPreview} nome={nomePreview} ver={ver} onVer={mudarVer} modo={modoEfetivo} onModo={mudarModo}
      motoristas={data.motoristas} temPublicada={Boolean(data.publicada)} ocultos={listaOcultos} rotuloAlvo={rotuloAlvo} />
  )

  const lista = useListView({
    host, tela: TELA, columns: MOTORISTA_COLUMNS, defaultSort: MOTORISTA_SORT, defaultName: 'Motoristas', fields: MOTORISTA_FIELDS,
    ready: data.loaded, builtins: builtinViews,
  })
  const [busca, setBusca] = useQueryTexto('q')
  const q = useDebouncedText(busca)
  const lido = useCallback((m: Motorista, key: string) => readMotorista(m, key, hoje), [hoje])
  const ordenados = useMemo(() => sortMotoristas(data.motoristas, lista.view.config.sort, hoje), [data.motoristas, lista.view.config.sort, hoje])
  const filtrados = useMemo(() => filterRows(ordenados, lista.filters, lista.fields, lido), [ordenados, lista.filters, lista.fields, lido])
  const indice = useMemo(() => keywordIndex<Motorista>((m) => motoristaKeywordText(m, hoje)), [hoje])
  const palavras = useMemo(() => searchWords(q), [q])
  const visiveis = useMemo(() => (palavras.length ? filtrados.filter((m) => indice.matches(m, palavras)) : filtrados), [filtrados, indice, palavras])
  const lazyKey = useMemo(() => JSON.stringify({ f: lista.filters, q, s: lista.view.config.sort }), [lista.filters, q, lista.view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visiveis, lazyKey)

  const abrirMotorista = (id: string) => patchHashQuery({ motorista: id })
  const fecharMotorista = () => patchHashQuery({ motorista: null })
  const motoristaAberto = motoristaId ? data.motoristas.find((m) => m.id === motoristaId) ?? null : null

  const eventos = useMemo(() => linhaDoTempo(data.versoes, data.motoristas, hoje), [data.versoes, data.motoristas, hoje])
  const descartar = async () => { setConfirmarDescarte(false); await data.descartar() }
  const carregarVersao = (id: string) => {
    const v = data.versoes.find((x) => x.id === id)
    if (!v) return
    data.carregarMatriz(v.matriz)
    aviso('info', `Versão ${v.numero} carregada como rascunho. Revise e publique quando quiser.`)
  }
  const confirmarVoltar = () => {
    if (voltarPara) carregarVersao(voltarPara)
    setVoltarPara(null)
  }
  // Com mudanças no rascunho, trocar a matriz pede confirmação.
  const pedirVoltar = (id: string) => (data.mudancas > 0 ? setVoltarPara(id) : carregarVersao(id))
  const publicar = async (nota: string) => {
    const n = await data.publicar(nota)
    if (n == null) return false
    aviso('success', `Versão ${n} publicada. O App passa a usar a nova configuração.`)
    return true
  }

  let corpo: ReactNode
  if (data.error && !data.loaded) {
    corpo = <Alert tone="danger" title="Não foi possível carregar a configuração" action={<Button variant="secondary" onClick={() => void data.reload()}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    corpo = <div className="am-vazio" role="status">Carregando a configuração…</div>
  } else if (aba === 'perfis') {
    corpo = <MatrizPerfis matriz={data.matriz} publicada={data.publicada?.matriz ?? null} onAlterar={data.alterarCelula} />
  } else if (aba === 'historico') {
    corpo = <Historico eventos={eventos} numeroNoAr={data.publicada?.numero ?? null} onVoltar={pedirVoltar} />
  } else {
    const limpar = () => { lista.clearFilters(); setBusca('') }
    const vazio = (
      <EmptyState align="start" icon={<SearchX size={36} />} title={data.motoristas.length ? 'Nenhum motorista com estes filtros' : 'Nenhum motorista com acesso ao App'}
        action={data.motoristas.length ? <Button variant="secondary" onClick={limpar}>Limpar filtros</Button> : undefined} />
    )
    const rodape = <span className="am-muted">{visiveis.length} de {data.motoristas.length} motoristas</span>
    corpo = (
      <>
        <div role="toolbar" aria-label="Comandos da lista de motoristas">
          <ViewBar view={lista.view} columns={MOTORISTA_COLUMNS} filters={{ fields: lista.fields }}
            search={<SearchBox size={size} value={busca} onChange={setBusca} placeholder="Buscar por nome, perfil ou exceção" aria-label="Buscar motoristas" />} />
        </div>
        {mobile
          ? (visiveis.length ? <MotoristasCards list={slice} hoje={hoje} onOpen={abrirMotorista} /> : <div className="surface">{vazio}</div>)
          : <MotoristasTable list={slice} hoje={hoje} onOpen={abrirMotorista} view={{ config: lista.view.config, onChange: lista.view.setConfig, density: lista.view.density, pinnable: true }} quickFilters={lista.quickFilters} footer={rodape} empty={vazio} />}
        <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} />
      </>
    )
  }

  return (
    <div className="page page--full am-page">
      <div className="am-topo">
        <SegmentedControl aria-label="Seções da configuração" value={aba} onChange={irParaAba} options={ABAS.map((a) => ({ value: a, label: ROTULO_ABA[a] }))} />
        <span className="am-topo__fim">
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={() => void data.reload()} />
          {estreito ? <Button variant="secondary" size={size} icon={<Smartphone size={16} />} onClick={() => setPreviewAberto(true)}>Ver no App</Button> : null}
        </span>
      </div>
      {data.loaded ? (
        <BarraRascunho publicada={data.publicada} rascunho={data.rascunho} temRascunho={data.temRascunho} mudancas={data.mudancas} estado={data.estado} ocupado={data.ocupado}
          onDescartar={() => setConfirmarDescarte(true)} onPublicar={() => setPublicarAberto(true)} />
      ) : null}
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={() => void data.reload()}>Tentar de novo</Button>}>{data.error}</Alert> : null}
      <div className="am-grade">
        <section className="am-principal" aria-label={ROTULO_ABA[aba]}>{corpo}</section>
        {!estreito ? <aside className="am-lateral" aria-label="Preview do App">{preview}</aside> : null}
      </div>

      {estreito ? <Drawer open={previewAberto} onClose={() => setPreviewAberto(false)} title="Ver no App">{preview}</Drawer> : null}
      <MotoristaDrawer motorista={motoristaAberto} naoEncontrado={Boolean(motoristaId) && data.loaded && !motoristaAberto} open={Boolean(motoristaId)} onClose={fecharMotorista}
        publicada={data.publicada} hoje={hoje} admin={acesso.admin} onDefinir={data.definirPessoa} onToast={aviso} />
      <PublicarDialog open={publicarAberto} onClose={() => setPublicarAberto(false)} publicada={data.publicada?.matriz ?? null} rascunho={data.matriz} numeroNoAr={data.publicada?.numero ?? null}
        motoristas={data.motoristas} hoje={hoje} onConfirmar={publicar} />
      <Dialog open={confirmarDescarte} onClose={() => setConfirmarDescarte(false)} title="Descartar o rascunho?"
        actions={<><Button variant="secondary" onClick={() => setConfirmarDescarte(false)}>Continuar editando</Button><Button variant="danger" onClick={() => void descartar()}>Descartar rascunho</Button></>}>
        As {data.mudancas} {data.mudancas === 1 ? 'mudança' : 'mudanças'} do rascunho serão perdidas e a matriz volta ao que está no ar.
      </Dialog>
      <Dialog open={voltarPara != null} onClose={() => setVoltarPara(null)} title="Substituir o rascunho?"
        actions={<><Button variant="secondary" onClick={() => setVoltarPara(null)}>Continuar editando</Button><Button variant="danger" onClick={confirmarVoltar}>Substituir rascunho</Button></>}>
        O rascunho atual tem {data.mudancas} {data.mudancas === 1 ? 'mudança' : 'mudanças'} e será trocado pela versão escolhida.
      </Dialog>
    </div>
  )
}
