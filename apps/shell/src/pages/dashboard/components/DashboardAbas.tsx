import type { ReactNode } from 'react'
import { EmptyState, buttonClassName, type TabItem } from '@betinhos/ui'
import { AlertTriangle, CarFront, LayoutDashboard, Maximize2, Megaphone, PlugZap, Receipt, ReceiptText, Shuffle, Truck, Users, Wallet, Wrench } from 'lucide-react'
import type { Host } from '../../../host'
import { Frame } from '../../../app/Frame'
import { hrefFor } from '../../../nav/useHashRoute'

/**
 * Abas do Dashboard, as mesmas do dashboard antigo. O valor é o alias que o legado aceita em `?tab=`
 * (`financeiro` = Faturamento, `pagantes` = Pagamentos); Resumo é React, as demais abrem o legado até a migração.
 */
export const ABAS = [
  { value: 'resumo', label: 'Resumo', icon: <LayoutDashboard /> },
  { value: 'servicos', label: 'Serviços', icon: <CarFront /> },
  { value: 'financeiro', label: 'Faturamento', icon: <Wallet /> },
  { value: 'pagantes', label: 'Pagamentos', icon: <Receipt /> },
  { value: 'despesas', label: 'Despesas', icon: <ReceiptText /> },
  { value: 'frota', label: 'Frota', icon: <Truck /> },
  { value: 'motoristas', label: 'Motoristas', icon: <Users /> },
  { value: 'manutencoes', label: 'Manutenções', icon: <Wrench /> },
  { value: 'multas', label: 'Multas', icon: <AlertTriangle /> },
  { value: 'trocas', label: 'Trocas', icon: <Shuffle /> },
  { value: 'marketing', label: 'Marketing', icon: <Megaphone /> },
] as const satisfies readonly (TabItem & { label: string; icon: ReactNode })[]

export type Aba = (typeof ABAS)[number]['value']

/** Aba pelo valor da URL; valor ausente ou desconhecido cai no Resumo. */
export function abaDaUrl(valor: string | null): Aba {
  return ABAS.find((a) => a.value === valor)?.value ?? 'resumo'
}

export const rotuloAba = (aba: Aba) => ABAS.find((a) => a.value === aba)?.label ?? 'Resumo'

/**
 * Esconde, dentro do iframe, o chrome do dashboard antigo (barra superior, menu lateral, navegação do celular e o aviso de
 * snapshot): a navegação passa a ser a barra de abas do shell. Só funciona na mesma origem; senão o legado fica como está.
 */
const CSS_EMBUTIDO = [
  '.topbar, .sidebar, .mobile-nav, #alertArea .alert:has(code) { display: none !important; }',
  ':root { --topbar-h: 0px !important; }',
  '.shell { height: 100vh !important; }',
  '.content { margin-left: 0 !important; }',
].join('\n')

export function embutirLegado(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument
    if (!doc?.head || doc.getElementById('bt-shell-embutido')) return
    const style = doc.createElement('style')
    style.id = 'bt-shell-embutido'
    style.textContent = CSS_EMBUTIDO
    doc.head.appendChild(style)
  } catch {
    // Outra origem ou documento bloqueado: o legado aparece com o próprio chrome.
  }
}

/** Aba ainda não migrada: o dashboard antigo na aba correspondente, dentro da tela. */
export function AbaLegado({ host, aba }: { host: Host; aba: Exclude<Aba, 'resumo'> }) {
  const rotulo = rotuloAba(aba)
  if (host.mode === 'mock') {
    return (
      <EmptyState className="surface" align="start" icon={<PlugZap size={36} />} title="Esta aba abre dentro do Dataverse">
        Fora do ambiente não há dados para mostrar. Publique com <code>pnpm push</code> e abra o Sistema Betinhos no Dataverse para ver <code>new_dashboard?tab={aba}</code>.
      </EmptyState>
    )
  }
  return (
    <div className="dash-legado">
      <div className="dash-legado__aviso">
        <p>Esta aba ainda abre o dashboard antigo.</p>
        <a className={buttonClassName({ variant: 'ghost', size: 'compact' })} href={hrefFor('new_dashboard')}><Maximize2 size={16} aria-hidden="true" /> Abrir em tela cheia</a>
      </div>
      <Frame className="dash-legado__frame" src={`${host.clientUrl}/WebResources/new_dashboard?tab=${aba}`} title={`Dashboard antigo, aba ${rotulo}`} onLoad={embutirLegado} />
    </div>
  )
}
