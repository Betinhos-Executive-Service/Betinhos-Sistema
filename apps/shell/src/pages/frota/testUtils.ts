import { fireEvent, screen, within } from '@testing-library/react'

/** Escolhe uma opção no Select do Design System pelo rótulo do filtro e pelo texto da opção. */
export function escolher(filtro: string, opcao: string) {
  fireEvent.click(screen.getByRole('combobox', { name: filtro }))
  // O painel usa `popover`, que o jsdom trata como oculto.
  fireEvent.click(screen.getByRole('option', { name: opcao, hidden: true }))
}

/** Limpa o filtro (volta a "todos"). */
export function limpar(filtro: string) {
  const trigger = screen.getByRole('combobox', { name: filtro })
  fireEvent.click(within(trigger.parentElement!).getByRole('button', { name: 'Limpar seleção' }))
}

/** Texto mostrado no gatilho: a opção escolhida ou o "todos" do placeholder. */
export const valorDoFiltro = (filtro: string) => screen.getByRole('combobox', { name: filtro }).textContent

/** Linhas de dados da tabela do Design System (sem o cabeçalho nem a linha de filtro rápido). */
export const linhasDaTabela = () => screen.getAllByRole('row').filter((row) => row.classList.contains('bt-table__row')).map((row) => row.textContent)
