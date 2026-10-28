import type { Motivo, Servico, Sessao } from '../domain/types'
import { ErroPortal, type CodigoErro } from './PortalApi'

/**
 * PortalApi real: fala com o Worker na mesma origem (`/api/*`), sessão em cookie HttpOnly.
 * Ponto de troca: em `main.tsx`, `createMockApi(...)` → `createWorkerApi()` quando o Worker estiver no ar.
 * Tipado localmente com o contrato das duas etapas; quando `PortalApi.ts` tiver `confirmarAutenticador`,
 * anote o retorno como `PortalApi` (o formato já é o mesmo).
 */
export type ResultadoEntrada =
  | { etapa: 'cadastrar_autenticador'; otpauthUrl: string; segredo: string }
  | { etapa: 'autenticador' }
  | { etapa: 'ok'; sessao: Sessao }

const CODIGOS: string[] = ['codigo_invalido', 'codigo_expirado', 'totp_invalido', 'bloqueado', 'nao_permitido', 'falha']

/** Corpo `{erro, mensagem?}` do Worker → ErroPortal; sem corpo, pelo status HTTP. */
export async function erroDaResposta(r: Response): Promise<ErroPortal> {
  let corpo: { erro?: string; mensagem?: string } = {}
  try {
    corpo = await r.json()
  } catch {
    /* sem JSON */
  }
  const porStatus: CodigoErro = r.status === 429 ? 'bloqueado' : [400, 401, 403, 404, 409].includes(r.status) ? 'nao_permitido' : 'falha'
  const codigo = (corpo.erro && CODIGOS.includes(corpo.erro) ? corpo.erro : porStatus) as CodigoErro
  return new ErroPortal(codigo, corpo.mensagem ?? codigo)
}

export function createWorkerApi(base = '/api', f: typeof fetch = (...a) => fetch(...a)) {
  async function chamar<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
    let r: Response
    try {
      r = await f(base + caminho, {
        method: metodo,
        credentials: 'include',
        headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
    } catch {
      throw new ErroPortal('falha', 'Sem conexão com o servidor.')
    }
    if (!r.ok) throw await erroDaResposta(r)
    return (r.status === 204 ? undefined : await r.json()) as T
  }
  return {
    solicitarCodigo: (email: string) => chamar<void>('POST', '/auth/codigo', { email }),
    entrar: (email: string, codigo: string) => chamar<ResultadoEntrada>('POST', '/auth/entrar', { email, codigo }),
    confirmarAutenticador: (codigo: string, lembrar: boolean) => chamar<Sessao>('POST', '/auth/totp', { codigo, lembrar }),
    sair: () => chamar<void>('POST', '/auth/sair'),
    listar: () => chamar<Servico[]>('GET', '/servicos'),
    aprovar: (ids: string[]) => chamar<Servico[]>('POST', '/servicos/aprovar', { ids }),
    abrirDuvida: (id: string, motivo: Motivo, texto: string) => chamar<Servico>('POST', `/servicos/${encodeURIComponent(id)}/duvida`, { motivo, texto }),
    responder: (id: string, texto: string) => chamar<Servico>('POST', `/servicos/${encodeURIComponent(id)}/responder`, { texto }),
  }
}
