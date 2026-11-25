import type { Acessos } from '../../../app/acessos'
import { podeLer } from '../../../app/nivel'
import { VISOES, type Visao } from './types'

/** Tabelas que cada visão consulta em `data/dataverse.ts`; a visão só aparece para quem lê todas. */
export const TABELAS_DA_VISAO: Record<Visao, readonly string[]> = {
  operacao: ['cr40f_reservadeveculos'],
  financeiro: ['cr40f_reservadeveculos', 'cr40f_servicosporpassageiro', 'cr40f_fluxocaixalancamento'],
  ti_marketing: [], // asyncoperation, lead e campaign ficam fora do mapa: só o Administrador do Sistema
  gestao: ['cr40f_reservadeveculos', 'cr40f_composicaodeprecos', 'cr40f_plannertarefa'],
}

export function visoesPermitidas(a: Acessos): Visao[] {
  if (a.admin) return [...VISOES]
  return VISOES.filter((v) => v !== 'ti_marketing' && TABELAS_DA_VISAO[v].every((t) => podeLer(a, t)))
}
