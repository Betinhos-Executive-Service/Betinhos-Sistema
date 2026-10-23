// @vitest-environment jsdom
import { useState } from 'react'
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

function fakeSource(save: DataSource['save'], extra: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    list: async () => [record], get: async () => structuredClone(record), save,
    uploadImage: async () => {}, uploadAditivo: async () => {}, saveLogins: async () => {}, multas: async () => [], posses: async () => [], equipamentos: async () => [], anotacoes: async () => [], addAnotacao: async () => {}, updateAnotacao: async () => {}, deleteAnotacao: async () => {}, limitesAnexo: async () => ({ maxBytes: 5e6, bloqueadas: [] }), anexo: async () => ({ nome: 'a', blob: new Blob() }),
    documentos: { pasta: () => '', listar: async () => [], enviar: async () => { throw new Error('n/a') }, abrir: async () => ({ nome: '', blob: new Blob() }), excluir: async () => {} },
    searchVeiculos: async () => [], openForm: () => {},
    ...extra,
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
    window.location.hash = '#/funcionarios?ficha=m1&secao=documentos'
    const onClose = vi.fn()
    const base = fakeSource(vi.fn(async () => 'm1'))
    const source: DataSource = { ...base, get: async () => structuredClone({ ...record, id: 'm1' }) }
    render(<ToastProvider><Ficha source={source} id="m1" docs={createMockDocsSource()} onClose={onClose} onSaved={() => {}} /></ToastProvider>)
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    const painel = await screen.findByRole('dialog', { name: 'Renovar CNH' })
    fireEvent.keyDown(painel, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('aba Equipamentos fica entre Veículos e Anotações, lista o que está com o funcionário e abre o item', async () => {
    const equipamentos = vi.fn(async () => [
      { id: 'e1', descricao: 'Notebook do Financeiro', tipo: 'Notebook', numeroSerie: 'DL5440-001', status: 100000000 },
      { id: 'e2', descricao: 'Mouse sem fio', tipo: 'Mouse', numeroSerie: '', status: 100000002 },
    ])
    await renderFicha(fakeSource(vi.fn(async () => 'f1'), { equipamentos }))
    const abas = screen.getAllByRole('tab').map((tab) => tab.textContent)
    expect(abas.slice(abas.indexOf('Veículos'), abas.indexOf('Veículos') + 3)).toEqual(['Veículos', 'Equipamentos', 'Anotações'])
    fireEvent.click(screen.getByRole('tab', { name: 'Equipamentos' }))
    expect(await screen.findByText('Notebook do Financeiro')).toBeTruthy()
    expect(screen.getByText('Notebook · Série DL5440-001')).toBeTruthy()
    expect(screen.getByText('Mouse')).toBeTruthy()
    expect(screen.getByText('Em uso')).toBeTruthy()
    expect(screen.getByText('Em manutenção')).toBeTruthy()
    // Um link por item (a descrição); a seta é só alvo de toque, fora da árvore de acessibilidade e do Tab.
    expect(screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Notebook do Financeiro', '#/equipamentos?ver=e1'],
      ['Mouse sem fio', '#/equipamentos?ver=e2'],
    ])
    expect(screen.getByRole('link', { name: 'Abrir equipamento Notebook do Financeiro' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()
    expect(equipamentos).toHaveBeenCalledWith('f1')
  })

  it('aba Equipamentos vazia explica', async () => {
    await renderFicha(fakeSource(vi.fn(async () => 'f1')))
    fireEvent.click(screen.getByRole('tab', { name: 'Equipamentos' }))
    expect(await screen.findByText('Nenhum equipamento com este funcionário.')).toBeTruthy()
  })

  it('aba Equipamentos com erro de carga (ex.: tabela ausente) mostra o erro só dentro da aba', async () => {
    const equipamentos = vi.fn(async () => { throw new Error('Tabela cr40f_equipamento não encontrada na metadata.') })
    await renderFicha(fakeSource(vi.fn(async () => 'f1'), { equipamentos }))
    fireEvent.click(screen.getByRole('tab', { name: 'Equipamentos' }))
    expect(await screen.findByText('Não foi possível carregar.')).toBeTruthy()
    expect(screen.getByText('Tabela cr40f_equipamento não encontrada na metadata')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Dados' }))
    expect(await screen.findByDisplayValue('Ana Souza')).toBeTruthy()
  })

  it('funcionário novo não abre a aba Equipamentos', async () => {
    const equipamentos = vi.fn(async () => [])
    render(<ToastProvider><Ficha source={fakeSource(vi.fn(async () => 'f1'), { equipamentos })} id={null} onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    const aba = screen.getByRole('tab', { name: 'Equipamentos' })
    expect(aba.hasAttribute('disabled') || aba.getAttribute('aria-disabled') === 'true').toBe(true)
    fireEvent.click(aba)
    expect(equipamentos).not.toHaveBeenCalled()
  })

  describe('Assinatura eletrônica (aditivo)', () => {
    const pdf = () => new File(['%PDF-1.4'], 'aditivo.pdf', { type: 'application/pdf' })

    it('mostra a seção com explicação e o selo no cabeçalho quando há data', async () => {
      const comAditivo: Funcionario = { ...record, values: { ...record.values, new_aditivoassinaturaem: '2026-10-15' }, aditivo: { nome: 'aditivo.pdf', url: 'https://x/y/$value' } }
      await renderFicha(fakeSource(vi.fn(async () => 'f1'), { get: async () => structuredClone(comAditivo) }))
      expect(screen.getByText('Assinatura eletrônica')).toBeTruthy()
      expect(screen.getByText(/sem o aditivo, o motorista não assina termos pelo app/i)).toBeTruthy()
      expect(screen.getByText('Aditivo assinado em 15/10/2026')).toBeTruthy()
      const link = screen.getByRole('link', { name: /aditivo\.pdf/ })
      expect(link.getAttribute('href')).toBe('https://x/y/$value')
    })

    it('sem data não mostra o selo', async () => {
      await renderFicha(fakeSource(vi.fn(async () => 'f1')))
      const cabecalho = document.querySelector('.drawer-head') as HTMLElement
      expect(within(cabecalho).queryByText(/Aditivo assinado em/)).toBeNull()
    })

    it('salvar com data e PDF grava a data e envia o arquivo', async () => {
      const save = vi.fn(async () => 'f1')
      const uploadAditivo = vi.fn(async () => {})
      await renderFicha(fakeSource(save, { uploadAditivo }))
      fireEvent.change(screen.getByLabelText('Aditivo assinado em'), { target: { value: '2026-10-20' } })
      const arquivo = pdf()
      fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [arquivo] } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
      await waitFor(() => expect(uploadAditivo).toHaveBeenCalledTimes(1))
      const [, draft] = save.mock.calls[0] as unknown as [Funcionario, { values: Record<string, unknown> }]
      expect(draft.values.new_aditivoassinaturaem).toBe('2026-10-20')
      expect(uploadAditivo).toHaveBeenCalledWith('f1', arquivo)
    })

    it('só o arquivo (sem alterar campos) também habilita salvar e envia', async () => {
      const save = vi.fn(async () => 'f1')
      const uploadAditivo = vi.fn(async () => {})
      await renderFicha(fakeSource(save, { uploadAditivo }))
      fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [pdf()] } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
      await waitFor(() => expect(uploadAditivo).toHaveBeenCalledTimes(1))
    })

    it('recusa arquivo que não é PDF e acima de 10 MB', async () => {
      const uploadAditivo = vi.fn(async () => {})
      await renderFicha(fakeSource(vi.fn(async () => 'f1'), { uploadAditivo }))
      const input = screen.getByLabelText('Arquivo do aditivo (PDF)')
      fireEvent.change(input, { target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] } })
      expect(await screen.findByText('Envie o aditivo em PDF.')).toBeTruthy()
      const grande = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
      Object.defineProperty(grande, 'size', { value: 11 * 1024 * 1024 })
      fireEvent.change(input, { target: { files: [grande] } })
      expect(await screen.findByText('O aditivo deve ter até 10 MB.')).toBeTruthy()
      expect(uploadAditivo).not.toHaveBeenCalled()
    })

    it('falha no envio do arquivo avisa e não perde o resto', async () => {
      const save = vi.fn(async () => 'f1')
      const uploadAditivo = vi.fn(async () => { throw new Error('Sem permissão.') })
      await renderFicha(fakeSource(save, { uploadAditivo }))
      fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [pdf()] } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
      expect(await screen.findByText(/Aditivo não enviado: Sem permissão\./)).toBeTruthy()
      expect(save).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/aditivo\.pdf · será enviado ao salvar/)).toBeTruthy()
    })

    it('aceita application/octet-stream quando a extensão é .pdf', async () => {
      const uploadAditivo = vi.fn(async () => {})
      await renderFicha(fakeSource(vi.fn(async () => 'f1'), { uploadAditivo }))
      fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [new File(['%PDF'], 'scan.PDF', { type: 'application/octet-stream' })] } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar/ })) })
      await waitFor(() => expect(uploadAditivo).toHaveBeenCalledTimes(1))
    })

    it('criar novo com PDF e upload falhando mantém o PDF pendente depois da troca de id', async () => {
      const novo: Funcionario = { ...record, id: 'novo1' }
      const save = vi.fn(async () => 'novo1')
      const uploadAditivo = vi.fn(async () => { throw new Error('Sem permissão.') })
      const source = fakeSource(save, { uploadAditivo, get: async () => structuredClone(novo) })
      function Pai() {
        const [id, setId] = useState<string | null>(null)
        return <ToastProvider><Ficha source={source} id={id} onClose={() => {}} onSaved={(savedId) => setId(savedId)} /></ToastProvider>
      }
      render(<Pai />)
      fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Souza' } })
      fireEvent.change(screen.getByLabelText(/Apelido/), { target: { value: 'Ana' } })
      fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [pdf()] } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar colaborador/ })) })
      expect(await screen.findByText(/Aditivo não enviado: Sem permissão\./)).toBeTruthy()
      expect(await screen.findByText(/aditivo\.pdf · será enviado ao salvar/)).toBeTruthy()
    })
  })

  it('mostra o estado do acesso e encerra pela ficha', async () => {
    const encerrar = vi.fn(async () => [{ etapa: 'funcionario', estado: 'feita' as const, detalhe: 'inativado' }])
    const comEmail = { ...record, values: { ...record.values, cr40f_emailmicrosoft: 'ana.souza@betinhos.onmicrosoft.com' } }
    const source = fakeSource(async () => 'f1', { get: async () => structuredClone(comEmail) })
    render(<ToastProvider><Ficha source={source} id="f1" onClose={() => {}} onSaved={() => {}} acesso={{ cadastrar: async () => { throw new Error('n/a') }, encerrar }} /></ToastProvider>)
    await screen.findByText('Acesso ativo')
    fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar agora$/ })) })
    await waitFor(() => expect(encerrar).toHaveBeenCalledWith('f1', 'Ana'))
  })

  it('sem e-mail oferece cadastrar acesso', async () => {
    const onCadastrarAcesso = vi.fn()
    render(<ToastProvider><Ficha source={fakeSource(async () => 'f1')} id="f1" onClose={() => {}} onSaved={() => {}} acesso={{ cadastrar: async () => { throw new Error('n/a') }, encerrar: async () => [] }} onCadastrarAcesso={onCadastrarAcesso} /></ToastProvider>)
    await screen.findByText('Sem acesso ao app')
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar acesso/ }))
    expect(onCadastrarAcesso).toHaveBeenCalledWith({ funcionarioId: 'f1', nomeCompleto: 'Ana Souza', celular: '' })
  })

  it('funcionário afastado (status 2) com e-mail pode ter o acesso encerrado', async () => {
    const afastado = { ...record, values: { ...record.values, cr40f_status: 2, cr40f_emailmicrosoft: 'ana.souza@betinhos.onmicrosoft.com' } }
    render(<ToastProvider><Ficha source={fakeSource(async () => 'f1', { get: async () => structuredClone(afastado) })} id="f1" onClose={() => {}} onSaved={() => {}} acesso={{ cadastrar: async () => { throw new Error('n/a') }, encerrar: async () => [] }} /></ToastProvider>)
    await screen.findByText('Acesso ativo')
    expect(screen.getByRole('button', { name: /^Encerrar acesso$/ })).toBeTruthy()
  })

  it('encerrou mas a recarga da ficha falhou: avisa sem rejeição solta', async () => {
    const comEmail = { ...record, values: { ...record.values, cr40f_emailmicrosoft: 'ana.souza@betinhos.onmicrosoft.com' } }
    let chamadas = 0
    const get = vi.fn(async () => { chamadas += 1; if (chamadas > 1) throw new Error('rede'); return structuredClone(comEmail) })
    render(<ToastProvider><Ficha source={fakeSource(async () => 'f1', { get })} id="f1" onClose={() => {}} onSaved={() => {}} acesso={{ cadastrar: async () => { throw new Error('n/a') }, encerrar: async () => [] }} /></ToastProvider>)
    await screen.findByText('Acesso ativo')
    fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar agora$/ })) })
    expect(await screen.findByText('Acesso encerrado, mas a ficha não recarregou. Reabra a ficha.')).toBeTruthy()
  })
})
