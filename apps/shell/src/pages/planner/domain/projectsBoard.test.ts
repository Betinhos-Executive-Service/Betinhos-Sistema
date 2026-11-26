import { describe, expect, it } from 'vitest'
import { STATUS } from '../../projetos/domain/choices'
import { MAX_ANEXOS } from '../../projetos/domain/anexos'
import { AVISO_SEM_PROVA, AVISO_SO_RENAN } from '../../projetos/domain/regras'
import { createMockAtualizacoes, createMockEtapas, createMockProjetos } from '../../projetos/data/mock'
import { acceptFiles, attachmentKind, cardsByStatus, moveError, namePastedFile, projectCards } from './projectsBoard'

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

describe('quadro de projetos do Planner', () => {
  const projetos = createMockProjetos()
  const etapas = createMockEtapas()
  const atualizacoes = createMockAtualizacoes()
  const cards = projectCards(projetos, etapas, atualizacoes)

  it('um cartão por projeto; sem etapa cai em Ideia', () => {
    expect(cards).toHaveLength(projetos.length)
    const semEtapa = cards.find((c) => c.projeto.codigo === 'PRJ-4')!
    expect(semEtapa.etapa).toBeNull()
    expect(cardsByStatus(cards).get(STATUS.ideia)).toContain(semEtapa)
    expect([...cardsByStatus(cards).values()].flat()).toHaveLength(cards.length)
  })

  it('só o Renan move; Pronto exige prova', () => {
    const card = cards.find((c) => c.projeto.codigo === 'PRJ-2')!
    expect(moveError(card, STATUS.validacao, 'gestor', atualizacoes)).toBe(AVISO_SO_RENAN)
    expect(moveError(card, STATUS.validacao, 'renan', atualizacoes)).toBeNull()
    expect(moveError({ ...card, etapa: null }, STATUS.concluida, 'renan', [])).toBe(AVISO_SEM_PROVA)
  })

  it('classifica anexos e nomeia o print colado', () => {
    expect(attachmentKind('audio/webm')).toBe('audio')
    expect(attachmentKind('video/mp4')).toBe('video')
    expect(attachmentKind('image/png')).toBe('image')
    expect(attachmentKind('application/pdf')).toBe('file')
    expect(namePastedFile(file('image.png', 'image/png'), new Date(2026, 10, 25, 9, 5, 7)).name).toBe('colado-20261125-090507.png')
    expect(namePastedFile(file('foto.jpg', 'image/jpeg')).name).toBe('foto.jpg')
  })

  it('recusa tipo errado, vazio e acima do limite de quantidade', () => {
    const { accepted, errors } = acceptFiles([], [file('a.png', 'image/png'), file('b.txt', 'text/plain'), file('c.png', 'image/png', 0)])
    expect(accepted.map((f) => f.name)).toEqual(['a.png'])
    expect(errors).toHaveLength(2)
    const cheio = Array.from({ length: MAX_ANEXOS }, (_, i) => file(`${i}.png`, 'image/png'))
    expect(acceptFiles(cheio, [file('x.png', 'image/png')]).accepted).toHaveLength(0)
  })
})
