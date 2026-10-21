// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from './data/source'
import { EquipamentosPage } from './EquipamentosPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/equipamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const openButton = (nome: string) => screen.findByRole('button', { name: new RegExp(`^${nome}`) })
const rowOf = async (nome: string) => (await openButton(nome)).closest('.bt-table__row') as HTMLElement

/** Fonte de exemplo com operações trocadas (carga vazia, falha, salvamento lento). */
function stubSource(over: Partial<sourceModule.Source>) {
  const real = sourceModule.createSource
  return vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), ...over }))
}
const stubLoad = (load: () => Promise<sourceModule.Carga>) => stubSource({ load })

const field = (name: string) => document.querySelector(`.eq-form [name="${name}"]`) as HTMLInputElement

/** Abre o item pela lista e devolve o drawer. */
async function abrir(nome: string) {
  render(<EquipamentosPage host={{ mode: 'mock' }} />)
  fireEvent.click(await openButton(nome))
  return screen.findByRole('dialog', { name: nome })
}

/** Textos das opções do Select do Design System aberto pelo rótulo. */
async function opcoes(dialog: HTMLElement, rotulo: string | RegExp) {
  fireEvent.click(within(dialog).getByRole('combobox', { name: rotulo }))
  const list = await screen.findAllByRole('option', { hidden: true })
  return list.map((o) => o.textContent ?? '')
}

/** Abre o Select pelo rótulo e escolhe a opção pelo texto. */
async function escolher(dialog: HTMLElement, rotulo: string | RegExp, opcao: string) {
  fireEvent.click(within(dialog).getByRole('combobox', { name: rotulo }))
  const item = await waitFor(() => {
    const el = screen.getAllByText(opcao).map((e) => e.closest('[role="option"]')).find(Boolean)
    if (!el) throw new Error(`opção ${opcao} não apareceu`)
    return el
  })
  fireEvent.click(item)
}

describe('Equipamentos', () => {
  it('lista os itens e esconde baixados na visão padrão', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook do Financeiro')
    expect(screen.queryByText('Impressora antiga')).toBeNull()
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
  })

  it('responsável inativo aparece com selo', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Celular plantão')
    expect(within(row).getByText('Gustavo Amostra Pires')).toBeTruthy()
    expect(within(row).getByText('Inativo')).toBeTruthy()
    const ativo = await rowOf('Notebook do Financeiro')
    expect(within(ativo).queryByText('Inativo')).toBeNull()
  })

  it('item sem responsável mostra o texto no lugar do nome', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook reserva')
    await waitFor(() => expect(within(row).getByText('Sem responsável')).toBeTruthy())
  })

  it('compra em dd/mm/aaaa com valor em reais', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook do Financeiro')
    expect(within(row).getByText(/^12\/03\/2025 · R\$\s5\.899,90$/)).toBeTruthy()
  })

  it('clicar na linha grava ?ver=<id>; Novo equipamento grava ?novo=1', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook reserva')
    fireEvent.click(within(row).getByText('TP-E14-778'))
    await waitFor(() => expect(window.location.hash).toContain('ver=eeeeeeee-0000-4000-8000-000000000002'))
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    await waitFor(() => expect(window.location.hash).toContain('novo=1'))
    expect(window.location.hash).not.toContain('ver=')
  })

  it('Marca/modelo nasce oculta; o modelo aparece sob a descrição', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook do Financeiro')
    expect(within(row).getByText('Dell Latitude 5440')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /Marca\/modelo/ })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /Status/ })).toBeTruthy()
  })

  it('busca sem resultado mostra o estado de filtro vazio', async () => {
    window.location.hash = '#/equipamentos?q=xyzinexistente'
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const vazio = (await screen.findByText('Nenhum equipamento com estes filtros')).closest('.bt-empty') as HTMLElement
    fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }))
    await openButton('Notebook do Financeiro')
  })

  it('sem nenhum item mostra o vazio com Novo equipamento', async () => {
    stubLoad(async () => ({ equipamentos: [], tipos: [], pessoas: [] }))
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Nenhum equipamento cadastrado.')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo equipamento' }).at(-1)!)
    await waitFor(() => expect(window.location.hash).toContain('novo=1'))
  })

  it('falha na carga mostra o erro com Tentar de novo', async () => {
    const load = vi.fn<() => Promise<sourceModule.Carga>>()
      .mockRejectedValueOnce(new Error('Tabela cr40f_equipamento não encontrada na metadata.'))
      .mockResolvedValue({ equipamentos: [], tipos: [], pessoas: [] })
    stubLoad(load)
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Não foi possível carregar os equipamentos')).toBeTruthy()
    expect(screen.getByText('Tabela cr40f_equipamento não encontrada na metadata.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nenhum equipamento cadastrado.')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('abre o item, edita e salva', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await openButton('Notebook reserva'))
    await screen.findByRole('dialog', { name: 'Notebook reserva' })
    fireEvent.change(field('marcaModelo'), { target: { value: 'Lenovo ThinkPad E16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Notebook reserva salvo.')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Lenovo ThinkPad E16')).toBeTruthy())
    expect(window.location.hash).not.toContain('ver=')
  })

  it('avisa número de série repetido sem bloquear', async () => {
    const dialog = await abrir('Notebook reserva')
    fireEvent.change(field('numeroSerie'), { target: { value: 'dl5440 001' } })
    expect(await within(dialog).findByText(/Já usado em Notebook do Financeiro/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Notebook reserva salvo.')).toBeTruthy()
  })

  it('cadastro exige tipo e pede confirmação ao fechar com alterações', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook reserva')
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    await screen.findByRole('dialog', { name: 'Novo equipamento' })
    fireEvent.change(field('descricao'), { target: { value: 'Webcam sala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar equipamento' }))
    expect(await screen.findByText('Escolha o tipo.')).toBeTruthy()

    // Cancelar, Esc e clique no fundo pedem confirmação; "Continuar editando" mantém o que foi digitado.
    const drawer = screen.getByRole('dialog', { name: 'Novo equipamento' })
    const tentativas = [
      () => fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar' })),
      () => fireEvent(drawer, new Event('cancel', { cancelable: true })),
      () => fireEvent.click(drawer),
    ]
    for (const fechar of tentativas) {
      fechar()
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
      expect(field('descricao').value).toBe('Webcam sala')
    }

    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo equipamento' })).toBeNull())
    expect(window.location.hash).not.toContain('novo=')
  })

  it('cadastra um item novo e ele entra na lista', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook reserva')
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novo equipamento' })
    fireEvent.change(field('descricao'), { target: { value: 'Webcam sala' } })
    await escolher(dialog, /^Tipo/, 'Outro')
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar equipamento' }))
    expect(await screen.findByText('Webcam sala cadastrado.')).toBeTruthy()
    await openButton('Webcam sala')
  })

  it('seletores mostram só ativos; regras de status e responsável', async () => {
    const dialog = await abrir('Notebook reserva')
    const pessoas = await opcoes(dialog, 'Responsável')
    expect(pessoas).toContain('Fabio Demo Nunes')
    expect(pessoas.some((p) => p.includes('Gustavo'))).toBe(false)
    fireEvent.click(screen.getAllByText('Fabio Demo Nunes').map((e) => e.closest('[role="option"]')).find(Boolean)!)
    // Disponível + responsável → Em uso.
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: /^Status/ }).textContent).toBe('Em uso'))
    // Baixado limpa e desabilita o responsável.
    await escolher(dialog, /^Status/, 'Baixado')
    const resp = within(dialog).getByRole('combobox', { name: 'Responsável' }) as HTMLButtonElement
    await waitFor(() => expect(resp.disabled).toBe(true))
    expect(resp.textContent).toBe('Sem responsável')
    expect(within(dialog).getByText('Item baixado não fica com responsável.')).toBeTruthy()
    const tipos = await opcoes(dialog, /^Tipo/)
    expect(tipos.some((t) => t.startsWith('Pager'))).toBe(false)
  })

  it('responsável e tipo inativos do item continuam no seletor, marcados', async () => {
    const dialog = await abrir('Celular plantão')
    expect(await opcoes(dialog, 'Responsável')).toContain('Gustavo Amostra Pires (inativo)')
    cleanup()
    window.location.hash = '#/equipamentos'
    const pager = await abrir('Pager da portaria')
    expect(await opcoes(pager, /^Tipo/)).toContain('Pager (inativo)')
  })

  it('durante o salvamento não fecha por X, Esc nem fundo', async () => {
    let finish = () => undefined as void
    const update = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    stubSource({ update })
    const dialog = await abrir('Notebook reserva')
    fireEvent.change(field('marcaModelo'), { target: { value: 'Lenovo ThinkPad E16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar painel' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Notebook reserva' })).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true)
    finish()
    expect(await screen.findByText('Notebook reserva salvo.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notebook reserva' })).toBeNull())
  })

  it('falha ao salvar mantém o drawer com os valores e mostra a mensagem', async () => {
    stubSource({ update: vi.fn(async () => { throw new Error('Privilégio insuficiente (prvWritecr40f_equipamento).') }) })
    const dialog = await abrir('Notebook reserva')
    fireEvent.change(field('marcaModelo'), { target: { value: 'Lenovo ThinkPad E16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText(/Privilégio insuficiente \(prvWritecr40f_equipamento\)\./)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Notebook reserva' })).toBe(dialog)
    expect(field('marcaModelo').value).toBe('Lenovo ThinkPad E16')
    expect((within(dialog).getByRole('button', { name: 'Salvar alterações' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('link com id inexistente avisa e mantém a lista', async () => {
    window.location.hash = '#/equipamentos?ver=00000000-0000-0000-0000-000000000000'
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Equipamento não encontrado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    await waitFor(() => expect(screen.queryByText('Equipamento não encontrado')).toBeNull())
    expect(window.location.hash).not.toContain('ver=')
    await openButton('Notebook do Financeiro')
  })

  it('link direto ?ver=<id> abre o item', async () => {
    window.location.hash = '#/equipamentos?ver=eeeeeeee-0000-4000-8000-000000000001'
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('dialog', { name: 'Notebook do Financeiro' })
    await waitFor(() => expect(field('numeroSerie').value).toBe('DL5440-001'))
  })
})
