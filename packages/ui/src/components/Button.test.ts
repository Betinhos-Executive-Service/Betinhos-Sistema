import { expect, it } from 'vitest'
import { buttonClassName } from './Button'

it('usa primary e altura padrão quando nada é informado', () => {
  expect(buttonClassName()).toBe('bt-button bt-button--primary')
})

it('combina variante, tamanho, largura total, ícone e classe extra', () => {
  expect(buttonClassName({ variant: 'danger', size: 'compact', fullWidth: true, iconOnly: true }, 'minha-classe'))
    .toBe('bt-button bt-button--danger bt-button--compact bt-button--full bt-button--icon minha-classe')
})
