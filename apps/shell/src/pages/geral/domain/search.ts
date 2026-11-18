/**
 * Busca por palavras da Geral (motor comum em `app/keywordSearch.ts`): cada palavra tem de aparecer em algum dos campos
 * abaixo (AND entre palavras, OR entre campos), em qualquer parte do texto, sem acento nem caixa ("Lima" acha "Carlos Lima").
 *
 * Lista curada, não a localização rápida da tabela: ela cobre o que a Geral mostra em colunas e o que se procura de cabeça
 * (OS, cliente, passageiro, motorista, placa). Lookup entra pelo nome da tabela relacionada, via link-entity `outer` (a reserva
 * sem motorista continua achável pelas outras palavras). Dinheiro só se a coluna for simples: o `eq` em coluna calculada custa
 * ~1,5 s (DEV, 18/11/2026). Ficam de fora booleano (todo "sim"/"não" casaria), datas, URLs e os lookups OM/OT (o texto
 * deles é o número da manutenção/troca, já achável pela OS).
 */
import type { ChoiceOption } from '@betinhos/dataverse'
import type { KeywordField } from '../../../app/keywordSearch'

const TEXT = ['cr40f_id', 'cr40f_idnovo', 'cr40f_cr', 'new_idexterno', 'cr40f_trajeto', 'cr40f_endereodesada', 'cr40f_destino', 'cr40f_passageirosetelefonedecontato', 'cr40f_email', 'cr40f_obsdeoperao', 'cr40f_observaointerna', 'new_observacaofinal', 'new_observacaodefaturamento', 'cr40f_perfildopassageiro']
const CHOICES = ['cr40f_status', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo', 'cr40f_statusdefaturamento', 'cr40f_formadepagamento']

/** Lookups da reserva buscados pelo nome da tabela relacionada; o alias é o do link-entity que a consulta ganha. */
export const SEARCH_LINKS = [
  { lookup: 'cr40f_cliente', table: 'cr40f_clientes1', name: 'cr40f_nomedocliente' },
  { lookup: 'cr40f_solicitante', table: 'cr40f_bancodedados', name: 'cr40f_nomedopassageiro' },
  { lookup: 'cr40f_motorista', table: 'cr40f_funcionarios', name: 'cr40f_nomecompleto' },
  { lookup: 'cr40f_veiculo', table: 'cr40f_veiculos', name: 'cr40f_placa' },
  { lookup: 'cr40f_financeiro', table: 'cr40f_financeiro', name: 'cr40f_idfinanceiro' },
].map((link) => ({ ...link, alias: `busca_${link.lookup}` }))

export type Search = { tokens: string[]; fields: KeywordField[] }

/** Campos da busca; `optionsOf` dá os rótulos de cada choice (a palavra é comparada com eles). */
export function searchFields(optionsOf: (attribute: string) => ChoiceOption[]): KeywordField[] {
  return [
    ...TEXT.map((attribute): KeywordField => ({ attribute, kind: 'text' })),
    { attribute: 'cr40f_idtenaris', kind: 'integer' },
    { attribute: 'cr40f_cotao', kind: 'money' },
    ...CHOICES.map((attribute): KeywordField => ({ attribute, kind: 'choice', options: optionsOf(attribute) })),
    ...SEARCH_LINKS.map((link): KeywordField => ({ attribute: link.name, kind: 'text', entity: link.alias })),
  ]
}
