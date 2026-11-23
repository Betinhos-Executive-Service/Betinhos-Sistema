import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  atribuirPrs, codigosPublicados, criarApi, dataHoraSp, extrairCodigos, gravarPublicacoes, jaRegistrado, prDoAssunto, resumoMarkdown, textoAtualizacao,
} from './publicados.mjs'

const SHA = 'abc1234def5678abc1234def5678abc1234def56'

test('extrai o código do título, vários do corpo, ignora PRJ sem etapa e repetidos', () => {
  assert.deepEqual(extrairCodigos('feat: X (PRJ-12.3)'), ['PRJ-12.3'])
  assert.deepEqual(extrairCodigos('Etapas PRJ-1.2 e PRJ-4.10.\nVer também PRJ-1.2'), ['PRJ-1.2', 'PRJ-4.10'])
  assert.deepEqual(extrairCodigos('fix: sem código'), [])
  assert.deepEqual(extrairCodigos('Projeto PRJ-12 inteiro, sem etapa'), [])
  assert.deepEqual(extrairCodigos('prj-7.01 em minúsculas'), ['PRJ-7.1'])
  assert.deepEqual(extrairCodigos('XPRJ-1.2 colado não conta'), [])
  assert.deepEqual(extrairCodigos(undefined), [])
})

test('PR pelo assunto do merge ou do squash', () => {
  assert.equal(prDoAssunto('Merge pull request #622 from org/fix/x'), 622)
  assert.equal(prDoAssunto('feat(projetos): etapas (#640)'), 640)
  assert.equal(prDoAssunto('fix: sem PR'), null)
})

test('o merge mais interno ganha o commit', () => {
  const commits = [
    { sha: 'm-main', assunto: 'Merge pull request #700 from org/develop' },
    { sha: 'm-feat', assunto: 'Merge pull request #699 from org/feat/x' },
    { sha: 'c1', assunto: 'feat: x' },
    { sha: 'c2', assunto: 'docs: direto na develop' },
  ]
  const pr = atribuirPrs(commits, { 'm-main': ['m-feat', 'c1', 'c2'], 'm-feat': ['c1'] })
  assert.equal(pr.get('c1'), 699)
  assert.equal(pr.get('m-feat'), 699)
  assert.equal(pr.get('c2'), 700)
  assert.equal(pr.get('m-main'), 700)
})

test('junta códigos de commits e PRs, sem duplicar, ordenados', () => {
  const commits = [
    { sha: 'c1', mensagem: 'feat: X (PRJ-12.3)', pr: 699 },
    { sha: 'c2', mensagem: 'fix: de novo PRJ-12.3', pr: 699 },
    { sha: 'c3', mensagem: 'chore: nada', pr: 700 },
  ]
  const prs = { 699: { titulo: 'feat: X (PRJ-12.3)', corpo: 'Também PRJ-2.1 e PRJ-12' }, 700: { titulo: 'develop → main', corpo: null } }
  assert.deepEqual(codigosPublicados(commits, prs), [{ codigo: 'PRJ-2.1', prs: [699] }, { codigo: 'PRJ-12.3', prs: [699] }])
  assert.deepEqual(codigosPublicados([{ sha: 'c', mensagem: 'PRJ-1.1', pr: null }]), [{ codigo: 'PRJ-1.1', prs: [] }])
})

test('texto da atualização em America/Sao_Paulo com commit curto e PR', () => {
  const agora = new Date('2026-11-23T18:05:00Z')
  assert.equal(dataHoraSp(agora), '23/11/2026 15:05')
  assert.equal(textoAtualizacao({ agora, sha: SHA, prs: [699] }), 'Publicado no PROD em 23/11/2026 15:05 (America/Sao_Paulo), commit abc1234, PR #699')
  assert.equal(textoAtualizacao({ agora, sha: SHA }), 'Publicado no PROD em 23/11/2026 15:05 (America/Sao_Paulo), commit abc1234')
  assert.ok(jaRegistrado(['outra', textoAtualizacao({ agora, sha: SHA })], SHA))
  assert.ok(!jaRegistrado(['Publicado no PROD em 01/11/2026 10:00 (America/Sao_Paulo), commit 9999999'], SHA))
})

// Dataverse falso: responde pelas rotas que o script usa e registra as escritas.
function dataverseFalso({ tabelas = true, etapas = {}, atualizacoes = [] } = {}) {
  const escritas = []
  const json = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) })
  const fetch = async (url, init) => {
    const caminho = decodeURIComponent(url.split('/api/data/v9.2/')[1])
    if (init.method === 'GET' && caminho.startsWith('EntityDefinitions')) {
      const nome = /LogicalName='([^']+)'/.exec(caminho)[1]
      return tabelas ? json(200, { EntitySetName: `${nome}s` }) : json(404, { error: { message: 'Could not find entity' } })
    }
    if (init.method === 'GET' && caminho.startsWith('cr40f_projetoetapas(cr40f_codigo=')) {
      const codigo = /cr40f_codigo='([^']+)'/.exec(caminho)[1]
      return etapas[codigo] ? json(200, etapas[codigo]) : json(404, { error: { message: 'Does Not Exist' } })
    }
    if (init.method === 'GET' && caminho.startsWith('cr40f_projetoatualizacaos?')) {
      const id = /_cr40f_etapa_value eq ([\w-]+)/.exec(caminho)[1]
      return json(200, { value: atualizacoes.filter((a) => a.etapa === id).map((a) => ({ cr40f_texto: a.texto })) })
    }
    if (init.method === 'PATCH' || init.method === 'POST') {
      escritas.push({ metodo: init.method, caminho, corpo: JSON.parse(init.body) })
      return { ok: true, status: 204, json: async () => null, text: async () => '' }
    }
    return json(400, { error: { message: `rota inesperada ${caminho}` } })
  }
  return { api: criarApi({ fetch, baseUrl: 'https://orgf261ae8e.crm2.dynamics.com/', token: 't' }), escritas }
}

test('grava etapa encontrada, avisa a não encontrada e não duplica a já registrada', async () => {
  const agora = new Date('2026-11-23T18:05:00Z')
  const { api, escritas } = dataverseFalso({
    etapas: { 'PRJ-1.1': { cr40f_projetoetapaid: 'e1', _cr40f_projeto_value: 'p1' }, 'PRJ-2.1': { cr40f_projetoetapaid: 'e2', _cr40f_projeto_value: 'p2' } },
    atualizacoes: [{ etapa: 'e2', texto: textoAtualizacao({ agora: new Date('2026-11-23T10:00:00Z'), sha: SHA }) }],
  })
  const codigos = [{ codigo: 'PRJ-1.1', prs: [699] }, { codigo: 'PRJ-2.1', prs: [] }, { codigo: 'PRJ-9.9', prs: [] }]
  const r = await gravarPublicacoes({ api, codigos, sha: SHA, agora })
  assert.deepEqual(r.gravados, ['PRJ-1.1'])
  assert.deepEqual(r.jaRegistrados, ['PRJ-2.1'])
  assert.deepEqual(r.naoEncontrados, ['PRJ-9.9'])
  assert.deepEqual(r.falhas, [])
  assert.equal(escritas.length, 2)
  assert.deepEqual(escritas[0], { metodo: 'PATCH', caminho: 'cr40f_projetoetapas(e1)', corpo: { cr40f_publicadoprod: '2026-11-23T18:05:00.000Z' } })
  assert.deepEqual(escritas[1].corpo, {
    cr40f_name: 'Publicado no PROD - PRJ-1.1', cr40f_data: '2026-11-23T18:05:00.000Z', cr40f_autor: 100000002,
    cr40f_texto: 'Publicado no PROD em 23/11/2026 15:05 (America/Sao_Paulo), commit abc1234, PR #699', cr40f_eprova: false,
    'cr40f_Projeto@odata.bind': '/cr40f_projetos(p1)', 'cr40f_Etapa@odata.bind': '/cr40f_projetoetapas(e1)',
  })
  const md = resumoMarkdown({ codigos, resultado: r })
  assert.match(md, /Gravados: PRJ-1\.1/)
  assert.match(md, /não encontrados no PROD: PRJ-9\.9/)
})

test('tabela ausente no PROD vira aviso e não grava nada', async () => {
  const { api, escritas } = dataverseFalso({ tabelas: false })
  const r = await gravarPublicacoes({ api, codigos: [{ codigo: 'PRJ-1.1', prs: [] }], sha: SHA })
  assert.deepEqual(r.tabelasAusentes, ['cr40f_projeto', 'cr40f_projetoetapa', 'cr40f_projetoatualizacao'])
  assert.equal(escritas.length, 0)
  assert.match(resumoMarkdown({ codigos: [{ codigo: 'PRJ-1.1', prs: [] }], resultado: r }), /tabelas ausentes no PROD/)
})

test('sem códigos não chama o Dataverse', async () => {
  const api = { get: async () => { throw new Error('não devia chamar') } }
  const r = await gravarPublicacoes({ api, codigos: [], sha: SHA })
  assert.deepEqual(r.gravados, [])
})

test('falha numa etapa vira aviso e as outras seguem', async () => {
  const { api } = dataverseFalso({ etapas: { 'PRJ-1.1': { cr40f_projetoetapaid: 'e1', _cr40f_projeto_value: 'p1' }, 'PRJ-2.1': { cr40f_projetoetapaid: 'e2', _cr40f_projeto_value: 'p2' } } })
  const original = api.patch
  let primeira = true
  api.patch = async (...a) => { if (primeira) { primeira = false; throw new Error('HTTP 500') } return original(...a) }
  const r = await gravarPublicacoes({ api, codigos: [{ codigo: 'PRJ-1.1', prs: [] }, { codigo: 'PRJ-2.1', prs: [] }], sha: SHA })
  assert.deepEqual(r.falhas, [{ codigo: 'PRJ-1.1', motivo: 'HTTP 500' }])
  assert.deepEqual(r.gravados, ['PRJ-2.1'])
})
