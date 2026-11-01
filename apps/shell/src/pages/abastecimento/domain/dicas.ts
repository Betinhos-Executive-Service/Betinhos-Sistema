import type { Anomalia } from './anomalias'
import { ANOMALIA_ROTULO } from './anomalias'
import { chaveVeiculo, type ResumoMotorista, type ResumoVeiculo, type Trecho } from './indicadores'
import type { Abastecimento } from './types'

/**
 * Dicas ao motorista e alertas ao gestor no formato das propostas dos agentes (packages/agentes-ia): o sistema
 * calcula por regra fixa; a IA do Assistente da Frota redige e o gestor aprova. Os tipos são os do agente Frota.
 */
export type Proposta = {
  id: string
  tipo: 'FrotaConsumo' | 'FrotaDicaCombustivel'
  titulo: string
  justificativa: string
  prioridade: 'alta' | 'media' | 'baixa'
  alvo: { entidade: 'cr40f_veiculos' | 'cr40f_funcionarios'; id: string | null; nome: string }
}

const fmt = (n: number, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: Date) => d.toLocaleDateString('pt-BR')
/** Consumo do motorista pior que o do veículo nesta fração (ou mais) rende dica. */
export const PIORA_MIN = 0.1
/** Preço médio pago acima do da frota nesta fração (ou mais) rende dica de posto. */
export const PRECO_ACIMA_MIN = 0.05

/** Um alerta por veículo com anomalia, listando os motivos; prioridade alta se alguma for alta. */
export function gerarAlertas(anomalias: Anomalia[]): Proposta[] {
  const porVeiculo = new Map<string, Anomalia[]>()
  for (const an of anomalias) { const k = chaveVeiculo(an.abastecimento); porVeiculo.set(k, [...(porVeiculo.get(k) ?? []), an]) }
  return [...porVeiculo.values()].map((grupo) => {
    const a = grupo[0].abastecimento
    const motivos = grupo.slice(0, 4).map((an) => `${data(an.abastecimento.data)}: ${ANOMALIA_ROTULO[an.tipo].toLowerCase()} (${an.motivo})`)
    return {
      id: `alerta:${chaveVeiculo(a)}`, tipo: 'FrotaConsumo' as const,
      titulo: `${a.placa}: ${grupo.length === 1 ? 'uma anomalia' : `${grupo.length} anomalias`} de abastecimento`,
      justificativa: motivos.join('. ') + (grupo.length > 4 ? ` e mais ${grupo.length - 4}.` : '.'),
      prioridade: grupo.some((an) => an.gravidade === 'alta') ? 'alta' : 'media',
      alvo: { entidade: 'cr40f_veiculos', id: a.veiculoId, nome: a.placa },
    }
  })
}

type Entrada = { lista: Abastecimento[]; ts: Trecho[]; motoristas: ResumoMotorista[]; veiculos: ResumoVeiculo[] }

/**
 * Dicas por motorista: consumo pior que o do veículo que ele mais usa, preço por litro acima do da frota e
 * odômetro em branco na maioria dos abastecimentos. Motorista sem cadastro não recebe dica (não há a quem enviar).
 */
export function gerarDicas({ lista, ts, motoristas, veiculos }: Entrada): Proposta[] {
  const litrosFrota = lista.reduce((s, a) => s + (a.litros ?? 0), 0)
  const precoFrota = litrosFrota > 0 ? lista.reduce((s, a) => s + (a.valor ?? 0), 0) / litrosFrota : null
  const ids = new Set(lista.map((a) => a.id))
  const kmPorLitroVeiculo = new Map(veiculos.map((v) => [v.veiculoId ?? `placa:${v.placa}`, v.kmPorLitro]))
  const out: Proposta[] = []
  for (const m of motoristas) {
    if (!m.motoristaId) continue
    const meus = lista.filter((a) => a.motoristaId === m.motoristaId)
    const alvo = { entidade: 'cr40f_funcionarios' as const, id: m.motoristaId, nome: m.nome }
    const meusTrechos = ts.filter((t) => t.ate.motoristaId === m.motoristaId && ids.has(t.ate.id))
    if (meusTrechos.length >= 2) {
      const porVeiculo = new Map<string, Trecho[]>()
      for (const t of meusTrechos) { const k = chaveVeiculo(t.ate); porVeiculo.set(k, [...(porVeiculo.get(k) ?? []), t]) }
      const [chave, trechosDoCarro] = [...porVeiculo.entries()].sort((a, b) => b[1].length - a[1].length)[0]
      const referencia = kmPorLitroVeiculo.get(chave)
      const litros = trechosDoCarro.reduce((s, t) => s + (t.ate.litros ?? 0), 0)
      const meu = litros > 0 ? trechosDoCarro.reduce((s, t) => s + t.km, 0) / litros : null
      if (meu != null && referencia && meu < referencia * (1 - PIORA_MIN)) {
        out.push({ id: `dica:consumo:${m.motoristaId}`, tipo: 'FrotaDicaCombustivel', prioridade: meu < referencia * 0.8 ? 'media' : 'baixa', alvo,
          titulo: `${m.nome}: consumo ${fmt((1 - meu / referencia) * 100, 0)}% pior no ${trechosDoCarro[0].ate.placa}`,
          justificativa: `${fmt(meu)} km/l nos ${trechosDoCarro.length} trechos dele; o veículo faz ${fmt(referencia)} km/l em média. Vale conversar sobre condução econômica (aceleração suave, antecipar frenagens, ar-condicionado em espera longa).` })
      }
    }
    const meusLitros = meus.reduce((s, a) => s + (a.litros ?? 0), 0)
    const meuPreco = meusLitros > 0 ? meus.reduce((s, a) => s + (a.valor ?? 0), 0) / meusLitros : null
    if (meuPreco != null && precoFrota && meus.length >= 3 && meuPreco > precoFrota * (1 + PRECO_ACIMA_MIN)) {
      const postos = [...new Set(meus.map((a) => a.posto).filter(Boolean))].slice(0, 3)
      out.push({ id: `dica:preco:${m.motoristaId}`, tipo: 'FrotaDicaCombustivel', prioridade: 'baixa', alvo,
        titulo: `${m.nome}: paga ${brl(meuPreco)}/L, frota ${brl(precoFrota)}/L`,
        justificativa: `${fmt((meuPreco / precoFrota - 1) * 100, 0)}% acima da média da frota em ${meus.length} abastecimentos${postos.length ? ` (${postos.join(', ')})` : ''}. Sugerir os postos com melhor preço da rota.` })
    }
    const semOdometro = meus.filter((a) => a.odometro == null && a.origem !== 'credito').length
    if (meus.length >= 3 && semOdometro / meus.length >= 0.5) {
      out.push({ id: `dica:odometro:${m.motoristaId}`, tipo: 'FrotaDicaCombustivel', prioridade: 'baixa', alvo,
        titulo: `${m.nome}: odômetro em branco em ${semOdometro} de ${meus.length}`,
        justificativa: 'Sem o odômetro no abastecimento não dá para calcular o km/l. Pedir para informar o km do painel na bomba ou no App.' })
    }
  }
  return out
}

/**
 * Contexto que o Assistente da Frota recebe (packages/agentes-ia `SYSTEM_ABASTECIMENTO`): só números já calculados,
 * sem CPF ou contato. A IA redige dicas e alertas; o gestor aprova em #/assistente-frota.
 */
export function montarContextoIA(hoje: Date, veiculos: ResumoVeiculo[], motoristas: ResumoMotorista[], anomalias: Anomalia[]) {
  return {
    hoje: hoje.toISOString().slice(0, 10),
    veiculos: veiculos.map((v) => ({ veiculoId: v.veiculoId, placa: v.placa, modelo: v.modelo, abastecimentos: v.qtd, litros: round(v.litros), valor: round(v.valor), kmPorLitro: v.kmPorLitro == null ? null : round(v.kmPorLitro), precoMedio: v.precoMedio == null ? null : round(v.precoMedio, 3), motoristas: v.motoristas })),
    motoristas: motoristas.filter((m) => m.motoristaId).map((m) => ({ motoristaId: m.motoristaId, nome: m.nome, abastecimentos: m.qtd, litros: round(m.litros), valor: round(m.valor), kmPorLitro: m.kmPorLitro == null ? null : round(m.kmPorLitro), placas: m.placas })),
    anomalias: anomalias.map((an) => ({ tipo: an.tipo, gravidade: an.gravidade, data: an.abastecimento.data.toISOString(), veiculoId: an.abastecimento.veiculoId, placa: an.abastecimento.placa, motoristaId: an.abastecimento.motoristaId, motorista: an.abastecimento.motorista, motivo: an.motivo })),
  }
}
const round = (n: number, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas
