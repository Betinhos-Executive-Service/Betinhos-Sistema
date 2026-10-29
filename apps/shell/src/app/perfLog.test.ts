// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createPerfCollector, dataverseTable, describeBatch, isSampled } from './perfLog'

const API = 'https://org.crm2.dynamics.com/api/data/v9.2'
const req = (path: string, startTime: number, responseEnd: number, extra = {}) => ({ name: `${API}/${path}`, startTime, responseEnd, ...extra })

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('dataverseTable (sanitização da URL)', () => {
  it('guarda só a tabela: sem id, filtro, select nem valores', () => {
    expect(dataverseTable(`${API}/cr40f_reservadeveculoses?$select=cr40f_name&$filter=cr40f_passageiro eq 'Fulano'`)).toBe('cr40f_reservadeveculoses')
    expect(dataverseTable(`${API}/contacts(11111111-1111-1111-1111-111111111111)/emails`)).toBe('contacts')
    expect(dataverseTable(`${API}/cr40f_funcionarios(cr40f_cpf='12345678900')`)).toBe('cr40f_funcionarios')
    expect(dataverseTable(`${API}/$batch`)).toBe('$batch')
  })

  it('fora da Web API não é consulta', () => {
    expect(dataverseTable('https://org.crm2.dynamics.com/WebResources/cr40f_/assets/index.js')).toBeNull()
  })
})

describe('createPerfCollector', () => {
  it('mede a tela do clique até a última consulta encadeada e não fecha antes do silêncio', () => {
    const c = createPerfCollector()
    c.route('servicos', 1000)
    c.paint(1100)
    c.resource(req('cr40f_reservadeveculoses?$top=50', 1050, 1800, { encodedBodySize: 20480, responseStatus: 200 }))
    c.resource(req('cr40f_servicosporpassageiros', 2500, 3200)) // começou 700 ms depois: ainda é a abertura
    c.resource(req('contacts', 6000, 6100)) // começou muito depois (polling): conta como consulta, não como abertura
    expect(c.take(4000)?.telas).toEqual([]) // só 800 ms de silêncio
    const batch = c.take(9200)!
    expect(batch.telas).toEqual([{ tela: 'servicos', ms: 2200, consultas: 2 }])
  })

  it('consulta guarda tabela, tela, duração, tamanho em KB e status; 4xx/5xx também', () => {
    const c = createPerfCollector()
    c.route('servicos', 0)
    c.resource(req('cr40f_reservadeveculoses', 10, 510, { encodedBodySize: 20480, responseStatus: 200 }))
    c.resource(req('cr40f_x', 20, 70, { responseStatus: 400 }))
    c.resource(req('cr40f_y', 30, 90, { responseStatus: 503 }))
    expect(c.take(100, true)!.consultas).toEqual([
      { t: 'cr40f_reservadeveculoses', tela: 'servicos', ms: 500, kb: 20, st: 200 },
      { t: 'cr40f_x', tela: 'servicos', ms: 50, kb: null, st: 400 },
      { t: 'cr40f_y', tela: 'servicos', ms: 60, kb: null, st: 503 },
    ])
  })

  it('ignora a própria tabela de log (sem laço) e recursos que não são da Web API', () => {
    const c = createPerfCollector()
    c.route('inicio', 0)
    c.resource(req('new_appmotoristaslogs', 10, 50, { responseStatus: 500 }))
    c.resource({ name: 'https://org.crm2.dynamics.com/WebResources/x.js', startTime: 10, responseEnd: 40 })
    expect(c.take(100, true)!.consultas).toEqual([])
  })

  it('aba escondida (final) fecha a tela aberta na hora', () => {
    const c = createPerfCollector()
    c.route('frota', 0)
    c.paint(300)
    expect(c.take(400, true)!.telas).toEqual([{ tela: 'frota', ms: 300, consultas: 0 }])
  })

  it('troca de tela fecha a anterior; consulta que começou antes conta para a tela antiga', () => {
    const c = createPerfCollector()
    c.route('a', 0)
    c.paint(100)
    c.route('b', 500)
    c.paint(600)
    c.resource(req('contacts', 200, 900))
    const batch = c.take(5000)!
    expect(batch.telas.map((t) => t.tela)).toEqual(['a', 'b'])
    expect(batch.consultas[0].tela).toBe('a')
  })

  it('tela sem quadro pintado nem requisição (alias que redireciona) é descartada', () => {
    const c = createPerfCollector()
    c.route('infracoes', 0)
    c.route('frota-multas', 5)
    c.paint(400)
    expect(c.take(400, true)!.telas).toEqual([{ tela: 'frota-multas', ms: 395, consultas: 0 }])
  })

  it('lote: sem novidade devolve null; vitais só vão quando mudam; limite de consultas conta as descartadas', () => {
    const c = createPerfCollector()
    expect(c.take(0)).toBeNull()
    c.vital('lcp', 1234.4)
    c.vital('cls', 0.12345)
    expect(c.take(0)!.vitais).toEqual({ lcp: 1234, cls: 0.123 })
    expect(c.take(0)).toBeNull()
    c.vital('inp', 88)
    expect(c.take(0)!.vitais).toEqual({ inp: 88 })
    for (let i = 0; i < 205; i++) c.resource(req('contacts', i, i + 1))
    const batch = c.take(0)!
    expect(batch.consultas).toHaveLength(200)
    expect(batch.descartadas).toBe(5)
    expect(c.take(0)).toBeNull()
  })

  it('resumo legível para a lista de logs', () => {
    expect(describeBatch({ telas: [{ tela: 'servicos', ms: 2300, consultas: 2 }], consultas: [{ t: 'contacts', tela: 'servicos', ms: 1500, kb: 3, st: 200 }], vitais: { lcp: 1800, inp: 120 }, descartadas: 0 }))
      .toBe('LCP 1,8 s · INP 120 ms · 1 tela(s), mais lenta servicos 2,3 s · 1 consulta(s), mais lenta contacts 1,5 s')
  })
})

describe('isSampled (amostra por sessão)', () => {
  it('sorteia uma vez por sessão da aba e mantém', () => {
    expect(isSampled(0.2, () => 0.1)).toBe(true)
    expect(isSampled(0.2, () => 0.9)).toBe(true)
    sessionStorage.clear()
    expect(isSampled(0.2, () => 0.5)).toBe(false)
    expect(isSampled(0.2, () => 0.1)).toBe(false)
  })

  it('localStorage força a taxa na hora, mesmo com a sessão já sorteada (1 = sempre, 0 = nunca; vazio = padrão)', () => {
    expect(isSampled(0.2, () => 0.99)).toBe(false)
    localStorage.setItem('betinhos-perf-taxa', '1')
    expect(isSampled(0.2, () => 0.99)).toBe(true)
    localStorage.setItem('betinhos-perf-taxa', '0')
    expect(isSampled(0.2, () => 0)).toBe(false)
    localStorage.setItem('betinhos-perf-taxa', '')
    expect(isSampled(0.2, () => 0)).toBe(false) // volta à decisão salva da sessão
  })
})
