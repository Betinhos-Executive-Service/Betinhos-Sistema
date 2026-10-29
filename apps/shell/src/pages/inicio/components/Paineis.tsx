import { useEffect, useRef, useState } from 'react'
import { Button, buttonClassName, EmptyState, MetricCard, Skeleton, StatusBadge, Surface } from '@betinhos/ui'
import { AlertCircle, Bell, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, ExternalLink, ListTodo, Maximize2, Minimize2, Newspaper, RefreshCw, UserRound, Users } from 'lucide-react'
import { imagemSegura } from '../data/capas'
import { textoPlano, urlSegura } from '../domain/inicio'
import { dailyMessages as frases, getDailyMessage, rotateDailyMessage } from '../domain/frases/frases'
import type { Comunicado, Indicador, Noticia, ServicoAReceber, Tarefa } from '../domain/types'
import type { Escopo } from '../useInicio'

function IconeIndicador({ indicador }: { indicador: Indicador }) {
  const { id, tom } = indicador
  if (id === 'peak_hour' || id === 'scheduled_revenue' || id === 'business_days_to_close') return <CalendarClock size={20} />
  if (id === 'revenue_vs_goal' || id === 'receipts_kpi' || id === 'today_receivables') return <CircleDollarSign size={20} />
  if (id === 'pending_composition') return <ClipboardList size={20} />
  if (tom === 'danger') return <AlertCircle size={20} />
  if (tom === 'info') return <ListTodo size={20} />
  if (tom === 'success') return <CheckCircle2 size={20} />
  return <Bell size={20} />
}

export function Indicadores({ itens, carregando, quantos, onAbrir }: { itens: Indicador[] | null; carregando: boolean; quantos: number; onAbrir: (i: Indicador) => void }) {
  if (!itens) {
    return <div className="ini-metricas" aria-busy="true">{Array.from({ length: quantos }, (_, i) => <MetricCard key={i} label=" " value="" hint=" " loading />)}</div>
  }
  return (
    <div className="ini-metricas" aria-label="Indicadores da visão" aria-busy={carregando || undefined}>
      {itens.map((i) => (
        <button key={i.id} type="button" className="ini-metrica" onClick={() => onAbrir(i)} aria-label={`${i.label}: ${i.valor}. Abrir`}>
          <MetricCard icon={<IconeIndicador indicador={i} />} tone={i.tom} label={i.label} value={i.valor} hint={i.detalhe} />
        </button>
      ))}
    </div>
  )
}

export function FraseDoDia() {
  const [{ dayKey, index }, setFrase] = useState(getDailyMessage)
  const frase = frases[index]!
  return (
    <figure className="ini-frase" aria-label="Mensagem do dia">
      <blockquote>{frase.text}</blockquote>
      {frase.author ? <figcaption>{frase.author}</figcaption> : null}
      <Button variant="ghost" size="compact" icon={<RefreshCw size={14} />} aria-label="Trocar mensagem do dia" title="Trocar mensagem"
        onClick={() => setFrase({ dayKey, index: rotateDailyMessage(dayKey, index) })} />
    </figure>
  )
}

const TOM_COMUNICADO = { info: 'info', attention: 'warning', critical: 'danger' } as const

export function FaixaComunicado({ comunicado, carregando, onGerenciar }: { comunicado: Comunicado | null; carregando: boolean; onGerenciar: () => void }) {
  return (
    <section className="ini-comunicado bt-surface" aria-label="Comunicado mais recente">
      <Bell size={18} aria-hidden="true" />
      {comunicado ? (
        <>
          <StatusBadge tone={TOM_COMUNICADO[comunicado.prioridade]}>Comunicado</StatusBadge>
          <strong>{comunicado.titulo}</strong>
          <span className="ini-comunicado__corpo">{comunicado.corpo}</span>
        </>
      ) : <span className="ini-comunicado__corpo">{carregando ? 'Carregando comunicado…' : 'Nenhum comunicado ativo'}</span>}
      <Button variant="ghost" size="compact" onClick={onGerenciar}>Gerenciar<ChevronRight size={15} aria-hidden="true" /></Button>
    </section>
  )
}

const TOM_ESTADO = { 'Crítico': 'danger', 'Atenção': 'warning', Novo: 'info' } as const

function Bloco({ titulo, tom, tarefas, carregando, vazio, onAbrir }: { titulo: string; tom: 'atrasada' | 'hoje'; tarefas: Tarefa[]; carregando: boolean; vazio: string; onAbrir: (id: string) => void }) {
  return (
    <section className={`ini-bloco ini-bloco--${tom}`}>
      <h3>{titulo} <strong>{String(tarefas.length).padStart(2, '0')}</strong></h3>
      {carregando ? <div className="ini-skeletons"><Skeleton height={44} /><Skeleton height={44} /></div>
        : tarefas.length === 0 ? <p className="ini-vazio">{vazio}</p>
        : <ul className="ini-tarefas">{tarefas.slice(0, 3).map((t) => (
          <li key={t.id}>
            <button type="button" className="ini-tarefa" onClick={() => onAbrir(t.id)}>
              <span className={`ini-ponto ini-ponto--${TOM_ESTADO[t.estado]}`} aria-hidden="true" />
              <span className="ini-tarefa__texto"><strong>{t.titulo}</strong><small>Prioridade {t.prioridade.toLowerCase()}</small></span>
              <em>{t.prazoLabel}</em>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}</ul>}
    </section>
  )
}

export function PainelPlanner({ atrasadas, hoje, carregando, escopo, onEscopo, onAbrir, onVerTodas }: {
  atrasadas: Tarefa[]; hoje: Tarefa[]; carregando: boolean; escopo: Escopo; onEscopo: (e: Escopo) => void; onAbrir: (id: string) => void; onVerTodas: () => void
}) {
  const botao = (e: Escopo, label: string, icon: React.ReactNode) => (
    <button type="button" className={escopo === e ? 'is-ativo' : ''} aria-pressed={escopo === e} onClick={() => onEscopo(e)}>{icon}{label}</button>
  )
  return (
    <Surface className="ini-planner" title={<><ListTodo size={18} aria-hidden="true" /> Planner</>}
      action={<Button variant="ghost" size="compact" onClick={onVerTodas}>Ver todas as tarefas<ChevronRight size={15} aria-hidden="true" /></Button>}>
      <div className="ini-escopo" role="group" aria-label="Filtrar tarefas">
        {botao('todas', 'Todas', <Users size={13} aria-hidden="true" />)}
        {botao('minhas', 'Minhas', <UserRound size={13} aria-hidden="true" />)}
      </div>
      <div className="ini-blocos">
        <Bloco titulo="Atrasadas" tom="atrasada" tarefas={atrasadas} carregando={carregando} vazio="Nenhuma tarefa atrasada" onAbrir={onAbrir} />
        <Bloco titulo="Hoje" tom="hoje" tarefas={hoje} carregando={carregando} vazio="Nenhuma tarefa para hoje" onAbrir={onAbrir} />
      </div>
    </Surface>
  )
}

export function ServicosAReceber({ servicos, carregando, onAbrir }: { servicos: ServicoAReceber[]; carregando: boolean; onAbrir: () => void }) {
  return (
    <Surface title={<><CalendarDays size={18} aria-hidden="true" /> Serviços a receber</>} action={<span className="ini-legenda">Hoje e amanhã</span>}>
      {carregando ? <div className="ini-skeletons"><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></div>
        : servicos.length === 0 ? <p className="ini-vazio">Nenhum serviço previsto</p>
        : <ul className="ini-receber">{servicos.map((s) => (
          <li key={s.id}>
            <button type="button" className="ini-receber__linha" onClick={onAbrir}>
              <span className="ini-receber__data"><strong>{s.data}</strong><small>{s.hora}</small></span>
              <span className="ini-receber__texto"><strong>{s.titulo}</strong><small>Pax: {s.passageiro} · {s.rota}</small></span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}</ul>}
    </Surface>
  )
}

const hora = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)
}
const TOM_NOTICIA = { Normal: 'info', Alta: 'warning', 'Crítica': 'danger' } as const

function Capa({ noticia, src, grande = false }: { noticia: Noticia; src: string | null | undefined; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  const imagem = falhou ? undefined : imagemSegura(src)
  const url = urlSegura(noticia.url)
  const capa = (
    <div className={`ini-capa${grande ? ' ini-capa--grande' : ''}`}>
      {imagem
        ? <img src={imagem} alt="" loading={grande ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
        : <span className="ini-capa__fallback"><Newspaper size={grande ? 28 : 18} aria-hidden="true" />{grande ? noticia.tema : null}</span>}
    </div>
  )
  return url ? <a className="ini-capa__link" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir notícia: ${noticia.titulo}`} tabIndex={-1}>{capa}</a> : capa
}

function Titulo({ noticia }: { noticia: Noticia }) {
  const url = urlSegura(noticia.url)
  return url ? <a href={url} target="_blank" rel="noreferrer">{noticia.titulo}</a> : <>{noticia.titulo}</>
}

function ItemNoticia({ noticia, src }: { noticia: Noticia; src: string | null | undefined }) {
  return (
    <article className="ini-noticia">
      <Capa noticia={noticia} src={src} />
      <div className="ini-noticia__texto">
        <StatusBadge tone={TOM_NOTICIA[noticia.prioridade]}>{noticia.tema}</StatusBadge>
        <h3><Titulo noticia={noticia} /></h3>
        <p>{textoPlano(noticia.resumo)}</p>
        <small>{noticia.fonte} · {hora(noticia.publicadoEm)}</small>
      </div>
    </article>
  )
}

/** Radar Betinhos: compacto na coluna; expandido vira janela modal com filtro por tema (Esc fecha). */
export function Radar({ noticias, capas }: { noticias: Noticia[] | null; capas: Record<string, string | null> }) {
  const [expandido, setExpandido] = useState(false)
  const [tema, setTema] = useState('Todos')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (expandido && !d.open) d.showModal?.()
    if (!expandido && d.open) d.close()
  }, [expandido])

  const lista = noticias ?? []
  const temas = ['Todos', ...new Set(lista.map((n) => n.tema))]
  const capaDe = (n: Noticia) => capas[urlSegura(n.url) ?? '']

  const conteudo = (modo: 'compacto' | 'expandido') => {
    if (!noticias) return <div className="ini-skeletons"><Skeleton height={140} shape="rect" /><Skeleton height={56} /><Skeleton height={56} /></div>
    const visiveis = (modo === 'expandido' && tema !== 'Todos' ? lista.filter((n) => n.tema === tema) : lista).slice(0, modo === 'expandido' ? 24 : 3)
    if (!visiveis.length) return <EmptyState compact title="Nenhuma notícia disponível" />
    const [destaque, ...resto] = visiveis as [Noticia, ...Noticia[]]
    const url = urlSegura(destaque.url)
    return (
      <div className={`ini-radar__corpo ini-radar__corpo--${modo}`}>
        <article className="ini-destaque">
          <Capa noticia={destaque} src={capaDe(destaque)} grande />
          <div className="ini-noticia__texto">
            <StatusBadge tone={TOM_NOTICIA[destaque.prioridade]}>{destaque.tema}</StatusBadge>
            <h3><Titulo noticia={destaque} /></h3>
            <p>{textoPlano(destaque.resumo)}</p>
            <small>{destaque.fonte} · {hora(destaque.publicadoEm)}</small>
            {modo === 'expandido' && url ? <a className={buttonClassName({ variant: 'secondary', size: 'compact' }, 'ini-ler')} href={url} target="_blank" rel="noreferrer">Ler notícia<ExternalLink size={14} aria-hidden="true" /></a> : null}
          </div>
        </article>
        {resto.length ? <div className="ini-noticias">{resto.map((n) => <ItemNoticia key={n.id} noticia={n} src={capaDe(n)} />)}</div> : null}
      </div>
    )
  }

  return (
    <>
      <Surface className="ini-radar" eyebrow="Inteligência de mercado" title={<><Newspaper size={18} aria-hidden="true" /> Radar Betinhos</>}
        action={<Button variant="ghost" size="compact" icon={<Maximize2 size={16} />} aria-label="Expandir radar" onClick={() => setExpandido(true)} />}>
        {conteudo('compacto')}
      </Surface>
      <dialog ref={ref} className="ini-radar-dialog" aria-label="Radar Betinhos" onCancel={(e) => { e.preventDefault(); setExpandido(false) }}
        onClick={(e) => { if (e.target === e.currentTarget) setExpandido(false) }}>
        {expandido ? (
          <div className="ini-radar-dialog__painel">
            <header className="ini-radar-dialog__topo">
              <div><span className="bt-surface__eyebrow">Inteligência de mercado</span><h2><Newspaper size={18} aria-hidden="true" /> Radar Betinhos</h2><p>Sinais de mercado e operação.</p></div>
              <Button variant="ghost" size="compact" icon={<Minimize2 size={16} />} aria-label="Fechar radar" onClick={() => setExpandido(false)} />
            </header>
            <nav className="ini-temas" aria-label="Filtrar notícias por tema">
              {temas.map((t) => <button key={t} type="button" className={tema === t ? 'is-ativo' : ''} aria-pressed={tema === t} onClick={() => setTema(t)}>{t}</button>)}
            </nav>
            {conteudo('expandido')}
          </div>
        ) : null}
      </dialog>
    </>
  )
}
