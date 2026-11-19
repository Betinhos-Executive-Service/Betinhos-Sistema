import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { escolherTabelas, exportarTabela, obter } from './exportar-dataverse.mjs'

const def = (LogicalName, extra = {}) => ({ LogicalName, EntitySetName: `${LogicalName}s`, TableType: 'Standard', ...extra })

test('escolhe cr40f_, new_ e extras, nunca cr40f_segredo, virtuais nem personalizadas da plataforma', () => {
  const tabelas = escolherTabelas([
    def('cr40f_servico'),
    def('cr40f_segredo'),
    def('new_appmotoristaslog'),
    def('cr40f_virtual', { TableType: 'Virtual' }),
    def('account'),
    def('systemuser'),
    def('flowlog'),
    def('msdyn_aioptimizationprivatedata'),
    def('cr40f_semconjunto', { EntitySetName: null }),
  ])
  assert.deepEqual(tabelas.map((t) => t.logico), ['account', 'cr40f_servico', 'new_appmotoristaslog'])
})

test('cr40f_segredo sai mesmo se pedida como extra; excluir tira outras', () => {
  const tabelas = escolherTabelas([def('cr40f_segredo'), def('cr40f_a'), def('cr40f_b')], {
    extra: ['cr40f_segredo'],
    excluir: ['cr40f_b'],
  })
  assert.deepEqual(tabelas.map((t) => t.logico), ['cr40f_a'])
})

const resposta = (status, corpo, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null },
  json: async () => corpo,
  text: async () => JSON.stringify(corpo),
})

test('obter repete em 429 e para em 4xx', async () => {
  const fila = [resposta(429, {}, { 'retry-after': '0.001' }), resposta(200, { ok: 1 })]
  assert.deepEqual(await obter('u', {}, { fetchFn: async () => fila.shift() }), { ok: 1 })
  await assert.rejects(obter('u', {}, { fetchFn: async () => resposta(403, { erro: 'x' }) }), /HTTP 403/)
})

test('exportarTabela segue o nextLink e grava NDJSON comprimido', async () => {
  const paginas = {
    'https://dv/api/data/v9.2/cr40f_as': { value: [{ id: 1 }, { id: 2 }], '@odata.nextLink': 'https://dv/proxima' },
    'https://dv/proxima': { value: [{ id: 3 }] },
  }
  const arquivo = join(mkdtempSync(join(tmpdir(), 'bk-')), 'a.ndjson.gz')
  const total = await exportarTabela('https://dv', 'cr40f_as', {}, arquivo, { fetchFn: async (url) => resposta(200, paginas[url]) })
  assert.equal(total, 3)
  const linhas = gunzipSync(readFileSync(arquivo)).toString().trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(linhas, [{ id: 1 }, { id: 2 }, { id: 3 }])
})
