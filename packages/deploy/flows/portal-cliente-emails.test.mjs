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
  __TPL_CONFIRMADO__: 'pedido-confirmado.html',
  __TPL_APROV_PENDENTE__: 'aprovacao-pendente.html',
  __TPL_APROV_LEMBRETE__: 'aprovacao-lembrete.html',
  __TPL_APROV_RESULTADO__: 'aprovacao-resultado.html',
  __TPL_AVISO_OPERACAO__: 'aviso-operacao.html',
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
    equals: (a, b) => a === b, concat: (...a) => a.join(''), float: (s) => { const n = Number(s); if (Number.isNaN(n)) throw new Error('float'); return n },
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
  pedido_confirmado: { tipo: 'pedido_confirmado', para: ['paula@latasa.com.br', 'hiroshi@exemplo.com'], dados: {
    numero: 'RV-10300', data: '01/12/2026 06:30', origem: 'Latasa, Pindamonhangaba', destino: 'GRU Guarulhos', passageiros: 'Paula Lima, Hiroshi Tanaka' } },
  aprovacao_pendente: { tipo: 'aprovacao_pendente', para: ['aline@latasa.com.br'], dados: {
    nome: 'Aline', solicitante: 'Paula Lima', numero: 'RV-10301', data: '02/12/2026 08:00', trajeto: 'Latasa, Pindamonhangaba → GRU Guarulhos', passageiros: 'Hiroshi Tanaka', linkPortal: 'https://cliente.betinhos.com.br/' } },
  aprovacao_lembrete: { tipo: 'aprovacao_lembrete', para: ['aline@latasa.com.br'], dados: {
    nome: 'Aline', solicitante: 'Paula Lima', numero: 'RV-10301', data: '02/12/2026 08:00', trajeto: 'Latasa, Pindamonhangaba → GRU Guarulhos', passageiros: 'Hiroshi Tanaka', linkPortal: 'https://cliente.betinhos.com.br/' } },
  aprovacao_resultado: { tipo: 'aprovacao_resultado', para: ['paula@latasa.com.br'], dados: {
    nome: 'Paula', resultado: 'recusado', aprovador: 'Aline', numero: 'RV-10301', data: '02/12/2026 08:00', trajeto: 'Latasa, Pindamonhangaba → GRU Guarulhos', motivo: 'Fora do orçamento do mês.', linkPortal: 'https://cliente.betinhos.com.br/' } },
  aviso_operacao: { tipo: 'aviso_operacao', para: [], dados: {
    numero: 'RV-10301', solicitante: 'Paula Lima', cliente: 'Latasa', data: '02/12/2026 08:00', trajeto: 'Latasa, Pindamonhangaba → GRU Guarulhos', passageiros: 'Hiroshi Tanaka' } },
}

const TIPOS = ['codigo', 'resumo_diario', 'resposta_betinhos', 'pedido_confirmado', 'aprovacao_pendente', 'aprovacao_lembrete', 'aprovacao_resultado', 'aviso_operacao']

test('gatilho HTTP POST com schema de tipo, para e dados', () => {
  const g = flow.triggers.manual
  assert.equal(g.type, 'Request'); assert.equal(g.kind, 'Http'); assert.equal(g.inputs.method, 'POST')
  assert.deepEqual(g.inputs.schema.required, ['tipo', 'para', 'dados'])
  assert.deepEqual(g.inputs.schema.properties.tipo.enum, TIPOS)
  assert.equal(g.inputs.schema.properties.para.type, 'array')
})

test('Switch por tipo com os oito casos e default 400', () => {
  const sw = todas.get('Por_tipo')
  assert.equal(sw.type, 'Switch')
  assert.deepEqual(Object.values(sw.cases).map((c) => c.case).sort(), [...TIPOS].sort())
  assert.equal(sw.default.actions.Responder_400_tipo.inputs.statusCode, 400)
})

test('envio com remetente fixo (De), um por caso, com os assuntos combinados', () => {
  const envios = porTipo('OpenApiConnection')
  assert.equal(envios.length, 8)
  for (const e of envios) {
    assert.equal(e.inputs.host.operationId, 'SendEmailV2')
    assert.equal(e.inputs.host.connectionName, 'shared_office365')
    assert.equal(e.inputs.parameters['emailMessage/From'], 'caixa@exemplo.com')
  }
  assert.equal(executar(exemplos.codigo).email.Subject, 'Seu código de acesso: 482913')
  assert.equal(executar(exemplos.resumo_diario).email.Subject, 'Serviços para validar hoje · Betinhos')
  assert.equal(executar(exemplos.resposta_betinhos).email.Subject, 'A Betinhos respondeu sua dúvida sobre RV-10234')
  assert.equal(executar(exemplos.pedido_confirmado).email.Subject, 'Serviço confirmado: RV-10300')
  assert.equal(executar(exemplos.aprovacao_pendente).email.Subject, 'Aprovação pendente: pedido RV-10301')
  assert.equal(executar(exemplos.aprovacao_lembrete).email.Subject, 'Lembrete: pedido RV-10301 aguarda aprovação')
  assert.equal(executar(exemplos.aprovacao_resultado).email.Subject, 'Pedido RV-10301 recusado')
  assert.equal(executar(exemplos.aviso_operacao).email.Subject, 'Pedido do portal sai em até 12 h: RV-10301')
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
    assert.equal(r.email.To, ex.tipo === 'aviso_operacao' ? 'caixa@exemplo.com' : ex.para.join(';'))
  }
})

test('campos obrigatórios por tipo: faltou um, 400 sem envio', () => {
  const obrig = { codigo: ['nome', 'codigo', 'validadeMinutos'], resumo_diario: ['nome', 'cliente', 'linkPortal'], resposta_betinhos: ['nome', 'numero', 'trecho', 'linkPortal'],
    pedido_confirmado: ['numero', 'data'], aprovacao_pendente: ['nome', 'solicitante', 'numero', 'linkPortal'], aprovacao_lembrete: ['nome', 'solicitante', 'numero', 'linkPortal'],
    aprovacao_resultado: ['nome', 'numero', 'aprovador', 'linkPortal'], aviso_operacao: ['numero', 'solicitante', 'cliente', 'data'] }
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
    { ...exemplos.codigo, para: [] }, { ...exemplos.pedido_confirmado, para: [] }, { ...exemplos.aprovacao_pendente, para: [] }, { ...exemplos.codigo, para: undefined }, { ...exemplos.codigo, para: 'a@b.com' },
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
    const c = structuredClone(ex)
    for (const k of ['nome', 'solicitante', 'passageiros', 'trajeto', 'origem', 'destino', 'cliente', 'aprovador', 'numero', 'data']) if (k in c.dados) c.dados[k] = mal
    if (c.dados.liberadosHoje) c.dados.liberadosHoje[0].trajeto = '<img src=x onerror=alert(1)>'
    if (c.dados.trecho) c.dados.trecho = '"><a href="https://mal">x</a>'
    const html = executar(c).email.Body
    assert.doesNotMatch(html, /<script|<img(?! src="https:\/\/)|href="https:\/\/mal/i, ex.tipo)
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; O&#39;Neil &#123;&#123;codigo}}'), ex.tipo)
  }
})

test('modelos no padrão do e-mail (§14.5): 640 px, fundo #F0F0F0, CTA navy 44 px, só a logo como imagem, sem gradiente', () => {
  for (const arq of Object.values(modelos)) {
    const h = ler(`./portal-cliente-emails/${arq}`)
    assert.doesNotMatch(h, /gradient|<style|@\{|url\(|border-left/i, arq)
    // Única imagem: a logo, com alt e tamanho fixo (cliente que bloqueia imagem mostra o texto).
    assert.deepEqual(h.match(/<img[^>]*>/g) ?? [], /resumo-linha/.test(arq) ? [] : [h.match(/<img src="\{\{logoUrl\}\}" width="143" height="80" alt="Betinhos Executive Service"[^>]*>/)?.[0]], arq)
    assert.ok(!h.startsWith('@'))
  }
  for (const arq of Object.values(modelos).filter((a) => !/resumo-linha/.test(a))) {
    const h = ler(`./portal-cliente-emails/${arq}`)
    assert.match(h, /max-width:640px/); assert.match(h, /background-color:#F0F0F0/); assert.match(h, /Betinhos Executive Service/)
    assert.match(h, /Segoe UI,Arial/)
  }
  for (const arq of ['resumo-diario.html', 'resposta-betinhos.html', 'aprovacao-pendente.html', 'aprovacao-lembrete.html', 'aprovacao-resultado.html']) {
    assert.match(ler(`./portal-cliente-emails/${arq}`), /bgcolor="#001A3D"[^>]*>.*height:44px;[^>]*color:#FFFFFF;[^>]*>Abrir o portal/s)
  }
})

test('logo: usa a logoUrl enviada e, sem ela, a do portal de produção', () => {
  const comLogo = structuredClone(exemplos.codigo); comLogo.dados.logoUrl = 'https://dev.exemplo/email/logo-betinhos.png'
  assert.match(executar(comLogo).email.Body, /<img src="https:\/\/dev\.exemplo\/email\/logo-betinhos\.png"/)
  for (const ex of Object.values(exemplos)) assert.match(executar(ex).email.Body, /<img src="https:\/\/cliente\.betinhos\.com\.br\/email\/logo-betinhos\.png"/, ex.tipo)
})

test('toda ação citada em expressões existe, nomes únicos e nenhum dado de ambiente no repo', () => {
  for (const [, nome] of raw.matchAll(/(?:outputs|body)\('([^']+)'\)/g)) assert.ok(todas.has(nome), `ação inexistente: ${nome}`)
  assert.equal(total, todas.size, 'nome de ação repetido')
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft|createArray\(\)/i)
  assert.doesNotMatch(montado, /__[A-Z_]+__/)
})

test('pedido confirmado: vai a todos os destinatários, sem botão, com os dados do serviço', () => {
  const r = executar(exemplos.pedido_confirmado)
  assert.equal(r.email.To, 'paula@latasa.com.br;hiroshi@exemplo.com')
  for (const t of ['RV-10300', '01/12/2026 06:30', 'Latasa, Pindamonhangaba', 'GRU Guarulhos', 'Paula Lima, Hiroshi Tanaka']) assert.ok(r.email.Body.includes(t), t)
  assert.doesNotMatch(r.email.Body, /Abrir o portal|\{\{\w+\}\}/)
})

test('aprovação pendente e lembrete: link do portal e dados do pedido', () => {
  for (const tipo of ['aprovacao_pendente', 'aprovacao_lembrete']) {
    const html = executar(exemplos[tipo]).email.Body
    for (const t of ['Aline', 'Paula Lima', 'RV-10301', '02/12/2026 08:00', 'Hiroshi Tanaka']) assert.ok(html.includes(t), `${tipo} ${t}`)
    assert.match(html, /<a href="https:\/\/cliente\.betinhos\.com\.br\/"[^>]*>Abrir o portal<\/a>/)
    assert.doesNotMatch(html, /\{\{\w+\}\}/)
  }
})

test('aprovação resultado: aprovado sem bloco de motivo, recusado com o motivo', () => {
  const recusado = executar(exemplos.aprovacao_resultado).email.Body
  assert.match(recusado, /Seu pedido foi recusado/); assert.match(recusado, /Aline recusou o seu pedido/); assert.match(recusado, /Fora do orçamento do mês\./)
  const ok = structuredClone(exemplos.aprovacao_resultado); ok.dados.resultado = 'aprovado'; ok.dados.motivo = ''
  const r = executar(ok)
  assert.equal(r.email.Subject, 'Pedido RV-10301 aprovado')
  assert.match(r.email.Body, /Seu pedido foi aprovado/); assert.match(r.email.Body, /Aline aprovou o seu pedido/); assert.doesNotMatch(r.email.Body, /Motivo:|\{\{\w+\}\}/)
  const mal = structuredClone(exemplos.aprovacao_resultado); mal.dados.motivo = '<b>x</b> & "y"'
  assert.match(executar(mal).email.Body, /&lt;b&gt;x&lt;\/b&gt; &amp; &quot;y&quot;/)
})

test('aviso à operação: ignora destinatários do corpo e vai só à caixa compartilhada', () => {
  const com = structuredClone(exemplos.aviso_operacao); com.para = ['intruso@exemplo.com']
  for (const ex of [exemplos.aviso_operacao, com]) {
    const r = executar(ex)
    assert.equal(r.status, 202); assert.equal(r.email.To, 'caixa@exemplo.com')
    for (const t of ['RV-10301', 'Paula Lima', 'Latasa', '02/12/2026 08:00']) assert.ok(r.email.Body.includes(t), t)
  }
  const ruim = structuredClone(exemplos.aviso_operacao); ruim.para = ['sem-arroba']
  assert.equal(executar(ruim).status, 400)
})

// PORTAL_EMAILS_EXEMPLOS=<pasta> grava os e-mails renderizados para conferência no navegador.
if (process.env.PORTAL_EMAILS_EXEMPLOS) {
  mkdirSync(process.env.PORTAL_EMAILS_EXEMPLOS, { recursive: true })
  for (const [tipo, ex] of Object.entries(exemplos)) writeFileSync(`${process.env.PORTAL_EMAILS_EXEMPLOS}/${tipo}.html`, executar(ex).email.Body)
}
