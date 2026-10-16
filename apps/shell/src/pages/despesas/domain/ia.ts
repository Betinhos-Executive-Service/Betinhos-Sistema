import type { StatusTone } from '@betinhos/ui'

/** Choices `cr40f_ia*` de `cr40f_despesaoperacional` (DEV, 13/10/2026). */
export const IA_STATUS = { pendente: 100000000, processando: 100000001, concluida: 100000002, erro: 100000003 } as const
export const IA_DECISAO = { validar: 100000000, corrigir: 100000001 } as const

export const IA_DECISAO_LABEL: Record<number, string> = { [IA_DECISAO.validar]: 'Validar', [IA_DECISAO.corrigir]: 'Precisa corrigir' }

/** Resultado da validação automática do comprovante (somente leitura nesta tela). */
export type AnaliseIA = {
  status: number | null
  decisao: number | null
  /** Um motivo por linha de `cr40f_iamotivos`; em Erro, é o motivo técnico. */
  motivos: string[]
  valorLido: number | null
  /** Data só (AAAA-MM-DD), sem fuso. */
  dataLida: string
  cnpjLido: string
  estabelecimentoLido: string
  /** 0–1. */
  confianca: number | null
  modelo: string
  analisadaEm: Date | null
}

export const IA_VAZIA: AnaliseIA = {
  status: null, decisao: null, motivos: [], valorLido: null, dataLida: '', cnpjLido: '', estabelecimentoLido: '', confianca: null, modelo: '', analisadaEm: null,
}

/** Mesma tolerância do prompt: até R$ 0,50 não é diferença. Positivo = lido acima do lançado. */
export function diferencaValor(lancado: number | null, lido: number | null) {
  if (lancado == null || lido == null) return null
  const diff = Math.round((lido - lancado) * 100) / 100
  return Math.abs(diff) > 0.5 ? diff : null
}

export const suspeitaIA = (d: { ia: Pick<AnaliseIA, 'decisao'> }) => d.ia.decisao === IA_DECISAO.corrigir

export const decisaoTone = (decisao: number | null): StatusTone =>
  decisao === IA_DECISAO.validar ? 'success' : decisao === IA_DECISAO.corrigir ? 'warning' : 'neutral'

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sem passar por Date (evita deslocar o dia pelo fuso). */
export function formatDataLida(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}
