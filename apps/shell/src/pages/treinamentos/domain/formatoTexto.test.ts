import { describe, expect, it } from 'vitest'
import { aplicarFormato } from './formatoTexto'

describe('aplicarFormato', () => {
  it('negrito envolve a seleção e desfaz ao repetir', () => {
    const a = aplicarFormato('dirija com calma', 11, 16, 'negrito')
    expect(a.texto).toBe('dirija com **calma**')
    expect(aplicarFormato(a.texto, a.inicio, a.fim, 'negrito').texto).toBe('dirija com calma')
  })
  it('título entra na linha do cursor e troca lista por título', () => {
    expect(aplicarFormato('a\nComo dirigir\nb', 5, 5, 'titulo').texto).toBe('a\n# Como dirigir\nb')
    expect(aplicarFormato('- item', 0, 0, 'titulo').texto).toBe('# item')
  })
  it('lista cobre várias linhas e alterna', () => {
    const a = aplicarFormato('um\ndois', 0, 7, 'lista')
    expect(a.texto).toBe('- um\n- dois')
    expect(aplicarFormato(a.texto, a.inicio, a.fim, 'lista').texto).toBe('um\ndois')
  })
})
