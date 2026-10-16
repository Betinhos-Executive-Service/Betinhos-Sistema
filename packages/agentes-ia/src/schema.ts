import { PRIORIDADES, TODAS_AS_ACOES, TODOS_OS_TIPOS } from './tipos.ts'

/** Campos das ações: a saída estruturada exige additionalProperties false, então as chaves são fixas e as que não se aplicam vêm null. */
const textoOuNulo = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const camposProps = { titulo: textoOuNulo, descricao: textoOuNulo, conteudo: textoOuNulo, motoristaId: textoOuNulo, veiculoId: textoOuNulo }
const propostaProps = {
  tipo: { type: 'string', enum: [...TODOS_OS_TIPOS] },
  titulo: { type: 'string' },
  justificativa: { type: 'string' },
  prioridade: { type: 'string', enum: [...PRIORIDADES] },
  registroAlvo: { type: 'object', properties: { entidade: { type: 'string' }, id: { type: 'string' } }, required: ['entidade', 'id'], additionalProperties: false },
  acao: { anyOf: [{ type: 'object', properties: { tipo: { type: 'string', enum: [...TODAS_AS_ACOES] }, campos: { type: 'object', properties: camposProps, required: Object.keys(camposProps), additionalProperties: false } }, required: ['tipo', 'campos'], additionalProperties: false }, { type: 'null' }] },
}
const properties = {
  resumo: { type: 'string' },
  propostas: { type: 'array', items: { type: 'object', properties: propostaProps, required: Object.keys(propostaProps), additionalProperties: false } },
}
/** Schema da saída estruturada (`output_config.format`). Sem maxItems/maxLength: a API não suporta; os limites ficam em `analisarMensagem`. */
export const RESPOSTA_SCHEMA = { type: 'object', properties, required: ['resumo', 'propostas'], additionalProperties: false } as const
