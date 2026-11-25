import type { EnderecoSugerido, EstimativaRota, Motivo, NovoPedido, PassageiroPedido, Pedido, Servico, Sessao } from '../domain/types'

export type CodigoErro = 'codigo_invalido' | 'codigo_expirado' | 'senha_invalida' | 'senha_fraca' | 'bloqueado' | 'aguarde' | 'sem_acesso' | 'nao_permitido' | 'duplicado' | 'falha'

export class ErroPortal extends Error {
  constructor(public codigo: CodigoErro, message: string = codigo) {
    super(message)
    this.name = 'ErroPortal'
  }
}

/** Regra da senha, usada pela tela, pelo mock e pelo Worker. */
export const SENHA_MIN = 8
/** Intervalo mínimo entre dois códigos para o mesmo e-mail: o Worker recusa antes disso e a tela mostra a contagem. */
export const REENVIO_S = 60
export const senhaFraca = (senha: string) => senha.length < SENHA_MIN || !senha.trim()

/** Contrato das telas com o servidor. O protótipo usa o mock; o portal real, o Worker (`/api/*`). */
export interface PortalApi {
  /** Sessão ainda válida (cookie de 30 dias) ou `null`: o portal abre já logado. */
  sessao(): Promise<Sessao | null>
  /** E-mail liberado + senha criada pela pessoa. Sem cadastro ou sem senha: `senha_invalida`, igual a senha errada. */
  entrar(email: string, senha: string): Promise<Sessao>
  /** 1º acesso e "Esqueci a senha". Não revela se o e-mail está liberado: responde igual para qualquer e-mail válido. */
  solicitarCodigo(email: string): Promise<void>
  /** Código de 6 dígitos do e-mail; certo, libera `criarSenha` por 10 minutos. */
  confirmarCodigo(email: string, codigo: string): Promise<void>
  /** Grava a senha nova e já entra; as sessões abertas com a senha antiga caem. */
  criarSenha(senha: string): Promise<Sessao>
  sair(): Promise<void>
  /** Serviços liberados do cliente da sessão. */
  listar(): Promise<Servico[]>
  /** Ignora os que já estão aprovados; devolve os serviços atualizados. */
  aprovar(ids: string[]): Promise<Servico[]>
  abrirDuvida(id: string, motivo: Motivo, texto: string): Promise<Servico>
  responder(id: string, texto: string): Promise<Servico>
  /** Módulo Pedir: passageiros já cadastrados do cliente da sessão (nome contém `q`; até 20, por nome). */
  buscarPassageiros(q: string): Promise<PassageiroPedido[]>
  /** Módulo Pedir: sugestões de endereço (até 6). Lista vazia = sem sugestão; o campo segue texto livre. `sinal` cancela a chamada anterior. */
  buscarEnderecos(q: string, sinal?: AbortSignal): Promise<EnderecoSugerido[]>
  /** Módulo Pedir: distância e tempo entre a saída e o destino; null = sem estimativa (o pedido segue igual). */
  estimarRota(origem: string, destino: string, sinal?: AbortSignal): Promise<EstimativaRota | null>
  /** Módulo Pedir: cria a reserva em Solicitado. `duplicado` = mesmo pedido há menos de 1 minuto. */
  pedir(novo: NovoPedido): Promise<Pedido>
  /** Módulo Meus serviços: pedidos feitos pelo e-mail da sessão, do mais recente para o mais antigo. */
  meusServicos(): Promise<Pedido[]>
  /** Cancela um pedido do próprio usuário ainda em Solicitado; senão `nao_permitido` com a mensagem para a tela. */
  cancelarPedido(id: string): Promise<Pedido>
}
