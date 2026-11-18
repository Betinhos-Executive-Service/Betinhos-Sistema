import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { celula, nomeArquivo, planilhaDaTabela, valorLegivel } from './planilhas.mjs'

const F = '@OData.Community.Display.V1.FormattedValue'

test('lookup, choice e sim/não pelo rótulo; dinheiro cru com vírgula', () => {
  const r = {
    _cr40f_cliente_value: 'guid', [`_cr40f_cliente_value${F}`]: 'Tenaris',
    statuscode: 1, [`statuscode${F}`]: 'Ativo',
    cr40f_pago: true, [`cr40f_pago${F}`]: 'Sim',
    cr40f_tipos: '1,2', [`cr40f_tipos${F}`]: 'A; B',
    cr40f_valor: 1234.5, [`cr40f_valor${F}`]: 'R$1,234.50',
    cr40f_km: 12, [`cr40f_km${F}`]: '12',
  }
  assert.equal(valorLegivel(r, '_cr40f_cliente_value'), 'Tenaris')
  assert.equal(valorLegivel(r, 'statuscode'), 'Ativo')
  assert.equal(valorLegivel(r, 'cr40f_pago'), 'Sim')
  assert.equal(valorLegivel(r, 'cr40f_tipos'), 'A; B')
  assert.equal(valorLegivel(r, 'cr40f_valor'), '1234,5')
  assert.equal(valorLegivel(r, 'cr40f_km'), '12')
  // Dinheiro inteiro: o formatado ("R$ 1.500,00") não é rótulo de choice quando a metadata diz que é número.
  assert.equal(valorLegivel({ v: 1500, [`v${F}`]: 'R$ 1.500,00' }, 'v', false, true), '1500')
})

test('datas em Brasília e só data em dd/mm/aaaa', () => {
  assert.equal(valorLegivel({ d: '2026-11-18T13:05:00Z' }, 'd'), '18/11/2026 10:05')
  assert.equal(valorLegivel({ d: '2026-11-18T13:05:00Z' }, 'd', true), '18/11/2026 13:05')
  assert.equal(valorLegivel({ d: '2026-11-18' }, 'd'), '18/11/2026')
  assert.equal(valorLegivel({ d: null }, 'd'), '')
})

test('célula escapa ; e aspas e neutraliza fórmula, sem mexer em número negativo', () => {
  assert.equal(celula('a;b'), '"a;b"')
  assert.equal(celula('diz "oi"'), '"diz ""oi"""')
  assert.equal(celula('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(celula('-12,5'), '-12,5')
  assert.equal(celula('@x'), "'@x")
})

test('nome de arquivo com nome de exibição e lógico, sem caracteres proibidos', () => {
  assert.equal(nomeArquivo('Serviço', 'cr40f_servico'), 'Serviço (cr40f_servico).csv')
  assert.equal(nomeArquivo('A/B', 'x'), 'A-B (x).csv')
  assert.equal(nomeArquivo(undefined, 'x'), 'x.csv')
})

test('planilha tira colunas vazias e anotações e usa os rótulos no cabeçalho em ordem alfabética', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'planilha-'))
  const ndjson = join(pasta, 't.ndjson.gz')
  const linhas = [
    { '@odata.etag': 'W/1', tid: 'g1', _owninguser_value: 'g2', _cr40f_x_value: 'g3', cr40f_nome: 'Ana', vazia: null, _cr40f_cliente_value: 'g', [`_cr40f_cliente_value${F}`]: 'Latasa' },
    { '@odata.etag': 'W/2', cr40f_nome: 'Bia;Silva', vazia: null, _cr40f_cliente_value: null },
  ]
  writeFileSync(ndjson, gzipSync(linhas.map((l) => JSON.stringify(l)).join('\n') + '\n'))
  const csv = join(pasta, 't.csv')
  assert.equal(await planilhaDaTabela(ndjson, csv, { rotulos: { cr40f_nome: 'Nome', cr40f_cliente: 'Cliente', cr40f_x: 'X' }, chavePrimaria: 'tid' }), 2)
  assert.equal(readFileSync(csv, 'utf8'), '﻿Cliente;Nome\r\nLatasa;Ana\r\n;"Bia;Silva"\r\n')
})
