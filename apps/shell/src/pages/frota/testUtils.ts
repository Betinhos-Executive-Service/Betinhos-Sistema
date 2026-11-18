import { fireEvent, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { ArquivosManutencao, ComandosManutencao } from './data/source'

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

/** Métodos da manutenção para as fontes falsas dos testes que não os exercitam. */
export function manutencaoFalsa(): ComandosManutencao & ArquivosManutencao {
  return {
    detalheManutencao: vi.fn(async () => null),
    criarManutencao: vi.fn(async () => 'nova'),
    agendarManutencao: vi.fn(async () => {}),
    programarManutencao: vi.fn(async () => {}),
    reprovarManutencao: vi.fn(async () => {}),
    cancelarManutencao: vi.fn(async () => {}),
    concluirManutencao: vi.fn(async () => ({ despesaId: 'd1', statusAnexo: 100000002, geralId: null })),
    enviarArquivoManutencao: vi.fn(async (_alvo: unknown, arquivo: File) => ({ link: `https://example.invalid/${arquivo.name}`, nomeArquivo: arquivo.name, caminho: 'Manutenções/TESTE' })),
    anexarNotaFiscalDespesa: vi.fn(async () => {}),
    buscarFuncionarios: vi.fn(async () => []),
    buscarCidades: vi.fn(async () => []),
    buscarVeiculos: vi.fn(async () => []),
  }
}
