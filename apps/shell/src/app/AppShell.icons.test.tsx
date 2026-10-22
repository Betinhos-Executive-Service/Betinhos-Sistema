import { describe, expect, it } from 'vitest'
import { MENU } from '../nav/menu'
import { GROUP_ICONS, ITEM_ICONS } from './AppShell'

// Regra do Design System (§10.1): todo grupo e item da sidebar tem ícone.
describe('AppShell: ícones da sidebar', () => {
  it('todo grupo e todo item do menu tem ícone', () => {
    expect(MENU.map((g) => g.id).filter((id) => !GROUP_ICONS[id])).toEqual([])
    expect(MENU.flatMap((g) => g.items.map((i) => i.id)).filter((id) => !ITEM_ICONS[id])).toEqual([])
  })
})
