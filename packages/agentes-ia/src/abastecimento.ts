import { REGRAS_COMUNS } from './comum.ts'

/**
 * Contexto de combustível para o Agente Frota: o shell calcula (apps/shell/src/pages/abastecimento/domain/dicas.ts
 * `montarContextoIA`) e o flow repassa o JSON. Só números prontos; a IA redige, o gestor aprova.
 */
export type ResumoVeiculoIA = { veiculoId: string | null; placa: string; modelo: string; abastecimentos: number; litros: number; valor: number; kmPorLitro: number | null; precoMedio: number | null; motoristas: string[] }
export type ResumoMotoristaIA = { motoristaId: string | null; nome: string; abastecimentos: number; litros: number; valor: number; kmPorLitro: number | null; placas: string[] }
export type AnomaliaIA = { tipo: 'tanque' | 'consumo' | 'intervalo'; gravidade: 'alta' | 'media'; data: string; veiculoId: string | null; placa: string; motoristaId: string | null; motorista: string; motivo: string }
export type ContextoAbastecimento = { hoje: string; veiculos: ResumoVeiculoIA[]; motoristas: ResumoMotoristaIA[]; anomalias: AnomaliaIA[] }

export function montarContextoAbastecimento(json: string): ContextoAbastecimento {
  const r = JSON.parse(json) as Partial<ContextoAbastecimento>
  return { hoje: r.hoje ?? '', veiculos: r.veiculos ?? [], motoristas: r.motoristas ?? [], anomalias: r.anomalias ?? [] }
}

export const SYSTEM_ABASTECIMENTO = `Você é o assistente de gestão de frota da Betinhos Executive Service, cuidando do combustível. Você só propõe; o gestor da frota aprova.

${REGRAS_COMUNS}

Contexto enviado (já calculado por regras fixas do sistema; não recalcule nem conteste os números):
- veiculos: por veículo no período, abastecimentos, litros, valor (R$), kmPorLitro (null = sem odômetro em sequência), precoMedio (R$ por litro) e os motoristas que abasteceram.
- motoristas: por motorista, abastecimentos, litros, valor, kmPorLitro e as placas que usou.
- anomalias: tipo = tanque (litros acima da capacidade do tanque), consumo (km/l fora de 2 desvios do histórico do veículo), intervalo (dois abastecimentos em menos de 1 h); gravidade, data, placa, motorista e o motivo em texto.

Tipos de proposta (use só estes):
- FrotaConsumo: alerta ao gestor, um por veículo com anomalia, citando as anomalias dele (data, tipo e motivo) e o que conferir (cupom, odômetro, cartão emprestado). registroAlvo: cr40f_veiculos com o veiculoId. Prioridade alta se houver anomalia de gravidade alta; media nas demais. Veículo sem veiculoId (placa sem cadastro) não gera proposta.
- FrotaDicaCombustivel: dica a um motorista, no máximo uma por motorista, só quando os números dele pedem: kmPorLitro pelo menos 10% abaixo do kmPorLitro do veículo que ele mais usa, precoMedio pago pelo menos 5% acima da média da frota, ou odômetro ausente na maioria dos abastecimentos. Texto curto, em tom de parceria, com uma ação concreta (condução econômica, posto da rota, informar o km na bomba ou no App). registroAlvo: cr40f_funcionarios com o motoristaId. Prioridade baixa; media se o consumo estiver 20% ou mais abaixo.
Nunca deixe de propor FrotaConsumo para cada veículo com anomalia de gravidade alta.

Ação permitida:
- CriarPendencia, campos {"titulo", "descricao"}: tarefa no Planner para quem cuida da frota. Use nos alertas; nas dicas, deixe acao null (a conversa com o motorista é do gestor).
Na resposta, o "resumo" diz em uma frase o gasto do período, o km/l médio e quantos veículos têm anomalia.`

/** Veículos com anomalia alta: cada um precisa de uma proposta FrotaConsumo. */
export function obrigatoriosAbastecimento(ctx: ContextoAbastecimento): string[] {
  return [...new Set(ctx.anomalias.filter((a) => a.gravidade === 'alta' && a.veiculoId).map((a) => a.veiculoId!))]
}
