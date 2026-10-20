import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mascarar } from './mascarar.mjs'

test('esconde e-mail, CPF, CNPJ, telefone, CEP e placa', () => {
  const s = mascarar('joao.silva@betinhos.com.br 123.456.789-09 12.345.678/0001-90 (11) 98765-4321 +55 11 3456-7890 01310-100 ABC1D23 ABC-1234')
  assert.equal(s, '[email] [cpf] [cnpj] [telefone] [telefone] [cep] [placa] [placa]')
})

test('esconde valores de campos pessoais em JSON, qualquer formato', () => {
  const s = mascarar('{"cr40f_nomedopassageiro":"Maria Souza","Endereco":"Rua X, 10","statuscode":3}')
  assert.equal(s, '{"cr40f_nomedopassageiro":"[pessoal]","Endereco":"[pessoal]","statuscode":3}')
})

test('mantém GUIDs, códigos de erro e texto técnico', () => {
  const guid = 'ea79256a-e7c7-f111-a05c-7ced8da8c473'
  const s = mascarar(`{"code":"ActionFailed","message":"An action failed."} flow ${guid} linha 12`)
  assert.ok(s.includes(guid))
  assert.ok(s.includes('ActionFailed'))
  assert.ok(s.includes('linha 12'))
})

test('esconde tokens e assinaturas de URL', () => {
  const s = mascarar('Authorization: Bearer eyJ0eXAi.abc.def https://x/y?sig=AbC123%2F&sv=1 ghp_abcdefghijklmnopqrstuvwxyz123456')
  assert.ok(!s.includes('eyJ0eXAi'))
  assert.ok(!s.includes('AbC123'))
  assert.ok(!s.includes('ghp_abc'))
  assert.ok(s.includes('sv=1'))
})

test('nulo vira vazio', () => {
  assert.equal(mascarar(null), '')
  assert.equal(mascarar(undefined), '')
})
