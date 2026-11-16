// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { filtersToFetchXml, type FilterField } from '@betinhos/ui'
import { LOCKED_REASON, splitViewFilters } from './viewFetchFilters'

const FIELDS: FilterField[] = [
  { key: 'cr40f_dataehorriodesada', label: 'Data e horário de saída', kind: 'date' },
  { key: 'cr40f_cr', label: 'CR', kind: 'text' },
  { key: 'cr40f_cliente', label: 'Cliente', kind: 'lookup' },
  { key: 'cr40f_status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Confirmado' }, { value: '2', label: 'Cancelado' }] },
  { key: 'cr40f_receber', label: 'Receber', kind: 'number', money: true },
  { key: 'cr40f_trajeto', label: 'Trajeto', kind: 'text' },
]
const LABELS: Record<string, string> = { statecode: 'Status do registro', cr40f_motorista: 'Motorista' }
const labelOf = (key: string) => LABELS[key]

// Formato real da savedquery "Sem CR da Tenaris" no DEV (colunas resumidas).
const SEM_CR_TENARIS = `<fetch version="1.0" output-format="xml-platform" mapping="logical" savedqueryid="fc9c63ee-f826-f111-88b4-7ced8da87663" distinct="true">
    <entity name="cr40f_reservadeveculos">
        <attribute name="cr40f_id"/>
        <attribute name="cr40f_dataehorriodesada"/>
        <filter type="and">
            <condition attribute="cr40f_dataehorriodesada" operator="this-month"/>
            <condition attribute="cr40f_cr" operator="null"/>
            <condition attribute="cr40f_cliente" operator="eq" value="{564bdd2e-74cf-f011-8543-6045bd3adc1c}" uiname="Tenaris" uitype="cr40f_clientes1"/>
        </filter>
    <attribute name="cr40f_cr"/></entity>
</fetch>`

const wrap = (filters: string, extra = '') => `<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id"/>${filters}${extra}</entity></fetch>`

describe('splitViewFilters', () => {
  it('lê a visão "Sem CR da Tenaris" inteira como filtros editáveis e tira as condições do FetchXML base', () => {
    const split = splitViewFilters(SEM_CR_TENARIS, FIELDS, labelOf)
    expect(split.locked).toEqual([])
    expect(split.filters.quick).toEqual({
      cr40f_dataehorriodesada: { type: 'condition', id: 'visao-cr40f_dataehorriodesada', field: 'cr40f_dataehorriodesada', op: 'this-month' },
      cr40f_cr: { type: 'condition', id: 'visao-cr40f_cr', field: 'cr40f_cr', op: 'empty' },
      cr40f_cliente: { type: 'condition', id: 'visao-cr40f_cliente', field: 'cr40f_cliente', op: 'in', values: [{ value: '564bdd2e-74cf-f011-8543-6045bd3adc1c', label: 'Tenaris' }] },
    })
    expect(split.base).not.toContain('<condition')
    expect(split.base).not.toContain('<filter')
    expect(split.base).toContain('savedqueryid="fc9c63ee-f826-f111-88b4-7ced8da87663"')
    // Reinjetados, dão as mesmas condições da visão.
    const xml = filtersToFetchXml(split.filters, FIELDS)
    expect(xml).toContain('<condition attribute="cr40f_dataehorriodesada" operator="this-month" />')
    expect(xml).toContain('<condition attribute="cr40f_cr" operator="null" />')
    expect(xml).toContain('<condition attribute="cr40f_cliente" operator="in"><value>564bdd2e-74cf-f011-8543-6045bd3adc1c</value></condition>')
  })

  it('o que a tela não sabe ler fica no FetchXML e vira item só leitura com nome de exibição e valor formatado', () => {
    const fetch = wrap(`<filter type="and">
      <condition attribute="statecode" operator="eq" value="0"/>
      <condition attribute="cr40f_status" operator="in"><value>1</value><value>2</value></condition>
      <condition attribute="cr40f_dataehorriodesada" operator="last-x-days" value="30"/>
      <condition attribute="cr40f_trajeto" operator="like" value="%GRU%REC%"/>
      <filter type="or">
        <condition attribute="cr40f_motorista" operator="eq" value="{11111111-2222-3333-4444-555555555555}" uiname="Fulano"/>
        <condition attribute="cr40f_receber" operator="gt" value="100"/>
      </filter>
    </filter>`)
    const split = splitViewFilters(fetch, FIELDS, labelOf)
    expect(Object.keys(split.filters.quick)).toEqual(['cr40f_status'])
    expect(split.filters.quick.cr40f_status.values).toEqual([{ value: '1', label: 'Confirmado' }, { value: '2', label: 'Cancelado' }])
    expect(split.locked).toEqual([
      { id: 'n:0', label: 'Status do registro igual a Ativo', reason: LOCKED_REASON, removable: false },
      { id: 'n:1', label: 'Data e horário de saída nos últimos dias 30', reason: LOCKED_REASON, removable: false },
      { id: 'n:2', label: 'Trajeto contém "…GRU…REC…"', reason: LOCKED_REASON, removable: false },
      { id: 'n:3', label: 'uma destas: Motorista igual a Fulano; Receber maior que 100', reason: LOCKED_REASON, removable: false },
    ])
    expect(split.base).toContain('attribute="statecode"')
    expect(split.base).toContain('<filter type="or">')
    expect(split.base).not.toContain('attribute="cr40f_status"')
  })

  it('filtro OU da raiz e filtro de link-entity ficam só leitura, sem nome interno', () => {
    const fetch = wrap(
      '<filter type="or"><condition attribute="cr40f_cr" operator="null"/><condition attribute="cr40f_cr" operator="eq" value="X"/></filter>',
      '<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="c"><filter><condition attribute="statecode" operator="eq" value="0"/></filter></link-entity>',
    )
    const split = splitViewFilters(fetch, FIELDS, labelOf)
    expect(split.filters.quick).toEqual({})
    expect(split.base).toBe(fetch)
    expect(split.locked.map((l) => l.label)).toEqual([
      'uma destas: CR está vazio; CR igual a X',
      'todas estas: Campo de tabela relacionada igual a Ativo',
    ])
  })

  it('converte texto, número, data e escolha nos operadores do painel', () => {
    const fetch = wrap(`<filter>
      <condition attribute="cr40f_trajeto" operator="like" value="%GRU[_]1%"/>
      <condition attribute="cr40f_receber" operator="ge" value="150.5"/>
      <condition attribute="cr40f_dataehorriodesada" operator="on-or-after" value="2026-11-10"/>
      <condition attribute="cr40f_dataehorriodesada" operator="on-or-before" value="2026-11-20"/>
      <condition attribute="cr40f_status" operator="ne" value="2"/>
    </filter>`)
    const { filters, locked } = splitViewFilters(fetch, FIELDS)
    expect(locked).toEqual([])
    expect(filters.quick.cr40f_trajeto).toMatchObject({ op: 'contains', value: 'GRU_1' })
    expect(filters.quick.cr40f_receber).toMatchObject({ op: 'ge', value: 150.5 })
    expect(filters.quick.cr40f_dataehorriodesada).toMatchObject({ op: 'after', value: '2026-11-09' })
    expect(filters.advanced.items).toEqual([expect.objectContaining({ field: 'cr40f_dataehorriodesada', op: 'before', value: '2026-11-21' })])
    expect(filters.quick.cr40f_status).toMatchObject({ op: 'not-in', values: [{ value: '2', label: 'Cancelado' }] })
    // Ida e volta: "depois de 09/11" = a partir de 10/11; "antes de 21/11" = até 20/11.
    const xml = filtersToFetchXml(filters, FIELDS)
    expect(xml).toContain('operator="on-or-after" value="2026-11-10"')
    expect(xml).toContain('operator="lt" value="2026-11-21"')
    expect(xml).toContain('value="%GRU[_]1%"')
  })

  it('FetchXML inválido ou sem filtros volta igual', () => {
    expect(splitViewFilters('<nao-fetch/>', FIELDS)).toEqual({ base: '<nao-fetch/>', filters: expect.any(Object), locked: [] })
    const plain = wrap('')
    expect(splitViewFilters(plain, FIELDS).base).toBe(plain)
  })

  it('o filtro de localização rápida fica intacto e fora do painel', () => {
    const fetch = wrap('<filter type="or" isquickfindfields="1"><condition attribute="cr40f_trajeto" operator="like" value="{0}"/></filter>')
    expect(splitViewFilters(fetch, FIELDS)).toEqual({ base: fetch, filters: expect.objectContaining({ quick: {} }), locked: [] })
  })
})
