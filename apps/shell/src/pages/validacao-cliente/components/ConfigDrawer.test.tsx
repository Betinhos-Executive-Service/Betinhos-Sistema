// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMBRAER, TENARIS, createMockConfigs, createMockValidadores } from '../data/mock'
import type { Source } from '../data/source'
import type { PortalConfig } from '../domain/types'
import { prazosDoForm } from '../domain/config'
import { ConfigDrawer } from './ConfigDrawer'

afterEach(cleanup)

const configs = createMockConfigs()
const validadores = createMockValidadores()
const salvarConfig = (): Source['salvarConfig'] => vi.fn(async (cliente, form) => ({ cliente, ligado: form.ligado, modulos: form.modulos, dominios: [], exigeAprovacao: form.exigeAprovacao, ...prazosDoForm(form) }))

function abrir(cliente = EMBRAER, config: PortalConfig | null = configs.find((c) => c.cliente.id === cliente.id) ?? null, over: Partial<Source> = {}, editarIdentidade = true) {
  const source = { salvarConfig: salvarConfig(), logoDoCliente: vi.fn(async () => null), criarValidador: vi.fn(async () => 'e1000000-0000-4000-8000-000000000999'), ...over } as Source
  const props = { onClose: vi.fn(), onSaved: vi.fn(), onValidadorSaved: vi.fn() }
  render(<ToastProvider><ConfigDrawer cliente={cliente} config={config} outros={configs} validadores={validadores} source={source} mobile={false} editarIdentidade={editarIdentidade} {...props} /></ToastProvider>)
  return { source, ...props }
}
const drawer = () => screen.getAllByRole('dialog', { hidden: true }).find((d) => d.classList.contains('bt-drawer'))!
const salvar = () => fireEvent.click(within(drawer()).getByRole('button', { name: 'Salvar' }))

describe('ConfigDrawer', () => {
  it('liga o portal sem módulo: erro e nada gravado', () => {
    const { source, onSaved } = abrir(EMBRAER, { ...configs[2], modulos: [] })
    fireEvent.click(within(drawer()).getByRole('switch', { name: /Portal liberado/ }))
    salvar()
    expect(within(drawer()).getByText(/Escolha ao menos um módulo/)).toBeTruthy()
    expect(source.salvarConfig).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('domínio já usado por outro cliente ligado bloqueia', () => {
    const { source } = abrir(TENARIS)
    fireEvent.click(within(drawer()).getByRole('radio', { name: /Também e-mails destes domínios/ }))
    fireEvent.change(within(drawer()).getByLabelText('Domínios'), { target: { value: '@Ternium.com' } })
    salvar()
    expect(within(drawer()).getByText('@ternium.com já é do cliente Ternium.')).toBeTruthy()
    expect(source.salvarConfig).not.toHaveBeenCalled()
  })

  it('domínio público só avisa e deixa salvar', async () => {
    const { source, onSaved, onClose } = abrir(TENARIS)
    fireEvent.click(within(drawer()).getByRole('radio', { name: /Também e-mails destes domínios/ }))
    fireEvent.change(within(drawer()).getByLabelText('Domínios'), { target: { value: 'gmail.com' } })
    expect(within(drawer()).getByText(/@gmail\.com é um e-mail público/)).toBeTruthy()
    salvar()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(source.salvarConfig).toHaveBeenCalledWith(TENARIS, expect.objectContaining({ restringir: true, dominiosTexto: 'gmail.com' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('prazos: placeholders do padrão, prévia ao vivo e gravação das horas e do contato', async () => {
    const { source } = abrir(EMBRAER)
    const ant = within(drawer()).getByLabelText(/Antecedência mínima/) as HTMLInputElement
    expect(ant.placeholder).toBe('4 h (padrão)')
    expect((within(drawer()).getByLabelText(/Prazo para cancelar/) as HTMLInputElement).placeholder).toBe('2 h (padrão)')
    const previa = () => within(drawer()).getByTestId('previa-prazos').textContent ?? ''
    expect(previa()).toContain('Pedidos com pelo menos 4 h de antecedência.')
    expect(previa()).toContain('Você cancela até 2 h antes da saída.')
    expect(previa()).toContain('Fale com a Betinhos.')
    fireEvent.change(ant, { target: { value: '48' } })
    fireEvent.change(within(drawer()).getByLabelText(/Prazo para cancelar/), { target: { value: '0' } })
    fireEvent.change(within(drawer()).getByLabelText('Contato da operação'), { target: { value: '(12) 99999-0000' } })
    expect(previa()).toContain('Pedidos com pelo menos 48 h de antecedência.')
    expect(previa()).toContain('Você cancela até a hora da saída.')
    expect(previa()).toContain('Fale com a Betinhos: (12) 99999-0000.')
    salvar()
    await waitFor(() => expect(source.salvarConfig).toHaveBeenCalled())
    expect(source.salvarConfig).toHaveBeenCalledWith(EMBRAER, expect.objectContaining({ antecedenciaTexto: '48', prazoCancelarTexto: '0', contato: '(12) 99999-0000' }))
  })

  it('prazo inválido bloqueia o Salvar', () => {
    const { source } = abrir(EMBRAER)
    fireEvent.change(within(drawer()).getByLabelText(/Antecedência mínima/), { target: { value: '800' } })
    salvar()
    expect(within(drawer()).getByText(/número inteiro de 0 a 720/)).toBeTruthy()
    expect(source.salvarConfig).not.toHaveBeenCalled()
  })

  it('erro ao gravar: drawer continua aberto e nada é aplicado', async () => {
    const { onSaved, onClose } = abrir(TENARIS, configs[0], { salvarConfig: vi.fn(async () => { throw new Error('HTTP 500') }) })
    fireEvent.click(within(drawer()).getByRole('checkbox', { name: /Pedir/ }))
    salvar()
    expect(await screen.findByText(/Não foi possível salvar. HTTP 500/)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lista os e-mails do cliente e libera um novo na hora, sem o Salvar', async () => {
    const { source, onSaved, onValidadorSaved } = abrir(TENARIS, configs[0])
    expect(within(drawer()).getByText('carla.menezes@tenaris.com')).toBeTruthy()
    expect(within(drawer()).queryByText('marcos@ternium.com')).toBeNull()
    fireEvent.change(within(drawer()).getByLabelText('Nome'), { target: { value: 'Paulo Reis' } })
    fireEvent.change(within(drawer()).getByLabelText('E-mail'), { target: { value: 'Paulo@Tenaris.com' } })
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Liberar e-mail' }))
    await waitFor(() => expect(onValidadorSaved).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Paulo Reis', email: 'paulo@tenaris.com', cliente: TENARIS, ativo: true })))
    expect(source.criarValidador).toHaveBeenCalledWith({ nome: 'Paulo Reis', email: 'Paulo@Tenaris.com', clienteId: TENARIS.id })
    expect(source.salvarConfig).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('e-mail já liberado é recusado', () => {
    const { source } = abrir(TENARIS, configs[0])
    fireEvent.change(within(drawer()).getByLabelText('Nome'), { target: { value: 'Carla' } })
    fireEvent.change(within(drawer()).getByLabelText('E-mail'), { target: { value: 'carla.menezes@tenaris.com' } })
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Liberar e-mail' }))
    expect(within(drawer()).getByText('Este e-mail já é validador.')).toBeTruthy()
    expect(source.criarValidador).not.toHaveBeenCalled()
  })

  it('desativa um e-mail liberado na hora', async () => {
    const { onValidadorSaved } = abrir(TENARIS, configs[0], { setValidadorAtivo: vi.fn(async () => undefined) })
    fireEvent.click(within(drawer()).getAllByRole('switch', { name: 'Ativo' })[0])
    await waitFor(() => expect(onValidadorSaved).toHaveBeenCalledWith(expect.objectContaining({ ativo: false })))
  })

  it('Esc com alteração pede "Descartar alterações?"; sem alteração fecha direto', () => {
    const sujo = abrir(TENARIS, configs[0])
    fireEvent.click(within(drawer()).getByRole('checkbox', { name: /Pedir/ }))
    fireEvent(drawer(), new Event('cancel', { cancelable: true }))
    expect(sujo.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    cleanup()
    const limpo = abrir(TENARIS, configs[0])
    fireEvent(drawer(), new Event('cancel', { cancelable: true }))
    expect(limpo.onClose).toHaveBeenCalled()
  })

  const png = (tamanho = 100, type = 'image/png') => new File([new Uint8Array(tamanho)], 'logo.png', { type })
  const enviar = (arquivo: File) => fireEvent.change(within(drawer()).getByLabelText('Arquivo do logo'), { target: { files: [arquivo] } })

  it('envia o logo: a prévia mostra antes de salvar e o Salvar leva a imagem', async () => {
    const { source, onSaved } = abrir(EMBRAER)
    enviar(png())
    expect((await within(drawer()).findAllByAltText('Logo de Embraer')).length).toBeGreaterThan(0)
    expect(within(drawer()).getByLabelText('Prévia da identidade no portal')).toBeTruthy()
    expect(within(drawer()).getAllByText('Embraer').length).toBeGreaterThan(0)
    salvar()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(source.salvarConfig).toHaveBeenCalledWith(EMBRAER, expect.objectContaining({ logoMudou: true, logo: expect.stringMatching(/^data:image\/png;base64,/) }))
  })

  it('arquivo grande ou de tipo inválido é recusado com mensagem clara', async () => {
    abrir(EMBRAER)
    enviar(png(1024 * 1024 + 1))
    expect(await within(drawer()).findByText(/O limite é 1 MB/)).toBeTruthy()
    enviar(png(10, 'application/pdf'))
    expect(await within(drawer()).findByText(/Formato não aceito/)).toBeTruthy()
    expect(within(drawer()).queryByAltText(/Logo de/)).toBeNull()
  })

  it('mostra o logo atual do cliente e remove sem trocar', async () => {
    const atual = 'data:image/png;base64,AAAA'
    const { source } = abrir(EMBRAER, undefined, { logoDoCliente: vi.fn(async () => atual) })
    expect((await within(drawer()).findAllByAltText('Logo de Embraer')).length).toBeGreaterThan(0)
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Remover' }))
    salvar()
    await waitFor(() => expect(source.salvarConfig).toHaveBeenCalledWith(EMBRAER, expect.objectContaining({ logo: null, logoMudou: true })))
  })

  it('sem ser o Renan a identidade é só leitura', () => {
    abrir(EMBRAER, undefined, {}, false)
    expect(within(drawer()).getByText(/Só o administrador do ambiente/)).toBeTruthy()
    expect(within(drawer()).queryByLabelText('Arquivo do logo')).toBeNull()
    expect(within(drawer()).queryByRole('button', { name: /Enviar logo/ })).toBeNull()
  })

  it('aprovação ligada sem aprovador mostra o aviso e grava o interruptor', async () => {
    const { source } = abrir(EMBRAER, { ...configs[2], ligado: true })
    expect(within(drawer()).queryByText('Nenhum aprovador ativo')).toBeNull()
    fireEvent.click(within(drawer()).getByRole('switch', { name: /Pedidos precisam de aprovação/ }))
    expect(within(drawer()).getByText('Nenhum aprovador ativo')).toBeTruthy()
    salvar()
    await waitFor(() => expect(source.salvarConfig).toHaveBeenCalledWith(EMBRAER, expect.objectContaining({ exigeAprovacao: true })))
  })

  it('cliente com aprovador ativo não mostra o aviso e a marca Aprovador salva na hora', async () => {
    const setValidadorAprovador = vi.fn(async () => undefined)
    const { onValidadorSaved } = abrir(TENARIS, configs[0], { setValidadorAprovador })
    expect(within(drawer()).queryByText('Nenhum aprovador ativo')).toBeNull()
    const marcas = within(drawer()).getAllByRole('switch', { name: 'Aprovador' })
    fireEvent.click(marcas[1])
    await waitFor(() => expect(setValidadorAprovador).toHaveBeenCalled())
    expect(onValidadorSaved).toHaveBeenCalledWith(expect.objectContaining({ aprovador: expect.any(Boolean) }))
  })
})
