import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

/** O botão só libera quando a prévia do que deixa de ter chega. */
export async function salvar(nome: string) {
  const botao = screen.getByRole('button', { name: nome }) as HTMLButtonElement
  await waitFor(() => expect(botao.disabled).toBe(false))
  fireEvent.click(botao)
}
