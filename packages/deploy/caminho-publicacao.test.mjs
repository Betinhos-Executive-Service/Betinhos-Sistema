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
