// @vitest-environment jsdom
import type { Row } from '@betinhos/dataverse'
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch } from './fetch'
import { aplicarManutencoes, avisoForaDaJanela, colunasDaManutencao, ehLinhaDeManutencao, gravarManutencoesNaVisao, lerLinhaManutencao, lerManutencoesDaVisao, padraoManutencoes, desenhoDaManutencao } from './manutencao'
import type { Column } from './types'

const ENT = 'cr40f_reservadeveculos'
const fetchDe = (filtro = '') => `<fetch version="1.0" mapping="logical"><entity name="${ENT}"><attribute name="cr40f_id" /><order attribute="cr40f_dataehorriodesada" descending="false" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" />${filtro}</filter></entity></fetch>`
const layoutDe = (...cells: string[]) => `<grid name="resultset" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">${cells.map((c) => `<cell name="${c}" width="120" />`).join('')}</row></grid>`
const visao = (fetchxml: string, layoutxml = layoutDe('cr40f_id', 'cr40f_motorista'), id = 'v1') => ({ id, fetchxml, layoutxml })
const xml = (text: string) => new DOMParser().parseFromString(text, 'text/xml')
const norm = (text: string) => new XMLSerializer().serializeToString(xml(text))
const MARCA = 'entity > filter[type="or"] > condition[attribute="new_categoriadoitem"]'

describe('padrão de "Mostrar manutenções"', () => {
  it('ligado em visão de programação: mostra ou filtra o motorista e não filtra faturamento', () => {
    expect(padraoManutencoes(visao(fetchDe()))).toBe(true)
    expect(padraoManutencoes(visao(fetchDe('<condition attribute="cr40f_motorista" operator="null" />'), layoutDe('cr40f_id', 'cr40f_trajeto')))).toBe(true)
  })

  it('desligado em visão de faturamento (mesmo com motorista) ou sem motorista', () => {
    expect(padraoManutencoes(visao(fetchDe('<condition attribute="cr40f_statusdefaturamento" operator="eq" value="202410005" />')))).toBe(false)
    expect(padraoManutencoes(visao(fetchDe(), layoutDe('cr40f_id', 'cr40f_cotao')))).toBe(false)
  })

  it('só as condições da entidade raiz contam: filtro dentro de link-entity não liga nem desliga', () => {
    const link = (atributo: string) => `<link-entity name="cr40f_outra" from="x" to="y" alias="a"><filter><condition attribute="${atributo}" operator="eq" value="1" /></filter></link-entity>`
    const comLink = (atributo: string) => fetchDe().replace('</entity>', `${link(atributo)}</entity>`)
    // Motorista só no link: a visão não é de programação.
    expect(padraoManutencoes(visao(comLink('cr40f_motorista'), layoutDe('cr40f_id', 'cr40f_trajeto')))).toBe(false)
    // Faturamento só no link: não é visão de faturamento.
    expect(padraoManutencoes(visao(comLink('cr40f_statusdefaturamento')))).toBe(true)
    // Filtro aninhado na raiz continua valendo.
    expect(padraoManutencoes(visao(fetchDe('<filter type="or"><condition attribute="cr40f_statusdefaturamento" operator="eq" value="1" /></filter>')))).toBe(false)
  })

  it('a exceção pelo id da visão vence a regra', () => {
    expect(padraoManutencoes(visao(fetchDe(), undefined, 'ABC'), { abc: false })).toBe(false)
    expect(padraoManutencoes(visao(fetchDe(), layoutDe('cr40f_id'), 'abc'), { abc: true })).toBe(true)
  })
})

describe('marca na visão', () => {
  it('sem marca: FetchXML intacto e o padrão da visão', () => {
    const v = visao(fetchDe())
    expect(lerManutencoesDaVisao(v)).toEqual({ fetchxml: v.fetchxml, mostrar: true, gravado: false })
  })

  it('gravar e ler de volta: a marca sai do FetchXML que a tela usa', () => {
    const base = fetchDe('<condition attribute="cr40f_trajeto" operator="like" value="%GRU%" />')
    for (const mostrar of [false, true]) {
      const gravado = gravarManutencoesNaVisao(base, mostrar)
      expect(xml(gravado).querySelectorAll(MARCA).length).toBe(mostrar ? 3 : 2)
      const lido = lerManutencoesDaVisao(visao(gravado))
      expect(lido.mostrar).toBe(mostrar)
      expect(lido.gravado).toBe(true)
      expect(norm(lido.fetchxml)).toBe(norm(base))
    }
  })

  it('gravar de novo troca a marca, sem acumular', () => {
    const duas = gravarManutencoesNaVisao(gravarManutencoesNaVisao(fetchDe(), true), false)
    expect(xml(duas).querySelectorAll('entity > filter[type="or"]').length).toBe(1)
    expect(lerManutencoesDaVisao(visao(duas)).mostrar).toBe(false)
  })

  it('filtro de categoria do usuário não é a marca e continua valendo', () => {
    const v = visao(fetchDe('<condition attribute="new_categoriadoitem" operator="eq" value="100000000" />'))
    expect(lerManutencoesDaVisao(v)).toEqual({ fetchxml: v.fetchxml, mostrar: true, gravado: false })
  })

  it('FetchXML inválido não derruba a tela', () => {
    expect(lerManutencoesDaVisao(visao('<fetch>'))).toEqual({ fetchxml: '<fetch>', mostrar: false, gravado: false })
  })
})

describe('FetchXML da consulta', () => {
  it('desligado: filtro que tira as manutenções sem perder as linhas sem categoria', () => {
    const doc = xml(aplicarManutencoes(fetchDe(), false))
    expect(Array.from(doc.querySelectorAll(MARCA)).map((c) => c.getAttribute('operator'))).toEqual(['ne', 'null'])
    expect(doc.querySelector('link-entity')).toBeNull()
  })

  it('ligado: campos da linha e o link-entity da manutenção (outer, por cr40f_om), uma vez só', () => {
    const doc = xml(aplicarManutencoes(aplicarManutencoes(fetchDe(), true), true))
    const links = doc.querySelectorAll('link-entity[alias="bt_manut"]')
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('name')).toBe('cr40f_manutencoes')
    expect(links[0].getAttribute('from')).toBe('cr40f_manutencoesid')
    expect(links[0].getAttribute('to')).toBe('cr40f_om')
    expect(links[0].getAttribute('link-type')).toBe('outer')
    expect(Array.from(links[0].querySelectorAll('attribute')).map((a) => a.getAttribute('name'))).toEqual(['cr40f_id', 'cr40f_descricao', 'cr40f_graudamanutencao', 'cr40f_status', 'cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_agendarpara'])
    for (const nome of ['new_categoriadoitem', 'cr40f_om', 'cr40f_veiculo', 'cr40f_motorista', 'cr40f_dataehorriodesada']) expect(doc.querySelectorAll(`entity > attribute[name="${nome}"]`).length).toBe(1)
    expect(doc.querySelector(MARCA)).toBeNull()
  })

  it('com all-attributes não acrescenta atributos na raiz', () => {
    const doc = xml(aplicarManutencoes(`<fetch><entity name="${ENT}"><all-attributes /></entity></fetch>`, true))
    expect(doc.querySelectorAll('entity > attribute').length).toBe(0)
    expect(doc.querySelector('link-entity[alias="bt_manut"]')).toBeTruthy()
  })

  it('paginação e contagem seguem: a página leva as colunas do link; a contagem, o link sem colunas', () => {
    const ligado = aplicarManutencoes(fetchDe(), true)
    const pagina = xml(buildFetch(ligado, { page: 2, pageSize: 100, cookie: '<cookie page="1" />', sort: null, search: [] }))
    expect(pagina.documentElement.getAttribute('page')).toBe('2')
    expect(pagina.querySelector('link-entity[alias="bt_manut"] > attribute')).toBeTruthy()
    const contagem = xml(buildCountFetch(ligado, { search: [] }))
    expect(contagem.querySelector('link-entity[alias="bt_manut"]')).toBeTruthy()
    expect(contagem.querySelector('link-entity[alias="bt_manut"] > attribute')).toBeNull()
    expect(contagem.querySelectorAll('entity > attribute').length).toBe(1)
  })
})

const F = '@OData.Community.Display.V1.FormattedValue'
const HOJE = '2026-11-18'
const linha = (extra: Row = {}): Row => ({
  cr40f_reservadeveculosid: 'r1', new_categoriadoitem: 100000001, _cr40f_om_value: '{m1}', [`_cr40f_veiculo_value${F}`]: 'ABC1D23',
  cr40f_dataehorriodesada: '2026-11-23T03:00:00Z',
  'bt_manut.cr40f_id': 'M-1', 'bt_manut.cr40f_descricao': 'Freio com ruído', 'bt_manut.cr40f_graudamanutencao': 4,
  'bt_manut.cr40f_status': 202410001, 'bt_manut.cr40f_janelainicio': '2026-11-23', 'bt_manut.cr40f_janelafim': '2026-11-29',
  ...extra,
})
const coluna = (key: string, width = 120): Column => {
  const dot = key.indexOf('.')
  return { key, attribute: dot < 0 ? key : key.slice(dot + 1), alias: dot < 0 ? null : key.slice(0, dot), entity: null, width }
}

describe('linha de manutenção', () => {
  it('reconhece a linha pela categoria e pela ligação com a manutenção', () => {
    expect(ehLinhaDeManutencao(linha())).toBe(true)
    expect(ehLinhaDeManutencao(linha({ new_categoriadoitem: 100000000 }))).toBe(false)
    expect(ehLinhaDeManutencao(linha({ _cr40f_om_value: null }))).toBe(false)
    expect(lerLinhaManutencao({ new_categoriadoitem: 100000000 }, HOJE)).toBeNull()
  })

  it('lê o resumo: veículo, problema, grau, status, janela', () => {
    expect(lerLinhaManutencao(linha(), HOJE)).toEqual({
      manutencaoId: 'm1', codigo: 'M-1', veiculo: 'ABC1D23', descricao: 'Freio com ruído', grau: 'Urgente',
      status: 202410001, statusRotulo: 'Agendado', statusTom: 'info',
      janela: { inicio: '2026-11-23', fim: '2026-11-29' }, janelaRotulo: 'Semana de 23/11 a 29/11/2026',
      atrasada: false, foraDaJanela: false,
    })
  })

  it('atrasada: janela vencida em Agendado ou Programado; registro antigo usa a data de agendamento', () => {
    const programada = lerLinhaManutencao(linha({ 'bt_manut.cr40f_status': 202410005, 'bt_manut.cr40f_janelainicio': '2026-11-15', 'bt_manut.cr40f_janelafim': '2026-11-15', cr40f_dataehorriodesada: '2026-11-15T12:00:00Z' }), HOJE)
    expect(programada).toMatchObject({ statusRotulo: 'Programado', janelaRotulo: '15/11/2026', atrasada: true, foraDaJanela: false })
    const antiga = lerLinhaManutencao(linha({ 'bt_manut.cr40f_janelainicio': null, 'bt_manut.cr40f_janelafim': null, 'bt_manut.cr40f_agendarpara': '2026-11-10T03:00:00Z' }), HOJE)
    expect(antiga).toMatchObject({ janela: null, janelaRotulo: 'Agendada para 10/11/2026', atrasada: true })
    expect(lerLinhaManutencao(linha({ 'bt_manut.cr40f_status': 202410002, 'bt_manut.cr40f_janelafim': '2026-11-01' }), HOJE)?.atrasada).toBe(false)
  })

  it('cr40f_agendarpara (UserLocal, UTC) vale pela data de São Paulo, não pelo corte da string UTC', () => {
    // 02:00Z de 18/11 é 23h de 17/11 em São Paulo: o dia 17 já passou em 18/11 (atrasada); o corte UTC daria 18 (não atrasada).
    const noite = lerLinhaManutencao(linha({ 'bt_manut.cr40f_janelainicio': null, 'bt_manut.cr40f_janelafim': null, 'bt_manut.cr40f_agendarpara': '2026-11-18T02:00:00Z' }), HOJE)
    expect(noite).toMatchObject({ janelaRotulo: 'Agendada para 17/11/2026', atrasada: true })
    // 03:00Z é a meia-noite de São Paulo: o mesmo dia.
    const meiaNoite = lerLinhaManutencao(linha({ 'bt_manut.cr40f_janelainicio': null, 'bt_manut.cr40f_janelafim': null, 'bt_manut.cr40f_agendarpara': '2026-11-18T03:00:00Z' }), HOJE)
    expect(meiaNoite).toMatchObject({ janelaRotulo: 'Agendada para 18/11/2026', atrasada: false })
  })

  it('sem dados da manutenção (link vazio), rótulos legíveis no lugar', () => {
    const vazia = lerLinhaManutencao({ new_categoriadoitem: 100000001, _cr40f_om_value: 'm9' }, HOJE)
    expect(vazia).toMatchObject({ veiculo: 'Sem veículo', descricao: 'Sem descrição', grau: null, status: null, statusRotulo: 'Sem status', statusTom: 'neutral', janelaRotulo: 'Sem janela', atrasada: false, foraDaJanela: false })
  })

  it('fora da janela: selo na linha e aviso que não bloqueia', () => {
    const fora = lerLinhaManutencao(linha({ cr40f_dataehorriodesada: '2026-11-18T13:00:00Z' }), HOJE)!
    expect(fora.foraDaJanela).toBe(true)
    expect(avisoForaDaJanela('2026-11-18T13:00:00Z', fora)).toBe('A saída de 18/11/2026 ficou fora da janela da manutenção (Semana de 23/11 a 29/11/2026). A data foi gravada; confira com o gestor de frota.')
    expect(avisoForaDaJanela('2026-11-25T13:00:00Z', fora)).toBeNull()
    expect(avisoForaDaJanela(null, fora)).toBeNull()
    expect(avisoForaDaJanela('2026-11-18T13:00:00Z', { janela: null, janelaRotulo: 'Sem janela' })).toBeNull()
  })

  it('o aviso de fora da janela segue o selo: só com a manutenção Agendada ou Programada', () => {
    const fora = lerLinhaManutencao(linha({ cr40f_dataehorriodesada: '2026-11-18T13:00:00Z' }), HOJE)!
    for (const [status, esperado] of [[202410001, true], [202410005, true], [202410002, false], [100000001, false], [100000002, false], [0, false], [null, false]] as const) {
      expect(avisoForaDaJanela('2026-11-18T13:00:00Z', { ...fora, status }) != null, String(status)).toBe(esperado)
    }
    // Aviso e selo usam a mesma linha lida: o status da linha vem junto.
    expect(avisoForaDaJanela('2026-11-18T13:00:00Z', lerLinhaManutencao(linha({ 'bt_manut.cr40f_status': 202410002 }), HOJE)!)).toBeNull()
  })

  it('colunas com sentido: status no Status de Op., placa no Veículo, o problema no Trajeto, saída e motorista editam', () => {
    const cols = ['cr40f_id', 'comprovantes', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_dataehorriodesada', 'cr40f_motorista', 'cr40f_veiculo', 'cr40f_cliente', 'cr40f_trajeto', 'x__cr40f_Motorista.cr40f_motorista'].map((k) => coluna(k))
    const d = desenhoDaManutencao(cols)
    expect(d.celulas.map((c) => c.tipo)).toEqual(['vazio', 'status', 'vazio', 'campo', 'campo', 'veiculo', 'vazio', 'problema', 'vazio'])
    expect(d.celulas.map((c) => c.column)).toEqual(cols.slice(1))
    expect(d).toMatchObject({ resumoNaPrimeira: false, statusNoProblema: false })
  })

  it('sem Trajeto, o problema vai na coluna comum mais larga; sem Status de Op., o status vai junto com o problema', () => {
    const cols = [coluna('cr40f_id'), coluna('comprovantes', 90), coluna('cr40f_dataehorriodesada'), coluna('cr40f_cliente', 140), coluna('cr40f_motorista'), coluna('cr40f_statusdefaturamento', 140)]
    const d = desenhoDaManutencao(cols)
    expect(d.celulas.map((c) => c.tipo)).toEqual(['vazio', 'campo', 'problema', 'campo', 'vazio'])
    expect(d).toMatchObject({ resumoNaPrimeira: false, statusNoProblema: true })
  })

  it('visão sem coluna para o problema: o resumo vai dentro da primeira coluna e nenhuma célula sobra', () => {
    expect(desenhoDaManutencao([coluna('cr40f_id')])).toEqual({ celulas: [], resumoNaPrimeira: true, statusNoProblema: true })
    const d = desenhoDaManutencao([coluna('cr40f_id'), coluna('cr40f_status'), coluna('cr40f_dataehorriodesada'), coluna('cr40f_motorista')])
    expect(d.celulas.map((c) => c.tipo)).toEqual(['status', 'campo', 'campo'])
    expect(d).toMatchObject({ resumoNaPrimeira: true, statusNoProblema: false })
    expect(desenhoDaManutencao([])).toEqual({ celulas: [], resumoNaPrimeira: false, statusNoProblema: true })
  })

  it('colunas da edição no celular: as da visão, ou criadas quando a visão não tem', () => {
    const motorista = coluna('cr40f_motorista', 200)
    expect(colunasDaManutencao([coluna('cr40f_id'), motorista])).toEqual([motorista, { key: 'cr40f_dataehorriodesada', attribute: 'cr40f_dataehorriodesada', alias: null, entity: null, width: 160 }])
  })
})
