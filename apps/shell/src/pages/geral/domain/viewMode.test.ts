import { describe, expect, it } from 'vitest'
import { loadViewMode, saveViewMode, VIEW_MODE_KEY, type ViewMode } from './viewMode'

const memory = (initial?: string) => {
  const map = new Map<string, string>(initial == null ? [] : [[VIEW_MODE_KEY, initial]])
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }
}

describe('viewMode', () => {
  it('padrão é tabela e valor inválido volta para tabela', () => {
    expect(loadViewMode(memory())).toBe('tabela')
    expect(loadViewMode(memory('lista'))).toBe('tabela')
  })
  it('persiste e relê a escolha', () => {
    const kv = memory()
    for (const mode of ['cards', 'tabela'] as ViewMode[]) { saveViewMode(kv, mode); expect(loadViewMode(kv)).toBe(mode) }
  })
  it('storage que lança não quebra', () => {
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => undefined }
    expect(loadViewMode(broken)).toBe('tabela')
    expect(() => saveViewMode(broken, 'cards')).not.toThrow()
  })
})
