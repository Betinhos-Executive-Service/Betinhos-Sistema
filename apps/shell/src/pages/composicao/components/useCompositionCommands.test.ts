import { describe, expect, it } from 'vitest'
import { confirmDialogContent } from './useCompositionCommands'

const pending = (eligible: string[]) => ({ kind: 'op' as const, result: { eligible, existing: ['OS-9'], withoutService: [], readErrors: [] } })

describe('confirmDialogContent (Gerar OP)', () => {
  it('anuncia uma única OP para todos os serviços elegíveis', () => {
    const content = confirmDialogContent(pending(['a', 'b', 'c']), false)
    expect(content.title).toBe('Gerar 1 ordem de pagamento com 3 serviços?')
    expect(content.description).toBe('Uma única OP será criada e vinculada aos 3 serviços elegíveis.')
    expect(content.confirmLabel).toBe('Gerar 1 OP')
  })

  it('usa o singular com um serviço e mantém a simulação no modo local', () => {
    const content = confirmDialogContent(pending(['a']), true)
    expect(content.title).toBe('Simular 1 ordem de pagamento com 1 serviço?')
    expect(content.confirmLabel).toBe('Simular 1 OP')
  })
})
