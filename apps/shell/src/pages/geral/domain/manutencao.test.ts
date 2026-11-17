// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch } from './fetch'
import { aplicarManutencoes, gravarManutencoesNaVisao, lerManutencoesDaVisao, padraoManutencoes } from './manutencao'

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
