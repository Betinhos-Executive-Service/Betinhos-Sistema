import { OPERACIONAL } from '../../domain/status'
import { CANAL, SITUACAO, TIPO, type DespesaMotorista } from '../domain/regras'
import type { Cartao, Pessoa, Transacao } from '../domain/types'

/** Mesmos ids e nomes do mock de Equipamentos/Funcionários. */
export function createMockMotoristas(): Pessoa[] {
  return [
    { id: 'm1', nome: 'Carlos Alberto Teste', ativo: true },
    { id: 'm2', nome: 'Bruna Ficticia Lima', ativo: true },
    { id: 'm3', nome: 'Diego Exemplo Rocha', ativo: true },
    { id: 'm4', nome: 'Elaine Mock Duarte', ativo: true },
    { id: 'm5', nome: 'Fabio Demo Nunes', ativo: true },
  ]
}

export const CONTA_ITAU = 'conta-itau-0001'
export const CONTA_NUBANK = 'conta-nubank-0002'
const nome = (id: string) => createMockMotoristas().find((m) => m.id === id)?.nome ?? ''
const cid = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`
const tid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const did = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Itaú 1234 (Carlos), Itaú 5678 com troca de motorista em 01/10 (Bruna → Diego) e Nubank da conta toda (Elaine). */
export function createMockCartoes(): Cartao[] {
  const c = (n: number, nomeCartao: string, conta: string, final: string, motoristaId: string, inicio: string, fim: string | null = null): Cartao =>
    ({ id: cid(n), nome: nomeCartao, conta, final, motoristaId, motoristaNome: nome(motoristaId), inicio, fim })
  return [
    c(1, 'Itaú final 1234 · Carlos', CONTA_ITAU, '1234', 'm1', '2026-01-01'),
    c(2, 'Itaú final 5678 · Bruna', CONTA_ITAU, '5678', 'm2', '2026-01-01', '2026-09-30'),
    c(3, 'Itaú final 5678 · Diego', CONTA_ITAU, '5678', 'm3', '2026-10-01'),
    c(4, 'Nubank conta toda · Elaine', CONTA_NUBANK, '', 'm4', '2026-06-01'),
  ]
}

/**
 * Uma transação de cada situação. As duas "Sem motorista": a do Nubank já tem cartão (cadastrado depois do flow) e
 * reprocessa direto; a do Itaú final 9012 só depois de cadastrar o cartão.
 */
export function createMockTransacoes(): Transacao[] {
  const cartoes = createMockCartoes()
  const t = (n: number, descricao: string, dataCompra: string, valor: number, situacao: number, motivo: string, o: Partial<Transacao> = {}): Transacao => {
    const cartao = cartoes.find((c) => c.id === o.cartaoId)
    return {
      id: tid(n), descricao, conta: cartao?.conta ?? CONTA_ITAU, fatura: dataCompra.slice(0, 7), dataCompra, valor, estabelecimento: descricao,
      final: cartao?.final ?? '', parcela: 1, totalParcelas: 1, tipo: TIPO.compra, situacao, canal: null, motivo,
      cartaoId: cartao?.id ?? '', cartaoNome: cartao?.nome ?? '', motoristaId: cartao?.motoristaId ?? '', motoristaNome: cartao?.motoristaNome ?? '',
      despesaId: '', despesaNome: '', placa: '', combustivel: '', litros: null, precoLitro: null, hodometro: null, kmRodado: null, desconto: null, cidadePosto: '', veiculoNome: '', ...o,
    }
  }
  return [
    t(1, 'POSTO SHELL AV BRASIL', '2026-11-03', 250, SITUACAO.pendente, 'Cartão vinculado manualmente; case com a despesa do motorista.', { cartaoId: cid(1) }),
    t(2, 'RESTAURANTE SABOR', '2026-10-20', 89.9, SITUACAO.divergencia, 'Mais de uma despesa do motorista com o mesmo valor e data próxima; escolha no Sistema Betinhos.', { cartaoId: cid(3) }),
    t(3, 'ESTACIONAMENTO CENTRO', '2026-10-28', 120, SITUACAO.semMotorista, 'Cartão sem motorista vigente na data; cadastre o vínculo no Sistema Betinhos.', { final: '9012' }),
    t(4, 'LAVA RAPIDO JARDINS', '2026-10-30', 64.5, SITUACAO.semMotorista, 'Cartão sem motorista vigente na data; cadastre o vínculo no Sistema Betinhos.', { conta: CONTA_NUBANK, final: '4321' }),
    t(5, 'POSTO IPIRANGA MARGINAL', '2026-10-15', 180, SITUACAO.automatica, 'Casada com a despesa lançada pelo motorista (mesmo valor e data próxima).', { cartaoId: cid(1), despesaId: 'mock-desp-7', despesaNome: 'Combustível · Marcos' }),
    t(6, 'PEDAGIO ECOVIAS', '2026-09-20', 75, SITUACAO.manual, 'Casada manualmente no Sistema Betinhos.', { cartaoId: cid(2), despesaId: 'mock-desp-2', despesaNome: 'Pedágio · Ana' }),
    t(7, 'AUTO PECAS SILVA', '2026-10-25', 310.4, SITUACAO.aguardando, 'Nenhuma despesa lançada pelo motorista; despesa criada para ele validar.', { cartaoId: cid(1), despesaId: 'mock-desp-3', despesaNome: 'Estacionamento · Marcos' }),
    t(8, 'IOF COMPRA INTERNACIONAL', '2026-10-31', 3.21, SITUACAO.ignorada, 'Lançamento que não é compra (encargo, estorno ou pagamento).', { tipo: TIPO.encargo }),
    t(9, 'LOJA PNEUS PARC 02/03', '2026-10-02', 400, SITUACAO.ignorada, 'Parcela seguinte de compra parcelada; a despesa é da compra inteira.', { cartaoId: cid(3), parcela: 2, totalParcelas: 3 }),
    t(10, 'POSTO GRAAL TAUBATE', '2026-11-04', 412.37, SITUACAO.semMotorista, 'Motorista do CTF não encontrado pelo CPF nem pelo nome.', { canal: CANAL.ctf, conta: '', final: '' }),
    t(11, 'POSTO SHELL FARIA LIMA', '2026-11-05', 238.9, SITUACAO.automatica, 'Casada com a despesa lançada pelo motorista (mesmo valor e data próxima).', {
      canal: CANAL.ctf, conta: '', final: '', motoristaId: 'm1', motoristaNome: nome('m1'), despesaId: 'mock-desp-1', despesaNome: 'Combustível · Carlos',
      placa: 'FJK2B19', combustivel: 'Diesel S10', litros: 41.2, precoLitro: 5.9602, hodometro: 48210, kmRodado: 612, desconto: 6.4, cidadePosto: 'São Paulo', veiculoNome: 'Mercedes S500 · FJK-2B19',
    }),
  ]
}

/** Despesas dos motoristas: d1 casa com t1; d2 está fora da janela; d3/d4 são a divergência de t2; d5 casa com t4 após reprocessar; d8 é Pix. */
export function createMockDespesas(): DespesaMotorista[] {
  const d = (n: number, nomeDespesa: string, motoristaId: string, dia: string, valor: number, o: Partial<DespesaMotorista> = {}): DespesaMotorista => ({
    id: did(n), nome: nomeDespesa, protocolo: `DSP-${String(n).padStart(4, '0')}`, data: new Date(`${dia}T15:00:00Z`), valor, estabelecimento: nomeDespesa,
    motoristaId, cartao: true, statusOperacional: OPERACIONAL.enviado, conciliada: false, ...o,
  })
  return [
    d(1, 'Combustível Shell', 'm1', '2026-11-03', 250),
    d(2, 'Combustível outro dia', 'm1', '2026-11-08', 250),
    d(3, 'Almoço com passageiro', 'm3', '2026-10-20', 89.9),
    d(4, 'Jantar viagem', 'm3', '2026-10-21', 89.9),
    d(5, 'Lavagem do carro', 'm4', '2026-10-30', 64.5),
    d(6, 'Combustível 15/10', 'm1', '2026-10-15', 180, { conciliada: true }),
    d(7, 'Cartão final 1234 · AUTO PECAS SILVA', 'm1', '2026-10-25', 310.4, { conciliada: true, statusOperacional: OPERACIONAL.corrigir }),
    d(8, 'Combustível no Pix', 'm1', '2026-11-03', 250, { cartao: false }),
    d(9, 'Pedágio Imigrantes', 'm2', '2026-09-20', 75, { conciliada: true }),
  ]
}
