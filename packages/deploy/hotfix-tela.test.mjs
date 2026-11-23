import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maiorVersao, validarHotfixTela } from './hotfix-tela.mjs'

test('só arquivos da tela passam, com documentação junto', () => {
  assert.equal(validarHotfixTela(['apps/shell/src/App.tsx', 'packages/dataverse/src/x.ts', 'pnpm-lock.yaml', 'docs/x.md']).ok, true)
})

test('o próprio workflow pode entrar na branch (o dispatch precisa dele)', () => {
  assert.equal(validarHotfixTela(['apps/shell/src/App.tsx', '.github/workflows/hotfix-tela.yml']).ok, true)
})

test('sem arquivo da tela não há o que publicar', () => {
  assert.equal(validarHotfixTela([]).ok, false)
  assert.equal(validarHotfixTela(['docs/x.md']).ok, false)
})

test('plugin, schema, flow, solução e outro WebResource reprovam', () => {
  for (const arquivo of [
    'packages/plugins/Cr40f.Frota.Plugin/A.cs',
    'packages/deploy/migrations/20261123-1000-x.ps1',
    'packages/deploy/provision-flow-x.ps1',
    'solution/AppBetinhos/Other/Solution.xml',
    'apps/escala-fds/src/main.tsx',
    'arquivo-desconhecido.bin',
  ]) {
    const r = validarHotfixTela(['apps/shell/src/App.tsx', arquivo])
    assert.equal(r.ok, false, arquivo)
    assert.match(r.erros.join(' '), /soluções/, arquivo)
  }
})

test('mudar CI ou script de publicação reprova, mesmo sendo neutro para o PROD', () => {
  for (const arquivo of ['.github/workflows/producao.yml', 'packages/deploy/push-front-prod.ps1', 'packages/deploy/hotfix-tela.mjs']) {
    const r = validarHotfixTela(['apps/shell/src/App.tsx', arquivo])
    assert.equal(r.ok, false, arquivo)
    assert.match(r.erros.join(' '), /conta de serviço/, arquivo)
  }
})

test('maior versão entre PROD e DEV', () => {
  assert.equal(maiorVersao('0.0.286', '0.0.293'), '0.0.293')
  assert.equal(maiorVersao('0.1.0', 'v0.0.293'), '0.1.0')
  assert.equal(maiorVersao('', '0.0.5'), '0.0.5')
  assert.equal(maiorVersao('', undefined), '')
})
