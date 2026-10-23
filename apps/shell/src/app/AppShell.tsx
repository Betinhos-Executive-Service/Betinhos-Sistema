import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle, Banknote, BookUser, Calculator, Calendar, Camera, Car, CarFront, ClipboardCheck, ClipboardList, Clock, Coins, Contact, Database, Download,
  FileText, FolderCheck, FolderCog, Gauge, Home, Hourglass, IdCard, KeyRound, Landmark, Laptop, LayoutDashboard, List, Mail, Megaphone, MapPin, Paperclip, Receipt, ReceiptText, Route,
  ScrollText, Shield, Shuffle, Sparkles, Tag, TrendingUp, Users, Wallet, Wrench,
} from 'lucide-react'
import { AppShell as Shell, type NavGroup } from '@betinhos/ui'
import { MENU, itemLabel, type MenuGroup } from '../nav/menu'
import { hrefFor, patchHashQuery, readHashQuery } from '../nav/useHashRoute'
import { useInstallPrompt } from './useInstallPrompt'

// Logo B da Betinhos: o mesmo WebResource usado como favicon e ícone do app instalável.
const BRAND_LOGO = '/WebResources/cr40f_SistemaBetinhosIcon192.png'

type Props = {
  activeId: string
  title: string
  entityLabels: Map<string, string>
  connection: { ok: boolean; text: string }
  /** Contador por id de item do menu (ex.: `documentos`). */
  badges?: Record<string, ReactNode>
  /** A tela ativa pede a navegação recolhida no trilho (grades largas), se o usuário não escolheu outra coisa. */
  defaultCollapsed?: boolean
  children: ReactNode
}

export const GROUP_ICONS: Record<string, ReactNode> = {
  inicio: <Home />,
  operacional: <Route />,
  financeiro: <Wallet />,
  frota: <Car />,
  cadastros: <Database />,
  'back-end': <FolderCog />,
}

// Um ícone por tela (id do sitemap). Todo item novo do menu precisa de ícone próprio,
// coerente com a tela e distinto dos vizinhos (regra do Design System).
export const ITEM_ICONS: Record<string, ReactNode> = {
  frota: <ClipboardList />,
  'frota-veiculos': <CarFront />,
  'frota-manutencoes': <Wrench />,
  'frota-multas': <AlertTriangle />,
  new_parcelamultafolha: <ReceiptText />,
  'frota-colisoes': <Camera />,
  'frota-indicadores': <Gauge />,
  'frota-plano': <Clock />,
  pendencias: <Hourglass />,
  funcionarios: <IdCard />,
  'assistente-logistica': <Sparkles />,
  'assistente-financeiro': <Sparkles />,
  'assistente-frota': <Sparkles />,
  'assistente-pessoas': <Sparkles />,
  cr40f_homebetinhos: <Home />,
  geral: <Calendar />,
  cr40f_reservadeveculos: <Calendar />,
  dashboard: <LayoutDashboard />,
  new_dashboard: <LayoutDashboard />,
  operacional: <Clock />,
  new_telafuncoesoperacionais: <Wrench />,
  cr40f_trocasdecarro: <Shuffle />,
  new_possedeveiculo: <KeyRound />,
  new_gestaochecklistsveiculos: <ClipboardCheck />,
  'new_gestao_erros_operacionais': <Shield />,
  infleet: <MapPin />,
  new_telaplanner: <ClipboardList />,
  cr40f_composicaodeprecos: <Calculator />,
  ops: <Coins />,
  pagantes: <Users />,
  cr40f_recibos_v2: <Receipt />,
  cr40f_pedidodecotacao: <Mail />,
  cr40f_telapagamentofornecedores: <Banknote />,
  cr40f_telafluxodecaixa: <TrendingUp />,
  pessoas: <Contact />,
  documentos: <FolderCheck />,
  cr40f_clientes1: <Landmark />,
  cr40f_veiculos: <CarFront />,
  cr40f_funcionarios: <BookUser />,
  new_curriculo: <ScrollText />,
  curriculos: <ScrollText />,
  equipamentos: <Laptop />,
  new_marketing: <Megaphone />,
  cr40f_servicosporpassageiro: <List />,
  new_teladespesasoperacionais: <Coins />,
  new_fotomanutencao: <Camera />,
  new_appmotoristaslog: <FileText />,
  cr40f_anexodespesaoperacional: <Paperclip />,
  cr40f_categoriadespesaoperacional: <Tag />,
  'despesas-operacionais': <ReceiptText />,
  cr40f_formapagamentodespesa: <Wallet />,
  cr40f_anexocolisao_v2: <Paperclip />,
  cr40f_anexorecebimento_v2: <Paperclip />,
  'custom-page-funcoes-operacionais': <Wrench />,
  comunicados: <Megaphone />,
  cr40f_gerenciarcomunicados: <Megaphone />,
  new_telacomposicaopreco: <Calculator />,
}

/** Traduz o sitemap do app para a navegação do AppShell do Design System. */
function toNavGroup(group: MenuGroup, entityLabels: Map<string, string>, badges?: Record<string, ReactNode>): NavGroup {
  return {
    id: group.id,
    label: group.label,
    icon: GROUP_ICONS[group.id],
    admin: group.id === 'back-end',
    items: group.items.map((item) => ({
      id: item.id,
      label: itemLabel(item, entityLabels),
      href: item.kind === 'external' ? item.url : hrefFor(item.id),
      external: item.kind === 'external',
      icon: ITEM_ICONS[item.id],
      badge: badges?.[item.id],
    })),
  }
}

/**
 * Estado do shell guardado na URL sem avisar as telas: lido uma vez na abertura e gravado em silêncio.
 * Com `useHashQuery`, cada tecla na busca ou abrir a gaveta re-renderizava a tela inteira (ex.: a grade do Geral).
 */
function useShellQuery(chave: string) {
  const [valor, setValor] = useState(() => readHashQuery().get(chave) ?? '')
  const alterar = useCallback((proximo: string) => {
    setValor(proximo)
    patchHashQuery({ [chave]: proximo === '' ? null : proximo }, { silent: true })
  }, [chave])
  return [valor, alterar] as const
}

/** Chrome persistente do Sistema Betinhos: AppShell do pacote alimentado pelo sitemap e pelo estado de conexão. */
export function AppShell({ activeId, title, entityLabels, connection, badges, defaultCollapsed, children }: Props) {
  const install = useInstallPrompt()
  // Gaveta do menu no celular e busca de telas também vivem na URL (`menu=1`, `busca=…`).
  const [menu, setMenu] = useShellQuery('menu')
  const setNavOpen = useCallback((open: boolean) => setMenu(open ? '1' : ''), [setMenu])
  const [search, setSearch] = useShellQuery('busca')
  // Trocar de tela leva uma URL sem `busca`; o campo acompanha e volta vazio, como antes.
  const shownId = useRef(activeId)
  useEffect(() => {
    if (shownId.current === activeId) return
    shownId.current = activeId
    setSearch('')
  }, [activeId, setSearch])
  // Grupos estáveis entre renders: sem isto o menu inteiro (ícones e filtro da busca) era refeito a cada render do shell.
  const groups = useMemo(() => MENU.map((group) => toNavGroup(group, entityLabels, badges)), [entityLabels, badges])
  return (
    <Shell
      brand={{ name: 'Betinhos', subtitle: 'Sistema interno', logo: <img src={BRAND_LOGO} alt="" />, href: hrefFor(MENU[0].items[0].id) }}
      groups={groups}
      activeId={activeId}
      title={title}
      defaultCollapsed={defaultCollapsed}
      navOpen={menu === '1'}
      onNavOpenChange={setNavOpen}
      search={search}
      onSearchChange={setSearch}
      status={{ tone: connection.ok ? 'success' : 'warning', text: connection.text }}
      footer={install ? (
        <button type="button" className="bt-shell__item" onClick={install}>
          <span className="bt-shell__item-icon" aria-hidden="true"><Download /></span>
          <span className="bt-shell__item-label">Instalar aplicativo</span>
        </button>
      ) : null}
    >
      {children}
    </Shell>
  )
}
