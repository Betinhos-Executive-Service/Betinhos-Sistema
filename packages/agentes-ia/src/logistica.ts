import { REGRAS_COMUNS, id, num, rotulo, str } from './comum.ts'

type Row = Record<string, unknown>
export type DadosLogistica = { servicos: Row[]; motoristas: Row[]; trocas: Row[] }
export type ContextoLogistica = {
  hoje: string
  servicos: { id: string; codigo: string; status: number | null; saida: string; retorno: string; tipoVeiculo: string; destino: string; enderecoSaida: string; motoristaId: string; veiculoId: string; cliente: string }[]
  motoristas: { id: string; apelido: string; veiculoAtualId: string; veiculoAtual: string }[]
  trocas: { id: string; codigo: string; status: number | null; inicio: string; fim: string; motorista1Id: string; motorista2Id: string }[]
}

export function montarContextoLogistica(d: DadosLogistica, hoje: string): ContextoLogistica {
  return {
    hoje,
    servicos: d.servicos.map((r) => ({
      id: id(r.cr40f_reservadeveculosid), codigo: str(r.cr40f_idnovo) || str(r.cr40f_id), status: num(r.cr40f_status), saida: str(r.cr40f_dataehorriodesada), retorno: str(r.cr40f_horrioprevistoderetorno),
      tipoVeiculo: rotulo(r, 'cr40f_tipodeveiculo'), destino: str(r.cr40f_destino), enderecoSaida: str(r.cr40f_endereodesada),
      motoristaId: id(r._cr40f_motorista_value), veiculoId: id(r._cr40f_veiculo_value), cliente: rotulo(r, '_cr40f_cliente_value'),
    })),
    motoristas: d.motoristas.map((r) => ({ id: id(r.cr40f_funcionariosid), apelido: str(r.new_apelido), veiculoAtualId: id(r._cr40f_veiculoatual_value), veiculoAtual: rotulo(r, '_cr40f_veiculoatual_value') })),
    trocas: d.trocas.map((r) => ({ id: id(r.cr40f_trocasdecarroid), codigo: str(r.cr40f_id), status: num(r.cr40f_statusdatroca), inicio: str(r.cr40f_iniciodajaneladetroca), fim: str(r.cr40f_fimdajaneladetroca), motorista1Id: id(r._cr40f_motorista1_value), motorista2Id: id(r._cr40f_motorista2_value) })),
  }
}

export const SYSTEM_LOGISTICA = `Você é o assistente de Logística (operação) da Betinhos Executive Service. Você só propõe; a operação aprova.

${REGRAS_COMUNS}

Contexto enviado:
- servicos: OS de hoje e dos próximos 2 dias com status 202410001 Confirmado, 202410005 Programado ou 202410006 Em Execução, ordenadas por saida. motoristaId e veiculoId vazios significam sem atribuição.
- motoristas: motoristas ativos com o veículo atual (veiculoAtualId vazio = sem carro).
- trocas: trocas de carro programadas ou confirmadas na mesma janela, com a janela de troca de cada motorista.

Tipos de proposta (use só estes):
- ServicoSemMotorista: OS sem motoristaId. Sugira um motorista do contexto que não tenha outra OS a menos de 45 minutos do horário (considere retorno quando houver) nem troca na janela. Se nenhum servir, proponha sem ação (acao null) e diga por quê. registroAlvo: cr40f_reservadeveculos; acao AtribuirMotorista com campos {"motoristaId": id do motorista}.
- ServicoSemVeiculo: OS com motorista e sem veiculoId, quando o motorista tem veiculoAtualId. acao AtribuirVeiculo com campos {"veiculoId": veiculoAtualId do motorista}.
- ConflitoHorario: o mesmo motorista com duas OS cujas saídas distam menos de 45 minutos, ou OS dentro da janela de troca dele. acao null.
- MotoristaSemVeiculoAtual: motorista com OS no período e sem veículo atual. registroAlvo: cr40f_funcionarios; acao null.

Prioridade: alta para OS nas próximas 6 horas; media para hoje; baixa para os dias seguintes.`
