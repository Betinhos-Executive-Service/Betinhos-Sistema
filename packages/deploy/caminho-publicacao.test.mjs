import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhoDaPublicacao, caminhoDoArquivo } from './caminho-publicacao.mjs'

test('só a tela vai direto (front)', () => {
  const r = caminhoDaPublicacao(['apps/shell/src/App.tsx', 'packages/dataverse/src/cliente.ts', 'pnpm-lock.yaml'])
  assert.equal(r.caminho, 'front')
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

test('teste de plugin não muda o PROD', () => {
  assert.equal(caminhoDaPublicacao(['packages/plugins/Cr40f.Frota.Plugin.Tests/A.cs']).caminho, 'nada')
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
