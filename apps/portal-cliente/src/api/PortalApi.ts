import type { Motivo, Servico, Sessao } from '../domain/types'

export type CodigoErro = 'codigo_invalido' | 'codigo_expirado' | 'totp_invalido' | 'bloqueado' | 'nao_permitido' | 'falha'

export class ErroPortal extends Error {
  constructor(public codigo: CodigoErro, message: string = codigo) {
    super(message)
    this.name = 'ErroPortal'
  }
}

/** Próximo passo depois do código do e-mail: cadastrar o autenticador (1º acesso), digitar o código dele ou já entrar (computador lembrado). */
export type ResultadoEntrada =
  | { etapa: 'cadastrar_autenticador'; otpauthUrl: string; segredo: string }
  | { etapa: 'autenticador' }
  | { etapa: 'ok'; sessao: Sessao }

/** Contrato das telas com o servidor. O protótipo usa o mock; o portal real, o Worker (`/api/*`). */
export interface PortalApi {
  /** Não revela se o e-mail está cadastrado: responde igual para qualquer e-mail válido. */
  solicitarCodigo(email: string): Promise<void>
  entrar(email: string, codigo: string): Promise<ResultadoEntrada>
  /** Segunda etapa: código de 6 dígitos do app autenticador (TOTP). `lembrar` dispensa o TOTP neste computador por 30 dias. */
  confirmarAutenticador(codigoTotp: string, lembrar: boolean): Promise<Sessao>
  sair(): Promise<void>
  /** Serviços liberados do cliente da sessão. */
  listar(): Promise<Servico[]>
  /** Ignora os que já estão aprovados; devolve os serviços atualizados. */
  aprovar(ids: string[]): Promise<Servico[]>
  abrirDuvida(id: string, motivo: Motivo, texto: string): Promise<Servico>
  responder(id: string, texto: string): Promise<Servico>
}
