import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executarFontes } from './fontes.mjs'
import { mascarar } from './mascarar.mjs'

test('falha na leitura da tabela de log não derruba as outras fontes', async () => {
  const { saida, falhas } = await executarFontes([
    ['flowsProd', async () => [1]],
    ['logsAppsProd', async () => { throw new Error('prod new_appmotoristaslogs: HTTP 403 joao@betinhos.com.br') }],
    ['appProd', async () => [2]],
  ], mascarar)
  assert.deepEqual(saida, { flowsProd: [1], logsAppsProd: null, appProd: [2] })
  assert.equal(falhas.length, 1)
  assert.match(falhas[0], /^logsAppsProd: .*HTTP 403 \[email\]$/)
})
