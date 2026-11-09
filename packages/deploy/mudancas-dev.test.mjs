import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mudancasDev, pluginDoArquivo } from './mudancas-dev.mjs'

test('só a tela publica a tela e nenhum plugin', () => {
  assert.deepEqual(mudancasDev(['apps/shell/src/App.tsx', 'docs/x.md']), { tela: true, webresources: false, formulario: false, plugins: [] })
})

test('script de publicação da tela também republica a tela', () => {
  assert.equal(mudancasDev(['packages/deploy/push-dev.ps1']).tela, true)
  assert.equal(mudancasDev(['packages/deploy/bump-version.mjs']).tela, true)
})

test('plugin, registrador e script de publicação apontam o plugin', () => {
  assert.equal(pluginDoArquivo('packages/plugins/Cr40f.Frota.Plugin/FrotaPendenciasPlugin.cs'), 'frota')
  assert.equal(pluginDoArquivo('packages/plugins/tools/Cr40f.Acesso.Registrar/Program.cs'), 'acesso')
  assert.equal(pluginDoArquivo('packages/plugins/scripts/push-prontuario-plugin.ps1'), 'prontuario')
})

test('Betinhos.DriverRecordSharing publica como driverrecordsharing; ExpenseUpload e testes não', () => {
  assert.equal(pluginDoArquivo('packages/plugins/Betinhos.DriverRecordSharing/FuelMath.cs'), 'driverrecordsharing')
  assert.equal(pluginDoArquivo('packages/plugins/scripts/push-driverrecordsharing-plugin.ps1'), 'driverrecordsharing')
  assert.equal(pluginDoArquivo('packages/plugins/Betinhos.DriverRecordSharing.Tests/FuelMathTests.cs'), null)
  assert.equal(pluginDoArquivo('packages/plugins/Betinhos.ExpenseUpload/ExpenseUploadCommand.cs'), null)
  assert.deepEqual(mudancasDev(['packages/plugins/Betinhos.ExpenseUpload/A.cs', 'packages/plugins/Betinhos.ExpenseUpload.Tests/B.cs']), { tela: false, webresources: false, formulario: false, plugins: [] })
  assert.deepEqual(mudancasDev(['packages/plugins/Betinhos.DriverRecordSharing/A.cs', 'packages/plugins/Cr40f.Frota.Plugin/B.cs', 'packages/plugins/Betinhos.DriverRecordSharing/C.cs']), { tela: false, webresources: false, formulario: false, plugins: ['driverrecordsharing', 'frota'] })
})

test('teste de plugin não republica', () => {
  assert.equal(pluginDoArquivo('packages/plugins/Cr40f.Frota.Plugin.Tests/FrotaTests.cs'), null)
  assert.deepEqual(mudancasDev(['packages/plugins/Cr40f.Frota.Plugin.Tests/FrotaTests.cs']), { tela: false, webresources: false, formulario: false, plugins: [] })
})

test('vários plugins saem sem repetição e em ordem', () => {
  const r = mudancasDev([
    'packages/plugins/Cr40f.Portal.Plugin/A.cs',
    'packages/plugins/Cr40f.Acesso.Plugin/B.cs',
    'packages/plugins/tools/Cr40f.Portal.Registrar/Program.cs',
  ])
  assert.deepEqual(r, { tela: false, webresources: false, formulario: false, plugins: ['acesso', 'portal'] })
})

test('flow e schema não publicam nada (continuam à mão)', () => {
  assert.deepEqual(mudancasDev(['packages/deploy/provision-flow-avaliacao.ps1']), { tela: false, webresources: false, formulario: false, plugins: [] })
})

test('sem base publica só a tela', () => {
  assert.deepEqual(mudancasDev(null), { tela: true, webresources: false, formulario: false, plugins: [] })
})

test('tela Gerar Pagantes publica os WebResources, não a tela do sistema', () => {
  assert.deepEqual(mudancasDev(['apps/gerar-pagantes/src/ui/App.tsx']), { tela: false, webresources: true, formulario: false, plugins: [] })
  assert.equal(mudancasDev(['packages/deploy/push-webresources-dev.ps1']).webresources, true)
  assert.equal(mudancasDev(['apps/gerar-pagantes/src/money.test.ts']).webresources, false)
  assert.equal(mudancasDev(['pnpm-lock.yaml']).webresources, true)
})

test('plugin Gerar Pagantes entra pelo nome da pasta', () => {
  assert.deepEqual(mudancasDev(['packages/plugins/Cr40f.GerarPagantes.Plugin/Contracts.cs']).plugins, ['gerarpagantes'])
})

test('Formulário Geral publica o WebResource; teste, fixture, .md e docs do app não', () => {
  assert.deepEqual(mudancasDev(['apps/formulario-geral/app.js']), { tela: false, webresources: false, formulario: true, plugins: [] })
  assert.equal(mudancasDev(['apps/formulario-geral/scripts/xlsx_import_core.js']).formulario, true)
  assert.equal(mudancasDev(['apps/formulario-geral/power-platform/flows/ai_schedule_interpret.json', 'apps/formulario-geral/scripts/provision-ai-schedule-flows.ps1']).formulario, false)
  assert.equal(mudancasDev(['packages/deploy/push-formulario-dev.ps1']).formulario, true)
  assert.equal(mudancasDev(['apps/formulario-geral/scripts/xlsx_import_parser.test.js']).formulario, false)
  assert.equal(mudancasDev(['apps/formulario-geral/scripts/ai_schedule_conversation.fixtures.mjs']).formulario, false)
  assert.equal(mudancasDev(['apps/formulario-geral/IMPORTACAO_SERVICOS.md', 'apps/formulario-geral/docs/AI_AGENDAR_POR_IA.md']).formulario, false)
  assert.equal(mudancasDev(['apps/shell/src/App.tsx']).formulario, false)
})
