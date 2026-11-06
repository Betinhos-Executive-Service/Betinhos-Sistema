// @vitest-environment jsdom
import { createClient, createMetadata } from '@betinhos/dataverse'
import { describe, expect, it } from 'vitest'
import type { Host } from '../../../host'
import { ENTITY_NAMES } from '../../../nav/menu'
import { createSource } from './source'

const PICKLISTS = Array.from({ length: 20 }, (_, i) => `cr40f_choice${i}`)
const QUICK_FIND = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id"/><filter><condition attribute="cr40f_statuscode" operator="like" value="%"/></filter></entity></fetch>'

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** Dataverse falso: só responde à metadata e guarda cada URL de EntityDefinitions pedida. */
function fakeDataverse(delayMs = 5) {
  const metadataCalls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = decodeURIComponent(String(input)).replace('https://org.example/api/data/v9.2/', '')
    if (url.startsWith('EntityDefinitions')) metadataCalls.push(url)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (url.startsWith('EntityDefinitions?')) {
      const names = [...url.matchAll(/LogicalName eq '([^']+)'/g)].map((m) => m[1])
      return json({ value: names.map((name) => ({ LogicalName: name, EntitySetName: `${name}s`, PrimaryNameAttribute: 'name', ObjectTypeCode: 1 })) })
    }
    const single = /^EntityDefinitions\(LogicalName='([^']+)'\)\?/.exec(url)
    if (single) return json({ LogicalName: single[1], EntitySetName: `${single[1]}s`, PrimaryNameAttribute: 'name', ObjectTypeCode: 1 })
    if (url.includes('/Attributes?')) {
      return json({ value: [
        { LogicalName: 'cr40f_id', AttributeType: 'String', IsValidForUpdate: true },
        { LogicalName: 'cr40f_motorista', AttributeType: 'Lookup', IsValidForUpdate: true },
        ...PICKLISTS.map((name) => ({ LogicalName: name, AttributeType: 'Picklist', IsValidForUpdate: true })),
      ] })
    }
    if (url.includes('LookupAttributeMetadata')) return json({ value: [{ LogicalName: 'cr40f_motorista', Targets: ['cr40f_funcionarios'] }] })
    if (url.includes('/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?')) {
      return json({ value: PICKLISTS.map((name) => ({ LogicalName: name, OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: 'A' } } }] } })) })
    }
    if (url.includes('PicklistAttributeMetadata') || url.includes('StateAttributeMetadata') || url.includes('StatusAttributeMetadata')) {
      return json({ OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: 'A' } } }] } })
    }
    if (url.startsWith('savedqueries')) return json({ value: url.includes('isquickfindquery') ? [{ fetchxml: QUICK_FIND }] : [] })
    return json({ value: [] })
  }
  return { metadataCalls, fetchImpl }
}

function hostWith(fetchImpl: typeof fetch): Host {
  const client = createClient('https://org.example', fetchImpl)
  return { mode: 'dataverse', clientUrl: 'https://org.example', client, metadata: createMetadata(client), insideModelDriven: false, appId: async () => undefined }
}

/** Abertura da Geral como o app faz: rótulos do menu (App.tsx) + quickFind/objectTypeCode/atributos (useGeral) ao mesmo tempo. */
async function abrirGeral(host: Host) {
  if (host.mode !== 'dataverse') throw new Error('host')
  const source = createSource(host)
  await Promise.all([
    host.metadata.entities(ENTITY_NAMES),
    source.quickFind(),
    source.objectTypeCode(),
    source.attributes('cr40f_reservadeveculos'),
    source.page({ fetchxml: '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id"/></entity></fetch>', page: 1, cookie: null, sort: null, query: '', quickFind: [] }),
  ])
}

describe('metadata na abertura da Geral', () => {
  it('abre com o mínimo de consultas: 1 por tabela, 1 para todas as choices, nenhuma repetida', async () => {
    const { metadataCalls, fetchImpl } = fakeDataverse()
    await abrirGeral(hostWith(fetchImpl))
    const daReserva = metadataCalls.filter((url) => url.includes("'cr40f_reservadeveculos'"))
    const choices = metadataCalls.filter((url) => url.includes('PicklistAttributeMetadata'))
    // Antes: 25 (20 choices, uma por coluna; a tabela da reserva lida 2 vezes). Agora: 1 lote de rótulos, 1 da reserva, 2 de colunas, 1 de choices.
    expect(metadataCalls.filter((url, i) => metadataCalls.indexOf(url) !== i)).toEqual([])
    expect(choices).toHaveLength(1)
    expect(daReserva.filter((url) => url.includes('$filter=LogicalName eq') || /\)\?\$select=LogicalName,EntitySetName/.test(url))).toHaveLength(1)
    expect(metadataCalls).toHaveLength(5)
  })

  it('devolve as opções das choices vindas da consulta única', async () => {
    const { fetchImpl } = fakeDataverse()
    const host = hostWith(fetchImpl)
    if (host.mode !== 'dataverse') throw new Error('host')
    const attributes = await createSource(host).attributes('cr40f_reservadeveculos')
    expect(attributes.get('cr40f_choice7')?.options).toEqual([{ value: 1, label: 'A' }])
    expect(attributes.get('cr40f_motorista')?.targets).toEqual(['cr40f_funcionarios'])
  })

  it('se a consulta única das choices falhar, cada coluna tenta a sua', async () => {
    const { metadataCalls, fetchImpl } = fakeDataverse()
    let falhou = false
    const flaky: typeof fetch = async (input, init) => {
      if (!falhou && String(input).includes('/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?')) { falhou = true; return new Response('{}', { status: 500 }) }
      return fetchImpl(input, init)
    }
    const host = hostWith(flaky)
    if (host.mode !== 'dataverse') throw new Error('host')
    const attributes = await createSource(host).attributes('cr40f_reservadeveculos')
    expect(attributes.get('cr40f_choice3')?.options).toEqual([{ value: 1, label: 'A' }])
    expect(metadataCalls.filter((url) => url.includes('PicklistAttributeMetadata'))).toHaveLength(PICKLISTS.length)
  })
})
