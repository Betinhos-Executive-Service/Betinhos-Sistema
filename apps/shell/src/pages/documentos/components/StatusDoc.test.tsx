// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusDoc } from './StatusDoc'

afterEach(cleanup)

describe('StatusDoc', () => {
  it('mostra estado e prazo', () => {
    render(<><StatusDoc estado="vencido" dias={-3} /><StatusDoc estado="vence30" dias={20} /><StatusDoc estado="faltando" dias={null} /><StatusDoc estado="semValidade" dias={null} /></>)
    expect(screen.getByText('Vencido · vencido há 3 dias')).toBeTruthy()
    expect(screen.getByText('Vence em 20 dias')).toBeTruthy()
    expect(screen.getByText('Faltando')).toBeTruthy()
    expect(screen.getByText('Sem validade')).toBeTruthy()
  })
})
