import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { FECHAMENTO_VALOR, LADO_VALOR, STATUS_VALOR, aplicarResposta } from '../domain/regras'
import type { Cliente, Fechamento, Linha, Mensagem, NovoValidador, Validador } from '../domain/types'
import { MOCK_CLIENTES, createMockLinhas, createMockMensagens, createMockValidadores } from './mock'
import { ENTITIES, loadAll, mapMensagem, mensagensPath, type EntitySets } from './queries'

export type Carga = { linhas: Linha[]; clientes: Cliente[]; validadores: Validador[] }
/** Resultado de "Enviar resposta"; `avisoFalhou` = a mensagem foi gravada, mas o e-mail ao cliente não saiu. */
export type Resposta = { mensagem: Mensagem; prazoTacita: string; avisoFalhou: string | null }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** Só o financeiro usa a tela (checagem simples por papel; ver `PAPEIS_FINANCEIRO`). */
  podeAcessar: () => Promise<boolean>
  load: () => Promise<Carga>
  mensagens: (validacaoId: string) => Promise<Mensagem[]>
  /** Grava a mensagem, põe a validação em Respondido com o prazo reiniciado e avisa o cliente pelo flow. */
  responder: (linha: Linha, texto: string) => Promise<Resposta>
  retirar: (validacaoId: string) => Promise<void>
  setFechamento: (validacaoIds: string[], valor: Fechamento) => Promise<void>
  criarValidador: (v: NovoValidador) => Promise<string>
  setValidadorAtivo: (id: string, ativo: boolean) => Promise<void>
  /** Zera o segredo TOTP: no próximo acesso o validador lê um QR code novo. Não avisa o cliente. */
  refazerAutenticador: (id: string) => Promise<void>
}

/** Papéis que abrem a tela; administradores também. Sem papel de financeiro dedicado no DEV, a checagem é por nome. */
export const PAPEIS_FINANCEIRO = /financeiro|system administrator|administrador do sistema/i
/** URL do flow HTTP "Portal cliente – e-mails" (variável de ambiente; sessão do flow). */
export const FLOW_EMAILS_VAR = 'cr40f_URLFlowPortalClienteEmails'
export const AUTOR_BETINHOS = 'Juliana (Financeiro)'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function createMockSource(): Source {
  let seq = 900
  const nextId = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  let mensagens = createMockMensagens()
  const validadores = new Set(createMockValidadores().map((v) => v.id))
  return {
    mock: true,
    podeAcessar: async () => true,
    async load() {
      await wait(250)
      return { linhas: createMockLinhas(mensagens), clientes: MOCK_CLIENTES, validadores: createMockValidadores() }
    },
    async mensagens(validacaoId) { await wait(200); return mensagens.filter((m) => m.validacaoId === cleanId(validacaoId)) },
    async responder(linha, texto) {
      await wait(400)
      const agora = new Date().toISOString()
      const { prazoTacita } = aplicarResposta(linha, agora)
      const mensagem: Mensagem = { id: nextId('b1000000'), validacaoId: linha.validacaoId!, lado: 'betinhos', autor: AUTOR_BETINHOS, motivo: null, texto: texto.trim(), criadaEm: agora }
      mensagens = [...mensagens, mensagem]
      // E-mail ao cliente: no mock só registra a chamada que o flow receberia.
      console.info('[mock] flow Portal cliente – e-mails', { tipo: 'resposta_betinhos', servico: linha.codigo })
      return { mensagem, prazoTacita, avisoFalhou: null }
    },
    async retirar() { await wait(300) },
    async setFechamento() { await wait(300) },
    async criarValidador() { await wait(300); const id = nextId('e1000000'); validadores.add(id); return id },
    async setValidadorAtivo(id) { await wait(250); if (!validadores.has(id)) throw new Error('Validador não encontrado.') },
    async refazerAutenticador(id) { await wait(250); if (!validadores.has(id)) throw new Error('Validador não encontrado.') },
  }
}

async function readEnvVar(host: Extract<Host, { mode: 'dataverse' }>, schemaName: string) {
  const filtro = (campo: string) => encodeURIComponent(`${campo} eq '${schemaName}'`)
  const values = await host.client.getAll(`environmentvariablevalues?$select=value&$filter=${filtro('EnvironmentVariableDefinitionId/schemaname')}`)
  const value = typeof values[0]?.value === 'string' ? values[0].value.trim() : ''
  if (value) return value
  const defs = await host.client.getAll(`environmentvariabledefinitions?$select=defaultvalue&$filter=${filtro('schemaname')}`)
  return typeof defs[0]?.defaultvalue === 'string' ? defs[0].defaultvalue.trim() : ''
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata. Rode o provision do portal do cliente neste ambiente.`)
      return value
    }
    return Object.fromEntries(Object.entries(ENTITIES).map(([k, v]) => [k, get(v)])) as EntitySets
  }).catch((error) => { sets = null; throw error }))
  let carga: Carga | null = null

  /** Aviso ao cliente: todos os validadores ativos do cliente recebem. Falha não desfaz a resposta. */
  async function avisarCliente(linha: Linha, texto: string): Promise<string | null> {
    try {
      const url = await readEnvVar(host as Extract<Host, { mode: 'dataverse' }>, FLOW_EMAILS_VAR)
      if (!/^https:\/\//i.test(url)) throw new Error(`falta a variável ${FLOW_EMAILS_VAR}`)
      const para = (carga?.validadores ?? []).filter((v) => v.ativo && v.cliente.id === linha.cliente.id).map((v) => v.email)
      if (!para.length) throw new Error('o cliente não tem validador ativo')
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'resposta_betinhos', para, dados: { servico: linha.codigo, data: linha.data, trajeto: linha.trajeto, texto } }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return null
    } catch (reason) {
      return message(reason)
    }
  }

  return {
    mock: false,
    async podeAcessar() {
      const me = await host.client.request<{ UserId: string }>('WhoAmI')
      const roles = await host.client.request<{ value: { name: string }[] }>(`systemusers(${me.UserId})/systemuserroles_association?$select=name`)
      return roles.value.some((r) => PAPEIS_FINANCEIRO.test(r.name))
    },
    async load() { carga = await loadAll(host.client, await entitySets()); return carga },
    mensagens: async (validacaoId) => (await host.client.getAll(mensagensPath((await entitySets()).mensagem, validacaoId))).map(mapMensagem),
    async responder(linha, texto) {
      const s = await entitySets()
      const agora = new Date().toISOString()
      const { prazoTacita } = aplicarResposta(linha, agora)
      const corpo = texto.trim()
      const id = cleanId(await host.client.create(s.mensagem, {
        'cr40f_Validacao@odata.bind': `/${s.validacao}(${linha.validacaoId})`,
        cr40f_lado: LADO_VALOR.betinhos, cr40f_autor: AUTOR_BETINHOS, cr40f_texto: corpo,
      }))
      await host.client.update(s.validacao, linha.validacaoId!, { cr40f_status: STATUS_VALOR.respondido, cr40f_prazotacita: prazoTacita })
      const avisoFalhou = await avisarCliente(linha, corpo)
      return { mensagem: { id, validacaoId: linha.validacaoId!, lado: 'betinhos', autor: AUTOR_BETINHOS, motivo: null, texto: corpo, criadaEm: agora }, prazoTacita, avisoFalhou }
    },
    // A conversa fica: só o status muda (o portal deixa de mostrar o serviço).
    retirar: async (id) => host.client.update((await entitySets()).validacao, id, { cr40f_status: STATUS_VALOR.retirado }),
    async setFechamento(ids, valor) {
      const set = (await entitySets()).validacao
      for (const id of ids) await host.client.update(set, id, { cr40f_incluirfechamento: FECHAMENTO_VALOR[valor] })
    },
    async criarValidador(v) {
      const s = await entitySets()
      return cleanId(await host.client.create(s.validador, {
        cr40f_name: v.nome.trim(), cr40f_email: v.email.trim().toLowerCase(), cr40f_ativo: true,
        'cr40f_Cliente@odata.bind': `/${s.cliente}(${cleanId(v.clienteId)})`,
      }))
    },
    setValidadorAtivo: async (id, ativo) => host.client.update((await entitySets()).validador, id, { cr40f_ativo: ativo }),
    refazerAutenticador: async (id) => host.client.update((await entitySets()).validador, id, { cr40f_segredototp: null, cr40f_totpcadastradoem: null }),
  }
}
