import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhoDaPublicacao, caminhoDoArquivo } from './caminho-publicacao.mjs'

test('só a tela vai direto (front)', () => {
  const r = caminhoDaPublicacao(['apps/shell/src/App.tsx', 'packages/dataverse/src/cliente.ts', 'pnpm-lock.yaml'])
  assert.equal(r.caminho, 'front')
})

test('teste da Tela Gerar Pagantes não muda o PROD; o código dela vai pelas soluções', () => {
  assert.equal(caminhoDoArquivo('apps/gerar-pagantes/src/money.test.ts'), 'nada')
  assert.equal(caminhoDoArquivo('apps/gerar-pagantes/src/money.ts'), 'solucoes')
})

test('Formulário Geral: código vai pelas soluções; teste, fixture, .md e docs do app e o script do DEV não mudam o PROD', () => {
  for (const arquivo of ['apps/formulario-geral/app.js', 'apps/formulario-geral/index.html', 'apps/formulario-geral/scripts/xlsx_import_core.js', 'apps/formulario-geral/vendor/xlsx.full.min.js', 'apps/formulario-geral/version.json']) {
    assert.equal(caminhoDoArquivo(arquivo), 'solucoes', arquivo)
  }
  for (const arquivo of [
    'apps/formulario-geral/scripts/xlsx_import_parser.test.js',
    'apps/formulario-geral/scripts/ai_schedule_conversation.test.mjs',
    'apps/formulario-geral/scripts/ai_schedule_conversation.fixtures.mjs',
    'apps/formulario-geral/IMPORTACAO_SERVICOS.md',
    'apps/formulario-geral/docs/power-platform/AI_AGENDAR_POR_IA_DEV_FLOW_CONTRACT.json',
    'packages/deploy/push-formulario-dev.ps1',
  ]) {
    assert.equal(caminhoDoArquivo(arquivo), 'nada', arquivo)
  }
  assert.equal(caminhoDaPublicacao(['apps/formulario-geral/app.js']).caminho, 'solucoes')
  assert.equal(caminhoDaPublicacao(['apps/formulario-geral/scripts/search_matching.test.js', 'apps/formulario-geral/CONTEXTO_PROJETO.md']).caminho, 'nada')
})

test('tela com documentação continua front', () => {
  assert.equal(caminhoDaPublicacao(['apps/shell/src/App.tsx', 'docs/auto/01.md', '.claude/skills/x/SKILL.md']).caminho, 'front')
})

test('plugin, flow, schema ou outro WebResource vai pelas soluções', () => {
  for (const arquivo of [
    'packages/plugins/Financeiro/Plugin.cs',
    'packages/deploy/flows/lembrete-pagamento.ps1',
    'packages/deploy/provision-equipamentos.ps1',
    'apps/escala-fds/src/main.tsx',
    'solution/AppBetinhos/Other/Solution.xml',
    'packages/deploy/prod/_prod.ps1',
  ]) {
    assert.equal(caminhoDaPublicacao(['apps/shell/src/App.tsx', arquivo]).caminho, 'solucoes', arquivo)
  }
})

test('só código de plugin vai pelo caminho rápido, com a lista dos plugins', () => {
  const r = caminhoDaPublicacao(['packages/plugins/Cr40f.Frota.Plugin/A.cs', 'packages/plugins/Cr40f.Acesso.Plugin/B.cs', 'docs/x.md'])
  assert.equal(r.caminho, 'plugin')
  assert.deepEqual(r.plugins, ['acesso', 'frota'])
})

test('tela e plugin juntos fazem os dois caminhos rápidos', () => {
  const r = caminhoDaPublicacao(['apps/shell/src/App.tsx', 'packages/plugins/Cr40f.Portal.Plugin/A.cs'])
  assert.equal(r.caminho, 'front-plugin')
  assert.deepEqual(r.plugins, ['portal'])
})

test('registrador ou script de plugin vai pelas soluções', () => {
  for (const arquivo of ['packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs', 'packages/plugins/scripts/push-frota-plugin.ps1']) {
    assert.equal(caminhoDaPublicacao(['packages/plugins/Cr40f.Frota.Plugin/A.cs', arquivo]).caminho, 'solucoes', arquivo)
  }
})

test('Betinhos.DriverRecordSharing entra no caminho de plugin, sozinho ou com outros', () => {
  const sozinho = caminhoDaPublicacao(['packages/plugins/Betinhos.DriverRecordSharing/FuelMath.cs'])
  assert.equal(sozinho.caminho, 'plugin')
  assert.deepEqual(sozinho.plugins, ['driverrecordsharing'])
  const varios = caminhoDaPublicacao(['packages/plugins/Betinhos.DriverRecordSharing/A.cs', 'packages/plugins/Cr40f.Frota.Plugin/B.cs', 'packages/plugins/Betinhos.DriverRecordSharing/C.cs'])
  assert.equal(varios.caminho, 'plugin')
  assert.deepEqual(varios.plugins, ['driverrecordsharing', 'frota'])
  assert.equal(caminhoDaPublicacao(['apps/shell/src/App.tsx', 'packages/plugins/Betinhos.DriverRecordSharing/A.cs']).caminho, 'front-plugin')
})

test('Betinhos.ExpenseUpload está congelado e não muda o PROD', () => {
  assert.equal(caminhoDaPublicacao(['packages/plugins/Betinhos.ExpenseUpload/ExpenseUploadCommand.cs', 'packages/plugins/Betinhos.ExpenseUpload.Tests/ExpenseUploadTests.cs']).caminho, 'nada')
  assert.deepEqual(caminhoDaPublicacao(['packages/plugins/Betinhos.ExpenseUpload/A.cs', 'packages/plugins/Betinhos.DriverRecordSharing/B.cs']).plugins, ['driverrecordsharing'])
})

test('teste de plugin não muda o PROD', () => {
  assert.equal(caminhoDaPublicacao(['packages/plugins/Betinhos.DriverRecordSharing.Tests/A.cs']).caminho, 'nada')
  assert.equal(caminhoDaPublicacao(['packages/plugins/Cr40f.Frota.Plugin.Tests/A.cs']).caminho, 'nada')
})

test('App Motoristas: código vai pelas soluções (BetinhosMotoristas); teste, docs, skills e QA não mudam o PROD', () => {
  assert.equal(caminhoDaPublicacao(['apps/motoristas/src/App.tsx']).caminho, 'solucoes')
  assert.equal(caminhoDaPublicacao(['apps/motoristas/src/pwa/sw.js', 'apps/shell/src/main.tsx']).caminho, 'solucoes')
  assert.equal(caminhoDaPublicacao(['apps/motoristas/tests/media.test.ts', 'apps/motoristas/docs/a.md', 'apps/motoristas/AGENTS.md', 'apps/motoristas/.claude/skills/x/SKILL.md', 'apps/motoristas/scripts/qa/verify-tour.cjs']).caminho, 'nada')
})

test('arquivo desconhecido vai pelo caminho seguro', () => {
  assert.equal(caminhoDoArquivo('pasta-nova/qualquer.txt'), 'solucoes')
})

test('só documentação, CI e scripts de publicação: nada', () => {
  const r = caminhoDaPublicacao([
    'docs/auto/05-ambiente-scripts-deploy.md',
    '.github/workflows/ci.yml',
    'CLAUDE.md',
    'packages/deploy/solucoes/conferir.mjs',
    'packages/deploy/push-front-prod.ps1',
    'packages/deploy/push-flows-dev.ps1',
    'packages/deploy/flows-dev.mjs',
    'packages/deploy/flows-dev.test.mjs',
    'apps/portal-cliente/src/x.ts',
    '',
  ])
  assert.equal(r.caminho, 'nada')
})

test('sem base conhecida: soluções', () => {
  assert.equal(caminhoDaPublicacao(null).caminho, 'solucoes')
})

test('README dentro de pasta de plugin não muda o PROD', () => {
  assert.equal(caminhoDoArquivo('packages/plugins/README.md'), 'nada')
})
