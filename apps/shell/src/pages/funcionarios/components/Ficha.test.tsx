// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/source'
import { createMockDocsSource } from '../../documentos/data/source'
import type { Funcionario } from '../data/types'
import { Ficha } from './Ficha'
import { ToastProvider } from '@betinhos/ui'

const record: Funcionario = {
  id: 'f1',
  values: { cr40f_nomecompleto: 'Ana Souza', new_apelido: 'Ana', cr40f_status: 0, cr40f_funcao: 202410000 },
  veiculo: null, fotoThumb: null, fotoUrl: null, assinaturaUrl: null, loginsesenhas: null, modifiedon: null,
}

function fakeSource(save: DataSource['save']): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    list: async () => [record], get: async () => structuredClone(record), save,
    uploadImage: async () => {}, saveLogins: async () => {}, multas: async () => [], posses: async () => [], anotacoes: async () => [], addAnotacao: async () => {}, updateAnotacao: async () => {}, deleteAnotacao: async () => {}, limitesAnexo: async () => ({ maxBytes: 5e6, bloqueadas: [] }), anexo: async () => ({ nome: 'a', blob: new Blob() }),
    documentos: { pasta: () => '', listar: async () => [], enviar: async () => { throw new Error('n/a') }, abrir: async () => ({ nome: '', blob: new Blob() }), excluir: async () => {} },
    searchVeiculos: async () => [], openForm: () => {},
  }
}

async function renderFicha(source: DataSource) {
  render(<ToastProvider><Ficha source={source} id="f1" onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
  return screen.findByDisplayValue('Ana Souza')
}

afterEach(() => { cleanup(); window.location.hash = ''; vi.unstubAllGlobals() })

describe('Ficha', () => {
  it('salva somente o campo alterado', async () => {
    const save = vi.fn(async () => 'f1')
    await renderFicha(fakeSource(save))
    fireEvent.change(screen.getByLabelText(/Apelido/), { target: { value: 'Aninha' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const [, draft] = save.mock.calls[0] as unknown as [Funcionario, { values: Record<string, unknown> }]
    expect(draft.values.new_apelido).toBe('Aninha')
  })

  it('Validade da CNH e Data do ASO aparecem somente leitura com a dica e não vão no PATCH', async () => {
    const withDocs: Funcionario = { ...record, values: { ...record.values, cr40f_validadedacnh: '2027-01-10', cr40f_datadoaso: '2026-05-20' } }
    const save = vi.fn(async () => 'f1')
    const source = { ...fakeSource(save), get: async () => structuredClone(withDocs) }
    await renderFicha(source)
    for (const [label, valor] of [['Validade da CNH', '2027-01-10'], ['Data do ASO', '2026-05-20']] as const) {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.value).toBe(valor)
      expect(input.disabled).toBe(true)
      const hint = within(input.closest('.bt-field') as HTMLElement).getByText('Edite em Documentos')
      expect(input.getAttribute('aria-describedby')).toBe(hint.id)
    }
    fireEvent.change(screen.getByLabelText(/Apelido/), { target: { value: 'Aninha' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const [orig, draft] = save.mock.calls[0] as unknown as [Funcionario, { values: Record<string, unknown> }]
    expect(orig.values.cr40f_validadedacnh).toBe('2027-01-10')
    expect(draft.values.cr40f_validadedacnh).toBe('2027-01-10')
    expect(draft.values.cr40f_datadoaso).toBe('2026-05-20')
  })

  it('mantém o rascunho quando o Dataverse recusa', async () => {
    const save = vi.fn(async () => { throw new Error('Permissão negada.') })
    await renderFicha(fakeSource(save))
    fireEvent.change(screen.getByLabelText(/Apelido/), { target: { value: 'Aninha' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
    expect(await screen.findByText(/Não salvou: Permissão negada\. Suas alterações/)).toBeTruthy()
    expect((screen.getByLabelText(/Apelido/) as HTMLInputElement).value).toBe('Aninha')
  })

  it('bloqueia salvar com CPF inválido', async () => {
    const save = vi.fn(async () => 'f1')
    await renderFicha(fakeSource(save))
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '11111111111' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
    expect(screen.getByText('CPF inválido')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('aba Documentos mostra o checklist de documentos controlados quando há fonte de documentos', async () => {
    window.location.hash = '#/funcionarios?ficha=f1&secao=documentos'
    render(<ToastProvider><Ficha source={fakeSource(vi.fn(async () => 'f1'))} id="f1" docs={createMockDocsSource()} onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    // O id do mock de Funcionários (f1) não está nos donos do mock de documentos; a seção aparece mesmo assim.
    expect(await screen.findByText('Cadastro não encontrado na lista de documentos.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Outros arquivos' })).toBeTruthy()
  })

  it('aba Documentos não mostra o checklist sem fonte de documentos', async () => {
    window.location.hash = '#/funcionarios?ficha=f1&secao=documentos'
    render(<ToastProvider><Ficha source={fakeSource(vi.fn(async () => 'f1'))} id="f1" onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    expect(await screen.findByRole('heading', { name: 'Arquivos' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Outros arquivos' })).toBeNull()
    expect(screen.queryByText('Cadastro não encontrado na lista de documentos.')).toBeNull()
  })

  it('Esc dentro do painel de renovação não fecha a ficha', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    window.location.hash = '#/funcionarios?ficha=f-ana&secao=documentos'
    const onClose = vi.fn()
    const base = fakeSource(vi.fn(async () => 'f-ana'))
    const source: DataSource = { ...base, get: async () => structuredClone({ ...record, id: 'f-ana' }) }
    render(<ToastProvider><Ficha source={source} id="f-ana" docs={createMockDocsSource()} onClose={onClose} onSaved={() => {}} /></ToastProvider>)
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    const painel = await screen.findByRole('dialog', { name: 'Renovar CNH' })
    fireEvent.keyDown(painel, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
