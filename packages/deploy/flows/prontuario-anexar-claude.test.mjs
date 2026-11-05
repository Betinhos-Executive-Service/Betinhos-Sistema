import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./prontuario-anexar-claude.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)
const notesUrl = new URL('../../../apps/shell/src/pages/funcionarios/data/notes.ts', import.meta.url)

const todas = new Map()
const percorrer = (acoes) => {
  for (const [nome, acao] of Object.entries(acoes ?? {})) {
    todas.set(nome, acao)
    percorrer(acao.actions)
    percorrer(acao.else?.actions)
  }
}
percorrer(flow.actions)
const try_ = flow.actions.Try.actions
const sim = try_.Liberado.actions
const cada = sim.Salvar_cada.actions

test('gatilho HTTP POST com o corpo combinado com o script', () => {
  const g = flow.triggers.manual
  assert.equal(g.type, 'Request')
  assert.equal(g.inputs.method, 'POST')
  assert.deepEqual(Object.keys(g.inputs.schema.properties).sort(), ['arquivos', 'liberacaoId', 'texto', 'titulo', 'token'])
  assert.deepEqual(Object.keys(g.inputs.schema.properties.arquivos.items.properties).sort(), ['conteudoBase64', 'mimeType', 'nome'])
})

test('consome a liberação (Custom API) antes de salvar qualquer arquivo, com o tamanho calculado do base64', () => {
  const consumir = try_.Consumir
  assert.equal(consumir.inputs.host.operationId, 'PerformUnboundAction')
  assert.equal(consumir.inputs.parameters.actionName, 'cr40f_ConsumirAnexoProntuario')
  assert.deepEqual(consumir.runAfter, { Tamanhos: ['Succeeded'] })
  assert.match(consumir.inputs.parameters['item/ArquivosJson'], /body\('Tamanhos'\)/)
  assert.match(consumir.inputs.parameters['item/Token'], /triggerBody\(\)\?\['token'\]/)
  // Nada grava no SharePoint fora do ramo "Liberado" (Ok = true), que só roda depois do Consumir.
  assert.deepEqual(try_.Liberado.runAfter, { Consumir: ['Succeeded'] })
  assert.deepEqual(try_.Liberado.expression, { and: [{ equals: ["@outputs('Consumir')?['body/Ok']", true] }] })
  const criarArquivo = [...todas.entries()].filter(([, a]) => a.inputs?.host?.operationId === 'CreateFile').map(([n]) => n)
  assert.deepEqual(criarArquivo, ['Criar_arquivo'])
  assert.ok(cada.Criar_arquivo)
  // Fórmula do tamanho: 4 caracteres base64 = 3 bytes, menos o padding.
  const tamanho = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
  for (const n of [0, 1, 2, 3, 10, 1000]) assert.equal(tamanho(Buffer.alloc(n).toString('base64')), n)
  assert.match(try_.Tamanhos.inputs.select.tamanho, /^@sub\(div\(mul\(length\(coalesce\(item\(\)\?\['conteudoBase64'\], ''\)\), 3\), 4\), if\(endsWith\(.*'=='\), 2, if\(endsWith\(.*'='\), 1, 0\)\)\)$/)
})

test('recusa da API vira 403 (liberação) ou 400 (arquivos) com a mensagem da API, sem salvar', () => {
  const nao = try_.Liberado.else.actions
  assert.equal(nao.Recusar_status.inputs.value, "@if(equals(outputs('Consumir')?['body/Codigo'], 'ARQUIVOS'), 400, 403)")
  assert.equal(nao.Recusar_corpo.inputs.value.sucesso, false)
  assert.match(nao.Recusar_corpo.inputs.value.erro, /body\/Erro/)
  assert.ok(!JSON.stringify(nao).includes('CreateFile'))
})

test('salva um por vez na pasta devolvida, com o nome final da API e o conteúdo do mesmo índice', () => {
  assert.equal(sim.Salvar_cada.runtimeConfiguration.concurrency.repetitions, 1)
  assert.equal(sim.Salvar_cada.foreach, "@range(0, length(outputs('Finais')))")
  const p = cada.Criar_arquivo.inputs.parameters
  assert.equal(p.dataset, '__SITE_URL__')
  assert.equal(p.folderPath, "@{concat('/Documentos Compartilhados/', outputs('Consumir')?['body/Pasta'])}")
  assert.equal(p.name, "@{outputs('Arquivo')?['nome']}")
  assert.equal(p.body, "@base64ToBinary(triggerBody()?['arquivos'][items('Salvar_cada')]?['conteudoBase64'])")
  // O id entra na lista de limpeza logo depois do upload, antes de qualquer outro passo.
  assert.deepEqual(cada.Guardar_enviado.runAfter, { Criar_arquivo: ['Succeeded'] })
  assert.equal(cada.Guardar_enviado.inputs.name, 'enviados')
})

test('a nota sai no mesmo HTML de buildNoteHtml da tela (wrapper, parágrafos e links data-sp-*)', async () => {
  const { buildNoteHtml, textToNoteHtml, SP_SITE: site } = await import(notesUrl.href)
  const texto = 'RG frente e verso\n\nConferido <ok>\nAnexado por Ana & Cia via Claude'
  const anexo = { nome: '20261105-123312 rg & cpf.jpg', caminho: '/Documentos Compartilhados/Funcionarios/DEV/abc/Anotacoes/20261105-123312 rg & cpf.jpg', id: '%252fDocumentos%2bCompartilhados%252fx.jpg', mime: 'image/jpeg', tamanho: 2048 }
  // CorpoHtml do plugin = textToNoteHtml sem o wrapper (o C# tem teste com o mesmo formato).
  const completo = textToNoteHtml(texto)
  const wrapperDoFlow = sim.Criar_nota.inputs.parameters['item/notetext'].split('@{')[0]
  assert.ok(completo.startsWith(wrapperDoFlow), 'wrapper do flow difere do notes.ts')
  const corpoHtml = completo.slice(wrapperDoFlow.length, -'</div>'.length)

  // Emula as expressões de "Campos" (escape HTML e href por uriComponent).
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  for (const campo of ['caminho', 'id', 'nome']) assert.match(cada.Campos.inputs[campo], /^@\{replace\(replace\(replace\(replace\(.*'&', '&amp;'\), '<', '&lt;'\), '>', '&gt;'\), '"', '&quot;'\)\}$/)
  assert.equal(cada.Campos.inputs.href, "@{concat('__SITE_URL__', replace(uriComponent(coalesce(body('Criar_arquivo')?['Path'], '')), '%2F', '/'))}")
  const valores = {
    "outputs('Campos')?['href']": site + encodeURIComponent(anexo.caminho).replace(/%2F/g, '/'),
    "outputs('Campos')?['caminho']": esc(anexo.caminho),
    "outputs('Campos')?['id']": esc(anexo.id),
    "outputs('Campos')?['nome']": esc(anexo.nome),
    "outputs('Arquivo')?['mimeType']": anexo.mime,
    "outputs('Arquivo')?['tamanho']": String(anexo.tamanho),
  }
  const render = (tpl, v) => tpl.replace(/@\{([^}]+)\}/g, (_, expr) => { assert.ok(expr in v, `expressão sem valor: ${expr}`); return v[expr] })
  const link = render(cada.Acrescentar_link.inputs.value, valores)
  const nota = render(sim.Criar_nota.inputs.parameters['item/notetext'], { "outputs('Consumir')?['body/CorpoHtml']": corpoHtml, "variables('links')": link })
  // __SITE_URL__ = SP_SITE no provisionamento; para este caminho uriComponent inteiro = encodeURIComponent por segmento.
  assert.equal(nota, buildNoteHtml(texto, [anexo]))
  assert.match(nota, /data-sp-path="\/Documentos Compartilhados\/Funcionarios\/DEV\/abc\/Anotacoes\/20261105-123312 rg &amp; cpf\.jpg"/)
})

test('uma única anotação, ligada ao funcionário, depois de todos os uploads', () => {
  const notas = [...todas.values()].filter((a) => a.inputs?.host?.operationId === 'CreateRecord')
  assert.equal(notas.length, 1)
  const p = sim.Criar_nota.inputs.parameters
  assert.equal(p.entityName, 'annotations')
  assert.equal(p['item/subject'], "@{outputs('Consumir')?['body/Titulo']}")
  assert.equal(p['item/__NAV_ANOTACAO__@odata.bind'], "/__SET_FUNCIONARIOS__(@{outputs('Consumir')?['body/FuncionarioId']})")
  assert.deepEqual(sim.Criar_nota.runAfter, { Salvar_cada: ['Succeeded'] })
  assert.deepEqual(sim.Sucesso_status.runAfter, { Criar_nota: ['Succeeded'] })
  assert.equal(sim.Sucesso_status.inputs.value, 200)
  assert.equal(sim.Sucesso_corpo.inputs.value.sucesso, true)
  assert.match(sim.Sucesso_corpo.inputs.value.annotationId, /body\('Criar_nota'\)\?\['annotationid'\]/)
})

test('falha depois de subir arquivos apaga os que subiram e responde 500 genérico', () => {
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
  const c = flow.actions.Catch.actions
  assert.equal(c.Limpar.foreach, "@variables('enviados')")
  assert.equal(c.Limpar.actions.Apagar_arquivo.inputs.host.operationId, 'DeleteFile')
  assert.equal(c.Limpar.actions.Apagar_arquivo.inputs.parameters.id, "@{items('Limpar')?['id']}")
  assert.deepEqual(c.Erro_status.runAfter, { Limpar: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] })
  assert.equal(c.Erro_status.inputs.value, 500)
  assert.doesNotMatch(JSON.stringify(c.Erro_corpo.inputs.value), /outputs|body\(|result\(/)
  assert.deepEqual(flow.actions.Responder.runAfter, { Catch: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] })
  assert.equal(flow.actions.Responder.inputs.statusCode, "@variables('httpStatus')")
  assert.equal(flow.actions.Falhou.actions.Marcar_falha.type, 'Terminate')
})

test('tokens do script presentes e nenhum dado de ambiente no repo', () => {
  for (const t of ['__SITE_URL__', '__SET_FUNCIONARIOS__', '__NAV_ANOTACAO__']) assert.ok(raw.includes(t), t)
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft|sig=/i)
})

test('toda ação citada em expressões existe', () => {
  for (const [, nome] of raw.matchAll(/(?:outputs|body|items|result)\('([^']+)'\)/g)) assert.ok(todas.has(nome), `ação inexistente: ${nome}`)
})
