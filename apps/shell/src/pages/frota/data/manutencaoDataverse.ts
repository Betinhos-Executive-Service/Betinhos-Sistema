// apps/shell/src/pages/frota/data/manutencaoDataverse.ts
import { chamarCustomApi } from './customApi'
import type { DateBehavior } from './dates'
import { cleanId, guid, mapDetalheManutencao, SELECT_DETALHE_MANUTENCAO } from './mappers'
import { ENTITY_SET, MANUT, TABLE } from './schema'
import type { ComandosManutencao } from './source'
import { errorMessage, type XrmWebApi } from './xrm'

/** O que as fábricas da manutenção precisam do `createXrmSource`: Web API, URL, ambiente, variáveis e metadata. */
export type DepsXrm = {
  api: XrmWebApi
  apiUrl: string
  envLabel: string
  lerVariavel: (schemaName: string) => Promise<string | null>
  metadata: <T>(path: string) => Promise<T>
  comportamentos: () => Promise<Record<string, DateBehavior>>
}

export function criarComandosXrm(deps: DepsXrm): ComandosManutencao {
  const { api } = deps

  /** Custom API das manutenções: RequestJson entra, ResponseJson sai (Contratos.cs). */
  async function comando(nome: string, pedido: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
    const payload = await chamarCustomApi(deps.apiUrl, nome, { RequestJson: JSON.stringify(pedido) }, falha)
    const texto = typeof payload.ResponseJson === 'string' ? payload.ResponseJson : ''
    if (!texto) return {}
    try {
      return JSON.parse(texto) as Record<string, unknown>
    } catch {
      throw new Error(`${falha}: o servidor devolveu uma resposta inválida`)
    }
  }

  return {
    async detalheManutencao(id) {
      let row: Record<string, unknown>
      try {
        row = await api.retrieveRecord(TABLE.manutencoes, guid(id), `?$select=${SELECT_DETALHE_MANUTENCAO.join(',')}`)
      } catch (reason) {
        if (/does not exist|não existe/i.test(errorMessage(reason))) return null
        throw reason
      }
      return mapDetalheManutencao(row, await deps.comportamentos())
    },

    async criarManutencao(input) {
      const registro: Record<string, unknown> = {
        cr40f_descricao: input.descricao,
        cr40f_graudamanutencao: input.grau,
        cr40f_kmatual: input.km,
        cr40f_status: MANUT.SOLICITADO,
        'cr40f_Placa_Carro@odata.bind': `/${ENTITY_SET.veiculos}(${guid(input.veiculoId)})`,
      }
      if (input.tipo !== null) registro.cr40f_tipodoreparo = input.tipo
      if (input.solicitanteId) registro['cr40f_Solicitado_por@odata.bind'] = `/${ENTITY_SET.funcionarios}(${guid(input.solicitanteId)})`
      const { id } = await api.createRecord(TABLE.manutencoes, registro)
      return cleanId(id)
    },

    async agendarManutencao(p) {
      await comando('cr40f_ManutencaoAgendar', { manutencaoId: guid(p.manutencaoId), inicio: p.inicio, fim: p.fim, comentario: p.comentario }, 'Não foi possível encaixar a manutenção')
    },

    async reprovarManutencao(id, comentario) {
      await comando('cr40f_ManutencaoReprovar', { manutencaoId: guid(id), comentario }, 'Não foi possível reprovar a manutenção')
    },

    async cancelarManutencao(id, comentario) {
      await comando('cr40f_ManutencaoCancelar', { manutencaoId: guid(id), comentario }, 'Não foi possível cancelar a manutenção')
    },

    async concluirManutencao(p) {
      const r = await comando('cr40f_ManutencaoConcluir', { ...p, manutencaoId: guid(p.manutencaoId), cidadeId: guid(p.cidadeId), realizadoPorId: guid(p.realizadoPorId) }, 'Não foi possível concluir a manutenção')
      const despesaId = typeof r.despesaId === 'string' && r.despesaId ? cleanId(r.despesaId) : ''
      if (!despesaId) throw new Error('A conclusão não devolveu a despesa. Recarregue antes de tentar de novo')
      return { despesaId, statusAnexo: Number(r.statusAnexo), geralId: typeof r.geralId === 'string' && r.geralId ? cleanId(r.geralId) : null }
    },
  }
}
