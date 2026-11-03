import { describe, expect, it } from 'vitest'
import { ESTADO } from '../domain/treinamentos'
import { createMockSource } from './mock'

const ANEXO = { nome: 'novo.pdf', caminho: 'Treinamentos/x/novo.pdf', tamanho: 1, mime: 'application/pdf' }

describe('salvarAnexos (mock)', () => {
  it('no publicado grava os anexos e carimba editadoEm', async () => {
    const source = createMockSource()
    const publicado = (await source.treinamentos()).find((t) => t.estado === ESTADO.publicado && !t.editadoEm)!
    await source.salvarAnexos(publicado.id, [ANEXO], true)
    const depois = (await source.treinamentos()).find((t) => t.id === publicado.id)!
    expect(depois.anexos).toEqual([ANEXO])
    expect(depois.editadoEm).not.toBeNull()
  })

  it('no rascunho grava os anexos sem carimbar editadoEm', async () => {
    const source = createMockSource()
    const rascunho = (await source.treinamentos()).find((t) => t.estado === ESTADO.rascunho)!
    await source.salvarAnexos(rascunho.id, [ANEXO])
    const depois = (await source.treinamentos()).find((t) => t.id === rascunho.id)!
    expect(depois.anexos).toEqual([ANEXO])
    expect(depois.editadoEm).toBeNull()
  })
})
