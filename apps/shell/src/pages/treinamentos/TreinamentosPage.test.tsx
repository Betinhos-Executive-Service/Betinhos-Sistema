// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TreinamentosPage } from './TreinamentosPage'
import { textoParaHtml } from './domain/formatoTexto'

/** Escreve no editor visual: o texto vira o HTML do editor e dispara `input`. */
const escrever = (el: HTMLElement, texto: string) => { el.innerHTML = textoParaHtml(texto); fireEvent.input(el) }

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
    fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
    expect(await screen.findByRole('heading', { name: 'Embarque no GRU: novo procedimento' })).toBeTruthy()
    // Carlos é o selecionado inicial: o selo aparece na lista e no detalhe.
    expect(await screen.findAllByText('Concluído')).toHaveLength(2)
    expect(screen.getByText('Reprovado · 33%')).toBeTruthy()
    expect(screen.getByText('Aberto')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Assinatura registrada' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Márcio Lima/ }))
    expect(await screen.findByText(/33% · reprovado · 1 tentativa/)).toBeTruthy()
  })

  it('a tabela mostra progresso, exigências e validade com texto', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    const gru = await screen.findByRole('row', { name: /Embarque no GRU/ })
    expect(await within(gru).findByText(/\d de \d (concluiu|concluíram)/)).toBeTruthy()
    expect(within(gru).getByText('Assinatura')).toBeTruthy()
    expect(within(gru).getByText('Quiz')).toBeTruthy()
    expect(within(await screen.findByRole('row', { name: /Direção defensiva/ })).getByText('Venceu há 3 dias')).toBeTruthy()
  })

  it('Voltar fica no início do cabeçalho, antes do título, no painel e no editor', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
    const titulo = await screen.findByRole('heading', { name: 'Embarque no GRU: novo procedimento' })
    const antes = (voltar: HTMLElement, alvo: HTMLElement) => Boolean(voltar.compareDocumentPosition(alvo) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(antes(screen.getByRole('button', { name: 'Voltar' }), titulo)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Editar conteúdo' }))
    const editor = await screen.findByRole('heading', { name: 'Editar treinamento publicado' })
    expect(antes(screen.getByRole('button', { name: 'Voltar' }), editor)).toBe(true)
  })

  it('treinamento não encontrado tem Voltar no topo e leva à lista', async () => {
    window.location.hash = '#/treinamentos?ver=00000000-0000-4000-8000-000000000999'
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Treinamento não encontrado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('row', { name: /Embarque no GRU/ })).toBeTruthy()
  })

  it('mostra o push falho e lembra os pendentes', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
    expect((await screen.findAllByText('Push falhou · Dispositivo não registrado')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Lembrar pendentes' }))
    expect(await screen.findByText(/Lembrete enviado para 2 funcionários/)).toBeTruthy()
    expect(((await screen.findByRole('button', { name: 'Lembrar pendentes' })) as HTMLButtonElement).disabled).toBe(true)
  })

  it('baixa o comprovante só de quem concluiu', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
    // Carlos (concluído) é o selecionado inicial.
    const baixar = await screen.findByRole('button', { name: 'Baixar comprovante' })
    fireEvent.click(baixar)
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled(), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: /Márcio Lima/ }))
    expect(await screen.findByText(/33% · reprovado/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Baixar comprovante' })).toBeNull()
    clique.mockRestore()
  })

  it('o painel nomeia o público selecionado em vez de contar', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Direção defensiva/ }))
    expect(await screen.findByText(/Carlos Alberto Teste, Márcio Lima e mais 1/)).toBeTruthy()
  })

  it('anexar sem título avisa por toast', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('row', { name: /Embarque no GRU/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo treinamento' }))
    fireEvent.change(await screen.findByLabelText('Arquivos para anexar'), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText('Preencha o título antes de anexar.')).toBeTruthy()
  })

  it('treinamento vencido mostra o selo Vencido e o desligado continua no painel', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Direção defensiva/ }))
    expect(await screen.findByText('Vencido')).toBeTruthy()
    expect(await screen.findByText('Desligado')).toBeTruthy()
    expect(screen.getByText('Não aberto')).toBeTruthy()
  })

  it('cria um treinamento com texto, vídeo e quiz de 3 perguntas e publica para os motoristas', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('row', { name: /Embarque no GRU/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo treinamento' }))
    fireEvent.change(await screen.findByLabelText(/^Título/), { target: { value: 'Uniforme e apresentação' } })
    escrever(screen.getByLabelText(/^Texto/), '# Regras\n- Camisa **branca**\n- Terno escuro')
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
    await screen.findByRole('row', { name: /Embarque no GRU/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo treinamento' }))
    fireEvent.change(await screen.findByLabelText(/^Título/), { target: { value: 'Teste' } })
    escrever(screen.getByLabelText(/^Texto/), 'Conteúdo')
    fireEvent.click(screen.getByRole('radio', { name: 'Selecionar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar treinamento' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Selecione pelo menos um funcionário.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('edita o texto e a validade do publicado sem mexer no quiz nem no público', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar conteúdo' }))
    expect(await screen.findByRole('heading', { name: 'Editar treinamento publicado' })).toBeTruthy()
    expect((screen.getByLabelText('Exige quiz') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Publicar treinamento' })).toBeNull()
    escrever(screen.getByLabelText('Texto'), 'Encontro na porta 5.')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Alterações salvas. As participações continuam como estavam.')).toBeTruthy()
    expect(await screen.findByText('Encontro na porta 5.')).toBeTruthy()
    expect(await screen.findAllByText('Concluído')).toHaveLength(2)
  })

  it('Voltar do editor de publicado retorna ao painel', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar conteúdo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('button', { name: 'Reaplicar' })).toBeTruthy()
  })

  it('Reaplicar abre um rascunho copiado com o sufixo de reciclagem', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('row', { name: /Direção defensiva/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reaplicar' }))
    const titulo = await screen.findByLabelText(/^Título/) as HTMLInputElement
    expect(titulo.value).toMatch(/^Direção defensiva: revisão anual \(reciclagem \d{2}\/\d{2}\/\d{4}\)$/)
    expect((screen.getByLabelText('Validade (prazo para concluir)') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Publicar treinamento' })).toBeTruthy()
  })

  it('anexa vídeo num treinamento novo: salva o rascunho sozinho e abre com o anexo', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('row', { name: /Embarque no GRU/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo treinamento' }))
    const input = (await screen.findByLabelText('Arquivos para anexar')) as HTMLInputElement
    const video = new File(['x'], 'manobra.mp4', { type: 'video/mp4' })
    // Rascunho incompleto: avisa o que falta e não envia.
    fireEvent.change(input, { target: { files: [video] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/título/i)
    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: 'Manobras' } })
    escrever(screen.getByLabelText(/^Texto/), 'Conteúdo')
    fireEvent.change(input, { target: { files: [video] } })
    expect(await screen.findByText('manobra.mp4')).toBeTruthy()
    expect(screen.getByText(/Vídeo ·/)).toBeTruthy()
  })
})
