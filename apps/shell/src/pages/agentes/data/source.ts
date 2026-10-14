import type { Host } from '../../../host'
import { gravacaoDaAcao } from '../domain/acoes'
import type { Agente, Decisao, Execucao, Proposta } from '../domain/types'
import { createMockData } from './mock'
import { AGENTE_VALOR, ENTITY_EXECUCAO, ENTITY_PROPOSTA, execucaoPath, execucoesPath, mapExecucao, mapProposta, propostasPath } from './queries'

export type Source = {
  mock: boolean
  historico: (agente: Agente, top: number) => Promise<Execucao[]>
  buscar: (id: string) => Promise<Execucao>
  propostas: (execucaoId: string) => Promise<Proposta[]>
  criar: (agente: Agente, pergunta: string) => Promise<string>
  decidir: (proposta: Proposta, decisao: Exclude<Decisao, 'pendente'>, motivo: string) => Promise<void>
  /** Grava o que a proposta propõe, com a sessão do usuário. Lança se o usuário não puder gravar. */
  executarAcao: (proposta: Proposta) => Promise<void>
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const DECISAO_VALOR = { aprovada: 100000001, descartada: 100000002 } as const

function createMockSource(): Source {
  const { execucoes, propostas } = createMockData(new Date())
  let seq = 0
  return {
    mock: true,
    historico: async (agente, top) => { await wait(200); return execucoes.filter((e) => e.agente === agente).sort((a, b) => (b.criadaEm?.getTime() ?? 0) - (a.criadaEm?.getTime() ?? 0)).slice(0, top).map((e) => ({ ...e })) },
    buscar: async (id) => { await wait(150); const e = execucoes.find((x) => x.id === id); if (!e) throw new Error('Execução não encontrada.'); return { ...e } },
    propostas: async (execucaoId) => { await wait(150); return propostas.filter((p) => p.execucaoId === execucaoId).map((p) => ({ ...p })) },
    async criar(agente, pergunta) {
      await wait(200)
      const id = `mock-exec-novo-${++seq}`
      const e: Execucao = { id, agente, origem: 'manual', pergunta, status: 'processando', erro: '', resumo: '', modelo: '', tokensEntrada: 0, tokensSaida: 0, criadaEm: new Date() }
      execucoes.unshift(e)
      // Simula o flow: conclui em 4 s com uma proposta.
      setTimeout(() => { Object.assign(e, { status: 'concluida', resumo: pergunta ? `Resposta de exemplo para "${pergunta}".` : 'Execução de exemplo concluída.', modelo: 'claude-opus-5-5', tokensEntrada: 5000, tokensSaida: 500 }); propostas.push({ id: `mock-prop-novo-${seq}`, execucaoId: id, tipo: 'SemRecibo', titulo: 'OS-9999 sem recibo', justificativa: 'Exemplo gerado no modo mock.', prioridade: 'baixa', entidadeAlvo: 'cr40f_reservadeveculos', idAlvo: '99999999-9999-9999-9999-999999999999', acao: null, decisao: 'pendente', motivoDescarte: '', decididoPor: '', decididoEm: null }) }, 4000)
      return id
    },
    async decidir(proposta, decisao, motivo) {
      await wait(200)
      const p = propostas.find((x) => x.id === proposta.id)
      if (!p) throw new Error('Proposta não encontrada.')
      Object.assign(p, { decisao, motivoDescarte: motivo, decididoPor: 'Você', decididoEm: new Date() })
    },
    executarAcao: async () => { await wait(300) },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const sets = new Map<string, Promise<string>>()
  const entitySet = (entity: string) => {
    let p = sets.get(entity)
    if (!p) {
      p = host.metadata.entities([entity]).then((info) => { const v = info.get(entity)?.entitySetName; if (!v) throw new Error(`Tabela ${entity} não encontrada na metadata.`); return v }).catch((e) => { sets.delete(entity); throw e })
      sets.set(entity, p)
    }
    return p
  }
  return {
    mock: false,
    historico: async (agente, top) => (await host.client.getAll(execucoesPath(await entitySet(ENTITY_EXECUCAO), agente, top))).map(mapExecucao),
    buscar: async (id) => mapExecucao(await host.client.request(execucaoPath(await entitySet(ENTITY_EXECUCAO), id))),
    propostas: async (execucaoId) => (await host.client.getAll(propostasPath(await entitySet(ENTITY_PROPOSTA), execucaoId))).map(mapProposta),
    criar: async (agente, pergunta) => host.client.create(await entitySet(ENTITY_EXECUCAO), { cr40f_agenteexecucaonome: `${agente} ${new Date().toLocaleString('pt-BR')}`.slice(0, 200), cr40f_agente: AGENTE_VALOR[agente], cr40f_origem: 100000001, cr40f_status: 100000000, ...(pergunta ? { cr40f_pergunta: pergunta.slice(0, 2000) } : {}) }),
    async decidir(proposta, decisao, motivo) {
      const me = await host.client.request<{ UserId: string }>('WhoAmI')
      await host.client.update(await entitySet(ENTITY_PROPOSTA), proposta.id, { cr40f_decisao: DECISAO_VALOR[decisao], cr40f_motivodescarte: motivo.slice(0, 500), cr40f_decididoem: new Date().toISOString(), 'cr40f_DecididoPor@odata.bind': `/systemusers(${me.UserId})` })
    },
    async executarAcao(proposta) {
      const g = gravacaoDaAcao(proposta)
      if (!g) return
      const set = await entitySet(g.entity)
      if (g.kind === 'update') await host.client.update(set, g.id, g.data)
      else await host.client.create(set, g.data)
    },
  }
}
