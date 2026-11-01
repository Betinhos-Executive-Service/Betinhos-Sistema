/** De onde veio o abastecimento: extrato importado (CTF, Ticket Log, cartão de crédito) ou despesa do App Motoristas. */
export const ORIGENS = ['ctf', 'ticket', 'app', 'credito'] as const
export type Origem = (typeof ORIGENS)[number]
/** Extratos que a tela importa (o App entra sozinho, pelas despesas de combustível). */
export const OPERADORAS = ['ctf', 'ticket', 'credito'] as const
export type Operadora = (typeof OPERADORAS)[number]
export const ORIGEM_ROTULO: Record<Origem, string> = { ctf: 'CTF', ticket: 'Ticket Log', app: 'App Motoristas', credito: 'Crédito' }
/** Valores do choice `cr40f_origem` (provision-abastecimento.ps1), na ordem de ORIGENS. */
export const ORIGEM_VALOR: Record<Origem, number> = { ctf: 100000000, ticket: 100000001, app: 100000002, credito: 100000003 }

/** Abastecimento (`cr40f_abastecimento`) ou despesa de combustível do App lida como um. */
export type Abastecimento = {
  id: string
  data: Date
  /** null = placa do extrato sem veículo cadastrado (fila de pendências). */
  veiculoId: string | null
  placa: string
  motoristaId: string | null
  /** Nome do motorista no cadastro ou, sem vínculo, o que veio no extrato. */
  motorista: string
  litros: number | null
  valor: number | null
  precoLitro: number | null
  posto: string
  combustivel: string
  origem: Origem
  odometro: number | null
  /** Chave de deduplicação (`chaveDe`); vazia nas despesas do App. */
  chave: string
  arquivo: string
}

export type Veiculo = { id: string; placa: string; modelo: string; motoristaId: string | null; motorista: string; capacidadeTanque: number | null; ativo: boolean }
export type Motorista = { id: string; nome: string; ativo: boolean }
