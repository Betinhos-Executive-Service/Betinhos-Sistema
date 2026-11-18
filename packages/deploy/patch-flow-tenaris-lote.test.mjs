import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MSG_PAYLOAD_ANTIGO, estado, partes as partesDoModulo, problemasDeReferencia, transformar } from './patch-flow-tenaris-lote.mjs'

// Cópia sanitizada da definição do PROD (18/11/2026): sem e-mails, IDs de arquivo nem metadata.
const fixture = () => JSON.parse(readFileSync(new URL('./patch-flow-tenaris-lote.fixture.json', import.meta.url), 'utf8'))
const partes = (cd) => {
  const { definition: d, scope, lote } = partesDoModulo(cd)
  return { d, scope, lote, servico: lote.Loop_Servicos.actions.Scope_Servico?.actions }
}

test('fixture está no formato original e sem referências quebradas', () => {
  const cd = fixture()
  assert.equal(estado(cd), 'original')
  assert.deepEqual(problemasDeReferencia(cd.properties.definition), [])
})

test('transforma sem referências quebradas e é idempotente', () => {
  const { clientdata, mudou } = transformar(fixture())
  assert.equal(mudou, true)
  assert.equal(estado(clientdata), 'final')
  assert.deepEqual(problemasDeReferencia(clientdata.properties.definition), [])
  const again = transformar(clientdata)
  assert.equal(again.mudou, false)
  assert.equal(again.clientdata, clientdata)
})

test('não deixa referência às ações e variáveis removidas', () => {
  const texto = JSON.stringify(transformar(fixture()).clientdata)
  for (const n of ['Select_Responsável', 'Select_Pax_1', 'Compose_TodasPessoas', 'Filter_SemVazios', 'Loop_Dedup', 'Filter_Ocorr', 'Compose_Telefone', 'Compose_Email', 'Compose_Departamento', 'Compose_PaxSalvo', 'Compose_PaxAtual', 'Condition_PaxMudou', 'List_rows_ServicosPax', 'varPessoasUnicas', 'varNomesVistos', 'varGUIDsVistos']) {
    assert.ok(!texto.includes(n), `${n} ainda aparece`)
  }
})

test('Loop_UpsertBD percorre pessoas do script e coalesce pelo item', () => {
  const { lote } = partes(transformar(fixture()).clientdata)
  const loop = lote.Loop_UpsertBD
  assert.equal(loop.foreach, "@triggerBody()?['pessoas']")
  assert.deepEqual(loop.runAfter, { List_rows_BancodeDados_Completo: ['Succeeded'] })
  assert.deepEqual(loop.runtimeConfiguration, { concurrency: { repetitions: 1 } })
  assert.deepEqual(Object.keys(loop.actions).sort(), ['Condition_nome_nao_existe_ainda', 'Filter_BDLocal'])
  const update = loop.actions.Condition_nome_nao_existe_ainda.else.actions.Condition_BD_Mudou.actions.Update_BD_Existente
  assert.equal(update.inputs.parameters['item/cr40f_telefone'],
    "@if(empty(trim(coalesce(items('Loop_UpsertBD')?['telefone'], ''))), first(body('Filter_BDLocal'))?['cr40f_telefone'], trim(coalesce(items('Loop_UpsertBD')?['telefone'], '')))")
  assert.deepEqual(lote.List_rows_BancodeDados_Completo.runAfter, { Filter_array_Tenaris: ['Succeeded'] })
  assert.equal(loop.actions.Condition_nome_nao_existe_ainda.actions.Append_to_array_variable_varGUIDMap.inputs.name, 'varGUIDMap')
})

test('payload sem pessoas termina com erro claro antes do lote', () => {
  const { d, scope } = partes(transformar(fixture()).clientdata)
  const c = scope.Condition_PayloadAntigo
  assert.equal(c.expression, "@equals(triggerBody()?['pessoas'], null)")
  assert.equal(c.actions.Terminate_PayloadAntigo.inputs.runError.message, MSG_PAYLOAD_ANTIGO)
  assert.equal(c.actions.Run_script_PayloadAntigo.inputs.parameters['ScriptParameters/status'], 'Erro')
  assert.deepEqual(scope.Condition_linhas_mais_que_0.runAfter, { Condition_PayloadAntigo: ['Succeeded'] })
  const props = d.triggers.manual.inputs.schema.properties
  assert.equal(props.pessoas.type, 'array')
  assert.equal(props.versao.type, 'integer')
  assert.equal(d.triggers.manual.runtimeConfiguration, undefined)
})

test('serviço com erro vai para varFalhas sem derrubar o lote', () => {
  const { d, lote, servico } = partes(transformar(fixture()).clientdata)
  const acoes = lote.Loop_Servicos.actions
  assert.deepEqual(Object.keys(acoes), ['Scope_Servico', 'Filter_ErroServico', 'Append_to_array_variable_varFalhas'])
  assert.deepEqual(acoes.Filter_ErroServico.runAfter, { Scope_Servico: ['Failed', 'TimedOut'] })
  assert.equal(acoes.Filter_ErroServico.inputs.from, "@result('Scope_Servico')")
  assert.equal(acoes.Append_to_array_variable_varFalhas.inputs.name, 'varFalhas')
  assert.ok(servico.Upsert_Geral.inputs.parameters['item/new_snapshotsharepoint'])
  assert.equal(d.actions.Initialize_variable_varFalhas.inputs.variables[0].type, 'array')
  assert.deepEqual(d.actions.Scope.runAfter, { Initialize_variable_varFalhas: ['Succeeded'] })
})

test('painel recebe status do lote inteiro, executadoEm e falhas; e-mail de aviso não falha a execução', () => {
  const { scope } = partes(transformar(fixture()).clientdata)
  const p = scope.Run_script.inputs.parameters
  assert.match(p['ScriptParameters/status'], /actions\('Condition_linhas_mais_que_0'\)\?\['status'\]/)
  assert.ok(!p['ScriptParameters/status'].includes('?[0]'))
  assert.equal(p['ScriptParameters/executadoEm'], "@{triggerBody()?['executadoEm']}")
  assert.equal(p['ScriptParameters/falhas'], "@{string(variables('varFalhas'))}")
  assert.equal(p.drive, 'fixture')
  assert.deepEqual(scope.Scope_1_1.runAfter.Run_script, ['Succeeded', 'Failed', 'Skipped', 'TimedOut'])
  const aviso = scope.Condition_FalhasServico
  assert.deepEqual(aviso.runAfter, { Delay: ['Succeeded'] })
  assert.ok(aviso.actions.Send_an_email_Falhas_Servico.inputs.parameters['emailMessage/Body'].includes('/runs/'))
  assert.ok(!JSON.stringify(aviso).includes('Terminate'))
})

test('vínculos: apaga só o passageiro que saiu e cria depois', () => {
  const { servico } = partes(transformar(fixture()).clientdata)
  assert.deepEqual(servico.List_rows_Geral.runAfter, {})
  assert.deepEqual(servico.Compose_Status.runAfter, { List_rows_Geral: ['Succeeded'] })
  assert.match(servico.Select_PaxNativos.inputs.select, /Passageiro 4 - GUID/)
  assert.match(servico.Filter_VinculosRemover.inputs.where, /not\(contains\(body\('Select_PaxNativos'\)/)
  // pessoas[] incompleto (passageiro fora do varGUIDMap) não apaga vínculo.
  assert.match(servico.Filter_VinculosRemover.inputs.where, /greaterOrEquals\(sub\(length\(union\(body\('Select_PaxNativos'\), createArray\('-'\)\)\), 1\), length\(body\('Filter_PaxValidos'\)\)\)/)
  assert.equal(servico.Loop_Delete_Pax.foreach, "@body('Filter_VinculosRemover')")
  assert.deepEqual(Object.keys(servico.Loop_Delete_Pax.actions), ['Delete_a_row'])
  assert.deepEqual(servico.Loop_Create_Pax.runAfter, { Loop_Delete_Pax: ['Succeeded'] })
})

test('recusa formato inesperado e patch pela metade', () => {
  const sem = fixture()
  delete partes(sem).lote.Loop_UpsertBD.actions.Filter_Ocorrencias
  assert.throws(() => transformar(sem), /patch dos contatos/)
  const semPaxMudou = fixture()
  delete partes(semPaxMudou).lote.Loop_Servicos.actions.Condition_PaxMudou
  assert.throws(() => transformar(semPaxMudou), /Condition_PaxMudou/)
  const metade = transformar(fixture()).clientdata
  partes(metade).lote.Loop_Dedup = partes(fixture()).lote.Loop_Dedup
  assert.throws(() => transformar(metade), /pela metade/)
})

test('mantém acentos sem corromper', () => {
  const texto = JSON.stringify(transformar(fixture()).clientdata)
  assert.ok(texto.includes('Concluído'))
  assert.ok(texto.includes('serviço(s)'))
  assert.ok(!/Ã|Â|â€/.test(texto))
})
