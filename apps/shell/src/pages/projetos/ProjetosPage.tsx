import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, Drawer, EmptyState, SearchBox, SegmentedControl, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { FolderKanban, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { useDebouncedText } from '../../app/search'
import { useQueryAlvo, useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { FILTROS, contagens, ehFiltro, linhas, type Filtro } from './domain/painel'
import { hojeIso } from './domain/regras'
import type { Perfil } from './domain/types'
import { useProjetos } from './useProjetos'
import { Lista, ListaCarregando } from './components/Lista'
import { Painel } from './components/Painel'
import { ProjetoDrawer } from './components/ProjetoDrawer'
import './projetos.css'

export function ProjetosPage({ host }: { host: Host }) {
  return <ToastProvider><Projetos host={host} /></ToastProvider>
}

function Projetos({ host }: { host: Host }) {
  const toast = useToast()
  const source = useMemo(() => createSource(host), [host])
  const estreito = useMedia('(max-width: 1100px)')
  const mobile = useMedia('(max-width: 820px)')
  const data = useProjetos(source)
  const hoje = hojeIso()
  useShellHeader({ title: 'Projetos' })

  // Só o Renan muda status; no mock dá para trocar o perfil e ver a tela do gestor.
  const [perfil, setPerfil] = useState<Perfil>('gestor')
  useEffect(() => { let vivo = true; void source.perfil().then((p) => { if (vivo) setPerfil(p) }); return () => { vivo = false } }, [source])

  const [filtroTexto, setFiltro] = useQueryTexto('filtro', 'todos')
  const filtro: Filtro = ehFiltro(filtroTexto) && !(filtroTexto === 'mim' && perfil !== 'renan') ? filtroTexto : 'todos'
  const [query, setQuery] = useQueryTexto('q')
  const busca = useDebouncedText(query)

  // Projeto aberto no painel (`projeto=<id>`) e drawer do projeto (`novo`/`editar`).
  const [selecaoId, setSelecaoId] = useQueryId('projeto')
  const [alvo, setAlvo] = useQueryAlvo()

  // Atualização não registrada no painel: trocar de seleção ou fechar pergunta "Descartar alterações?".
  const [painelSujo, setPainelSujo] = useState(false)
  const [painelOcupado, setPainelOcupado] = useState(false)
  const [pendente, setPendente] = useState<{ seguir: () => void } | null>(null)
  /** Roda a ação que tira o painel da tela (trocar de projeto ou fechar) só depois de confirmar o descarte. */
  const guardar = useCallback((seguir: () => void) => {
    if (painelOcupado) { toast({ tone: 'info', message: 'Aguarde o envio da atualização terminar.' }); return }
    if (painelSujo) { setPendente({ seguir }); return }
    seguir()
  }, [painelOcupado, painelSujo, toast])
  const selecionar = useCallback((id: string | null) => guardar(() => setSelecaoId(id)), [guardar, setSelecaoId])

  const ctx = { projetos: data.projetos, etapas: data.etapas, atualizacoes: data.atualizacoes, perfil, hoje }
  const contas = useMemo(() => contagens(ctx), [data.projetos, data.etapas, data.atualizacoes, perfil, hoje])
  const lista = useMemo(() => linhas({ ...ctx, filtro, busca }), [data.projetos, data.etapas, data.atualizacoes, perfil, hoje, filtro, busca])

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const size = mobile ? 'touch' : 'default'
  const novo = () => setAlvo({ mode: 'create' })
  const projetoDaSelecao = selecaoId ? data.projetos.find((p) => p.id === selecaoId) : undefined

  let corpo
  if (data.error && !data.loaded) {
    corpo = <Alert tone="danger" title="Não foi possível carregar os projetos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    corpo = <ListaCarregando />
  } else if (!data.projetos.length) {
    corpo = <EmptyState className="surface" align="start" icon={<FolderKanban size={36} />} title="Nenhum projeto cadastrado." action={<Button icon={<Plus size={16} />} onClick={novo}>Novo projeto</Button>}>Cadastre o projeto com o briefing; a lista mostra a situação e o que falta em cada um.</EmptyState>
  } else if (!lista.length) {
    corpo = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nada neste filtro" action={<Button variant="secondary" onClick={() => { setFiltro(''); setQuery('') }}>Ver todos</Button>}>Nenhum projeto com este filtro e esta busca.</EmptyState>
  } else {
    corpo = <Lista linhas={lista} selecionado={selecaoId} onSelect={selecionar} />
  }

  const painelAberto = data.loaded && projetoDaSelecao != null
  const fecharPainel = useCallback(() => selecionar(null), [selecionar])
  // Esc fecha o painel fixo (no estreito o Drawer já cuida); diálogo ou drawer aberto por cima tem prioridade.
  useEffect(() => {
    if (!painelAberto || estreito) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !ev.defaultPrevented && !document.querySelector('[role="dialog"]')) fecharPainel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [painelAberto, estreito, fecharPainel])
  const painel = painelAberto ? (
    <Painel key={projetoDaSelecao.id} projeto={projetoDaSelecao} etapas={data.etapas} atualizacoes={data.atualizacoes} perfil={perfil} source={source} hoje={hoje}
      onAtualizacao={data.addAtualizacao} onEtapaSalva={data.upsertEtapa} onEditarProjeto={(id) => setAlvo({ mode: 'edit', id })}
      onDirty={setPainelSujo} onBusy={setPainelOcupado} onClose={estreito ? undefined : fecharPainel} />
  ) : null

  return (
    <div className={`page pj-page${painelAberto && !estreito ? ' pj-page--painel' : ''}`}>
      <div className="pj-barra-topo" role="toolbar" aria-label="Comandos de projetos">
        <div className="pj-barra-topo__busca">
          <SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar projeto ou PRJ…" aria-label="Buscar projeto ou PRJ" />
        </div>
        <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />
        <Button size={size} icon={<Plus size={16} />} disabled={!data.loaded} onClick={novo}>Novo</Button>
      </div>
      <div className="pj-chips" role="group" aria-label="Filtros rápidos">
        {FILTROS.filter((f) => f.value !== 'mim' || perfil === 'renan').map((f) => (
          <button key={f.value} type="button" className="pj-chip" aria-pressed={filtro === f.value} onClick={() => setFiltro(f.value === 'todos' ? '' : f.value)}>
            {f.label} <span className="pj-num">· {data.loaded ? contas[f.value] : '…'}</span>
          </button>
        ))}
        {source.mock ? (
          <span className="pj-chips__mock">
            <StatusBadge tone="info">Dados de exemplo</StatusBadge>
            <SegmentedControl size="compact" aria-label="Perfil (exemplo)" value={perfil} onChange={(v) => setPerfil(v as Perfil)} options={[{ value: 'renan', label: 'Renan' }, { value: 'gestor', label: 'Gestor' }]} />
          </span>
        ) : null}
      </div>

      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <div className="pj-corpo">{corpo}</div>
      {painel && !estreito ? <aside className="pj-painel" aria-label="Detalhe">{painel}</aside> : null}
      {estreito ? (
        <Drawer open={painel != null} onClose={fecharPainel} size="wide" eyebrow="Projetos" title={projetoDaSelecao ? `${projetoDaSelecao.codigo} · ${projetoDaSelecao.nome}` : 'Detalhe'}>
          {painel}
        </Drawer>
      ) : null}
      {data.loaded ? (
        <ProjetoDrawer target={alvo} onClose={() => setAlvo(null)} onDone={(id) => { setAlvo(null); setSelecaoId(id) }} projetos={data.projetos} etapas={data.etapas} atualizacoes={data.atualizacoes} perfil={perfil} source={source} onSaved={data.upsert} onEtapaSalva={data.upsertEtapa} />
      ) : null}
      <Dialog open={pendente != null} onClose={() => setPendente(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendente(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { const seguir = pendente?.seguir; setPendente(null); setPainelSujo(false); seguir?.() }}>Descartar</Button>
        </>}>
        A atualização deste painel ainda não foi registrada.
      </Dialog>
    </div>
  )
}
