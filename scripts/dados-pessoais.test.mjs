import { test } from 'node:test'
import assert from 'node:assert/strict'
import { achadosNoTexto, cpfValido, verificar } from './dados-pessoais.mjs'

test('CPF: dígito verificador, sequência repetida e CPFs de teste', () => {
  assert.equal(cpfValido('52998224725'), true)
  assert.equal(cpfValido('52998224724'), false)
  assert.equal(cpfValido('11111111111'), false)
  assert.deepEqual(achadosNoTexto('cpf 529.982.247-25 e 123.456.789-09'), [])
  const [a] = achadosNoTexto('x\ncpf 390.533.447-05')
  assert.equal(a.linha, 2)
  assert.equal(a.tipo, 'CPF válido')
  assert.equal(a.valor, '39***05')
})

test('e-mail: caixas funcionais e nomes de teste passam; pessoa real e provedor pessoal não', () => {
  assert.deepEqual(achadosNoTexto('financeiro@betinhos.com.br ana@betinhos.com.br joao@gmail.com fulano@exemplo.com.br'), [])
  const tipos = achadosNoTexto('fulano.real@betinhos.com.br e Carla.Mendes@Gmail.com').map((a) => a.valor)
  assert.deepEqual(tipos, ['fu***al@betinhos.com.br', 'Ca***es@gmail.com'])
})

test('backup de flow versionado é achado sem ler o arquivo; lock, binário e o próprio teste são ignorados', () => {
  const lidos = []
  const saida = verificar(
    ['packages/deploy/flows/backup/Flow-X.json', 'pnpm-lock.yaml', 'a.png', 'scripts/dados-pessoais.test.mjs', 'src/ok.ts'],
    (f) => { lidos.push(f); return 'nada aqui' },
  )
  assert.equal(saida.length, 1)
  assert.match(saida[0], /backup de flow versionado/)
  assert.deepEqual(lidos, ['src/ok.ts'])
})
