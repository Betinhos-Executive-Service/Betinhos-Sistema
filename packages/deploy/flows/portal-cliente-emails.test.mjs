import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// Mesma troca de tokens do provision-flow-portal-cliente-emails.ps1: cada modelo HTML entra como string JSON.
const modelos = {
  __TPL_CODIGO__: 'codigo.html',
  __TPL_RESUMO__: 'resumo-diario.html',
  __TPL_LINHA_LIBERADO__: 'resumo-linha-liberado.html',
  __TPL_LINHA_VENCENDO__: 'resumo-linha-vencendo.html',
  __TPL_RESPOSTA__: 'resposta-betinhos.html',
}
const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
const raw = ler('./portal-cliente-emails.json')
let montado = raw.replaceAll('__CAIXA_COMPARTILHADA__', 'caixa@exemplo.com')
for (const [tok, arq] of Object.entries(modelos)) montado = montado.replaceAll(`"${tok}"`, JSON.stringify(ler(`./portal-cliente-emails/${arq}`)))
const flow = JSON.parse(montado)

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

// Mini-interpretador das funções de expressão usadas no flow.
const paraJs = (expr) => {
  let js = ''
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] !== "'") { js += expr[i]; continue }
    let s = ''
    for (i++; i < expr.length; i++) {
      if (expr[i] === "'" && expr[i + 1] === "'") { s += "'"; i++ } else if (expr[i] === "'") break
      else s += expr[i]
    }
    js += JSON.stringify(s)
  }
  return js.replace(/\?\[/g, '?.[').replace(/\bif\(/g, 'iff(')
}
const avaliar = (expr, ctx) => {
  if (typeof expr !== 'string' || !expr.startsWith('@')) return expr
  const fns = {
    triggerBody: () => ctx.corpo, outputs: (n) => ctx.saidas[n], body: (n) => ctx.saidas[n], item: () => ctx.item,
    iff: (c, a, b) => (c ? a : b), string: (x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)),
    coalesce: (...a) => a.find((x) => x != null), replace: (s, a, b) => s.split(a).join(b), trim: (s) => s.trim(),
    empty: (x) => x == null || x.length === 0, length: (x) => x.length, json: (s) => JSON.parse(s), join: (a, sep) => a.join(sep),
    and: (...a) => a.every(Boolean), or: (...a) => a.some(Boolean), not: (a) => !a, greater: (a, b) => a > b,
    lessOrEquals: (a, b) => a <= b, contains: (s, p) => s.includes(p), startsWith: (s, p) => s.startsWith(p),
    concat: (...a) => a.join(''), float: (s) => { const n = Number(s); if (Number.isNaN(n)) throw new Error('float'); return n },
    formatNumber: (n, f, l) => new Intl.NumberFormat(l, { style: 'currency', currency: 'BRL' }).format(n),
  }
  return new Function(...Object.keys(fns), `return ${paraJs(expr.slice(1))}`)(...Object.values(fns))
}

// Executa o flow em memória: devolve status da resposta e e-mail enviado (se houver).
const executar = (corpo) => {
  const saidas = {}
  const ctx = { corpo, saidas, item: null }
  let resposta = null, email = null
  const rodar = (acoes) => {
    const feitas = new Set()
    const pendentes = Object.entries(acoes ?? {})
    while (pendentes.length) {
      const idx = pendentes.findIndex(([, a]) => Object.keys(a.runAfter ?? {}).every((d) => feitas.has(d)))
      const [nome, a] = pendentes.splice(idx, 1)[0]
      if (a.type === 'Compose') saidas[nome] = avaliar(a.inputs, ctx)
      else if (a.type === 'Query') saidas[nome] = avaliar(a.inputs.from, ctx).filter((it) => { ctx.item = it; return avaliar(a.inputs.where, ctx) })
      else if (a.type === 'Select') saidas[nome] = avaliar(a.inputs.from, ctx).map((it) => { ctx.item = it; return avaliar(a.inputs.select, ctx) })
      else if (a.type === 'If') rodar(avaliar(a.expression, ctx) ? a.actions : a.else.actions)
      else if (a.type === 'Switch') {
        const v = avaliar(a.expression, ctx)
        rodar((Object.values(a.cases).find((c) => c.case === v) ?? a.default).actions)
      } else if (a.type === 'Scope') rodar(a.actions)
      else if (a.type === 'Response') resposta ??= { status: a.inputs.statusCode, corpo: a.inputs.body }
      else if (a.type === 'OpenApiConnection') email = Object.fromEntries(Object.entries(a.inputs.parameters).map(([k, v]) => [k.split('/')[1], avaliar(v, ctx)]))
      feitas.add(nome)
    }
  }
  try { rodar(flow.actions.Validar.actions) } catch { resposta = flow.actions.Responder_400_corpo.inputs }
  if (!resposta) try { rodar(flow.actions.Envio.actions) } catch { resposta = flow.actions.Responder_502.inputs; email = null }
  return { status: resposta.status ?? resposta.statusCode, corpo: resposta.corpo ?? resposta.body, email }
}

const exemplos = {
  codigo: { tipo: 'codigo', para: ['ana.souza@tenaris.com'], dados: { nome: 'Ana Souza', codigo: '482913', validadeMinutos: 10 } },
  resumo_diario: { tipo: 'resumo_diario', para: ['ana.souza@tenaris.com', 'joao@tenaris.com'], dados: {
    nome: 'Ana Souza', cliente: 'Tenaris', linkPortal: 'https://portal.betinhos.com.br/',
    liberadosHoje: [
      { numero: 'RV-10234', data: '27/10/2026 07:30', trajeto: 'GIG Galeão → Tenaris Confab, Pindamonhangaba', valor: 1850.5 },
      { numero: 'RV-10241', data: '27/10/2026 18:00', trajeto: 'Hotel Fasano, Itaim → GRU Guarulhos', valor: 420 },
    ],
    vencendo: [{ numero: 'RV-10102', prazo: '29/10/2026' }] } },
  resposta_betinhos: { tipo: 'resposta_betinhos', para: ['ana.souza@tenaris.com'], dados: {
    nome: 'Ana Souza', numero: 'RV-10234', trecho: 'O valor inclui 2 horas de espera no aeroporto por atraso do voo.', linkPortal: 'https://portal.betinhos.com.br/' } },
}

test('gatilho HTTP POST com schema de tipo, para e dados', () => {
  const g = flow.triggers.manual
  assert.equal(g.type, 'Request'); assert.equal(g.kind, 'Http'); assert.equal(g.inputs.method, 'POST')
  assert.deepEqual(g.inputs.schema.required, ['tipo', 'para', 'dados'])
  assert.deepEqual(g.inputs.schema.properties.tipo.enum, ['codigo', 'resumo_diario', 'resposta_betinhos'])
  assert.equal(g.inputs.schema.properties.para.type, 'array')
})

test('Switch por tipo com os três casos e default 400', () => {
  const sw = todas.get('Por_tipo')
  assert.equal(sw.type, 'Switch')
  assert.deepEqual(Object.values(sw.cases).map((c) => c.case).sort(), ['codigo', 'resposta_betinhos', 'resumo_diario'])
  assert.equal(sw.default.actions.Responder_400_tipo.inputs.statusCode, 400)
})

test('envio com remetente fixo (De), um por caso, com os assuntos combinados', () => {
  const envios = porTipo('OpenApiConnection')
  assert.equal(envios.length, 3)
  for (const e of envios) {
    assert.equal(e.inputs.host.operationId, 'SendEmailV2')
    assert.equal(e.inputs.host.connectionName, 'shared_office365')
    assert.equal(e.inputs.parameters['emailMessage/From'], 'caixa@exemplo.com')
  }
  assert.equal(executar(exemplos.codigo).email.Subject, 'Seu código de acesso: 482913')
  assert.equal(executar(exemplos.resumo_diario).email.Subject, 'Serviços para validar hoje · Betinhos')
  assert.equal(executar(exemplos.resposta_betinhos).email.Subject, 'A Betinhos respondeu sua dúvida sobre RV-10234')
})

test('respostas só 202, 400 e 502, com corpo genérico que nunca ecoa dados', () => {
  const status = new Set(porTipo('Response').map((r) => r.inputs.statusCode))
  assert.deepEqual([...status].sort(), [202, 400, 502])
  for (const r of porTipo('Response')) {
    assert.doesNotMatch(JSON.stringify(r.inputs.body), /@|triggerBody|outputs|body\(/)
    assert.ok(Object.keys(r.inputs.body).every((k) => ['ok', 'codigo'].includes(k)))
  }
  assert.deepEqual(flow.actions.Responder_502.runAfter, { Envio: ['Failed', 'TimedOut'] })
  assert.deepEqual(flow.actions.Responder_400_corpo.runAfter, { Validar: ['Failed', 'TimedOut'] })
})

test('exemplos válidos respondem 202 e enviam para todos os destinatários', () => {
  for (const ex of Object.values(exemplos)) {
    const r = executar(ex)
    assert.equal(r.status, 202, ex.tipo)
    assert.deepEqual(r.corpo, { ok: true })
    assert.equal(r.email.To, ex.para.join(';'))
  }
})

test('campos obrigatórios por tipo: faltou um, 400 sem envio', () => {
  const obrig = { codigo: ['nome', 'codigo', 'validadeMinutos'], resumo_diario: ['nome', 'cliente', 'linkPortal'], resposta_betinhos: ['nome', 'numero', 'trecho', 'linkPortal'] }
  for (const [tipo, campos] of Object.entries(obrig)) {
    for (const c of campos) {
      for (const valor of [undefined, '   ']) {
        const ex = structuredClone(exemplos[tipo]); ex.dados[c] = valor
        const r = executar(ex)
        assert.equal(r.status, 400, `${tipo}.${c}=${valor}`); assert.equal(r.email, null)
      }
    }
  }
  const http = structuredClone(exemplos.resposta_betinhos); http.dados.linkPortal = 'javascript:alert(1)'
  assert.equal(executar(http).status, 400)
})

test('tipo, destinatários ou corpo inválidos respondem 400 sem envio', () => {
  const casos = [
    { ...exemplos.codigo, tipo: 'outro' }, { ...exemplos.codigo, tipo: undefined },
    { ...exemplos.codigo, para: [] }, { ...exemplos.codigo, para: undefined }, { ...exemplos.codigo, para: 'a@b.com' },
    { ...exemplos.codigo, para: ['a@b.com;c@d.com'] }, { ...exemplos.codigo, para: ['sem-arroba'] },
    { ...exemplos.codigo, para: Array.from({ length: 11 }, (_, i) => `p${i}@b.com`) },
    { ...exemplos.codigo, dados: undefined },
  ]
  for (const c of casos) {
    const r = executar(c)
    assert.equal(r.status, 400, JSON.stringify(c.para ?? c.tipo)); assert.equal(r.email, null)
  }
})

test('falha ao montar o e-mail (valor não numérico) responde 502 sem envio', () => {
  const ex = structuredClone(exemplos.resumo_diario); ex.dados.liberadosHoje[0].valor = 'R$ 10,00'
  const r = executar(ex)
  assert.equal(r.status, 502); assert.equal(r.email, null)
})

test('resumo sem nada liberado nem vencendo responde 202 e não envia', () => {
  const ex = structuredClone(exemplos.resumo_diario); ex.dados.liberadosHoje = []; delete ex.dados.vencendo
  const r = executar(ex)
  assert.equal(r.status, 202); assert.equal(r.email, null)
  const so = structuredClone(exemplos.resumo_diario); so.dados.liberadosHoje = []
  const html = executar(so).email.Body
  assert.match(html, /Nenhum serviço liberado hoje\./); assert.match(html, /RV-10102/)
})

test('resumo: tabela com cada serviço, valor em reais e CTA "Abrir o portal"', () => {
  const html = executar(exemplos.resumo_diario).email.Body
  for (const t of ['RV-10234', 'RV-10241', 'GIG Galeão → Tenaris Confab, Pindamonhangaba', 'R$ 1.850,50', 'R$ 420,00', '29/10/2026']) assert.ok(html.includes(t), t)
  assert.match(html, /<a href="https:\/\/portal\.betinhos\.com\.br\/"[^>]*>Abrir o portal<\/a>/)
  assert.doesNotMatch(html, /\{\{\w+\}\}/)
})

test('código: diz quanto tempo vale e "se não foi você, ignore este e-mail"', () => {
  const html = executar(exemplos.codigo).email.Body
  assert.match(html, />482913</); assert.match(html, /vale por 10 minutos/); assert.match(html, /Se não foi você, ignore este e-mail/)
  assert.doesNotMatch(html, /\{\{\w+\}\}/)
})

test('escape de HTML: nome com <script> não vira tag, nem em campos da tabela', () => {
  const mal = '<script>alert("x")</script> & O\'Neil {{codigo}}'
  for (const ex of Object.values(exemplos)) {
    const c = structuredClone(ex); c.dados.nome = mal
    if (c.dados.liberadosHoje) c.dados.liberadosHoje[0].trajeto = '<img src=x onerror=alert(1)>'
    if (c.dados.trecho) c.dados.trecho = '"><a href="https://mal">x</a>'
    const html = executar(c).email.Body
    assert.doesNotMatch(html, /<script|<img|href="https:\/\/mal/i, ex.tipo)
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; O&#39;Neil &#123;&#123;codigo}}'), ex.tipo)
  }
})

test('modelos no padrão do e-mail (§14.5): 640 px, fundo #F0F0F0, CTA navy 44 px, sem imagem nem gradiente', () => {
  for (const arq of Object.values(modelos)) {
    const h = ler(`./portal-cliente-emails/${arq}`)
    assert.doesNotMatch(h, /<img|gradient|<style|@\{|url\(/i, arq)
    assert.ok(!h.startsWith('@'))
  }
  for (const arq of ['codigo.html', 'resumo-diario.html', 'resposta-betinhos.html']) {
    const h = ler(`./portal-cliente-emails/${arq}`)
    assert.match(h, /max-width:640px/); assert.match(h, /background-color:#F0F0F0/); assert.match(h, /Betinhos Executive Service/)
    assert.match(h, /Segoe UI,Arial/)
  }
  for (const arq of ['resumo-diario.html', 'resposta-betinhos.html']) {
    assert.match(ler(`./portal-cliente-emails/${arq}`), /bgcolor="#001A3D"[^>]*>.*height:44px;[^>]*color:#FFFFFF;[^>]*>Abrir o portal/s)
  }
})

test('toda ação citada em expressões existe, nomes únicos e nenhum dado de ambiente no repo', () => {
  for (const [, nome] of raw.matchAll(/(?:outputs|body)\('([^']+)'\)/g)) assert.ok(todas.has(nome), `ação inexistente: ${nome}`)
  assert.equal(total, todas.size, 'nome de ação repetido')
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft|createArray\(\)/i)
  assert.doesNotMatch(montado, /__[A-Z_]+__/)
})

// PORTAL_EMAILS_EXEMPLOS=<pasta> grava os três e-mails renderizados para conferência no navegador.
if (process.env.PORTAL_EMAILS_EXEMPLOS) {
  mkdirSync(process.env.PORTAL_EMAILS_EXEMPLOS, { recursive: true })
  for (const [tipo, ex] of Object.entries(exemplos)) writeFileSync(`${process.env.PORTAL_EMAILS_EXEMPLOS}/${tipo}.html`, executar(ex).email.Body)
}
