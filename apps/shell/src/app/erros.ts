import type { DataverseClient } from '@betinhos/dataverse'

/** Tabela criada por packages/deploy/provision-erros-schema.ps1; lida pelo plantão (skill plantao-erros). */
export const ERRO_ENTITY_SET = 'cr40f_errodosistemas'
const ORIGEM_APP = 100000000
const SITUACAO_NOVO = 100000000
/** Teto por carregamento da página: um laço de erro não pode inundar a tabela. */
const MAX_POR_CARGA = 10

/** Erro do navegador ao baixar um chunk (Chrome, Firefox e Safari), e não erro do código da tela. */
export function isChunkLoadError(error: unknown) {
  return error instanceof TypeError && /dynamically imported module|importing a module script failed/i.test(error.message)
}

/** Ruído do navegador que não é bug do app. */
const IGNORAR = [/ResizeObserver loop/i, /^Script error\.?$/i]

let cliente: DataverseClient | null = null
const enviadas = new Set<string>()

/** Assinatura estável do erro (mensagem + primeiro quadro da pilha), para o plantão agrupar ocorrências. */
export function assinatura(mensagem: string, pilha = '') {
  const quadro = pilha.split('\n').map((l) => l.trim()).find((l) => l.startsWith('at ') || l.includes('@')) ?? ''
  // Hash de chunk e número de linha mudam a cada build: tira para o mesmo bug manter a assinatura.
  const base = `${mensagem}|${quadro.replace(/\.[a-z0-9]{6,}\.js/gi, '.js').replace(/:\d+:\d+/g, '')}`
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < base.length; i++) {
    a = Math.imul(a ^ base.charCodeAt(i), 0x01000193) >>> 0
    b = Math.imul(b ^ base.charCodeAt(base.length - 1 - i), 0x811c9dc5) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

function normalizar(motivo: unknown) {
  if (motivo instanceof Error) return { mensagem: motivo.message || motivo.name, pilha: motivo.stack ?? '' }
  return { mensagem: typeof motivo === 'string' ? motivo : JSON.stringify(motivo) ?? String(motivo), pilha: '' }
}

/**
 * Registra o erro no Dataverse. Nunca lança nem trava a tela: falha ao registrar só vai para o console.
 * Fora do Dataverse (pnpm dev, modo mock) não faz nada.
 */
export function reportarErro(motivo: unknown, contexto?: string) {
  if (!cliente || isChunkLoadError(motivo)) return
  const { mensagem, pilha } = normalizar(motivo)
  if (IGNORAR.some((re) => re.test(mensagem))) return
  const id = assinatura(mensagem, pilha)
  if (enviadas.has(id) || enviadas.size >= MAX_POR_CARGA) return
  enviadas.add(id)
  const rota = `${location.pathname}${location.hash}`
  const linha = (contexto ? `[${contexto}] ` : '') + mensagem
  cliente.create(ERRO_ENTITY_SET, {
    cr40f_errodosistemanome: linha.slice(0, 200),
    cr40f_origem: ORIGEM_APP,
    cr40f_assinatura: id,
    cr40f_mensagem: linha.slice(0, 2000),
    cr40f_detalhe: pilha.slice(0, 20000),
    cr40f_rota: rota.slice(0, 300),
    cr40f_versao: __APP_VERSION__,
    cr40f_navegador: navigator.userAgent.slice(0, 300),
    cr40f_situacao: SITUACAO_NOVO,
  }).catch((falha: unknown) => { console.warn('Não foi possível registrar o erro no Dataverse', falha) })
}

/** Liga a captura global (erros soltos e promessas rejeitadas). Idempotente; devolve a função que desliga. */
export function iniciarCapturaDeErros(client: DataverseClient) {
  if (cliente) return () => {}
  cliente = client
  const onError = (event: ErrorEvent) => reportarErro(event.error ?? event.message, 'window.onerror')
  const onRejection = (event: PromiseRejectionEvent) => reportarErro(event.reason, 'promessa rejeitada')
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    cliente = null
    enviadas.clear()
  }
}
