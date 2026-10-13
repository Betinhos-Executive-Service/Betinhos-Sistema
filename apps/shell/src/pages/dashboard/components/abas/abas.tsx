import type { ReactNode } from 'react'
import type { TabItem } from '@betinhos/ui'
import { AlertTriangle, CarFront, LayoutDashboard, ReceiptText, Truck, Users, Wallet, Wrench } from 'lucide-react'
import type { Contexto } from '../../domain/kpis'
import type { Dados, Filtros } from '../../domain/types'

/**
 * Contrato único das abas: a página calcula o `ctx` (todas, rv, f, now) uma vez e passa `ctx` + `dados`. Os dois são null na primeira
 * carga (ou na troca de janela) e a aba mostra o próprio esqueleto (`AbaCarregando`); com dados, a aba calcula o que mostra.
 */
export type PropsAba = { ctx: Contexto | null; dados: Dados | null; periodo: string }
/** As mesmas props, já carregadas: o corpo da aba, depois do esqueleto. */
export type DadosAba = { ctx: Contexto; dados: Dados; periodo: string }

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

/** Abas cujos números saem dos serviços filtrados: só nelas o recorte vazio vira "Nenhum serviço para estes filtros". */
export const ABAS_POR_SERVICO: ReadonlySet<Aba> = new Set<Aba>(['resumo', 'servicos', 'financeiro', 'motoristas'])

/** Nas demais abas, uma linha discreta diz quais filtros de segmento não valem ali (cada aba usa os segmentos de um jeito). */
export function avisoSegmento(aba: Aba, f: Filtros): string | null {
  const semMotorista = f.status.length + f.clientes.length + f.tipos.length > 0
  const algum = semMotorista || f.motoristas.length > 0
  switch (aba) {
    // O motorista vale nas despesas (filtro global); status, cliente e tipo não.
    case 'despesas': return semMotorista ? 'Status, cliente e tipo de veículo não se aplicam a esta aba.' : null
    case 'frota': return algum ? 'Status, cliente, motorista e tipo de veículo não se aplicam aos KPIs do cadastro; os blocos usam só os veículos dos serviços filtrados.' : null
    case 'manutencoes': return algum ? 'Status, cliente, motorista e tipo de veículo não se aplicam a esta aba, exceto no % da receita.' : null
    case 'multas': return algum ? 'Status, cliente, motorista e tipo de veículo não se aplicam a esta aba.' : null
    default: return null
  }
}
