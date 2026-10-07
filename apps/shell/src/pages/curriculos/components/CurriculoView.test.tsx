// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createSource } from '../data/source'
import { MOCK_CHOICES } from '../data/mock'
import { makeCurriculo } from '../domain/fixtures'
import { CurriculoView } from './CurriculoView'

afterEach(cleanup)

describe('CurriculoView: arquivos', () => {
  it('sem link e sem arquivo na pasta, avisa que não há anexo', async () => {
    const source = createSource({ mode: 'mock' })
    render(<CurriculoView c={makeCurriculo({ id: 'c1', link: '' })} choices={MOCK_CHOICES} source={source} />)
    expect(screen.getByText('Carregando arquivos…')).toBeTruthy()
    expect(await screen.findByText('Sem arquivo anexado.')).toBeTruthy()
  })

  it('lista o arquivo salvo na pasta do candidato e mantém o link antigo', async () => {
    const source = createSource({ mode: 'mock' })
    expect(await source.upload('c2', new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }), {})).toBe('')
    render(<CurriculoView c={makeCurriculo({ id: 'c2', link: 'https://exemplo.invalid/antigo.pdf' })} choices={MOCK_CHOICES} source={source} />)
    expect(await screen.findByRole('button', { name: /^Abrir \d{8}-\d{6} cv\.pdf$/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Abrir currículo' }).getAttribute('href')).toBe('https://exemplo.invalid/antigo.pdf')
    expect(screen.queryByText('Sem arquivo anexado.')).toBeNull()
  })
})
