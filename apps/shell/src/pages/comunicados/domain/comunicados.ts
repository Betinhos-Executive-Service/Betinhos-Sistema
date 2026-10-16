import type { Row } from '@betinhos/dataverse'

// Regras portadas da Tela Gestão de Comunicados (v1.0.9); as Custom APIs do plugin são a autoridade final.

export const COMUNICADO_TIPO = { informativo: 100000000, ciencia: 100000001 } as const
export const COMUNICADO_ESCOPO = { todos: 100000000, selecionados: 100000001 } as const
export const COMUNICADO_ESTADO = { rascunho: 100000000, disparado: 100000001 } as const
export const COMUNICADO_PUSH = { pendente: 100000000, enviado: 100000001, falhou: 100000002 } as const

export type ComunicadoTipo = (typeof COMUNICADO_TIPO)[keyof typeof COMUNICADO_TIPO]
export type ComunicadoEscopo = (typeof COMUNICADO_ESCOPO)[keyof typeof COMUNICADO_ESCOPO]

export type Comunicado = {
  id: string
  titulo: string
  corpo: string
  tipo: ComunicadoTipo
  escopo: ComunicadoEscopo
  alvoIds: string[]
  estado: number
  disparadoEm: string | null
}

export type Destinatario = {
  id: string
  comunicadoId: string
  motoristaId: string
  enviadoEm: string
  abertoEm: string | null
  lidoEm: string | null
  cienteEm: string | null
  nomeAssinante: string
  observacao: string
  assinaturaJson: string
  pushStatus: number
  pushErro: string
}

export type Motorista = { id: string; nome: string; email: string; problema: string }

export type SignatureStrokes = [number, number][][]

export const TITULO_MAX = 150
export const CORPO_MAX = 4000

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const cleanGuid = (value: string) => value.replace(/[{}]/g, '').toLowerCase()

export const emptyDraft = (): Comunicado => ({ id: '', titulo: '', corpo: '', tipo: COMUNICADO_TIPO.informativo, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado: COMUNICADO_ESTADO.rascunho, disparadoEm: null })

export const isDisparado = (item: Comunicado) => item.estado === COMUNICADO_ESTADO.disparado

export function parseTargetIds(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value || '[]'))
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map((id) => cleanGuid(String(id))).filter((id) => GUID.test(id)))]
  } catch {
    return []
  }
}

export function validateDraft(draft: Pick<Comunicado, 'titulo' | 'corpo' | 'escopo' | 'alvoIds'>) {
  if (!draft.titulo.trim() || draft.titulo.trim().length > TITULO_MAX) return 'Informe um título de até 150 caracteres.'
  if (!draft.corpo.trim() || draft.corpo.trim().length > CORPO_MAX) return 'Informe uma mensagem de até 4.000 caracteres.'
  if (draft.escopo === COMUNICADO_ESCOPO.selecionados && draft.alvoIds.length === 0) return 'Selecione pelo menos um motorista.'
  if (draft.alvoIds.some((id) => !GUID.test(cleanGuid(id)))) return 'Há um motorista inválido na seleção.'
  return ''
}

/** Payload do rascunho; disparado é imutável (o plugin também barra). */
export function draftPayload(draft: Comunicado): Row {
  return {
    new_name: draft.titulo.trim(),
    new_titulo: draft.titulo.trim(),
    new_corpo: draft.corpo.trim(),
    new_tipo: draft.tipo,
    new_escopo: draft.escopo,
    new_alvosjson: JSON.stringify(draft.escopo === COMUNICADO_ESCOPO.todos ? [] : draft.alvoIds.map(cleanGuid)),
    new_estado: COMUNICADO_ESTADO.rascunho,
  }
}

/** Informativo conclui na leitura; ciência, só com a assinatura. */
export const isPendente = (row: Destinatario, tipo: number) => (tipo === COMUNICADO_TIPO.informativo ? !row.lidoEm : !row.cienteEm)
export const isAberto = (row: Destinatario) => Boolean(row.abertoEm || row.lidoEm || row.cienteEm)

export function statusLabel(row: Destinatario) {
  if (row.cienteEm) return 'Ciência assinada'
  if (row.lidoEm) return 'Ciência registrada'
  if (row.abertoEm) return 'Visualizado'
  return 'Não aberto'
}

export const statusTone = (row: Destinatario) => (row.cienteEm || row.lidoEm ? 'success' : row.abertoEm ? 'info' : 'neutral') as 'success' | 'info' | 'neutral'

export function pushLabel(row: Destinatario) {
  if (row.pushStatus === COMUNICADO_PUSH.enviado) return 'Push enviado'
  if (row.pushStatus === COMUNICADO_PUSH.falhou) return `Falhou · ${row.pushErro || 'erro não informado'}`
  return 'Na fila de envio'
}

/** Espelha a regra do plugin: reenvio após falha ou lembrete enquanto o motorista não concluiu. */
export function canResendPush(row: Destinatario, tipo: number) {
  if (row.pushStatus === COMUNICADO_PUSH.falhou) return true
  return row.pushStatus === COMUNICADO_PUSH.enviado && isPendente(row, tipo)
}

export type ResultadoFiltro = 'todos' | 'pendentes' | 'concluidos' | 'falhas'

export function matchResultado(filtro: ResultadoFiltro, row: Destinatario, tipo: number) {
  if (filtro === 'pendentes') return isPendente(row, tipo)
  if (filtro === 'concluidos') return !isPendente(row, tipo)
  if (filtro === 'falhas') return row.pushStatus === COMUNICADO_PUSH.falhou
  return true
}

export type ListaFiltro = 'todos' | 'rascunhos' | 'enviados'
export const matchLista = (filtro: ListaFiltro, item: Comunicado) => filtro === 'todos' || (filtro === 'enviados') === isDisparado(item)

export function duplicateComunicado(item: Comunicado): Comunicado {
  const suffix = ' (cópia)'
  return { ...item, id: '', titulo: `${item.titulo.slice(0, TITULO_MAX - suffix.length)}${suffix}`, alvoIds: [...item.alvoIds], estado: COMUNICADO_ESTADO.rascunho, disparadoEm: null }
}

export function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : ''
}

export function parseSignature(value: string): SignatureStrokes {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as SignatureStrokes) : []
  } catch {
    return []
  }
}

const csvCell = (value: string) => (/[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

export function buildResultadosCsv(rows: Destinatario[], nome: (row: Destinatario) => string) {
  const header = ['Motorista', 'Status', 'Enviado em', 'Aberto em', 'Lido em', 'Ciência em', 'Assinante', 'Observação', 'Push', 'Erro do push']
  const push = (status: number) => (status === COMUNICADO_PUSH.enviado ? 'Enviado' : status === COMUNICADO_PUSH.falhou ? 'Falhou' : 'Pendente')
  const lines = rows.map((row) => [
    nome(row), statusLabel(row), formatDate(row.enviadoEm || null), formatDate(row.abertoEm), formatDate(row.lidoEm), formatDate(row.cienteEm),
    row.nomeAssinante, row.observacao, push(row.pushStatus), row.pushErro,
  ].map((value) => csvCell(String(value ?? ''))).join(';'))
  // BOM para o Excel abrir em UTF-8.
  return `﻿${[header.join(';'), ...lines].join('\r\n')}`
}

export function fileSlug(title: string) {
  return title.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'comunicado'
}

export function mapComunicado(row: Row): Comunicado {
  return {
    id: String(row.new_comunicadomotoristaid ?? ''),
    titulo: String(row.new_titulo ?? ''),
    corpo: String(row.new_corpo ?? ''),
    tipo: Number(row.new_tipo) as ComunicadoTipo,
    escopo: Number(row.new_escopo) as ComunicadoEscopo,
    alvoIds: parseTargetIds(row.new_alvosjson),
    estado: Number(row.new_estado),
    disparadoEm: row.new_disparadoem ? String(row.new_disparadoem) : null,
  }
}

export function mapDestinatario(row: Row): Destinatario {
  return {
    id: String(row.new_comunicadodestinatarioid ?? ''),
    comunicadoId: String(row._new_comunicado_value ?? ''),
    motoristaId: String(row._new_motorista_value ?? ''),
    enviadoEm: String(row.new_enviadoem ?? ''),
    abertoEm: row.new_abertoem ? String(row.new_abertoem) : null,
    lidoEm: row.new_lidoem ? String(row.new_lidoem) : null,
    cienteEm: row.new_cienteem ? String(row.new_cienteem) : null,
    nomeAssinante: String(row.new_nomeassinante ?? ''),
    observacao: String(row.new_observacao ?? ''),
    assinaturaJson: String(row.new_assinaturajson ?? ''),
    pushStatus: Number(row.new_pushstatus ?? COMUNICADO_PUSH.pendente),
    pushErro: String(row.new_pusherro ?? ''),
  }
}

const hasDriverLinkType = (row: Row) => row.cr40f_tipodevinculo != null && [0, 1].includes(Number(row.cr40f_tipodevinculo))

/**
 * Motorista só recebe push com um usuário ativo único pelo e-mail Microsoft (mesma regra do plugin).
 * `problema` explica por que fica fora do envio.
 */
export function mapMotoristas(employees: Row[], users: Row[]): Motorista[] {
  const usersByEmail = new Map<string, number>()
  const employeesByEmail = new Map<string, number>()
  for (const user of users) {
    const email = String(user.internalemailaddress ?? '').trim().toLowerCase()
    if (email) usersByEmail.set(email, (usersByEmail.get(email) ?? 0) + 1)
  }
  for (const row of employees) {
    if (!hasDriverLinkType(row)) continue
    const email = String(row.cr40f_emailmicrosoft ?? '').trim().toLowerCase()
    if (email) employeesByEmail.set(email, (employeesByEmail.get(email) ?? 0) + 1)
  }
  return employees
    .map((row) => {
      const email = String(row.cr40f_emailmicrosoft ?? '').trim().toLowerCase()
      const matches = usersByEmail.get(email) ?? 0
      const problema = !hasDriverLinkType(row) ? 'Tipo de vínculo não definido'
        : !email ? 'Sem e-mail Microsoft'
          : (employeesByEmail.get(email) ?? 0) > 1 ? 'E-mail usado por mais de um motorista'
            : matches === 0 ? 'Sem usuário ativo'
              : matches > 1 ? 'Usuário duplicado' : ''
      return { id: cleanGuid(String(row.cr40f_funcionariosid ?? '')), nome: String(row.cr40f_nomecompleto ?? ''), email, problema }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
