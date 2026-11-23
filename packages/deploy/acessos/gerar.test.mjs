import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { CAMINHO_COLUNAS, CAMINHO_GERADO, CAMINHO_MAPA, COPIAR_SEM, PROIBIDO, gerarPerfis, hashDe } from './gerar.mjs'

const mapa = JSON.parse(readFileSync(CAMINHO_MAPA, 'utf8'))
const colunas = JSON.parse(readFileSync(CAMINHO_COLUNAS, 'utf8'))
const gerado = gerarPerfis(mapa, colunas)
const AREAS = { operacional: 'Operacional', financeiro: 'Financeiro', frota: 'Frota', rh: 'RH' }
const comDelete = (papel) => Object.keys(papel.tabelas).filter((t) => papel.tabelas[t].Delete).sort()
const coluna = (perfil, tabela, nome) => gerado.colunas[perfil].find((p) => p.tabela === tabela && p.coluna === nome)

test('gera 10 papeis e 8 perfis de coluna', () => {
  assert.equal(Object.keys(gerado.papeis).length, 10)
  assert.equal(Object.keys(gerado.colunas).length, 8)
  assert.ok(gerado.papeis['Perfil - Base'])
  assert.ok(gerado.papeis['Perfil - Administrador de acessos'])
  assert.equal(gerado.colunas['Perfil - Base'], undefined)
})

test('Operador so exclui linhas-filhas; Gestor exclui tambem nas tabelas donas', () => {
  for (const [area, rotulo] of Object.entries(AREAS)) {
    const modulo = mapa.modulos[area]
    const filhas = [...(modulo.filhas ?? [])].sort()
    const donasEFilhas = [...new Set([...(modulo.donas ?? []), ...filhas])].sort()
    assert.deepEqual(comDelete(gerado.papeis[`Perfil - ${rotulo} - Operador`]), filhas, `${area} operador`)
    assert.deepEqual(comDelete(gerado.papeis[`Perfil - ${rotulo} - Gestor`]), donasEFilhas, `${area} gestor`)
  }
})

test('classes viram as acoes combinadas', () => {
  const fin = gerado.papeis['Perfil - Financeiro - Operador'].tabelas
  assert.deepEqual(fin.cr40f_financeiro, { Append: 'Global', AppendTo: 'Global', Create: 'Global', Read: 'Global', Write: 'Global' })
  assert.deepEqual(fin.cr40f_reservadeveculos, { Append: 'Global', AppendTo: 'Global', Read: 'Global', Write: 'Global' })
  assert.deepEqual(fin.cr40f_funcionarios, { AppendTo: 'Global', Read: 'Global' })
})

test('Base: visao propria, registro de erro so cria, sem tabela de area', () => {
  const base = gerado.papeis['Perfil - Base']
  assert.deepEqual(base.copiarDe, ['App Opener', 'Basic User'])
  assert.equal(base.app, 'cr40f_ModelDrivenBetinhos')
  assert.deepEqual(base.tabelas.cr40f_visaodetabela, { Append: 'Basic', AppendTo: 'Basic', Create: 'Basic', Delete: 'Basic', Read: 'Global', Write: 'Basic' })
  assert.deepEqual(base.tabelas.cr40f_errodosistema, { Append: 'Global', AppendTo: 'Global', Create: 'Global' })
  assert.equal(base.tabelas.annotation.Delete, 'Basic')
  for (const tabela of ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_veiculos', 'cr40f_reservadeveculos']) assert.equal(base.tabelas[tabela], undefined, tabela)
})

test('Administrador de acessos le o historico e nao recebe papel de atribuir', () => {
  const adm = gerado.papeis['Perfil - Administrador de acessos']
  assert.deepEqual(adm.tabelas, { cr40f_acessohistorico: { Read: 'Global' } })
  assert.deepEqual(Object.keys(adm.privilegios).sort(), ['prvReadRole', 'prvReadTeam', 'prvReadUser'])
})

test('nenhum papel toca cr40f_segredo nem pede privilegio proibido', () => {
  const proibido = new RegExp(gerado.proibido)
  for (const [nome, papel] of Object.entries(gerado.papeis)) {
    assert.equal(papel.tabelas.cr40f_segredo, undefined, nome)
    for (const priv of Object.keys(papel.privilegios)) assert.ok(!proibido.test(priv), `${nome}: ${priv}`)
  }
})

test('a trava pega personalizacao e segredo e poupa o uso comum', () => {
  const proibido = new RegExp(PROIBIDO)
  for (const p of ['prvAssignRole', 'prvWriteWebResource', 'prvReadcr40f_segredo', 'prvPublishCustomization', 'prvCreateWorkflow']) assert.ok(proibido.test(p), p)
  for (const p of ['prvWriteUserQuery', 'prvCreateWorkflowSession', 'prvReadRole', 'prvReadWebResource', 'prvReadcr40f_financeiro']) assert.ok(!proibido.test(p), p)
  const copiarSem = new RegExp(COPIAR_SEM)
  for (const p of ['prvReadcr40f_financeiro', 'prvAppendTonew_curriculo']) assert.ok(copiarSem.test(p), p)
  assert.ok(!copiarSem.test('prvReadNote'))
})

test('colunas: toda permissao le e o Gestor soma o Operador', () => {
  for (const rotulo of Object.values(AREAS)) {
    const operador = gerado.colunas[`Perfil - ${rotulo} - Operador`]
    const gestor = gerado.colunas[`Perfil - ${rotulo} - Gestor`]
    for (const p of [...operador, ...gestor]) assert.equal(p.ler, true)
    for (const p of operador) {
      const noGestor = gestor.find((g) => g.tabela === p.tabela && g.coluna === p.coluna)
      assert.ok(noGestor, `${rotulo}: ${p.tabela}.${p.coluna}`)
      if (p.editar) assert.equal(noGestor.editar, true)
    }
  }
})

test('colunas: matriz da spec', () => {
  assert.equal(coluna('Perfil - Financeiro - Operador', 'cr40f_financeiro', 'cr40f_valor').editar, false)
  assert.equal(coluna('Perfil - Financeiro - Gestor', 'cr40f_financeiro', 'cr40f_valor').editar, true)
  assert.equal(coluna('Perfil - RH - Operador', 'cr40f_funcionarios', 'cr40f_numerodocpf'), undefined)
  assert.equal(coluna('Perfil - RH - Gestor', 'cr40f_funcionarios', 'cr40f_numerodocpf').editar, true)
  assert.equal(coluna('Perfil - Frota - Operador', 'cr40f_funcionarios', 'cr40f_cnh').editar, false)
  assert.equal(coluna('Perfil - Frota - Operador', 'cr40f_funcionarios', 'cr40f_numerodocpf'), undefined)
})

test('contato do passageiro fica fora ate o corte', () => {
  const protegidas = ['cr40f_telefone', 'cr40f_email', 'cr40f_datadenascimento', 'cr40f_enderecodesaida']
  for (const [nome, lista] of Object.entries(gerado.colunas))
    for (const p of lista) assert.ok(!(p.tabela === 'cr40f_bancodedados' && protegidas.includes(p.coluna)), `${nome}: ${p.coluna}`)
})

test('colunas: senhas em nenhum perfil', () => {
  for (const [nome, lista] of Object.entries(gerado.colunas)) assert.ok(!lista.some((p) => p.coluna === 'cr40f_loginsesenhas'), nome)
})

test('grupo de colunas desconhecido falha', () => {
  const errado = structuredClone(colunas)
  errado.perfis.rh.operador.ler.push('cr40f_funcionarios.nada')
  assert.throws(() => gerarPerfis(mapa, errado), /Grupo de colunas desconhecido: cr40f_funcionarios\.nada/)
})

test('perfis.gerado.json esta em dia com os mapas', () => {
  const emDisco = readFileSync(CAMINHO_GERADO, 'utf8').replace(/\r\n/g, '\n')
  assert.equal(emDisco, JSON.stringify(gerado, null, 2) + '\n', 'Rode: node packages/deploy/acessos/gerar.mjs')
})

test('o hash do perfis.gerado.json esta numa migration', () => {
  const hash = hashDe(readFileSync(CAMINHO_GERADO, 'utf8'))
  const pasta = join(dirname(CAMINHO_GERADO), '..', 'migrations')
  const achou = readdirSync(pasta)
    .filter((f) => f.endsWith('.ps1'))
    .some((f) => readFileSync(join(pasta, f), 'utf8').includes(hash))
  assert.ok(
    achou,
    'Regenerou os perfis? Crie uma migration nova chamando Invoke-PerfisDeAcesso com o hash novo (node packages/deploy/acessos/gerar.mjs --hash).',
  )
})
