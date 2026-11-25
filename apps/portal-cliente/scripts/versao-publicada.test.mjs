import { test, expect } from 'vitest'
import { versaoDoHtml, versaoPublicada } from './versao-publicada.mjs'

test('lê a versão da meta da página', () => {
  expect(versaoDoHtml('<head><meta name="portal-versao" content="0.0.12"></head>')).toBe('0.0.12')
})

test('página sem versão ou lixo: null', () => {
  expect(versaoDoHtml('<html></html>')).toBe(null)
  expect(versaoDoHtml(undefined)).toBe(null)
})

test('falha de rede: null, sem derrubar a publicação', async () => {
  expect(await versaoPublicada('https://x', { fetch: async () => { throw new Error('rede') } })).toBe(null)
})
