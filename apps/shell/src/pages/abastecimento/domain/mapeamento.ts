import type { KV } from '../../pagantes/domain/filters'
import { normalizar } from './parse'
import type { Operadora } from './types'

/** Campos que a importação lê do extrato; cada um aponta para o cabeçalho de uma coluna do arquivo. */
export const CAMPOS = ['data', 'hora', 'placa', 'motorista', 'litros', 'valor', 'precoLitro', 'posto', 'combustivel', 'odometro'] as const
export type Campo = (typeof CAMPOS)[number]
export type Mapeamento = Partial<Record<Campo, string>>
export const OBRIGATORIOS: readonly Campo[] = ['data', 'placa', 'litros', 'valor']

export const CAMPO_ROTULO: Record<Campo, string> = {
  data: 'Data', hora: 'Hora (se vier separada)', placa: 'Placa', motorista: 'Motorista', litros: 'Litros', valor: 'Valor total',
  precoLitro: 'Preço por litro', posto: 'Posto', combustivel: 'Combustível', odometro: 'Odômetro (km)',
}

/** Cabeçalhos usuais dos extratos (CTF, Ticket Log, fatura de cartão), já normalizados; o primeiro que bater vence. */
const ALIASES: Record<Campo, string[]> = {
  data: ['data', 'data transacao', 'data da transacao', 'dt transacao', 'data abastecimento', 'data do abastecimento', 'data hora', 'data e hora', 'data compra', 'data da compra', 'date'],
  hora: ['hora', 'hora transacao', 'hora da transacao', 'horario'],
  placa: ['placa', 'placa do veiculo', 'placa veiculo', 'veiculo'],
  motorista: ['motorista', 'condutor', 'nome do motorista', 'nome motorista', 'nome do condutor', 'portador'],
  litros: ['litros', 'quantidade', 'qtd', 'qtde', 'volume', 'qtd litros', 'quantidade litros', 'litragem'],
  valor: ['valor', 'valor total', 'total', 'vl total', 'valor transacao', 'valor da transacao', 'valor liquido', 'valor bruto'],
  precoLitro: ['preco', 'preco unitario', 'valor unitario', 'vl unitario', 'preco litro', 'preco por litro', 'valor litro', 'valor por litro', 'pu'],
  posto: ['posto', 'estabelecimento', 'nome do estabelecimento', 'nome fantasia', 'razao social', 'credenciado', 'local', 'rede'],
  combustivel: ['combustivel', 'produto', 'tipo combustivel', 'tipo de combustivel', 'descricao produto', 'descricao do produto'],
  odometro: ['odometro', 'hodometro', 'km', 'km atual', 'quilometragem', 'km odometro', 'hodometro km', 'odometro km'],
}

/** Sugere o mapeamento pelos cabeçalhos: igualdade primeiro, depois cabeçalho que começa com o alias; cada coluna só uma vez. */
export function sugerirMapeamento(cabecalho: string[]): Mapeamento {
  const normais = cabecalho.map(normalizar)
  const usadas = new Set<string>()
  const out: Mapeamento = {}
  const tentar = (campo: Campo, bate: (coluna: string, alias: string) => boolean) => {
    if (out[campo]) return
    for (const alias of ALIASES[campo]) {
      const i = normais.findIndex((c, idx) => c && !usadas.has(cabecalho[idx]) && bate(c, alias))
      if (i >= 0) { out[campo] = cabecalho[i]; usadas.add(cabecalho[i]); return }
    }
  }
  for (const campo of CAMPOS) tentar(campo, (c, a) => c === a)
  for (const campo of CAMPOS) tentar(campo, (c, a) => c.startsWith(`${a} `))
  return out
}

/** Campos obrigatórios sem coluna (ou com coluna que não existe mais no arquivo). */
export function faltamNoMapeamento(m: Mapeamento, cabecalho: string[]): Campo[] {
  return OBRIGATORIOS.filter((campo) => !m[campo] || !cabecalho.includes(m[campo]!))
}

const chave = (operadora: Operadora) => `betinhos.abastecimento.mapeamento.${operadora}`

/** Mapeamento salvo por operadora neste navegador; inválido ou ausente → null. */
export function carregarMapeamento(kv: KV, operadora: Operadora): Mapeamento | null {
  try {
    const bruto = kv.getItem(chave(operadora))
    if (!bruto) return null
    const v: unknown = JSON.parse(bruto)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const out: Mapeamento = {}
    for (const campo of CAMPOS) { const col = (v as Record<string, unknown>)[campo]; if (typeof col === 'string' && col) out[campo] = col }
    return out
  } catch { return null }
}

export function salvarMapeamento(kv: KV, operadora: Operadora, m: Mapeamento) {
  kv.setItem(chave(operadora), JSON.stringify(m))
}

/** Mapeamento salvo quando ainda serve ao arquivo; senão a sugestão pelos cabeçalhos. */
export function mapeamentoInicial(kv: KV, operadora: Operadora, cabecalho: string[]): { mapeamento: Mapeamento; salvo: boolean } {
  const salvo = carregarMapeamento(kv, operadora)
  if (salvo && !faltamNoMapeamento(salvo, cabecalho).length) return { mapeamento: salvo, salvo: true }
  return { mapeamento: sugerirMapeamento(cabecalho), salvo: false }
}
