import type { Motivo, Servico, Sessao } from '../domain/types'

export type CodigoErro = 'codigo_invalido' | 'codigo_expirado' | 'bloqueado' | 'nao_permitido' | 'falha'

export class ErroPortal extends Error {
  constructor(public codigo: CodigoErro, message: string = codigo) {
    super(message)
    this.name = 'ErroPortal'
  }
}

/** Contrato das telas com o servidor. O protótipo usa o mock; o portal real, o Worker (`/api/*`). */
export interface PortalApi {
  /** Não revela se o e-mail está cadastrado: responde igual para qualquer e-mail válido. */
  solicitarCodigo(email: string): Promise<void>
  entrar(email: string, codigo: string): Promise<Sessao>
  sair(): Promise<void>
  /** Serviços liberados do cliente da sessão. */
  listar(): Promise<Servico[]>
  /** Ignora os que já estão aprovados; devolve os serviços atualizados. */
  aprovar(ids: string[]): Promise<Servico[]>
  abrirDuvida(id: string, motivo: Motivo, texto: string): Promise<Servico>
  responder(id: string, texto: string): Promise<Servico>
}
