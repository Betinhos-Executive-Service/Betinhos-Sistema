import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENTRADAS, descrever, entradasForcadas, entradasPendentes, preparosDe } from './flows-dev.mjs'

const aqui = fileURLToPath(new URL('.', import.meta.url))
const nomes = (arquivos) => entradasPendentes(arquivos).map((e) => e.nome)

function arquivosDe(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'backup') return []
    const caminho = join(pasta, d.name)
    return d.isDirectory() ? arquivosDe(caminho) : [relative(join(aqui, '../..'), caminho).replaceAll('\\', '/')]
  })
}

test('todo provision-flow-*.ps1 está na tabela, com nome e script únicos', () => {
  const noDisco = readdirSync(aqui).filter((f) => /^provision-flow-.*\.ps1$/.test(f)).sort()
  assert.deepEqual(ENTRADAS.map((e) => e.script).sort(), noDisco)
  assert.equal(new Set(ENTRADAS.map((e) => e.nome)).size, ENTRADAS.length)
})

test('todo arquivo de packages/deploy/flows (exceto teste e backup) pertence a uma entrada', () => {
  const soltos = arquivosDe(join(aqui, 'flows')).filter((a) => !a.endsWith('.test.mjs') && !entradasPendentes([a]).length)
  assert.deepEqual(soltos, [])
})

test('todo provision-flow-*.ps1 tem BOM: o Windows PowerShell 5.1 do Deploy lê .ps1 sem BOM como ANSI', () => {
  for (const e of ENTRADAS) assert.equal(readFileSync(join(aqui, e.script), 'utf8').charCodeAt(0), 0xfeff, e.script)
})

test('cada entrada tem flows, o script dela dispara a própria entrada e os args têm variável FLOW_*', () => {
  for (const e of ENTRADAS) {
    assert.ok(e.flows.length > 0, e.nome)
    assert.deepEqual(nomes([`packages/deploy/${e.script}`]).includes(e.nome), true, e.nome)
    for (const [, variavel] of e.args ?? []) assert.match(variavel, /^FLOW_[A-Z_]+$/)
  }
})

test('a regra dos args obrigatórios cobre os parâmetros Mandatory dos scripts', () => {
  for (const e of ENTRADAS) {
    const fonte = readFileSync(join(aqui, e.script), 'utf8')
    const obrigatorios = [...fonte.matchAll(/\[Parameter\(Mandatory = \$true\)\][^\n]*\$(\w+)/g)].map((m) => m[1]).sort()
    assert.deepEqual((e.args ?? []).map(([flag]) => flag).filter((f) => obrigatorios.includes(f)).sort(), obrigatorios, e.nome)
    assert.equal(/\[switch\] \$Apply/.test(fonte), !!e.apply, `${e.nome}: -Apply`)
  }
})

test('script que escolhe connection reference reusa a do flow existente: o Deploy não informa qual usar', () => {
  for (const e of ENTRADAS) {
    const fonte = readFileSync(join(aqui, e.script), 'utf8')
    if (fonte.includes('function Referencia(') || fonte.includes('$outlookRefs')) {
      assert.match(fonte, /\$refsAtuais\.(\$conector|shared_office365)\.connection\.connectionReferenceLogicalName/, e.script)
    }
  }
})

test('mudança no script ou no JSON publica só aquele flow', () => {
  assert.deepEqual(nomes(['packages/deploy/provision-flow-hodometro.ps1']), ['hodometro'])
  assert.deepEqual(nomes(['packages/deploy/flows/aniversariantes-diario.json']), ['aniversariantes'])
  assert.deepEqual(nomes(['packages/deploy/flows/portal-cliente-emails/codigo.html']), ['portal-cliente-emails'])
  assert.deepEqual(nomes(['packages/deploy/flows/lembrete-pagamento.ps1']), ['lembrete-pagamento'])
  assert.deepEqual(nomes(['packages/deploy/flows/conciliacao-cartao-tempo-real.mjs']), ['conciliacao-cartao'])
})

test('flows do App Motoristas: o JSON publica o próprio flow e as funções comuns publicam todos que as usam', () => {
  assert.deepEqual(nomes(['packages/deploy/flows/termo-multa-push.json']), ['termo-multa'])
  assert.deepEqual(nomes(['packages/deploy/flows/comunicados-push.json']), ['comunicados-push'])
  assert.deepEqual(nomes(['packages/deploy/flows/treinamentos-push.json']), ['treinamentos-push'])
  assert.deepEqual(nomes(['packages/deploy/flows/checklist-push.json', 'packages/deploy/flows/checklists-rotina-diaria.json']), ['checklists'])
  assert.deepEqual(nomes(['packages/deploy/flows/sincronizar-flow.ps1']).sort(), ['checklists', 'comunicados-push', 'termo-multa', 'treinamentos-push'])
  for (const n of ['checklists', 'comunicados-push', 'treinamentos-push']) assert.equal(descrever([n])[0].apply, true, n)
  assert.ok(descrever(['termo-multa'])[0].flows.includes('Termo de multa | Push ao motorista'))
})

test('JSON exportado do DEV não leva assinatura dos gatilhos, connection references nem URL assinada (vêm do flow existente)', () => {
  for (const f of ['termo-multa-push', 'comunicados-push', 'treinamentos-push', 'checklists-rotina-diaria', 'checklist-push']) {
    const texto = readFileSync(join(aqui, 'flows', `${f}.json`), 'utf8')
    const definicao = JSON.parse(texto)
    assert.ok(definicao.triggers && definicao.actions, f)
    assert.doesNotMatch(texto, /subscriptionRequest\/name|connectionReferenceLogicalName|sig=/, f)
  }
})

test('teste, backup, documentação e outros scripts não publicam flow', () => {
  assert.deepEqual(nomes(['packages/deploy/flows/aniversariantes-diario.test.mjs', 'packages/deploy/flows-dev.mjs', 'packages/deploy/flows-dev.test.mjs', 'packages/deploy/push-flows-dev.ps1']), [])
  assert.deepEqual(nomes(['packages/deploy/flows/backup/x.json', 'CLAUDE.md', 'apps/shell/src/App.tsx', 'packages/deploy/provision-acesso.ps1']), [])
  assert.deepEqual(nomes(['packages/agentes-ia/src/agentes-ia.test.ts', 'packages/despesas-ia/src/conferencia-envio/conferencia-envio.test.ts']), [])
})

test('fonte das constantes dispara só os flows que as usam e pede o preparo certo', () => {
  assert.deepEqual(nomes(['packages/agentes-ia/src/financeiro.ts']), ['agentes-executar'])
  assert.deepEqual(preparosDe(entradasPendentes(['packages/agentes-ia/scripts/gerar-constantes.ts'])), ['agentes-ia'])
  assert.deepEqual(nomes(['packages/despesas-ia/src/conferencia-envio/prompt.ts']), ['despesas-conferencia-envio'])
  assert.deepEqual(nomes(['packages/despesas-ia/src/leitura-rapida/schema.ts']), ['despesas-leitura-rapida'])
  assert.deepEqual(nomes(['packages/despesas-ia/src/prompt.ts']).sort(), ['despesas-conferencia-envio', 'despesas-ia', 'despesas-leitura-rapida'])
  assert.deepEqual(preparosDe(entradasPendentes(['packages/deploy/provision-flow-hodometro.ps1'])), [])
})

test('sem base não há nada pendente; forçar valida os nomes', () => {
  assert.deepEqual(entradasPendentes(null), [])
  assert.equal(entradasForcadas('todos').length, ENTRADAS.length)
  assert.deepEqual(entradasForcadas('hodometro, avaliacao').map((e) => e.nome), ['avaliacao', 'hodometro'])
  assert.throws(() => entradasForcadas('nao-existe'), /desconhecido/)
})

test('descrever devolve script, flows, apply e args', () => {
  const [d] = descrever(['cadastro-passageiro'])
  assert.equal(d.apply, true)
  assert.deepEqual(d.args.map((a) => a.flag), ['SiteUrl', 'BibliotecaId', 'Pasta'])
  assert.throws(() => descrever(['x']), /desconhecido/)
})
