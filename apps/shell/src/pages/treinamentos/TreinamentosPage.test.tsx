// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TreinamentosPage } from './TreinamentosPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/treinamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Treinamentos', () => {
  it('lista e abre o painel com status por motorista, assinatura e nota', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Embarque no GRU/ }))
    expect(await screen.findByRole('heading', { name: 'Embarque no GRU: novo procedimento' })).toBeTruthy()
    // Carlos é o selecionado inicial: o selo aparece na lista e no detalhe.
    expect(await screen.findAllByText('Concluído')).toHaveLength(2)
    expect(screen.getByText('Reprovado · 33%')).toBeTruthy()
    expect(screen.getByText('Aberto')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Assinatura registrada' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Márcio Lima/ }))
    expect(await screen.findByText(/33% · reprovado · 1 tentativa/)).toBeTruthy()
  })

  it('treinamento vencido mostra o selo Vencido e o desligado continua no painel', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Direção defensiva/ }))
    expect(await screen.findByText('Vencido')).toBeTruthy()
    expect(await screen.findByText('Desligado')).toBeTruthy()
    expect(screen.getByText('Não aberto')).toBeTruthy()
  })

  it('cria um treinamento com texto, vídeo e quiz de 3 perguntas e publica para os motoristas', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('button', { name: /Embarque no GRU/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo treinamento' }))
    fireEvent.change(await screen.findByLabelText(/^Título/), { target: { value: 'Uniforme e apresentação' } })
    fireEvent.change(screen.getByLabelText(/^Texto/), { target: { value: '# Regras\n- Camisa **branca**\n- Terno escuro' } })
    fireEvent.change(screen.getByLabelText(/Vídeo/), { target: { value: 'youtube.com/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar treinamento' }))
    expect((await screen.findByRole('alert')).textContent).toContain('O vídeo precisa de um link https:// válido.')
    fireEvent.change(screen.getByLabelText(/Vídeo/), { target: { value: 'https://www.youtube.com/watch?v=abc' } })

    fireEvent.click(screen.getByLabelText('Exige quiz'))
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }))
    const perguntas = screen.getAllByRole('group', { name: /Pergunta \d/ })
    expect(perguntas).toHaveLength(3)
    perguntas.forEach((grupo, i) => {
      fireEvent.change(within(grupo).getByLabelText(/Enunciado/), { target: { value: `Pergunta ${i + 1}?` } })
      fireEvent.change(within(grupo).getByLabelText(`Texto da alternativa 1 da pergunta ${i + 1}`), { target: { value: 'Errada' } })
      fireEvent.change(within(grupo).getByLabelText(`Texto da alternativa 2 da pergunta ${i + 1}`), { target: { value: 'Certa' } })
    })
    // Sem alternativa correta marcada: não salva.
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Marque a alternativa correta da pergunta 1.')
    perguntas.forEach((grupo, i) => fireEvent.click(within(grupo).getByLabelText(`Alternativa 2 da pergunta ${i + 1} é a correta`)))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar treinamento' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publicar para 3 funcionários?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar agora' }))
    expect(await screen.findByText('Treinamento publicado para 3 funcionários.')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Uniforme e apresentação' })).toBeTruthy()
    // 3 na lista + 1 no detalhe do selecionado inicial.
    expect(await screen.findAllByText('Não aberto')).toHaveLength(4)
  })

  it('público selecionado vazio avisa e não publica', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('button', { name: /Embarque no GRU/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo treinamento' }))
    fireEvent.change(await screen.findByLabelText(/^Título/), { target: { value: 'Teste' } })
    fireEvent.change(screen.getByLabelText(/^Texto/), { target: { value: 'Conteúdo' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Selecionar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar treinamento' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Selecione pelo menos um funcionário.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
