import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparLogs, caminhoLogs, limpar, normalizar } from './logs-apps.mjs'

let n = 0
const log = (o = {}) => ({
  new_appmotoristaslogid: `id-${++n}`, createdon: '2026-11-04T12:00:00Z', new_appname: 'App Motoristas', new_appversion: '2.1.8', new_severity: 'error',
  new_source: 'app', new_screen: 'Serviços', new_message: 'Erro qualquer', new_errorcode: null, new_action: null, new_phase: null, new_payloadjson: null, new_sessionid: 's1', ...o,
})
const DESDE = '2026-11-01T00:00:00Z'
const rodar = (linhas, extra) => agruparLogs(linhas, { desde: DESDE, ...extra })

test('agrupa por app + mensagem normalizada (ids e números removidos) com contagem, sessões, eventos e janela', () => {
  const r = rodar([
    log({ new_message: 'Falha ao gravar a chave dedupe 123', new_sessionid: 'a', createdon: '2026-11-04T10:00:00Z' }),
    log({ new_message: 'Falha ao gravar a chave dedupe 456', new_sessionid: 'a', createdon: '2026-11-04T10:00:20Z' }),
    log({ new_message: 'Falha ao gravar a chave dedupe 789', new_sessionid: 'a', createdon: '2026-11-04T10:05:00Z' }),
    log({ new_message: 'Falha ao gravar a chave dedupe 12', new_sessionid: 'b', createdon: '2026-11-04T11:00:00Z' }),
    log({ new_message: 'Outra coisa', new_appname: 'Sistema Betinhos' }),
  ])
  assert.equal(r.grupos.length, 2)
  const g = r.grupos.find((x) => x.app === 'App Motoristas')
  assert.equal(g.ocorrencias, 4)
  assert.equal(g.sessoes, 2)
  assert.equal(g.eventos, 3) // a: 2 eventos (gap de 5 min), b: 1
  assert.equal(g.primeira, '2026-11-04T10:00:00Z')
  assert.equal(g.ultima, '2026-11-04T11:00:00Z')
  assert.match(g.chave, /^log:app-motoristas:[0-9a-f]{8}$/)
})

test('mesma mensagem em apps diferentes são grupos diferentes', () => {
  const r = rodar([log({ new_message: 'Boom' }), log({ new_message: 'Boom', new_appname: 'Escala FDS' })])
  assert.equal(r.grupos.length, 2)
})

test('exclui info e telemetria perf, e conta o descarte', () => {
  const r = rodar([
    log({ new_severity: 'info' }), log({ new_severity: 'INFO' }),
    log({ new_source: 'perf', new_severity: 'warning' }), log({ new_appname: 'Desempenho Sistema Betinhos', new_severity: 'warning' }),
    log({ new_source: 'Perf', new_severity: 'error' }),
    log({ new_message: 'real' }),
  ])
  assert.equal(r.grupos.length, 1)
  assert.equal(r.grupos[0].mensagem, 'real')
  assert.deepEqual(r.descartados, { info: 2, perf: 3, antigos: 0 })
  assert.equal(r.totalLogs, 1)
})

test('só considera a janela desde a última rodada', () => {
  const r = rodar([log({ createdon: '2026-10-30T23:59:59Z', new_message: 'velho' }), log({ createdon: '2026-11-02T00:00:00Z', new_message: 'novo' })])
  assert.deepEqual(r.grupos.map((g) => g.mensagem), ['novo'])
  assert.equal(r.descartados.antigos, 1)
  assert.equal(rodar([log({ createdon: '2026-11-02T00:00:00Z' })], { desde: '2026-11-03T00:00:00Z' }).grupos.length, 0)
})

test('rede/timeout vira um grupo de ruído por app, separado do erro de regra', () => {
  const r = rodar([
    log({ new_source: 'Dataverse', new_errorcode: 'network', new_message: 'Falha de rede em GET /cr40f_documentos: Failed to fetch' }),
    log({ new_source: 'Dataverse', new_errorcode: 'network', new_message: 'Falha de rede em GET /cr40f_veiculoses: Failed to fetch' }),
    log({ new_message: 'Request timed out após 30000 ms' }),
    log({ new_message: 'Falha de conexão com o servidor' }),
    log({ new_message: 'Checklist inválido' }),
  ])
  const rede = r.grupos.filter((g) => g.classe === 'rede')
  assert.equal(rede.length, 1)
  assert.equal(rede[0].ocorrencias, 4)
  assert.equal(rede[0].chave, 'log:app-motoristas:rede')
  assert.deepEqual(r.grupos.filter((g) => g.classe === 'regra').map((g) => g.mensagem), ['Checklist inválido'])
})

test('aviso de fallback na mesma sessão de um erro vira derivado dele', () => {
  const r = rodar([
    log({ new_message: 'retrieveRecord falhou.', new_sessionid: 'x' }),
    log({ new_message: 'Falha ao enriquecer passageiros. Usando Pax - VIEW do Geral.', new_severity: 'warning', new_sessionid: 'x' }),
    log({ new_message: 'Falha ao enriquecer passageiros. Usando Pax - VIEW do Geral.', new_severity: 'warning', new_sessionid: 'y' }),
  ])
  const erro = r.grupos.find((g) => g.mensagem === 'retrieveRecord falhou.')
  const fb = r.grupos.find((g) => g.classe === 'derivado')
  assert.equal(erro.classe, 'regra')
  assert.equal(fb.fallbackDe, erro.chave)
})

test('limita os grupos por classe, prioriza erro e mais sessões, e informa o que sobrou', () => {
  const linhas = [
    ...Array.from({ length: 4 }, (_, i) => log({ new_message: `Erro distinto ${'x'.repeat(i + 1)}`, new_sessionid: `s${i}` })),
    log({ new_message: 'Aviso comum', new_severity: 'warning' }),
    log({ new_message: 'Mais sessões', new_sessionid: 'a' }), log({ new_message: 'Mais sessões', new_sessionid: 'b' }),
  ]
  const r = rodar(linhas, { limiteRegra: 2 })
  assert.equal(r.grupos.length, 2)
  assert.equal(r.grupos[0].mensagem, 'Mais sessões')
  assert.equal(r.omitidos.regra, 4)
})

test('mascara nome, e-mail, busca, telefone e id; nada pessoal na saída', () => {
  const r = rodar([log({
    new_message: "Busca por 'Maria Souza' falhou para joao.silva@betinhos.com.br (11) 98765-4321 id 8f3b2c1d-1111-2222-3333-444455556666",
    new_screen: 'Serviço de "Carlos Pereira"',
    new_payloadjson: '{"passageiro":"Ana Lima","search":"pedro alves","cpf":"123.456.789-09","statuscode":3}',
  })])
  const s = JSON.stringify(r)
  for (const pessoal of ['Maria', 'Souza', 'joao.silva', 'Carlos', 'Pereira', 'Ana Lima', 'pedro', 'alves', '98765', '123.456.789']) assert.ok(!s.includes(pessoal), `vazou: ${pessoal}`)
  assert.ok(s.includes('[texto]') && s.includes('[email]'))
})

test('normalizar remove ids, números e texto entre aspas', () => {
  assert.equal(normalizar("Erro 42 em 8f3b2c1d-1111-2222-3333-444455556666 busca 'Ana'"), "erro # em <id> busca '?'")
})

test('consulta filtra só pela janela e lê a tabela certa', () => {
  const c = caminhoLogs('2026-11-01T00:00:00Z')
  assert.match(c, /^new_appmotoristaslogs\?\$select=/)
  assert.ok(c.includes('createdon ge 2026-11-01T00:00:00Z'))
  assert.ok(!/new_username|new_useremail|new_stack/.test(c))
})

test('caso real: ChaveDedupe truncada (6 logs, 3 sessões) vira um único item e mantém a coluna', () => {
  const msg = "POST /cr40f_plannernotificacaos falhou: 400 String or binary data would be truncated in table 'db.dbo.cr40f_plannernotificacaoBase', column 'cr40f_ChaveDedupe'. Truncated value: <redacted>."
  const linhas = ['a', 'b', 'c'].flatMap((s, i) => [
    log({ new_appname: 'Tela Planner', new_message: msg, new_severity: 'error', new_source: 'Dataverse', new_sessionid: s, createdon: `2026-11-0${i + 1}T11:00:28Z` }),
    log({ new_appname: 'Tela Planner', new_message: msg, new_severity: 'warning', new_source: 'planner-quotes-v2', new_sessionid: s, createdon: `2026-11-0${i + 1}T11:00:28Z` }),
  ])
  const r = rodar(linhas)
  assert.equal(r.grupos.length, 1)
  assert.equal(r.grupos[0].ocorrencias, 6)
  assert.equal(r.grupos[0].eventos, 3)
  assert.ok(r.grupos[0].mensagem.includes('cr40f_ChaveDedupe'))
})

test('busca com ponto ou sublinhado não passa por identificador técnico; apóstrofo de palavra não abre aspas', () => {
  assert.equal(limpar("Busca 'joao.silva' e \"maria_souza\" falhou"), "Busca '?' e \"?\" falhou")
  assert.equal(limpar("Erro d'água em d'Ouro, coluna 'cr40f_x'"), "Erro d'água em d'Ouro, coluna 'cr40f_x'")
})

test('aviso "alternativa" na mesma sessão de um erro também vira derivado', () => {
  const r = rodar([
    log({ new_message: 'retrieveRecord falhou.', new_sessionid: 'x' }),
    log({ new_message: 'Carregando alternativa local', new_severity: 'warning', new_sessionid: 'x' }),
  ])
  assert.equal(r.grupos.filter((g) => g.classe === 'derivado').length, 1)
})

test('payload sai sem texto livre, mesmo com chave desconhecida; logs sem sessão não inflam sessões', () => {
  const r = rodar([
    log({ new_payloadjson: '{"q":"Maria Souza","filtro":"ana","status":3,"tabela":"cr40f_veiculos","id":"8f3b2c1d-1111-2222-3333-444455556666","ok":false}' }),
    ...Array.from({ length: 3 }, () => log({ new_message: 'Sem sessão', new_sessionid: null })),
  ])
  const g = r.grupos.find((x) => x.mensagem === 'Erro qualquer')
  assert.equal(g.payload, '{"q":"[texto]","filtro":"[texto]","status":3,"tabela":"cr40f_veiculos","id":"8f3b2c1d-1111-2222-3333-444455556666","ok":false}')
  assert.equal(r.grupos.find((x) => x.mensagem === 'Sem sessão').sessoes, 1)
})
