import type { Mapeamento } from './mapeamento'
import { normalizar, normalizarPlaca, parseData, parseNumero } from './parse'
import type { Abastecimento, Motorista, Operadora, Veiculo } from './types'

/** Uma linha do extrato já convertida (texto → data, números), antes de virar registro. */
export type LinhaLida = {
  linha: number
  data: Date | null
  placa: string
  motorista: string
  litros: number | null
  valor: number | null
  precoLitro: number | null
  posto: string
  combustivel: string
  odometro: number | null
}

export type Novo = Omit<Abastecimento, 'id'>
export type Invalida = { linha: number; motivo: string }
export type Resultado = {
  novos: Novo[]
  /** Já existiam (na base ou repetidas no próprio arquivo). */
  duplicados: number
  /** Linhas importadas sem veículo cadastrado para a placa (ficam na fila de pendências). */
  pendentes: number
  invalidas: Invalida[]
}

/** Converte as linhas do arquivo pelo mapeamento (cabeçalho → índice da coluna). A linha 1 é o cabeçalho. */
export function lerLinhas(cabecalho: string[], linhas: string[][], m: Mapeamento): LinhaLida[] {
  const idx = (campo: keyof Mapeamento) => { const col = m[campo]; const i = col ? cabecalho.indexOf(col) : -1; return i }
  const col = (linha: string[], campo: keyof Mapeamento) => { const i = idx(campo); return i >= 0 ? linha[i] ?? '' : '' }
  return linhas.map((linha, n) => ({
    linha: n + 2,
    data: parseData(col(linha, 'data'), col(linha, 'hora')),
    placa: normalizarPlaca(col(linha, 'placa')),
    motorista: col(linha, 'motorista').trim(),
    litros: parseNumero(col(linha, 'litros')),
    valor: parseNumero(col(linha, 'valor')),
    precoLitro: parseNumero(col(linha, 'precoLitro')),
    posto: col(linha, 'posto').trim(),
    combustivel: col(linha, 'combustivel').trim(),
    odometro: parseNumero(col(linha, 'odometro')),
  }))
}

/** Chave de deduplicação: origem, minuto do abastecimento, placa, litros e valor (igual em qualquer reimportação). */
export const chaveDe = (origem: Operadora, data: Date, placa: string, litros: number, valor: number) =>
  `${origem}|${data.toISOString().slice(0, 16)}|${placa}|${litros.toFixed(2)}|${valor.toFixed(2)}`

const tokens = (nome: string) => normalizar(nome).split(' ').filter((t) => t.length > 2)

/**
 * Motorista do cadastro pelo nome do extrato: nome igual, ou primeiro e último nome iguais (extrato abreviado).
 * Empate entre homônimos só se resolve se um deles for o motorista atual do veículo (`preferidoId`).
 */
export function acharMotorista(nome: string, motoristas: Motorista[], preferidoId: string | null = null): Motorista | null {
  const alvo = tokens(nome)
  if (!alvo.length) return null
  const exato = motoristas.find((m) => normalizar(m.nome) === normalizar(nome))
  if (exato) return exato
  if (alvo.length < 2) return null
  const [primeiro, ultimo] = [alvo[0], alvo[alvo.length - 1]]
  const parciais = motoristas.filter((m) => { const t = tokens(m.nome); return t[0] === primeiro && t[t.length - 1] === ultimo })
  if (parciais.length === 1) return parciais[0]
  return parciais.find((m) => m.id === preferidoId) ?? null
}

/** Preço do extrato só vale se bater (±20%) com valor ÷ litros: "6.199" lido como milhar daria R$ 6.199/L. */
const precoConfiavel = (informado: number | null, calculado: number) => (informado != null && Math.abs(informado - calculado) <= calculado * 0.2 ? informado : calculado)

type Entrada = { linhas: LinhaLida[]; origem: Operadora; arquivo: string; existentes: Iterable<string>; veiculos: Veiculo[]; motoristas: Motorista[] }

/**
 * Separa o que entra, o que repete e o que não dá para ler. Placa sem veículo cadastrado entra mesmo assim, sem
 * vínculo (pendência). Motorista: pelo nome do extrato; sem nome ou sem igual, o motorista atual do veículo.
 */
export function prepararImportacao({ linhas, origem, arquivo, existentes, veiculos, motoristas }: Entrada): Resultado {
  const vistas = new Set(existentes)
  const porPlaca = new Map(veiculos.map((v) => [normalizarPlaca(v.placa), v]))
  const out: Resultado = { novos: [], duplicados: 0, pendentes: 0, invalidas: [] }
  for (const l of linhas) {
    const faltas = [!l.data && 'data', !l.placa && 'placa', l.litros == null && 'litros', l.valor == null && 'valor'].filter((x): x is string => Boolean(x))
    if (faltas.length) { out.invalidas.push({ linha: l.linha, motivo: `sem ${faltas.join(', ')}` }); continue }
    if (l.litros! <= 0 || l.valor! <= 0) { out.invalidas.push({ linha: l.linha, motivo: 'litros ou valor zerados' }); continue }
    const chave = chaveDe(origem, l.data!, l.placa, l.litros!, l.valor!)
    if (vistas.has(chave)) { out.duplicados++; continue }
    vistas.add(chave)
    const veiculo = porPlaca.get(l.placa) ?? null
    const calculado = Math.round((l.valor! / l.litros!) * 1000) / 1000
    if (!veiculo) out.pendentes++
    const motorista = acharMotorista(l.motorista, motoristas, veiculo?.motoristaId ?? null)
    out.novos.push({
      data: l.data!, veiculoId: veiculo?.id ?? null, placa: l.placa,
      motoristaId: motorista?.id ?? (l.motorista ? null : veiculo?.motoristaId ?? null),
      motorista: motorista?.nome ?? (l.motorista || veiculo?.motorista || ''),
      litros: l.litros, valor: l.valor, precoLitro: precoConfiavel(l.precoLitro, calculado),
      posto: l.posto, combustivel: l.combustivel, origem, odometro: l.odometro, chave, arquivo,
    })
  }
  return out
}

/**
 * Despesa de combustível do App que o extrato já cobre: mesmo veículo, mesmo dia e valor com até R$ 0,50 de
 * diferença. Fica fora dos totais para não contar duas vezes.
 */
export function cobertaPorExtrato(despesa: Abastecimento, extratos: Abastecimento[]): boolean {
  if (!despesa.veiculoId || despesa.valor == null) return false
  const dia = despesa.data.toDateString()
  return extratos.some((e) => e.veiculoId === despesa.veiculoId && e.valor != null && e.data.toDateString() === dia && Math.abs(e.valor - despesa.valor!) <= 0.5)
}
