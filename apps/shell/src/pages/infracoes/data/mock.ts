import type { Infracao, MultaUso } from '../domain/types'

const MUN = 202410000
const ROD = 202410001
const EST = 202410002

const id = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`

function infracao(n: number, codigo: string, descricao: string, enquadramento: string, gravidade: number | null, pontos: number | null, valor: number | null, competencia: number[], responsabilidade = 0, ativo = true): Infracao {
  return { id: id(n), codigo, descricao, enquadramento, gravidade, pontos, valor, competencia, responsabilidade, ativo, modificadoEm: new Date('2026-01-10T12:00:00Z') }
}

/** Dados de exemplo do `pnpm dev`: inclui sem gravidade, inativa e multi-competência. */
export function createMockInfracoes(): Infracao[] {
  return [
    infracao(1, '5002', 'Multa, por não identificação do condutor infrator, imposta à pessoa jurídica', '257, § 8º', null, null, null, [MUN], 1),
    infracao(2, '5010', 'Dirigir veículo sem possuir CNH ou Permissão para Dirigir', '162, I', 3, 7, 880.41, [EST]),
    infracao(3, '5185', 'Deixar o condutor de usar o cinto de segurança', '167', 2, 5, 195.23, [MUN, ROD, EST]),
    infracao(4, '5541', 'Estacionar em desacordo com a regulamentação especificada pela sinalização', '181, XVII', 1, 4, 130.16, [MUN]),
    infracao(5, '5550', 'Estacionar em local/horário proibido especificamente pela sinalização', '181, XVIII', 1, 4, 130.16, [MUN]),
    infracao(6, '5746', 'Avançar o sinal vermelho do semáforo', '208', 3, 7, 293.47, [MUN, ROD]),
    infracao(7, '6050', 'Dirigir o veículo utilizando-se de telefone celular', '252, VI', 3, 7, 293.47, [MUN, ROD, EST]),
    infracao(8, '7455', 'Transitar em velocidade superior à máxima permitida em até 20%', '218, I', 1, 4, 130.16, [MUN, ROD]),
    infracao(9, '7463', 'Transitar em velocidade superior à máxima permitida em mais de 20% até 50%', '218, II', 2, 5, 195.23, [MUN, ROD]),
    infracao(10, '7471', 'Transitar em velocidade superior à máxima permitida em mais de 50%', '218, III', 3, 7, 880.41, [MUN, ROD]),
    infracao(11, '7587', 'Executar operação de retorno em locais proibidos pela sinalização', '206, I', 3, 7, 293.47, [MUN]),
    infracao(12, '5169', 'Conduzir o veículo com o lacre de identificação violado (código antigo)', '230, I', 3, 7, 293.47, [EST], 0, false),
  ]
}

const PLACAS = ['RTA-2B41', 'SFX-8C12', 'QPL-4D90']
const MOTORISTAS = ['Carlos Andrade', 'Rafael Souza', 'Márcio Lima', '']
const STATUS = ['Notificar o Condutor', 'Condutor Notificado', 'Indicada', 'Descontado', 'Pago']

/** Multas espalhadas nos últimos ~18 meses; velocidade e semáforo com mais uso. */
export function createMockMultas(now = new Date()): MultaUso[] {
  const pesos: [number, number][] = [[8, 9], [6, 5], [4, 3], [5, 2], [1, 2], [9, 2], [7, 1], [11, 1]]
  const out: MultaUso[] = []
  let n = 0
  for (const [infracaoN, qtd] of pesos) {
    for (let i = 0; i < qtd; i++) {
      n += 1
      const data = new Date(now)
      data.setDate(data.getDate() - n * 23)
      data.setHours(8 + (n % 10), (n * 7) % 60, 0, 0)
      out.push({
        id: id(1000 + n), infracaoId: id(infracaoN), titulo: `Multa ${String(n).padStart(3, '0')}`, status: STATUS[n % STATUS.length], data,
        placa: PLACAS[n % PLACAS.length], motorista: MOTORISTAS[n % MOTORISTAS.length],
      })
    }
  }
  return out
}
