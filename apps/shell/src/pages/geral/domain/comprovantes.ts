import { COMPROVANTES_KEY } from '../../recebimentos/colunaOp'
import { ID_ATTRIBUTE, type Column } from './types'

export { COMPROVANTES_FIELD, COMPROVANTES_KEY } from '../../recebimentos/colunaOp'

/**
 * Coluna virtual "Comprovantes" (quantos comprovantes de recebimento o serviço tem): aparece por padrão logo depois da
 * primeira coluna, move, redimensiona e sai como as outras. Estreita (peso 72 na grade, com o mínimo de 90 px de toda coluna), o título vira o cifrão (geral.css). Não ordena (a contagem não existe no FetchXML); o filtro
 * Sim/Não vira `link-entity` "any"/"not any" em cr40f_anexorecebimento_v2, aplicado no Dataverse.
 */
export const COMPROVANTES_COLUMN: Column = { key: COMPROVANTES_KEY, attribute: COMPROVANTES_KEY, alias: null, entity: null, width: 72, label: 'Comprovantes' }

/** Troca a condição Sim/Não da coluna virtual (gerada pelo DS como `eq 1/0`) pelo `link-entity` equivalente, em qualquer grupo. */
export function comprovantesNoFetch(filter: Element) {
  for (const condition of Array.from(filter.getElementsByTagName('condition'))) {
    if (condition.getAttribute('attribute') !== COMPROVANTES_KEY) continue
    const link = condition.ownerDocument.createElement('link-entity')
    link.setAttribute('name', 'cr40f_anexorecebimento_v2')
    link.setAttribute('from', 'cr40f_reserva')
    link.setAttribute('to', ID_ATTRIBUTE)
    link.setAttribute('link-type', condition.getAttribute('value') === '1' ? 'any' : 'not any')
    condition.replaceWith(link)
  }
}
