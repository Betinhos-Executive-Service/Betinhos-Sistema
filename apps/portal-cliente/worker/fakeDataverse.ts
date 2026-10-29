// Dataverse, login da Microsoft e flow de e-mail falsos para testar o Worker sem rede (testes e `wrangler dev` com FAKE).
// Entende só as consultas que o Worker monta (odata.ts/auth.ts), lendo os ids e o e-mail do $filter.
import type { Env, KV } from './env'
import type { Registro } from './mapear'

export const DV_URL = 'https://fake.crm2.dynamics.com'
export const FLOW_URL = 'https://flow.fake/emails'
export const TENARIS = '11111111-1111-1111-1111-111111111111'
export const OUTRO = '99999999-9999-9999-9999-999999999999'

export function kvMemoria(): KV & { dados: Map<string, string> } {
  const dados = new Map<string, string>()
  return { dados, get: async (k) => dados.get(k) ?? null, put: async (k, v) => void dados.set(k, v), delete: async (k) => void dados.delete(k) }
}

export type Banco = Record<'validadorclientes' | 'codigoacessos' | 'dispositivoconfiavels' | 'validacaoservicos' | 'mensagemvalidacaos', Registro[]>
export type Email = { tipo: string; para: string[]; dados: Record<string, unknown> }

const FV = '@OData.Community.Display.V1.FormattedValue'
let seq = 0
const novoId = () => `aaaaaaaa-0000-0000-0000-${String(++seq).padStart(12, '0')}`

export function bancoInicial(): Banco {
  const reserva = (n: string) => ({ cr40f_id: n, cr40f_idtenaris: `PO-${n}`, cr40f_cr: 'CR1', [`_cr40f_passageiro1_value${FV}`]: 'Ana', new_composicaodepreco: { new_valortotal: 500, cr40f_valorhoramotorista: 500 } })
  const validacao = (id: string, cliente: string, status: number, prazo: string, n: string) => ({
    cr40f_validacaoservicoid: id, _cr40f_cliente_value: cliente, cr40f_status: status, cr40f_prazotacita: prazo, cr40f_liberadoem: '2026-10-28T11:00:00Z', cr40f_Reserva: reserva(n),
  })
  return {
    validadorclientes: [
      { cr40f_validadorclienteid: '33333333-3333-3333-3333-333333333333', cr40f_name: 'Marcos', cr40f_email: 'fiscal@tenaris.com', cr40f_ativo: true, _cr40f_cliente_value: TENARIS, [`_cr40f_cliente_value${FV}`]: 'Tenaris' },
      { cr40f_validadorclienteid: '44444444-4444-4444-4444-444444444444', cr40f_name: 'Olga', cr40f_email: 'olga@outro.com', cr40f_ativo: true, _cr40f_cliente_value: OUTRO, [`_cr40f_cliente_value${FV}`]: 'Outro' },
    ],
    codigoacessos: [],
    dispositivoconfiavels: [],
    validacaoservicos: [
      validacao('22222222-2222-2222-2222-222222222221', TENARIS, 100000000, '2026-10-27', '10801'), // liberado, venceu
      validacao('22222222-2222-2222-2222-222222222222', TENARIS, 100000000, '2026-11-04', '10802'), // liberado, no prazo
      validacao('22222222-2222-2222-2222-222222222223', TENARIS, 100000001, '2026-10-20', '10803'), // em dúvida: tácita não corre
      validacao('22222222-2222-2222-2222-222222222224', TENARIS, 100000005, '2026-10-20', '10804'), // retirado
    ],
    mensagemvalidacaos: [],
  }
}

const guids = (texto: string) => [...texto.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map((m) => m[0])

function consultar(banco: Banco, tabela: keyof Banco, filtro: string): Registro[] {
  const linhas = banco[tabela]
  if (tabela === 'validadorclientes') {
    const email = /cr40f_email eq '([^']*)'/.exec(filtro)?.[1]
    return linhas.filter((v) => v.cr40f_ativo && (!email || v.cr40f_email === email))
  }
  if (tabela === 'codigoacessos') return linhas.filter((c) => c._cr40f_validador_value === guids(filtro)[0] && !c.cr40f_usado).slice(-1)
  if (tabela === 'dispositivoconfiavels') {
    const hash = /cr40f_hashtoken eq '([0-9a-f]+)'/.exec(filtro)?.[1]
    return linhas.filter((d) => d.cr40f_hashtoken === hash && Date.parse(String(d.cr40f_expiraem)) > Date.now())
  }
  if (tabela === 'mensagemvalidacaos') return linhas.filter((m) => guids(filtro).includes(String(m._cr40f_validacao_value)))
  // validacaoservicos
  const prazoLt = /cr40f_prazotacita lt (\d{4}-\d\d-\d\d)/.exec(filtro)?.[1]
  if (prazoLt) return linhas.filter((v) => [100000000, 100000002].includes(Number(v.cr40f_status)) && String(v.cr40f_prazotacita) < prazoLt)
  const [cliente, ...ids] = guids(filtro)
  return linhas.filter((v) => v._cr40f_cliente_value === cliente && Number(v.cr40f_status) !== 100000005 && (!ids.length || ids.includes(String(v.cr40f_validacaoservicoid))))
}

/** `fetch` falso. `emails` recebe o que iria para o flow. */
export function fetchFalso(banco: Banco, emails: Email[]): typeof fetch {
  return async (entrada, init) => {
    const url = String(entrada)
    const metodo = init?.method ?? 'GET'
    const corpo = init?.body ? JSON.parse(String(init.body).startsWith('{') ? String(init.body) : '{}') : {}
    if (url.startsWith('https://login.microsoftonline.com/')) return Response.json({ access_token: 'tk', expires_in: 3600 })
    if (url === FLOW_URL) return emails.push(corpo), new Response(null, { status: 202 })
    const caminho = decodeURIComponent(url.slice(`${DV_URL}/api/data/v9.2/`.length))
    const [, tabelaCr, id] = /^cr40f_(\w+?)(?:\((.+?)\))?(?:\?|$)/.exec(caminho) ?? []
    const tabela = tabelaCr as keyof Banco
    if (!banco[tabela]) return new Response('tabela desconhecida', { status: 404 })
    const chaveId = Object.keys(banco[tabela][0] ?? {}).find((k) => k.endsWith('id')) ?? `cr40f_${tabela.slice(0, -1)}id`
    if (metodo === 'POST') {
      const novo: Registro = { [chaveId]: novoId(), createdon: new Date().toISOString(), ...corpo }
      for (const k of Object.keys(corpo).filter((k) => k.endsWith('@odata.bind'))) novo[`_${k.split('@')[0].toLowerCase()}_value`] = guids(String(corpo[k]))[0]
      banco[tabela].push(novo)
      return new Response(null, { status: 204 })
    }
    if (id) {
      const reg = banco[tabela].find((r) => r[chaveId] === id)
      if (!reg) return new Response('não achou', { status: 404 })
      if (metodo === 'PATCH') return Object.assign(reg, corpo), new Response(null, { status: 204 })
      return Response.json(reg)
    }
    const filtro = /\$filter=([^&]*)/.exec(caminho)?.[1] ?? ''
    return Response.json({ value: consultar(banco, tabela, filtro) })
  }
}

export function envFalso(kv: KV = kvMemoria()): Env {
  const chave = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)))
  return { KV: kv, DV_TENANT: 't', DV_CLIENT_ID: 'c', DV_CLIENT_SECRET: 's', DV_URL, EMAIL_FLOW_URL: FLOW_URL, CHAVE_TOTP: chave, CHAVE_SESSAO: btoa(String.fromCharCode(...new Uint8Array(32).fill(4))) }
}
