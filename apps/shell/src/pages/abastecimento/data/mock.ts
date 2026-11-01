import { chaveDe } from '../domain/importacao'
import type { Abastecimento, Motorista, Operadora, Veiculo } from '../domain/types'

/** Mesmas placas da Frota e os mesmos nomes de Funcionários/Equipamentos, para os links baterem entre telas. */
export function createMockVeiculos(): Veiculo[] {
  return [
    { id: 'v1', placa: 'TST1A11', modelo: 'Toyota Corolla', motoristaId: 'm1', motorista: 'Carlos Alberto Teste', capacidadeTanque: 50, ativo: true },
    { id: 'v2', placa: 'TST2B22', modelo: 'VW Virtus', motoristaId: 'm2', motorista: 'Bruna Ficticia Lima', capacidadeTanque: 52, ativo: true },
    { id: 'v4', placa: 'TST4D44', modelo: 'Kia Carnival', motoristaId: 'm3', motorista: 'Diego Exemplo Rocha', capacidadeTanque: null, ativo: true },
    { id: 'v3', placa: 'TST3C33', modelo: 'Nissan Versa', motoristaId: null, motorista: '', capacidadeTanque: 41, ativo: false },
  ]
}

export function createMockMotoristas(): Motorista[] {
  return [
    { id: 'm1', nome: 'Carlos Alberto Teste', ativo: true },
    { id: 'm2', nome: 'Bruna Ficticia Lima', ativo: true },
    { id: 'm3', nome: 'Diego Exemplo Rocha', ativo: true },
    { id: 'm6', nome: 'Gustavo Amostra Pires', ativo: false },
  ]
}

type Semente = { dias: number; hora?: number; minuto?: number; v: Veiculo; litros: number; preco: number; odometro: number | null; origem?: Operadora; posto?: string; motorista?: Motorista | null }

/**
 * ~40 abastecimentos nos últimos 3 meses. Casos semeados: TST1A11 com consumo regular (~11 km/l) e um trecho
 * fora da curva, um acima do tanque (50 L) e dois em 35 min; TST2B22 sem odômetro em metade; TST4D44 (sem
 * capacidade cadastrada) com Diego pagando mais caro; placa XYZ9Z99 sem cadastro (pendência).
 */
export function createMockAbastecimentos(now: Date): Abastecimento[] {
  const [v1, v2, v4] = createMockVeiculos()
  const [m1, m2, m3] = createMockMotoristas()
  const fora: Veiculo = { id: '', placa: 'XYZ9Z99', modelo: '', motoristaId: null, motorista: '', capacidadeTanque: null, ativo: true }
  const sementes: Semente[] = []
  // TST1A11: a cada 4 dias, 40 L, 440 km (11 km/l); preço sobe devagar.
  let km = 158000
  for (let i = 22; i >= 0; i--) {
    km += 440
    sementes.push({ dias: i * 4, hora: 7 + (i % 3), v: v1, litros: 40, preco: 6.19 + (22 - i) * 0.01, odometro: km, posto: i % 2 ? 'Posto Shell Faria Lima' : 'Ipiranga Marginal' })
  }
  // Fora da curva: 40 L para só 180 km (4,5 km/l), há 30 dias.
  const curva = sementes.find((s) => s.dias === 28)!
  curva.odometro = curva.odometro! - 260
  for (const s of sementes) if (s.dias < 28 && s.v === v1) s.odometro = s.odometro! - 260
  // Acima do tanque: 54 L há 12 dias.
  sementes.find((s) => s.dias === 12)!.litros = 54
  // Dois em 35 minutos, há 8 dias.
  const par = sementes.find((s) => s.dias === 8)!
  sementes.push({ dias: 8, hora: par.hora, minuto: 45, v: v1, litros: 12, preco: 6.3, odometro: null, posto: par.posto })
  // TST2B22: Bruna, a cada 5 dias, metade sem odômetro; 10 km/l.
  km = 84000
  for (let i = 17; i >= 0; i--) {
    km += 380
    sementes.push({ dias: i * 5 + 1, hora: 18, v: v2, litros: 38, preco: 6.09 + (17 - i) * 0.012, odometro: i % 2 ? null : km, posto: 'Posto BR Anhanguera', motorista: m2 })
  }
  // TST4D44: Diego, 60 L a cada 6 dias, 7 km/l, preço 8% acima; sem capacidade cadastrada (sem alerta de tanque).
  km = 42000
  for (let i = 14; i >= 0; i--) {
    km += 420
    sementes.push({ dias: i * 6 + 2, hora: 12, v: v4, litros: 60, preco: 6.69 + (14 - i) * 0.01, odometro: km, posto: 'Posto Graal Bandeirantes', motorista: m3, origem: i % 3 ? 'ctf' : 'ticket' })
  }
  // Placa sem cadastro: entra na fila de pendências.
  sementes.push({ dias: 3, hora: 9, v: fora, litros: 35, preco: 6.4, odometro: null, motorista: null, origem: 'ticket' })
  // Crédito: cupom sem odômetro nem motorista.
  sementes.push({ dias: 15, hora: 20, v: v1, litros: 30, preco: 6.45, odometro: null, origem: 'credito', posto: 'Auto Posto Rodovia' })

  const lista = sementes.map((s, i): Abastecimento => {
    const data = new Date(now)
    data.setDate(data.getDate() - s.dias)
    data.setHours(s.hora ?? 8, s.minuto ?? 10, 0, 0)
    const valor = Math.round(s.litros * s.preco * 100) / 100
    const origem = s.origem ?? 'ctf'
    const motorista = s.motorista === undefined ? (s.v.motoristaId ? m1 : null) : s.motorista
    return {
      id: `ab-${i + 1}`, data, veiculoId: s.v.id || null, placa: s.v.placa, motoristaId: motorista?.id ?? null, motorista: motorista?.nome ?? '',
      litros: s.litros, valor, precoLitro: s.preco, posto: s.posto ?? 'Posto Exemplo', combustivel: origem === 'credito' ? '' : 'Gasolina comum', origem, odometro: s.odometro,
      chave: chaveDe(origem, data, s.v.placa, s.litros, valor), arquivo: origem === 'ticket' ? 'ticket-log-outubro.xlsx' : origem === 'credito' ? 'fatura-cartao.csv' : 'ctf-outubro.csv',
    }
  })
  // Despesas do App: uma já coberta pelo extrato (mesmo dia e valor do TST2B22) e uma só no App (TST4D44, com km).
  const coberta = lista.find((a) => a.veiculoId === 'v2' && a.data.getDate() !== now.getDate())!
  lista.push(
    { ...coberta, id: 'despesa:d1', origem: 'app', chave: '', arquivo: '', odometro: null, precoLitro: coberta.valor! / coberta.litros!, data: new Date(coberta.data.getTime() + 3600_000) },
    { id: 'despesa:d2', data: new Date(now.getTime() - 5 * 86400_000), veiculoId: 'v4', placa: 'TST4D44', motoristaId: 'm3', motorista: 'Diego Exemplo Rocha', litros: 20, valor: 134, precoLitro: 6.7, posto: 'Posto Ipiranga Centro', combustivel: '', origem: 'app', odometro: null, chave: '', arquivo: '' },
  )
  return lista
}
