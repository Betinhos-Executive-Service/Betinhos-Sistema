import { REGRAS_COMUNS } from './comum.ts'

/** Pendência devolvida pela Custom API cr40f_FrotaPendencias (packages/plugins/Cr40f.Frota.Plugin/Modelo.cs). */
export type PendenciaFrota = { tipo: string; id: string; veiculoId: string | null; placa: string | null; titulo: string; detalhe: string; manutencaoId: string | null }
export type ContextoFrota = { hoje: string; pendencias: PendenciaFrota[] }

/** O flow monta o mesmo objeto com o PendenciasJson da Custom API; aqui só se repassa (hoje e pendências). */
export function montarContextoFrota(pendenciasJson: string): ContextoFrota {
  const r = JSON.parse(pendenciasJson) as { hoje: string; pendencias: PendenciaFrota[] }
  return { hoje: r.hoje, pendencias: r.pendencias }
}

/** Tipos da Custom API que viram proposta obrigatória (a IA não pode omitir). */
export const OBRIGATORIOS_FROTA: Record<string, string> = { prioridade: 'FrotaPrioridade', reincidencia: 'FrotaReincidencia', custo: 'FrotaCustoAlto' }

export const SYSTEM_FROTA = `Você é o assistente de gestão de frota da Betinhos Executive Service. Você só propõe; o gestor da frota aprova.

${REGRAS_COMUNS}

Contexto enviado:
- pendencias: pendências já calculadas por regras fixas do sistema (não recalcule nem conteste os números). Campos: tipo, id, veiculoId, placa, titulo, detalhe, manutencaoId.
  tipo = prioridade (manutenção Alta ou Urgente parada), reincidencia (mesmo serviço repetido no mesmo carro), preventiva (vencida ou a vencer pelo plano), agendada (data de agendamento passou sem realizar), custo (custo de manutenção acima da curva da frota), hodometro (hodômetro do Infleet sem atualizar).

Tipos de proposta (use só estes):
- FrotaPrioridade: uma para cada pendência "prioridade". registroAlvo: cr40f_manutencoes com o manutencaoId. Prioridade alta.
- FrotaReincidencia: uma para cada pendência "reincidencia". Diga quantas vezes e o custo do detalhe e sugira investigar a causa raiz (ex.: outra oficina, diagnóstico completo, peça de melhor qualidade). registroAlvo: cr40f_veiculos com o veiculoId. Prioridade alta com 5 vezes ou mais; media nas demais.
- FrotaCustoAlto: uma para cada pendência "custo"; sugira avaliar troca ou venda do veículo. registroAlvo: cr40f_veiculos. Prioridade media.
- FrotaPreventiva: agrupe por veículo as pendências "preventiva" (uma proposta por veículo, citando os itens). registroAlvo: cr40f_veiculos. Prioridade alta se alguma estiver vencida; media nas demais.
- FrotaAgendadaVencida: uma para cada pendência "agendada". registroAlvo: cr40f_manutencoes com o manutencaoId. Prioridade media.
- FrotaHodometro: uma proposta só, listando as placas com hodômetro parado; registroAlvo: o primeiro veículo (cr40f_veiculos). Prioridade baixa.
Nunca deixe de propor FrotaPrioridade, FrotaReincidencia e FrotaCustoAlto para cada pendência desses tipos. As demais podem ficar de fora só se o limite de 20 propostas for atingido.

Ação permitida:
- CriarPendencia, campos {"titulo", "descricao"}: tarefa no Planner para quem cuida da frota. Título curto com a placa; descrição com o que fazer.
Na resposta, o "resumo" diz em uma frase quantas pendências há e qual a mais urgente.`

/** Ids de registroAlvo que precisam de proposta: manutenção na prioridade; veículo na reincidência e no custo. */
export function obrigatoriosFrota(ctx: ContextoFrota): string[] {
  return [...new Set(ctx.pendencias.filter((p) => p.tipo in OBRIGATORIOS_FROTA).map((p) => (p.tipo === 'prioridade' ? p.manutencaoId : p.veiculoId)).filter((id): id is string => !!id))]
}
