// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/source'
import { AcessoError, type AcessoSource } from '../data/acesso'
import { createMockSource as createMockComunicados } from '../../comunicados/data/mock'
import { createMockDocsSource } from '../../documentos/data/source'
import type { Funcionario } from '../data/types'
import { Ficha } from './Ficha'
import { RETENTATIVA_MS } from './AcessoProgresso'
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
    uploadImage: async () => {}, removeImage: async () => {}, gerarAditivo: async () => ({ pdfBase64: '', nomeArquivo: 'a.pdf' }), registrarAditivo: async () => {}, saveLogins: async () => {}, multas: async () => [], posses: async () => [], equipamentos: async () => [], anotacoes: async () => [], addAnotacao: async () => {}, updateAnotacao: async () => {}, deleteAnotacao: async () => {}, limitesAnexo: async () => ({ maxBytes: 5e6, bloqueadas: [] }), anexo: async () => ({ nome: 'a', blob: new Blob() }),
    documentos: { pasta: () => '', listar: async () => [], enviar: async () => { throw new Error('n/a') }, abrir: async () => ({ nome: '', blob: new Blob() }), excluir: async () => {} },
    usuarioDoApp: async () => null, searchVeiculos: async () => [], openForm: () => {},
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
    const comAditivo: Funcionario = { ...record, values: { ...record.values, new_aditivoassinaturaem: '2026-10-15' }, aditivo: { nome: 'aditivo.pdf', url: 'https://x/y/$value' } }

    it('mostra a seção com explicação, o selo no cabeçalho e o link de download quando há aditivo', async () => {
      await renderFicha(fakeSource(vi.fn(async () => 'f1'), { get: async () => structuredClone(comAditivo) }))
      expect(screen.getByText('Assinatura eletrônica')).toBeTruthy()
      expect(screen.getByText(/sem o aditivo, o motorista não assina termos pelo app/i)).toBeTruthy()
      expect(screen.getByText('Aditivo assinado em 15/10/2026')).toBeTruthy()
      expect(screen.getByText('Assinado em 15/10/2026')).toBeTruthy()
      expect(screen.getByRole('link', { name: /Baixar/ }).getAttribute('href')).toBe('https://x/y/$value')
    })

    it('sem data não mostra o selo e a data não vira campo editável da ficha', async () => {
      await renderFicha(fakeSource(vi.fn(async () => 'f1')))
      const cabecalho = document.querySelector('.drawer-head') as HTMLElement
      expect(within(cabecalho).queryByText(/Aditivo assinado em/)).toBeNull()
      expect(screen.queryByLabelText('Aditivo assinado em')).toBeNull()
    })

    it('registrar o aditivo recarrega a ficha, mostra o selo e avisa onAditivoSalvo (volta para a multa)', async () => {
      let atual: Funcionario = structuredClone(record)
      const registrarAditivo = vi.fn(async () => { atual = structuredClone(comAditivo) })
      const onAditivoSalvo = vi.fn()
      const source = fakeSource(vi.fn(async () => 'f1'), { get: async () => structuredClone(atual), registrarAditivo })
      render(<ToastProvider><Ficha source={source} id="f1" onClose={() => {}} onSaved={() => {}} onAditivoSalvo={onAditivoSalvo} /></ToastProvider>)
      await screen.findByDisplayValue('Ana Souza')
      fireEvent.click(screen.getByRole('button', { name: 'Anexar assinado' }))
      fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [new File(['%PDF-1.4'], 'aditivo.pdf', { type: 'application/pdf' })] } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar aditivo' })) })
      await waitFor(() => expect(onAditivoSalvo).toHaveBeenCalledTimes(1))
      expect(registrarAditivo).toHaveBeenCalledWith('f1', expect.any(String), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
      expect(await screen.findByText('Aditivo assinado em 15/10/2026')).toBeTruthy()
    })
  })

  const comEmail = { ...record, values: { ...record.values, cr40f_emailmicrosoft: 'ana.souza@betinhos.onmicrosoft.com', cr40f_telefonecorporativo: '+5512991234567' } }
  const naoUsar = async () => { throw new Error('n/a') }
  const acessoFake = (extra: Partial<AcessoSource> = {}): AcessoSource => ({ cadastrar: naoUsar, parecidos: async () => [], encerrar: async () => [], reativar: naoUsar, ...extra })
  const comUsuario = (ativo: boolean | null, extra: Partial<DataSource> = {}) => fakeSource(async () => 'f1', { get: async () => structuredClone(comEmail), usuarioDoApp: async () => (ativo === null ? null : { id: 'su1', ativo }), ...extra })

  const abrirAcesso = async () => { fireEvent.click(await screen.findByRole('tab', { name: 'Acesso' }, { timeout: 5000 })) }

  it('estado do acesso vem do systemuser, não do status do funcionário', async () => {
    const usuarioDoApp = vi.fn(async () => ({ id: 'su1', ativo: true }))
    const desligado = { ...comEmail, values: { ...comEmail.values, cr40f_status: 1 } }
    render(<ToastProvider><Ficha source={fakeSource(async () => 'f1', { get: async () => structuredClone(desligado), usuarioDoApp })} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake()} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso ativo', undefined, { timeout: 5000 })
    expect(usuarioDoApp).toHaveBeenCalledWith('ana.souza@betinhos.onmicrosoft.com')
    expect(screen.getByRole('button', { name: /^Encerrar acesso$/ })).toBeTruthy()
  })

  it.each([[false, 'desabilitado'], [null, 'ausente']] as const)('systemuser %s (%s) mostra acesso encerrado com Reativar', async (ativo, _caso) => {
    render(<ToastProvider><Ficha source={comUsuario(ativo)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake()} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso encerrado', undefined, { timeout: 5000 })
    expect(screen.getByRole('button', { name: /^Reativar acesso$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Encerrar acesso$/ })).toBeNull()
  })

  it('encerra pela ficha sem recarregar nem salvar o funcionário e passa a oferecer Reativar', async () => {
    let ativo = true
    const encerrar = vi.fn(async () => { ativo = false; return [{ etapa: 'conta', estado: 'feita' as const, detalhe: 'desativada' }] })
    const save = vi.fn(async () => 'f1')
    const get = vi.fn(async () => structuredClone(comEmail))
    const usuarioDoApp = vi.fn(async () => ({ id: 'su1', ativo }))
    render(<ToastProvider><Ficha source={fakeSource(save, { get, usuarioDoApp })} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ encerrar })} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso ativo', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ }))
    expect(screen.getByText(/status e demissão ficam como estão/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar agora$/ })) })
    await waitFor(() => expect(encerrar).toHaveBeenCalledWith('f1', 'Ana'))
    expect(await screen.findByText('Acesso encerrado')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Reativar acesso$/ })).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(1)
    // Relê o systemuser depois de encerrar: o que o bloco mostra é o que a ficha mostra ao abrir de novo.
    expect(usuarioDoApp).toHaveBeenCalledTimes(2)
  })

  it('encerrar que deixa o systemuser habilitado continua ativo e explica, sem dizer encerrado', async () => {
    const encerrar = vi.fn(async () => [
      { etapa: 'grupo', estado: 'feita' as const, detalhe: 'removido' },
      { etapa: 'bloqueio', estado: 'pulada' as const, detalhe: 'já bloqueado' },
    ])
    render(<ToastProvider><Ficha source={comUsuario(true)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ encerrar })} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso ativo', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar agora$/ })) })
    expect((await screen.findAllByText('O acesso não foi retirado por completo')).length).toBeGreaterThan(0)
    expect(screen.getByText(/ainda aparece habilitado no Dataverse \(bloqueio: já bloqueado\)/)).toBeTruthy()
    expect(screen.getByText('Acesso ativo')).toBeTruthy()
    expect(screen.queryByText('Acesso encerrado')).toBeNull()
    expect(screen.getByRole('button', { name: /^Encerrar acesso$/ })).toBeTruthy()
  })

  it('encerrar cuja conferência acha acesso restante mostra o que sobrou no bloco e deixa tentar de novo', async () => {
    // O bloqueio no Dataverse pegou (a ficha relê "encerrado"), mas a licença ficou: o Encerrar continua disponível para a nova tentativa.
    let ativo = true
    const encerrar = vi.fn(async () => { ativo = false; return [
      { etapa: 'licenca', estado: 'feita' as const, detalhe: 'removida' },
      { etapa: 'bloqueio', estado: 'feita' as const, detalhe: 'bloqueado no Dataverse' },
      { etapa: 'conferencia', estado: 'erro' as const, detalhe: 'licença ainda atribuída' },
    ] })
    render(<ToastProvider><Ficha source={comUsuario(null, { usuarioDoApp: async () => ({ id: 'su1', ativo }) })} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ encerrar })} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso ativo', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar agora$/ })) })
    expect(await screen.findByText(/conferência achou acesso restante: licença ainda atribuída/)).toBeTruthy()
    expect(screen.getAllByText('O acesso não foi retirado por completo').length).toBeGreaterThan(0)
    expect(screen.getByText('Conferindo se o acesso saiu')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Encerrar agora$/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Encerrar acesso$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Reativar acesso$/ })).toBeNull()
  })

  it('conta ativa fora do grupo: fecha o diálogo e explica no bloco, sem dizer encerrado', async () => {
    const encerrar = vi.fn(async (): Promise<never> => { throw new AcessoError('CONTA_FORA_DO_GRUPO', 'A conta Microsoft está ativa, mas fora do grupo de motoristas.', [{ etapa: 'grupo', estado: 'erro', detalhe: 'fora do grupo' }]) })
    render(<ToastProvider><Ficha source={comUsuario(true)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ encerrar })} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso ativo', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar agora$/ })) })
    expect(await screen.findByText(/fora do grupo de motoristas/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Encerrar agora$/ })).toBeNull()
    expect(screen.getByText('Acesso ativo')).toBeTruthy()
  })

  it('reativa com confirmação, mostra a senha nova e o link do WhatsApp, e pede confirmação ao fechar', async () => {
    const reativar = vi.fn(async () => ({ emailMicrosoft: 'ana.souza@betinhos.onmicrosoft.com', senhaTemporaria: 'Nova#1234567xy', linkApp: 'https://app', etapas: [{ etapa: 'senha', estado: 'feita' as const, detalhe: 'redefinida' }] }))
    render(<ToastProvider><Ficha source={comUsuario(false)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ reativar })} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso encerrado', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Reativar acesso$/ }))
    expect(screen.getByText('Reativar acesso de Ana Souza?')).toBeTruthy()
    expect(reativar).not.toHaveBeenCalled()
    const dialogo = document.querySelector('dialog[open]') as HTMLElement
    await act(async () => { fireEvent.click(within(dialogo).getByRole('button', { name: /^Reativar acesso$/ })) })
    expect(reativar).toHaveBeenCalledWith('f1')
    expect(await screen.findByText('Nova#1234567xy')).toBeTruthy()
    expect(screen.getByText(/aparece só agora/)).toBeTruthy()
    const wa = screen.getByRole('link', { name: /Enviar no WhatsApp/ }) as HTMLAnchorElement
    expect(wa.href).toContain('wa.me/5512991234567')
    expect(decodeURIComponent(wa.href)).toContain('Nova#1234567xy')
    expect(screen.getByText('Acesso ativo')).toBeTruthy()
    fireEvent.click(within(dialogo).getAllByRole('button', { name: /^Fechar$/ }).find((b) => b.textContent === 'Fechar')!)
    expect(await screen.findByText('Fechar sem enviar?')).toBeTruthy()
  })

  it('reativar sem permissão de senha mostra o erro e as etapas, e o bloco passa a ativo quando a conta voltou', async () => {
    const reativar = vi.fn(async () => { throw new Error('SEM_PERMISSAO_SENHA: x | etapas=[{"etapa":"conta","estado":"feita","detalhe":"reativada"},{"etapa":"senha","estado":"erro","detalhe":"403"}]') })
    render(<ToastProvider><Ficha source={comUsuario(false)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ reativar })} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Acesso encerrado', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Reativar acesso$/ }))
    const dialogo = document.querySelector('dialog[open]') as HTMLElement
    await act(async () => { fireEvent.click(within(dialogo).getByRole('button', { name: /^Reativar acesso$/ })) })
    expect(await screen.findByText(/User-PasswordProfile\.ReadWrite\.All/)).toBeTruthy()
    expect(within(dialogo).getByText('Gerando a senha nova')).toBeTruthy()
    expect(within(dialogo).getByText('Conta reativada sem senha nova')).toBeTruthy()
    expect(screen.getByText('Acesso ativo')).toBeTruthy()
    // Faltou só a senha: Reativar segue disponível para gerar a senha depois de conceder a permissão.
    expect(screen.getAllByRole('button', { name: /^Reativar acesso$/ }).length).toBeGreaterThan(0)
  })

  it('selo do cabeçalho: App ativo, App encerrado e Liberando com Concluir liberação', async () => {
    render(<ToastProvider><Ficha source={comUsuario(true)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake()} /></ToastProvider>)
    expect(await screen.findByText('App ativo', undefined, { timeout: 5000 })).toBeTruthy()
    cleanup()
    render(<ToastProvider><Ficha source={comUsuario(false)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake()} /></ToastProvider>)
    expect(await screen.findByText('App encerrado', undefined, { timeout: 5000 })).toBeTruthy()
    cleanup()
    const cadastrar = vi.fn(async () => ({ emailMicrosoft: 'ana.souza@betinhos.onmicrosoft.com', senhaTemporaria: '', funcionarioId: 'f1', linkApp: 'l', etapas: [{ etapa: 'funcionario', estado: 'feita' as const, detalhe: 'e-mail vinculado' }] }))
    const onLiberacaoConcluida = vi.fn()
    render(<ToastProvider><Ficha source={fakeSource(async () => 'f1')} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ cadastrar })} emailPendente="ana.souza@betinhos.onmicrosoft.com" onLiberacaoConcluida={onLiberacaoConcluida} /></ToastProvider>)
    expect(await screen.findByText('Liberando', undefined, { timeout: 5000 })).toBeTruthy()
    await abrirAcesso()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Concluir liberação/ })) })
    expect(cadastrar).toHaveBeenCalledWith(expect.objectContaining({ funcionarioId: 'f1', prefixoEmail: 'ana.souza' }))
    await waitFor(() => expect(onLiberacaoConcluida).toHaveBeenCalledWith('f1'))
  })

  it('liberação pendente conclui sozinha na ficha e trava "Concluir liberação" enquanto a tentativa automática está em andamento', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let soltar: (v: unknown) => void = () => {}
      const resposta = { emailMicrosoft: 'ana.souza@betinhos.onmicrosoft.com', senhaTemporaria: '', funcionarioId: 'f1', linkApp: 'l', etapas: [{ etapa: 'systemuser', estado: 'feita' as const, detalhe: 'ok' }] }
      const cadastrar = vi.fn(() => new Promise((r) => { soltar = r }).then(() => resposta))
      const onLiberacaoConcluida = vi.fn()
      render(<ToastProvider><Ficha source={fakeSource(async () => 'f1')} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ cadastrar })} emailPendente="ana.souza@betinhos.onmicrosoft.com" onLiberacaoConcluida={onLiberacaoConcluida} /></ToastProvider>)
      await abrirAcesso()
      await act(async () => { await vi.advanceTimersByTimeAsync(RETENTATIVA_MS) })
      expect(cadastrar).toHaveBeenCalledTimes(1)
      const botao = screen.getByRole('button', { name: /Concluir liberação/ }) as HTMLButtonElement
      expect(botao.disabled).toBe(true)
      fireEvent.click(botao)
      expect(cadastrar).toHaveBeenCalledTimes(1)
      await act(async () => { soltar(undefined) })
      await waitFor(() => expect(onLiberacaoConcluida).toHaveBeenCalledWith('f1'))
      expect(cadastrar).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('erro permanente para a retentativa automática na hora e mostra a mensagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const cadastrar = vi.fn(async () => { throw new Error('SEM_LICENCA_DISPONIVEL: sem licença | etapas=[]') })
      render(<ToastProvider><Ficha source={fakeSource(async () => 'f1')} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake({ cadastrar })} emailPendente="ana.souza@betinhos.onmicrosoft.com" /></ToastProvider>)
      await abrirAcesso()
      await act(async () => { await vi.advanceTimersByTimeAsync(RETENTATIVA_MS) })
      expect(await screen.findByText('Não foi possível concluir a liberação')).toBeTruthy()
      await act(async () => { await vi.advanceTimersByTimeAsync(RETENTATIVA_MS * 3) })
      expect(cadastrar).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/de novo em instantes/)).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it('aba Acesso reúne e-mail Microsoft, logins e assinatura; Dados não mostra o e-mail', async () => {
    render(<ToastProvider><Ficha source={comUsuario(true)} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake()} /></ToastProvider>)
    await screen.findByText('App ativo', undefined, { timeout: 5000 })
    expect(screen.queryByLabelText(/E-mail Microsoft/)).toBeNull()
    await abrirAcesso()
    expect(screen.getByText('ana.souza@betinhos.onmicrosoft.com')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Logins e senhas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Assinatura eletrônica' })).toBeTruthy()
  })

  it('sem e-mail oferece cadastrar acesso', async () => {
    const onCadastrarAcesso = vi.fn()
    render(<ToastProvider><Ficha source={fakeSource(async () => 'f1')} id="f1" onClose={() => {}} onSaved={() => {}} acesso={acessoFake()} onCadastrarAcesso={onCadastrarAcesso} /></ToastProvider>)
    await abrirAcesso()
    await screen.findByText('Sem acesso ao app')
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar acesso/ }))
    expect(onCadastrarAcesso).toHaveBeenCalledWith({ funcionarioId: 'f1', nomeCompleto: 'Ana Souza', celular: '' })
  })
  it('aba Comunicados lista só os concluídos, marcados, e gera o PDF do que ficar marcado', async () => {
    const baixados: string[] = []
    Object.assign(URL, { createObjectURL: () => 'blob:pdf', revokeObjectURL: () => undefined })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { baixados.push(this.download) })
    const abaixoDe = (abas: (string | null)[]) => abas.slice(abas.indexOf('Equipamentos'), abas.indexOf('Equipamentos') + 3)
    render(<ToastProvider><Ficha source={fakeSource(vi.fn(async () => 'm1'), { get: async () => ({ ...structuredClone(record), id: 'm1' }) })} comunicados={createMockComunicados()} id="m1" onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    await screen.findByDisplayValue('Ana Souza')
    expect(abaixoDe(screen.getAllByRole('tab').map((tab) => tab.textContent))).toEqual(['Equipamentos', 'Comunicados', 'Anotações'])
    fireEvent.click(screen.getByRole('tab', { name: 'Comunicados' }))
    expect(await screen.findByText('Novo procedimento de embarque no GRU')).toBeTruthy()
    expect(screen.queryByText('Uso obrigatório do crachá')).toBeNull()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar PDF (1)' }))
    await waitFor(() => expect(baixados).toHaveLength(1))
  })
})
