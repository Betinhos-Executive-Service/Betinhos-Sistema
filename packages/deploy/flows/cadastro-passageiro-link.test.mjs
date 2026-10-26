import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./cadastro-passageiro-link.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)

const todas = new Map()
let total = 0
const percorrer = (acoes) => {
  for (const [nome, acao] of Object.entries(acoes ?? {})) {
    todas.set(nome, acao); total++
    percorrer(acao.actions)
    percorrer(acao.else?.actions)
    percorrer(acao.default?.actions)
    for (const c of Object.values(acao.cases ?? {})) percorrer(c.actions)
  }
}
percorrer(flow.actions)
const porTipo = (tipo) => [...todas.values()].filter((a) => a.type === tipo)
const op = (id) => [...todas.values()].filter((a) => a.inputs?.host?.operationId === id)

test('gatilho HTTP POST com JSON e só o hash do token', () => {
  const gatilho = flow.triggers.manual
  assert.equal(gatilho.type, 'Request')
  assert.equal(gatilho.kind, 'Http')
  assert.equal(gatilho.inputs.method, 'POST')
  assert.deepEqual(Object.keys(gatilho.inputs.schema.properties).sort(), ['email', 'fotoBase64', 'hash', 'op', 'passageiroId', 'telefone'])
})

test('o token puro nunca é usado; o link é buscado por cr40f_tokenhash', () => {
  assert.doesNotMatch(raw, /\['token'\]|"token"/)
  const busca = todas.get('Buscar_link')
  assert.equal(busca.inputs.host.operationId, 'ListRecords')
  assert.match(busca.inputs.parameters.$filter, /^cr40f_tokenhash eq '@\{toLower\(trim\(coalesce\(triggerBody\(\)\?\['hash'\]/)
  assert.equal(busca.inputs.parameters.$top, 1)
})

test('operações ler, foto e salvar no Switch; outra op dá 400', () => {
  const sw = todas.get('Por_operacao')
  assert.equal(sw.type, 'Switch')
  assert.deepEqual(Object.values(sw.cases).map((c) => c.case).sort(), ['foto', 'ler', 'salvar'])
})

test('códigos de resposta previstos e corpo de erro genérico', () => {
  const status = new Set(porTipo('SetVariable').filter((a) => a.inputs.name === 'httpStatus').map((a) => a.inputs.value))
  assert.deepEqual([...status].sort(), [200, 400, 404, 410, 429, 500])
  for (const a of porTipo('SetVariable').filter((x) => x.inputs.name === 'corpo' && x.inputs.value.ok === false)) {
    assert.deepEqual(Object.keys(a.inputs.value).sort(), ['codigo', 'ok'])
  }
  const responder = flow.actions.Responder
  assert.equal(responder.type, 'Response')
  assert.equal(responder.inputs.statusCode, "@variables('httpStatus')")
  assert.deepEqual(responder.runAfter, { Catch: ['Succeeded', 'Skipped'] })
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
})

test('link vencido ou revogado responde 410 e marca Expirado (3)', () => {
  const venc = todas.get('Vencido_ou_revogado')
  const expr = JSON.stringify(venc.expression)
  assert.match(expr, /cr40f_expiraem/)
  assert.match(expr, /utcNow/)
  assert.equal(todas.get('Gravar_expirado').inputs.parameters.item.cr40f_status, 3)
  assert.equal(todas.get('Status_erro_410').inputs.value, 410)
})

test('escopo: passageiro do link, filhos por _cr40f_geral_value, fallback passageiro1..4', () => {
  assert.match(todas.get('Listar_filhos').inputs.parameters.$filter, /^_cr40f_geral_value eq /)
  assert.equal(todas.get('Listar_filhos').inputs.parameters.$select, '_cr40f_bancodedados_value')
  for (const n of [1, 2, 3, 4]) assert.match(todas.get('Obter_reserva').inputs.parameters.$select, new RegExp(`_cr40f_passageiro${n}_value`))
  assert.match(todas.get('Escopo').inputs, /_cr40f_passageiro_value/)
})

test('salvar: passageiro fora do escopo 404, limite de 30 envios 429', () => {
  assert.match(JSON.stringify(todas.get('No_escopo').expression), /contains\(outputs\('Escopo'\)/)
  assert.deepEqual(todas.get('Dentro_do_limite').expression.less[1], 30)
  assert.equal(todas.get('Status_erro_404_passageiro').inputs.value, 404)
  assert.equal(todas.get('Status_erro_429').inputs.value, 429)
})

test('foto vira <passageiroId>.jpg no SharePoint com link de caminho (/:i:/r/), sem compartilhamento', () => {
  const criar = todas.get('Criar_arquivo')
  assert.equal(criar.inputs.host.operationId, 'CreateFile')
  assert.match(criar.inputs.parameters.name, /passageiroId.*\.jpg$/)
  assert.equal(criar.inputs.parameters.folderPath, '__FOLDER_PATH__')
  assert.equal(op('CreateSharingLink').length, 0, 'sem link de compartilhamento')
  const guardar = todas.get('Guardar_link_foto')
  assert.deepEqual(guardar.runAfter, { Criar_arquivo: ['Succeeded'] })
  assert.equal(guardar.inputs.value, "@{concat('https://', uriHost('__SITE_URL__'), '/:i:/r', uriPath('__SITE_URL__'), replace(uriComponent(body('Criar_arquivo')?['Path']), '%2F', '/'))}")
})

test('ler: passageiros em paralelo e sem foto (a foto vem da op foto)', () => {
  const loop = todas.get('Por_passageiro')
  assert.ok(loop.runtimeConfiguration.concurrency.repetitions >= 10, 'loop paralelo')
  assert.ok(!('Ler_foto' in loop.actions) && !('Tem_foto_lida' in loop.actions), 'o ler não baixa fotos')
  const incluir = todas.get('Incluir_passageiro')
  assert.deepEqual(incluir.runAfter, { Obter_passageiro: ['Succeeded'] })
  assert.match(incluir.inputs.value.temFoto, /new_linkdafoto/)
  assert.equal(incluir.inputs.value.foto, null)
})

test('foto: só passageiro do escopo, só da pasta Passageiros/Fotos, lida por caminho e sem derrubar a resposta', () => {
  const escopo = todas.get('No_escopo_foto')
  assert.equal(escopo.expression.equals[0], "@contains(outputs('Escopo'), toLower(trim(coalesce(triggerBody()?['passageiroId'], ''))))")
  assert.equal(escopo.else.actions.Status_erro_404_foto.inputs.value, 404)
  assert.equal(todas.get('Obter_passageiro_foto').inputs.parameters.$select, 'new_linkdafoto')
  const caminho = todas.get('Caminho_foto').inputs
  assert.ok(caminho.startsWith("@if(and(startsWith(coalesce(body('Obter_passageiro_foto')?['new_linkdafoto']"))
  assert.ok(caminho.includes("'/Documentos%20Compartilhados/Passageiros/Fotos/'"), 'restrito à pasta de fotos')
  assert.ok(caminho.includes("contains(decodeUriComponent("), 'recusa ..')
  const ler = todas.get('Ler_foto')
  assert.equal(ler.inputs.host.operationId, 'GetFileContentByPath')
  assert.equal(ler.inputs.parameters.dataset, '__SITE_URL__')
  assert.equal(ler.inputs.parameters.path, "@outputs('Caminho_foto')")
  assert.equal(todas.get('Tem_foto_lida').expression.not.equals[0], "@empty(outputs('Caminho_foto'))")
  assert.deepEqual(todas.get('Status_foto').runAfter, { Tem_foto_lida: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] })
  const foto = todas.get('Corpo_foto').inputs.value.foto
  assert.ok(foto.startsWith("@if(equals(coalesce(actions('Ler_foto')?['status'], ''), 'Succeeded')"))
  assert.ok(foto.includes("base64(body('Ler_foto'))"))
})

test('PATCH do passageiro só com os campos enviados e registro do envio', () => {
  assert.match(todas.get('Patch_foto').inputs, /new_linkdafoto/)
  assert.match(todas.get('Patch_telefone').inputs, /cr40f_telefone/)
  assert.match(todas.get('Patch_email').inputs, /cr40f_email/)
  assert.equal(todas.get('Atualizar_passageiro').inputs.parameters.item, "@outputs('Patch_email')")
  const reg = todas.get('Registrar_envio').inputs.parameters.item
  assert.equal(reg.cr40f_status, 2)
  assert.match(reg.cr40f_envios, /add\(/)
  assert.equal(reg.cr40f_ultimouso, '@utcNow()')
})

test('tokens do script presentes e nenhum dado de ambiente no repo', () => {
  for (const t of ['__SET_LINKS__', '__SET_PASSAGEIROS__', '__SET_SERVICOS__', '__SET_RESERVAS__', '__SITE_URL__', '__FOLDER_PATH__']) assert.ok(raw.includes(t), t)
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft/i)
})

test('toda ação citada em expressões existe e nomes não se repetem', () => {
  for (const [, nome] of raw.matchAll(/(?:outputs|body|items|result)\('([^']+)'\)/g)) {
    assert.ok(todas.has(nome), `ação inexistente: ${nome}`)
  }
  assert.equal(total, todas.size, "nome de ação repetido")
  assert.ok(op('UpdateRecord').length >= 3)
})

test('nenhuma função de expressão é chamada sem argumentos (createArray() quebra o flow)', () => {
  assert.doesNotMatch(raw, /createArray\(\)/)
})

// Avalia as expressões de máscara do "ler" com um mini-interpretador das funções usadas.
const avaliar = (expr, registro) => {
  const js = expr.slice(1)
    .replace(/body\('Obter_passageiro'\)\?\['(\w+)'\]/g, "R['$1']")
    .replace(/\bif\(/g, 'iff(')
  const fns = {
    iff: (c, a, b) => (c ? a : b), trim: (s) => String(s).trim(), coalesce: (...a) => a.find((x) => x != null),
    replace: (s, a, b) => s.split(a).join(b), substring: (s, i, n) => s.substr(i, n), sub: (a, b) => a - b,
    length: (s) => s.length, less: (a, b) => a < b, empty: (s) => !s, and: (a, b) => a && b, not: (a) => !a,
    startsWith: (s, p) => s.startsWith(p), greaterOrEquals: (a, b) => a >= b, lessOrEquals: (a, b) => a <= b,
    concat: (...a) => a.join(''), indexOf: (s, p) => s.indexOf(p), min: Math.min,
  }
  return new Function('R', ...Object.keys(fns), `return ${js}`)(registro, ...Object.values(fns))
}

test('ler: telefone e e-mail só mascarados, nunca o valor completo', () => {
  assert.match(todas.get('Obter_passageiro').inputs.parameters.$select, /cr40f_telefone,cr40f_email/)
  const v = todas.get('Incluir_passageiro').inputs.value
  assert.ok(!Object.values(v).some((x) => x === "@body('Obter_passageiro')?['cr40f_telefone']" || x === "@body('Obter_passageiro')?['cr40f_email']"))
  const tel = (t) => avaliar(v.telefoneMascarado, { cr40f_telefone: t })
  assert.equal(tel('+5511987654321'), '(11) •••••-4321')
  assert.equal(tel('(21) 3456-7890'), '(21) •••••-7890')
  assert.equal(tel('+55 11 98765-4321'), '(11) •••••-4321')
  assert.equal(tel('+15551234567'), '+••• 4567')
  assert.equal(tel('123'), '••••')
  assert.equal(tel(null), '')
  assert.equal(avaliar(v.temTelefone, { cr40f_telefone: '  ' }), false)
  assert.equal(avaliar(v.temTelefone, { cr40f_telefone: '+5511987654321' }), true)
  const mail = (e) => avaliar(v.emailMascarado, { cr40f_email: e })
  assert.equal(mail('ana.souza@empresa.com.br'), 'an•••@empresa.com.br')
  assert.equal(mail('a@b.co'), 'a•••@b.co')
  assert.equal(mail('semarroba'), '•••')
  assert.equal(mail(null), '')
  assert.equal(avaliar(v.temEmail, { cr40f_email: 'a@b.co' }), true)
})
