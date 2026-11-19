import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gzipSync, inflateRawSync } from 'node:zlib'
import { inicioDoDia, montar, planilhaOperacao } from './operacao.mjs'
import { zip } from './xlsx.mjs'

const F = '@OData.Community.Display.V1.FormattedValue'

// Lê o zip pelos cabeçalhos locais (o que o Excel e o 7-Zip também fazem): { nome: texto }.
function lerZip(b) {
  const arquivos = {}
  for (let o = 0; b.readUInt32LE(o) === 0x04034b50;) {
    const tamanho = b.readUInt32LE(o + 18)
    const nome = b.toString('utf8', o + 30, o + 30 + b.readUInt16LE(o + 26))
    const inicio = o + 30 + b.readUInt16LE(o + 26) + b.readUInt16LE(o + 28)
    arquivos[nome] = inflateRawSync(b.subarray(inicio, inicio + tamanho)).toString()
    o = inicio + tamanho
  }
  return arquivos
}

function exportacao(tabelas) {
  const pasta = mkdtempSync(join(tmpdir(), 'operacao-'))
  mkdirSync(join(pasta, 'tabelas'))
  for (const [nome, linhas] of Object.entries(tabelas)) {
    writeFileSync(join(pasta, 'tabelas', `${nome}.ndjson.gz`), gzipSync(linhas.map((l) => JSON.stringify(l)).join('\n')))
  }
  return pasta
}

const servico = (id, saida, extra = {}) => ({
  cr40f_reservadeveculosid: id, cr40f_id: id, cr40f_dataehorriodesada: saida,
  cr40f_status: 1, [`cr40f_status${F}`]: 'Confirmado',
  _cr40f_cliente_value: 'c1', [`_cr40f_cliente_value${F}`]: 'Cliente A',
  cr40f_passageirosetelefonedecontato: 'Pax Um - +55 11 90000-0000', ...extra,
})

test('início do dia é meia-noite de Brasília', () => {
  const { utc, parede } = inicioDoDia(new Date('2026-11-20T02:30:00Z')) // 19/11 23:30 em Brasília
  assert.equal(new Date(utc).toISOString(), '2026-11-19T03:00:00.000Z')
  assert.equal(new Date(parede).toISOString(), '2026-11-19T00:00:00.000Z')
})

test('separa próximos e últimos 60 dias, ordena e junta motorista, veículo e solicitante', async () => {
  const pasta = exportacao({
    cr40f_reservadeveculos: [
      servico('S-ANTIGO', '2026-08-01T12:00:00Z'),
      servico('S-ONTEM', '2026-11-18T12:00:00Z', { cr40f_status: 2, [`cr40f_status${F}`]: 'Cancelado' }),
      servico('S-SEMANA', '2026-10-01T12:00:00Z'),
      servico('S-DEPOIS', '2026-12-05T09:00:00Z', {
        _cr40f_motorista_value: 'm1', [`_cr40f_motorista_value${F}`]: 'João Motorista',
        _cr40f_veiculo_value: 'v0', [`_cr40f_veiculo_value${F}`]: 'AAA0000',
        _new_veiculoreal_value: 'v1', [`_new_veiculoreal_value${F}`]: 'BBB1111',
        _cr40f_solicitante_value: 'p1', [`_cr40f_solicitante_value${F}`]: 'Maria Solicitante',
      }),
      // Hoje cedo (antes de agora) ainda é "próximo": o dia inteiro fica na aba de quem opera.
      servico('S-HOJE', '2026-11-19T10:00:00Z', { cr40f_status: 2, [`cr40f_status${F}`]: 'Cancelado' }),
      servico('S-SEMDATA', null),
    ],
    cr40f_funcionarios: [{ cr40f_funcionariosid: 'm1', cr40f_nomecompleto: 'João Motorista', cr40f_celular: '11 91111-1111', cr40f_telefonedeemergencia: '11 92222-2222' }],
    cr40f_veiculos: [{ cr40f_veiculosid: 'v1', cr40f_modelo: 'Corolla' }],
    cr40f_bancodedados: [{ cr40f_bancodedadosid: 'p1', cr40f_nomedopassageiro: 'Maria Solicitante', cr40f_telefone: '11 93333-3333', cr40f_email: 'maria@exemplo.test' }],
  })
  const dados = await montar(pasta, { agora: new Date('2026-11-19T18:00:00Z') })
  const id = (l) => l[19]
  assert.deepEqual(dados.proximos.map(id), ['S-HOJE', 'S-DEPOIS'])
  assert.deepEqual(dados.historico.map(id), ['S-ONTEM', 'S-SEMANA'])
  assert.equal(dados.proximos[0][2], 'Cancelado')
  const depois = dados.proximos[1]
  assert.equal(depois[0], '05/12/2026 06:00')
  assert.equal(depois[13], '11 91111-1111')
  assert.equal(depois[15], 'BBB1111 · Corolla')
  assert.equal(depois[6], '11 93333-3333')
  assert.deepEqual(dados.contatos, [
    ['Motorista', 'João Motorista', '11 91111-1111', 'emergência 11 92222-2222', '', ''],
    ['Solicitante', 'Maria Solicitante', '11 93333-3333', '', 'maria@exemplo.test', 'Cliente A'],
  ])

  const arquivos = lerZip(planilhaOperacao(dados))
  assert.match(arquivos['xl/workbook.xml'], /name="Próximos serviços".*name="Últimos 60 dias".*name="Contatos"/)
  assert.match(arquivos['xl/worksheets/sheet1.xml'], /<pane ySplit="1"[^>]*state="frozen"/)
  assert.match(arquivos['xl/worksheets/sheet1.xml'], /<autoFilter ref="A1:U3"\/>/)
  assert.match(arquivos['xl/worksheets/sheet1.xml'], /BBB1111 · Corolla/)
})

test('zip: texto escapado e sem caractere de controle', () => {
  const arquivos = lerZip(zip([{ nome: 'a.txt', dados: Buffer.from('olá') }]))
  assert.equal(arquivos['a.txt'], 'olá')
  const xml = lerZip(planilhaOperacao({ proximos: [['<b>&\u0001x']], historico: [], contatos: [] }))['xl/worksheets/sheet1.xml']
  assert.match(xml, /&lt;b&gt;&amp;x/)
})
