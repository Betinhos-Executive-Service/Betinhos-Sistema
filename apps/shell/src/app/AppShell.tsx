import type { ReactNode } from 'react'
import {
  AlertTriangle, Banknote, BookUser, Calculator, Calendar, Camera, Car, CarFront, ClipboardList, Clock, Coins, Database, Download,
  FileText, FolderCog, Home, KeyRound, Landmark, LayoutDashboard, List, Mail, Megaphone, MapPin, Paperclip, Palette, Receipt, Route,
  ScrollText, Shield, Shuffle, Tag, TrendingUp, Users, Wallet, Wrench,
} from 'lucide-react'
import { AppShell as Shell, type NavGroup } from '@betinhos/ui'
import { MENU, itemLabel, type MenuGroup } from '../nav/menu'
import { hrefFor } from '../nav/useHashRoute'
import { useInstallPrompt } from './useInstallPrompt'

type Props = {
  activeId: string
  title: string
  entityLabels: Map<string, string>
  connection: { ok: boolean; text: string }
  children: ReactNode
}

const GROUP_ICONS: Record<string, ReactNode> = {
  inicio: <Home />,
  operacional: <Route />,
  financeiro: <Wallet />,
  frota: <Car />,
  cadastros: <Database />,
  'back-end': <FolderCog />,
  'design-system': <Palette />,
}

// Um ícone por tela (id do sitemap); sem entrada, o item fica só com o rótulo.
const ITEM_ICONS: Record<string, ReactNode> = {
  cr40f_homebetinhos: <Home />,
  cr40f_reservadeveculos: <Calendar />,
  new_dashboard: <LayoutDashboard />,
  new_telaoperacional: <Clock />,
  new_telafuncoesoperacionais: <Wrench />,
  cr40f_trocasdecarro: <Shuffle />,
  new_possedeveiculo: <KeyRound />,
  'new_gestao_erros_operacionais': <Shield />,
  infleet: <MapPin />,
  new_telaplanner: <ClipboardList />,
  cr40f_composicaodeprecos: <Calculator />,
  cr40f_financeiro: <Coins />,
  cr40f_pagantes: <Users />,
  cr40f_recibos_v2: <Receipt />,
  cr40f_pedidodecotacao: <Mail />,
  cr40f_telapagamentofornecedores: <Banknote />,
  cr40f_telafluxodecaixa: <TrendingUp />,
  cr40f_manutencoes: <Wrench />,
  cr40f_multas: <AlertTriangle />,
  cr40f_colisao_v2: <Camera />,
  cr40f_bancodedados: <Database />,
  cr40f_clientes1: <Landmark />,
  cr40f_veiculos: <CarFront />,
  cr40f_funcionarios: <BookUser />,
  new_curriculo: <ScrollText />,
  cr40f_infracaodetransito: <AlertTriangle />,
  new_marketing: <Megaphone />,
  cr40f_servicosporpassageiro: <List />,
  new_teladespesasoperacionais: <Coins />,
  new_fotomanutencao: <Camera />,
  new_appmotoristaslog: <FileText />,
  cr40f_anexodespesaoperacional: <Paperclip />,
  cr40f_categoriadespesaoperacional: <Tag />,
  cr40f_despesaoperacional: <List />,
  cr40f_formapagamentodespesa: <Wallet />,
  cr40f_anexocolisao_v2: <Paperclip />,
  cr40f_anexorecebimento_v2: <Paperclip />,
  'custom-page-funcoes-operacionais': <Wrench />,
  cr40f_gerenciarcomunicados: <Megaphone />,
  new_telacomposicaopreco: <Calculator />,
  componentes: <Palette />,
}

/** Traduz o sitemap do app para a navegação do AppShell do Design System. */
function toNavGroup(group: MenuGroup, entityLabels: Map<string, string>): NavGroup {
  return {
    id: group.id,
    label: group.label,
    icon: GROUP_ICONS[group.id],
    admin: group.id === 'back-end' || group.id === 'design-system',
    items: group.items.map((item) => ({
      id: item.id,
      label: itemLabel(item, entityLabels),
      href: item.kind === 'external' ? item.url : hrefFor(item.id),
      external: item.kind === 'external',
      icon: ITEM_ICONS[item.id],
    })),
  }
}

/** Chrome persistente do Sistema Betinhos: AppShell do pacote alimentado pelo sitemap e pelo estado de conexão. */
export function AppShell({ activeId, title, entityLabels, connection, children }: Props) {
  const install = useInstallPrompt()
  return (
    <Shell
      brand={{ name: 'Betinhos', subtitle: 'Sistema interno', href: hrefFor(MENU[0].items[0].id) }}
      groups={MENU.map((group) => toNavGroup(group, entityLabels))}
      activeId={activeId}
      title={title}
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
