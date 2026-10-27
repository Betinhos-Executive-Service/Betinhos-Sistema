// Porte de Tela Planner/src/errorLogger.js: registro de erros do front na tabela compartilhada de logs de apps
// (new_appmotoristaslog). Grava só com contexto autenticado do Dataverse; em modo mock não faz nada.
//
// O shell já instala o logger global do Design System (app/errorLog.ts, appName "Sistema Betinhos"). Este módulo
// mantém o contrato do Planner (appName "Tela Planner", tela, e-mail, dedupe por sessão) para as chamadas de
// logAppError do Planner; installGlobalErrorLogging não deve ser chamado dentro do shell (duplicaria o global).
import { APP_VERSION } from './version'

export const ERROR_LOG_TABLE = 'new_appmotoristaslog'
export const ERROR_LOG_ENTITY_SET = 'new_appmotoristaslogs'
export const APP_NAME = 'Tela Planner'
const API_VERSION = 'v9.2'
const MAX_LOGS_PER_SESSION = 30
const DEDUPE_WINDOW_MS = 60000

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec => (value && typeof value === 'object' ? (value as Rec) : {})

const context = { screen: '', userEmail: '' }
const recentSignatures = new Map<string, number>()
let sentCount = 0
let sessionId = ''

export function setErrorLogContext(next: { screen?: unknown; userEmail?: unknown } = {}): void {
  if (typeof next.screen === 'string') context.screen = next.screen
  if (typeof next.userEmail === 'string') context.userEmail = next.userEmail
}

function truncate(value: unknown, limit: number): string {
  const text = String(value ?? '')
  return text.length <= limit ? text : text.slice(0, limit)
}

function stringify(value: unknown): string {
  try { return JSON.stringify(value) ?? '{}' } catch { return '{}' }
}

export interface NormalizedError { name: string; message: string; stack: string }

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message || 'Erro sem mensagem.', stack: error.stack || String(error) }
  }
  const message = typeof error === 'string' ? error : stringify(error)
  return { name: 'UnknownError', message, stack: '' }
}

// Remove query e IDs para agrupar falhas iguais da mesma rota.
export function sanitizeDataversePath(path: unknown): string {
  return String(path || '').split('?')[0].replace(/\([0-9a-f-]{36}\)/gi, '(id)')
}

interface GlobalContextLike {
  getClientUrl: () => string
  userSettings?: unknown
}

function asGlobalContext(value: unknown): GlobalContextLike | null {
  return typeof rec(value).getClientUrl === 'function' ? (value as GlobalContextLike) : null
}

function callGetter(getter: unknown, self: unknown): unknown {
  return typeof getter === 'function' ? (getter as (this: unknown) => unknown).call(self) : undefined
}

function getGlobalContext(): GlobalContextLike | null {
  const win = window as unknown as Rec
  const candidates: unknown[] = []
  try { candidates.push(rec(win.parent).Xrm) } catch { /* iframe de outra origem */ }
  try { candidates.push(win.Xrm) } catch { /* sem Xrm */ }
  for (const xrm of candidates) {
    try {
      const utility = rec(xrm).Utility
      const globalContext = asGlobalContext(callGetter(rec(utility).getGlobalContext, utility))
      if (globalContext) return globalContext
    } catch { /* contexto indisponível */ }
  }
  try {
    const globalContext = asGlobalContext(callGetter(win.GetGlobalContext, win))
    if (globalContext) return globalContext
  } catch { /* contexto indisponível */ }
  return null
}

function getSessionId(): string {
  if (!sessionId) sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return sessionId
}

export interface ErrorLogDetails {
  action?: string
  severity?: string
  source?: string
  phase?: string
  component?: string
  detailId?: string
  detailType?: string
  errorCode?: unknown
  payload?: unknown
  [extra: string]: unknown
}

export interface ErrorLogEnvironment {
  userSettings?: unknown
  navigator?: unknown
  document?: unknown
  window?: unknown
  now?: string
  clientUrl?: string
  timeZone?: string
}

export type ErrorLogRecord = Record<string, string>

export function buildErrorLogRecord(error: unknown, details: ErrorLogDetails = {}, environment: ErrorLogEnvironment = {}): ErrorLogRecord {
  const normalized = normalizeError(error)
  const action = details.action || 'runtime-error'
  const user = rec(environment.userSettings)
  const nav = rec(environment.navigator)
  const doc = rec(environment.document)
  const win = rec(environment.window)
  const occurredAt = environment.now || new Date().toISOString()
  return {
    new_name: truncate(`${APP_NAME} - ${action} - ${normalized.message}`, 160),
    new_occurredat: occurredAt,
    new_severity: details.severity || 'error',
    new_source: truncate(details.source || 'Web Resource', 120),
    new_action: truncate(action, 180),
    new_phase: truncate(details.phase || 'runtime', 120),
    new_component: truncate(details.component || APP_NAME, 180),
    new_screen: truncate(context.screen, 120),
    new_detailid: truncate(details.detailId || '', 120),
    new_detailtype: truncate(details.detailType || '', 80),
    new_message: truncate(normalized.message, 20000),
    new_stack: truncate(normalized.stack, 100000),
    new_errorname: truncate(normalized.name, 220),
    new_errorcode: truncate(details.errorCode ?? '', 120),
    new_appname: APP_NAME,
    new_appversion: truncate(String(APP_VERSION).split(' ')[0], 60),
    new_builtat: truncate(APP_VERSION, 80),
    new_userid: truncate(String(user.userId || '').replace(/[{}]/g, ''), 120),
    new_username: truncate(user.userName || '', 300),
    new_useremail: truncate(context.userEmail, 300),
    new_sessionid: getSessionId(),
    new_clienturl: truncate(environment.clientUrl || '', 500),
    new_url: truncate(rec(win.location).href || '', 4000),
    new_referrer: truncate(doc.referrer || '', 4000),
    new_useragent: truncate(nav.userAgent || '', 4000),
    new_platform: truncate(nav.platform || '', 160),
    new_language: truncate(nav.language || '', 80),
    new_isoffline: nav.onLine === false ? 'true' : 'false',
    new_visibilitystate: truncate(doc.visibilityState || '', 40),
    new_viewport: win.innerWidth ? `${win.innerWidth}x${win.innerHeight}` : '',
    new_timezone: truncate(environment.timeZone || '', 120),
    new_payloadjson: truncate(stringify(details.payload ?? {}), 100000),
    new_rawjson: truncate(stringify({ error: normalized, details, occurredAt }), 100000),
  }
}

function shouldSend(signature: string, now: number): boolean {
  if (sentCount >= MAX_LOGS_PER_SESSION) return false
  const last = recentSignatures.get(signature)
  if (last && now - last < DEDUPE_WINDOW_MS) return false
  recentSignatures.set(signature, now)
  sentCount += 1
  return true
}

export function resetErrorLoggerForTests(): void {
  recentSignatures.clear()
  sentCount = 0
}

export async function logAppError(error: unknown, details: ErrorLogDetails = {}): Promise<void> {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return
    const globalContext = getGlobalContext()
    const clientUrl = globalContext?.getClientUrl?.()?.replace(/\/$/, '')
    if (!globalContext || !clientUrl) return
    const normalized = normalizeError(error)
    if (!shouldSend(`${details.action || ''}|${normalized.message}`, Date.now())) return
    let timeZone = ''
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* sem Intl */ }
    const record = buildErrorLogRecord(error, details, {
      clientUrl, timeZone, window, document, navigator, userSettings: globalContext.userSettings,
    })
    // fetch direto (sem request()) para que falha ao logar nunca gere novo log.
    await fetch(`${clientUrl}/api/data/${API_VERSION}/${ERROR_LOG_ENTITY_SET}`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
      body: JSON.stringify(record),
    })
  } catch (loggingError) {
    console.warn('[Planner] falha ao gravar erro na tabela de logs', loggingError)
  }
}

export interface ErrorEventTarget {
  addEventListener: (type: string, listener: (event: never) => void) => void
  removeEventListener: (type: string, listener: (event: never) => void) => void
}

export function installGlobalErrorLogging(target: ErrorEventTarget = window as unknown as ErrorEventTarget): () => void {
  const onError = (event: { error?: unknown; message?: string; filename?: string; lineno?: number; colno?: number }) => {
    void logAppError(event.error || event.message, {
      source: 'Window', action: 'window.error', phase: 'global', component: 'window',
      payload: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    })
  }
  const onUnhandledRejection = (event: { reason?: unknown }) => {
    void logAppError(event.reason, { source: 'Window', action: 'unhandledrejection', phase: 'global', component: 'window' })
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
