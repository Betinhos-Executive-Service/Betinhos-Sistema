import type { ReactNode } from 'react'
import type { TabItem } from '@betinhos/ui'
import { AlertTriangle, CarFront, LayoutDashboard, ReceiptText, Truck, Users, Wallet, Wrench } from 'lucide-react'

/** As oito abas do Dashboard, na ordem da barra. O valor vai para a URL (`#/dashboard?tab=servicos`); Resumo não tem parâmetro. */
export const ABAS = [
  { value: 'resumo', label: 'Resumo', icon: <LayoutDashboard /> },
  { value: 'servicos', label: 'Serviços', icon: <CarFront /> },
  { value: 'financeiro', label: 'Financeiro', icon: <Wallet /> },
  { value: 'despesas', label: 'Despesas', icon: <ReceiptText /> },
  { value: 'frota', label: 'Frota', icon: <Truck /> },
  { value: 'motoristas', label: 'Motoristas', icon: <Users /> },
  { value: 'manutencoes', label: 'Manutenções', icon: <Wrench /> },
  { value: 'multas', label: 'Multas', icon: <AlertTriangle /> },
] as const satisfies readonly (TabItem & { label: string; icon: ReactNode })[]

export type Aba = (typeof ABAS)[number]['value']

/** Aba pelo valor da URL; valor ausente ou desconhecido cai no Resumo. */
export function abaDaUrl(valor: string | null): Aba {
  return ABAS.find((a) => a.value === valor)?.value ?? 'resumo'
}

export const rotuloAba = (aba: Aba) => ABAS.find((a) => a.value === aba)?.label ?? 'Resumo'
