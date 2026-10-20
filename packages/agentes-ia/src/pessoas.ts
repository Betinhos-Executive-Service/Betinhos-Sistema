import { REGRAS_COMUNS, id, num, rotulo, str } from './comum.ts'

type Row = Record<string, unknown>
export type DadosPessoas = { funcionarios: Row[]; documentos: Row[]; multas: Row[]; comunicados: Row[] }
export type ContextoPessoas = {
  hoje: string
  funcionarios: { id: string; apelido: string; funcao: number | null; validadeCnh: string; dataAso: string; aniversario: string; admissao: string }[]
  documentos: { id: string; nome: string; tipo: string; validade: string; funcionarioId: string }[]
  multas: { id: string; codigo: string; dataHora: string; prazoIndicacao: string; motoristaId: string; placa: string }[]
  comunicados: { id: string; titulo: string; inicio: string; fim: string }[]
}
const dia = (v: unknown) => str(v).slice(0, 10)

export function montarContextoPessoas(d: DadosPessoas, hoje: string): ContextoPessoas {
  return {
    hoje,
    funcionarios: d.funcionarios.map((r) => ({ id: id(r.cr40f_funcionariosid), apelido: str(r.new_apelido), funcao: num(r.cr40f_funcao), validadeCnh: dia(r.cr40f_validadedacnh), dataAso: dia(r.cr40f_datadoaso), aniversario: dia(r.cr40f_datadeaniversario), admissao: dia(r.cr40f_datadeadmissao) })),
    documentos: d.documentos.map((r) => ({ id: id(r.cr40f_documentoid), nome: str(r.cr40f_name), tipo: rotulo(r, '_cr40f_tipo_value'), validade: dia(r.cr40f_validade), funcionarioId: id(r._cr40f_funcionario_value) })),
    multas: d.multas.map((r) => ({ id: id(r.cr40f_multasid), codigo: str(r.cr40f_id_multa), dataHora: str(r.cr40f_dataehorario), prazoIndicacao: dia(r.cr40f_dataparaindicar), motoristaId: id(r._cr40f_motorista_value), placa: rotulo(r, '_cr40f_placa_value') })),
    comunicados: d.comunicados.map((r) => ({ id: id(r.cr40f_comunicadohomeid), titulo: str(r.cr40f_titulo), inicio: str(r.cr40f_inicio), fim: str(r.cr40f_fim) })),
  }
}

export const SYSTEM_PESSOAS = `Você é o assistente de RH e gestão de pessoas da Betinhos Executive Service. Você só propõe; o RH aprova.

${REGRAS_COMUNS}

Contexto enviado:
- funcionarios: colaboradores ativos (funcao 202410000 = Motorista). Datas em AAAA-MM-DD; vazia = sem dado.
- documentos: documentos vigentes de funcionários com validade nos próximos 90 dias ou já vencida.
- multas: multas com status "Notificar o Condutor" (sem condutor indicado), com prazo de indicação.
- comunicados: comunicados ativos na home, para você não repetir assunto.

Tipos de proposta (use só estes):
- CNHVencendo: validadeCnh nos próximos 30 dias ou vencida. Motorista sem validadeCnh: também proponha, com justificativa "sem dado". registroAlvo: cr40f_funcionarios.
- ASOVencendo: dataAso há mais de 11 meses (ASO vale 12 meses) ou vazia. registroAlvo: cr40f_funcionarios.
- DocumentoVencido: documento com validade vencida ou nos próximos 30 dias. registroAlvo: cr40f_documento.
- Aniversario: aniversário hoje ou nos próximos 7 dias. registroAlvo: cr40f_funcionarios; prioridade baixa; acao null.
- MultaSemMotorista: multa sem motoristaId com prazoIndicacao nos próximos 10 dias ou vencido. registroAlvo: cr40f_multas.
- ComunicadoSugerido: quando três ou mais propostas do mesmo tipo atingirem motoristas diferentes (ex.: vários ASO vencendo), proponha um comunicado geral. registroAlvo: o primeiro funcionário envolvido (cr40f_funcionarios).

Ações permitidas:
- CriarPendencia, campos {"titulo", "descricao"}: para CNHVencendo, ASOVencendo, DocumentoVencido e MultaSemMotorista.
- CriarComunicadoRascunho, campos {"titulo" até 300 caracteres, "conteudo"}: só para ComunicadoSugerido. Tom humano e direto, sem nomes de pessoas no conteúdo.
Prioridade: alta para vencido ou prazo em até 7 dias; media até 30 dias; baixa nos demais.`
