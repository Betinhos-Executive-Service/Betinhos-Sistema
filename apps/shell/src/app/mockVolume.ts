import { FIRST_PAGE } from './pagedLoad'

/**
 * Modo mock com listas grandes, para testar desempenho no `pnpm dev`: `?volume=5000` antes do `#` multiplica os
 * registros de exemplo; `?falha=carga` faz a carga completa falhar depois da primeira página.
 */
function param(name: string) {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

/** Quantos registros de exemplo a lista deve ter (0 = só os de sempre). */
export function mockVolume() {
  const value = Number(param('volume'))
  return Number.isInteger(value) && value > 0 ? Math.min(value, 20_000) : 0
}

export const mockFalhaCarga = () => param('falha') === 'carga'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Simula a carga do Dataverse: listas pequenas chegam de uma vez (como antes); grandes mostram a primeira página
 * logo e o resto depois, com tempo proporcional ao volume.
 */
export async function mockProgressive<T>(rows: T[], onFirstPage: ((rows: T[]) => void) | undefined, base = 350) {
  if (rows.length <= FIRST_PAGE) {
    await wait(base)
    return rows
  }
  await wait(120)
  onFirstPage?.(rows.slice(0, FIRST_PAGE))
  await wait(Math.min(base + rows.length / 3, 2500))
  if (mockFalhaCarga()) throw new Error('Falha simulada no meio da carga (?falha=carga).')
  return rows
}

/** Busca simulada no servidor: as primeiras linhas que batem. */
export async function mockSearch<T>(rows: T[], matches: (row: T) => boolean, top = 50) {
  await wait(150)
  return rows.filter(matches).slice(0, top)
}
