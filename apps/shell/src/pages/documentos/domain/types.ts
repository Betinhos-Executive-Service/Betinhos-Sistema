// domain/types.ts
import type { Documento } from '../../funcionarios/data/types'

/** Arquivo no SharePoint (mesmo formato da aba de documentos de Funcionários). */
export type Arquivo = Documento
export type Categoria = 'pessoas' | 'frota'
export type Marco = '60' | '30' | '7' | 'vencido'
export type Status = 'vencido' | 'vence7' | 'vence30' | 'vence60' | 'ok' | 'semValidade'
export type Situacao = 'vigente' | 'substituido'

export type TipoDoc = {
  id: string
  codigo: string
  nome: string
  categoria: Categoria
  temValidade: boolean
  validadePadraoMeses: number | null
  obrigatorioPara: number[]
  ordem: number
  ativo: boolean
}

/** Funcionário ou veículo dono de documentos. `obrigKey` é o valor de `OBRIG` que vale para ele. */
export type Dono = { id: string; categoria: Categoria; nome: string; detalhe: string; obrigKey: number | null; ativo: boolean; email: string }

export type DocEmitido = {
  id: string
  tipoId: string
  donoId: string
  categoria: Categoria
  numero: string
  emissao: string | null
  validade: string | null
  situacao: Situacao
  pasta: string
  observacao: string
  ultimoMarco: Marco | null
  modificadoEm: string | null
}

export type Destinatario = { id: string; categoria: Categoria; funcionarioId: string; nome: string }
export type DocsData = { tipos: TipoDoc[]; donos: Dono[]; docs: DocEmitido[]; destinatarios: Destinatario[] }

export type Kpi = 'vencido' | 'vence7' | 'vence30' | 'vence60' | 'faltando'
export type Pendencia = { chave: string; dono: Dono; tipo: TipoDoc; doc: DocEmitido | null; estado: Kpi; dias: number | null }
export type EstadoItem = Status | 'faltando' | 'opcional'
export type ItemChecklist = { tipo: TipoDoc; vigente: DocEmitido | null; historico: DocEmitido[]; estado: EstadoItem; dias: number | null }
