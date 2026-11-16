import type { FilterOption, StatusTone } from '@betinhos/ui'
import type { Comprovante } from '../../lib/comprovantes/arquivo'
import { formatDateTime } from '../pagantes/domain/messages'

/** Comprovante que o motorista tirou ao receber (`cr40f_anexorecebimento_v2`). */
export type Recebimento = Comprovante & {
  /** Id do serviço (`cr40f_reserva`), em minúsculas. */
  reservaId: string
  ordem: number | null
  enviadoEm: Date | null
  motorista: string
  /** Rótulos de `cr40f_tipo` (Comprovante, Foto complementar, Outros) e `cr40f_status` (envio do App). */
  tipo: string
  status: number | null
  statusTexto: string
}

/** O que o financeiro confere no serviço ao abrir os comprovantes. */
export type FinanceiroServico = { valorAReceber: number | null; receber: boolean | null; formaPagamento: string }

/** `cr40f_status` do anexo: Pendente em aviso, Falhou e Inválido em destaque; Enviado (o normal) neutro. */
const STATUS_ENVIADO = 100000001
const TOM_STATUS: Record<number, StatusTone> = { 100000000: 'warning', 100000002: 'danger', 100000003: 'danger' }
/** Enviado é o caso normal: só Pendente, Falhou e Inválido ganham etiqueta. */
export const mostraStatus = (r: Pick<Recebimento, 'status' | 'statusTexto'>) => Boolean(r.statusTexto) && r.status !== STATUS_ENVIADO
/** Rótulos do filtro Sim/Não da coluna Comprovantes (Geral e Composição). */
export const COMPROVANTES_OPCOES: FilterOption[] = [{ value: '1', label: 'Com comprovante' }, { value: '0', label: 'Sem comprovante' }]

export const tomStatus = (status: number | null): StatusTone => (status == null ? 'neutral' : TOM_STATUS[status] ?? 'neutral')

/** Ordem do App (`cr40f_ordem`); sem ordem ou empate, o primeiro enviado primeiro. */
export function ordenar(lista: Recebimento[]) {
  const ordem = (r: Recebimento) => r.ordem ?? Number.MAX_SAFE_INTEGER
  return [...lista].sort((a, b) => ordem(a) - ordem(b) || (a.enviadoEm?.getTime() ?? 0) - (b.enviadoEm?.getTime() ?? 0))
}

/** Um grupo por serviço, na ordem dos serviços recebida e mantendo a ordem da lista (passe já ordenada); serviço sem comprovante fica de fora. */
export function agruparPorServico<S extends { id: string }>(servicos: S[], lista: Recebimento[]) {
  return servicos
    .map((servico) => ({ servico, comprovantes: lista.filter((r) => r.reservaId === servico.id.toLowerCase()) }))
    .filter((grupo) => grupo.comprovantes.length > 0)
}

/** Linha cinza do cartão: data e hora do envio e o motorista. */
export const metaRecebimento = (r: Recebimento) => [r.enviadoEm ? formatDateTime(r.enviadoEm) : '', r.motorista].filter(Boolean).join(' · ')
