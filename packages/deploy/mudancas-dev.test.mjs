import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mudancasDev, pluginDoArquivo } from './mudancas-dev.mjs'

test('só a tela publica a tela e nenhum plugin', () => {
  assert.deepEqual(mudancasDev(['apps/shell/src/App.tsx', 'docs/x.md']), { tela: true, plugins: [] })
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
  assert.deepEqual(mudancasDev(['packages/plugins/Betinhos.ExpenseUpload/A.cs', 'packages/plugins/Betinhos.ExpenseUpload.Tests/B.cs']), { tela: false, plugins: [] })
  assert.deepEqual(mudancasDev(['packages/plugins/Betinhos.DriverRecordSharing/A.cs', 'packages/plugins/Cr40f.Frota.Plugin/B.cs', 'packages/plugins/Betinhos.DriverRecordSharing/C.cs']), { tela: false, plugins: ['driverrecordsharing', 'frota'] })
})

test('teste de plugin não republica', () => {
  assert.equal(pluginDoArquivo('packages/plugins/Cr40f.Frota.Plugin.Tests/FrotaTests.cs'), null)
  assert.deepEqual(mudancasDev(['packages/plugins/Cr40f.Frota.Plugin.Tests/FrotaTests.cs']), { tela: false, plugins: [] })
})

test('vários plugins saem sem repetição e em ordem', () => {
  const r = mudancasDev([
    'packages/plugins/Cr40f.Portal.Plugin/A.cs',
    'packages/plugins/Cr40f.Acesso.Plugin/B.cs',
    'packages/plugins/tools/Cr40f.Portal.Registrar/Program.cs',
  ])
  assert.deepEqual(r, { tela: false, plugins: ['acesso', 'portal'] })
})

test('flow e schema não publicam nada (continuam à mão)', () => {
  assert.deepEqual(mudancasDev(['packages/deploy/provision-flow-avaliacao.ps1']), { tela: false, plugins: [] })
})

test('sem base publica só a tela', () => {
  assert.deepEqual(mudancasDev(null), { tela: true, plugins: [] })
})
