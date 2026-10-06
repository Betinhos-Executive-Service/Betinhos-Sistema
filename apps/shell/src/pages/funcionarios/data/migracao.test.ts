// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createMockSource } from './mock'
import { imagensNoDataverse, migrarImagens } from './migracao'
import { extractSpAnexos } from './notes'

describe('migrarImagens', () => {
  it('copia a imagem para o SharePoint, mantém texto e anexo original e não repete', async () => {
    const source = createMockSource()
    const antes = await source.anotacoes('m1')
    expect(imagensNoDataverse(antes).map((nota) => nota.id)).toEqual(['n1'])
    const progresso = vi.fn()
    const resultado = await migrarImagens(source, 'm1', antes, progresso)
    expect(resultado).toEqual({ movidas: 1, falhas: [] })
    expect(progresso).toHaveBeenLastCalledWith(1, 1)

    const nota = (await source.anotacoes('m1')).find((item) => item.id === 'n1')!
    expect(nota.arquivo).toMatchObject({ nome: 'cnh-renovada.png' })
    const { corpo, anexos } = extractSpAnexos(nota.texto)
    expect(corpo).toContain('Entregou documentos da CNH renovada.')
    expect(anexos[0].caminho).toMatch(/^\/Documentos Compartilhados\/Funcionarios\/DEV\/m1\/Anotacoes\/\d{8}-\d{6} cnh-renovada\.png$/)
    expect(imagensNoDataverse(await source.anotacoes('m1'))).toEqual([])
  }, 15_000)

  it('apaga a cópia do SharePoint se a nota não puder ser atualizada', async () => {
    const source = createMockSource()
    const notas = await source.anotacoes('m1')
    source.updateAnotacao = async () => { throw new Error('Sem permissão.') }
    const excluir = vi.spyOn(source.documentos, 'excluir')
    const resultado = await migrarImagens(source, 'm1', notas)
    expect(resultado.movidas).toBe(0)
    expect(resultado.falhas).toEqual([{ notaId: 'n1', arquivo: 'cnh-renovada.png', erro: 'Sem permissão' }])
    expect(excluir).toHaveBeenCalledOnce()
    expect((await source.anotacoes('m1')).find((item) => item.id === 'n1')!.arquivo).not.toBeNull()
  }, 15_000)
})
