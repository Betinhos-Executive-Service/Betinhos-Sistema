import { expect, it } from 'vitest'
import { buttonClassName } from './Button'

it('usa primary e altura padrão quando nada é informado', () => {
  expect(buttonClassName()).toBe('bt-button bt-button--primary')
})

it('combina variante, tamanho, largura total, ícone e classe extra', () => {
  expect(buttonClassName({ variant: 'danger', size: 'compact', fullWidth: true, iconOnly: true }, 'minha-classe'))
    .toBe('bt-button bt-button--danger bt-button--compact bt-button--full bt-button--icon minha-classe')
})

it('rótulo usa line-height da escala do DS (line-height 1 cortava o acento de "Últimos")', async () => {
  // O Vitest roda em Node e devolve '' para .css (até com ?raw); lê o arquivo direto (tipos de node:fs via @types/node do Vite).
  const { readFileSync } = await import('node:fs')
  const css: string = readFileSync(new URL('./button.css', import.meta.url), 'utf8')
  expect(css).not.toMatch(/\.bt-button\s*\{[^}]*line-height:\s*1\s*;/)
  expect(css).toMatch(/\.bt-button\s*\{[^}]*line-height:\s*var\(--bt-typography-body-default-line-height\)/)
  expect(css).toMatch(/\.bt-button--compact\s*\{[^}]*line-height:\s*var\(--bt-typography-body-small-line-height\)/)
})
