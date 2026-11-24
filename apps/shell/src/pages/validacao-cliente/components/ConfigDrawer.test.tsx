// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMBRAER, TENARIS, createMockConfigs } from '../data/mock'
import type { Source } from '../data/source'
import type { PortalConfig } from '../domain/types'
import { ConfigDrawer } from './ConfigDrawer'

afterEach(cleanup)

const configs = createMockConfigs()
const salvarConfig = (): Source['salvarConfig'] => vi.fn(async (cliente, form) => ({ cliente, ligado: form.ligado, modulos: form.modulos, dominios: [] }))

function abrir(cliente = EMBRAER, config: PortalConfig | null = configs.find((c) => c.cliente.id === cliente.id) ?? null, over: Partial<Source> = {}) {
  const source = { salvarConfig: salvarConfig(), ...over } as Source
  const props = { onClose: vi.fn(), onSaved: vi.fn() }
  render(<ToastProvider><ConfigDrawer cliente={cliente} config={config} outros={configs} source={source} mobile={false} {...props} /></ToastProvider>)
  return { source, ...props }
}
const drawer = () => screen.getAllByRole('dialog', { hidden: true }).find((d) => d.classList.contains('bt-drawer'))!
const salvar = () => fireEvent.click(within(drawer()).getByRole('button', { name: 'Salvar' }))

describe('ConfigDrawer', () => {
  it('liga o portal sem módulo: erro e nada gravado', () => {
    const { source, onSaved } = abrir(EMBRAER, { ...configs[2], modulos: [] })
    fireEvent.click(within(drawer()).getByRole('switch', { name: /Portal ligado/ }))
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

  it('erro ao gravar: drawer continua aberto e nada é aplicado', async () => {
    const { onSaved, onClose } = abrir(TENARIS, configs[0], { salvarConfig: vi.fn(async () => { throw new Error('HTTP 500') }) })
    fireEvent.click(within(drawer()).getByRole('checkbox', { name: /Pedir/ }))
    salvar()
    expect(await screen.findByText(/Não foi possível salvar. HTTP 500/)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
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
})
