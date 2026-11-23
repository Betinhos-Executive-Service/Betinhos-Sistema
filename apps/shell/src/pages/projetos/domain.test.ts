import { describe, expect, it } from 'vitest'
import { createMockAtualizacoes, createMockProjetos } from './data/mock'
import { atualizacoesPath, mapAtualizacao, projetosPath } from './data/queries'
import { MAX_ANEXO_BYTES, erroDoAnexo } from './domain/anexos'
import { AUTOR, STATUS } from './domain/choices'
import { applyForm, diffForm, emptyForm, emptyProjeto, toForm, validateForm } from './domain/form'
import { builtinViews, projetoKeywordText, sortProjetos } from './domain/lista'
import { AVISO_SEM_PROVA, atrasado, doProjeto, erroDeStatus, podeConcluir, provas } from './domain/regras'
import type { Atualizacao } from './domain/types'

const at = (over: Partial<Atualizacao>): Atualizacao => ({ id: 'a', projetoId: 'p', data: '2026-11-20T10:00:00', autor: AUTOR.agente, texto: '', prova: false, anexos: [], ...over })
const anexo = { id: 'x', nome: 'print.png', tipo: 'image/png', tamanho: 10 }

describe('regra do Concluído', () => {
  it('sem atualização não conclui', () => {
    expect(podeConcluir([])).toBe(false)
    expect(erroDeStatus(STATUS.concluido, [])).toBe(AVISO_SEM_PROVA)
  })
  it('prova sem anexo ou anexo sem marca de prova não conta', () => {
    expect(podeConcluir([at({ prova: true })])).toBe(false)
    expect(podeConcluir([at({ anexos: [anexo] })])).toBe(false)
  })
  it('prova com anexo libera o Concluído; outros status são livres', () => {
    const lista = [at({ prova: true, anexos: [anexo] })]
    expect(provas(lista)).toHaveLength(1)
    expect(erroDeStatus(STATUS.concluido, lista)).toBeNull()
    expect(erroDeStatus(STATUS.pausado, [])).toBeNull()
  })
})

describe('formulário', () => {
  const base = { ...emptyForm(), nome: 'Projeto X' }
  it('exige nome, andamento de 0 a 100 e link http(s)', () => {
    expect(validateForm(emptyForm(), []).nome).toBeTruthy()
    expect(validateForm({ ...base, andamento: '101' }, []).andamento).toBeTruthy()
    expect(validateForm({ ...base, linkPr: 'javascript:alert(1)' }, []).linkPr).toBeTruthy()
    expect(validateForm({ ...base, prazo: '2026-02-30' }, []).prazo).toBeTruthy()
    expect(validateForm(base, [])).toEqual({})
  })
  it('Concluído sem prova vira erro de status', () => {
    expect(validateForm({ ...base, status: String(STATUS.concluido) }, []).status).toBe(AVISO_SEM_PROVA)
  })
  it('diff só leva o que mudou e limpa campo esvaziado', () => {
    const p = { ...emptyProjeto('1'), nome: 'A', area: 'Frota' }
    const f = { ...toForm(p), area: '', andamento: '40' }
    expect(diffForm(toForm(p), f)).toEqual({ cr40f_area: null, cr40f_andamento: 40 })
    expect(applyForm(p, f)).toMatchObject({ area: '', andamento: 40 })
  })
})

describe('anexos', () => {
  it('aceita imagem, vídeo e PDF; recusa o resto, o grande e o vazio', () => {
    expect(erroDoAnexo({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.mp4', type: 'video/mp4', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.exe', type: 'application/x-msdownload', size: 100 })).toMatch(/só imagem/)
    expect(erroDoAnexo({ name: 'g.png', type: 'image/png', size: MAX_ANEXO_BYTES + 1 })).toMatch(/limite de 5 MB/)
    expect(erroDoAnexo({ name: 'v.png', type: 'image/png', size: 0 })).toMatch(/vazio/)
  })
})

describe('lista e dados', () => {
  it('atrasado: prazo vencido e não concluído nem pausado', () => {
    expect(atrasado({ prazo: '2026-11-01', status: STATUS.andamento }, '2026-11-23')).toBe(true)
    expect(atrasado({ prazo: '2026-11-01', status: STATUS.concluido }, '2026-11-23')).toBe(false)
    expect(atrasado({ prazo: null, status: STATUS.andamento }, '2026-11-23')).toBe(false)
  })
  it('linha do tempo vem da mais recente para a mais antiga', () => {
    const itens = doProjeto(createMockAtualizacoes(), createMockProjetos()[0].id)
    expect(itens.map((a) => a.data)).toEqual([...itens.map((a) => a.data)].sort().reverse())
    expect(itens.some((a) => a.autor === AUTOR.agente)).toBe(true)
  })
  it('visões prontas, busca e ordenação', () => {
    expect(builtinViews().map((v) => v.name)).toEqual(['Em curso', 'Em validação', 'Concluídos'])
    const linhas = createMockProjetos().map((p) => ({ ...p, ultimaEm: null, provas: 0 }))
    expect(projetoKeywordText(linhas[0])).toContain('Painel de indicadores')
    expect(sortProjetos(linhas, { key: 'andamento', dir: 'desc' })[0].andamento).toBe(100)
  })
  it('consultas e mapeamento do Dataverse', () => {
    expect(projetosPath('cr40f_projetos')).toContain('cr40f_instrucoes')
    expect(atualizacoesPath('cr40f_projetoatualizacaos')).toContain('cr40f_projetoatualizacao_Annotations')
    const a = mapAtualizacao({ cr40f_projetoatualizacaoid: 'ID1', _cr40f_projeto_value: 'P1', cr40f_data: '2026-11-20T10:00:00Z', cr40f_autor: AUTOR.agente, cr40f_texto: 't', cr40f_eprova: true, cr40f_projetoatualizacao_Annotations: [{ annotationid: 'N1', filename: 'a.png', mimetype: 'image/png', filesize: 5 }] })
    expect(a).toMatchObject({ id: 'id1', projetoId: 'p1', prova: true, autor: AUTOR.agente })
    expect(a.anexos).toHaveLength(1)
  })
})
