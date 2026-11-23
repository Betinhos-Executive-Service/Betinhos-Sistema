// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppMotoristasPage } from './AppMotoristasPage'
import { MSG_CONFIG, MSG_PRONTO, Preview, origemDe } from './components/Preview'
import { configDoPreview } from './domain/regras'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/app-motoristas'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('AppMotoristasPage (mock)', () => {
  it('mostra a matriz com o rascunho, avisa a versão no ar e abre o diálogo de publicar', async () => {
    render(<AppMotoristasPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText(/Rascunho · 3 mudanças/)).toBeTruthy()
    expect(screen.getAllByText(/v3 no ar/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Publicar/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('alterar uma célula soma uma mudança e descartar pede confirmação', async () => {
    render(<AppMotoristasPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Rascunho · 3 mudanças/)
    const chaves = screen.getAllByRole('switch').filter((s) => !(s as HTMLInputElement).disabled)
    fireEvent.click(chaves[0])
    await waitFor(() => expect(screen.getByText(/Rascunho · [0-9]+ mudan/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Descartar rascunho/ }))
    expect(await screen.findByText('Descartar o rascunho?')).toBeTruthy()
  })

  it('aba Motoristas lista os motoristas e abre o drawer pela URL', async () => {
    window.location.hash = '#/app-motoristas?aba=motoristas'
    render(<AppMotoristasPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Joaquim Barros')).toBeTruthy()
    window.location.hash = '#/app-motoristas?aba=motoristas&motorista=inexistente'
    expect(await screen.findByText(/não encontrado|não existe|Não encontramos/i)).toBeTruthy()
  })

  it('aba Histórico mostra as versões publicadas', async () => {
    window.location.hash = '#/app-motoristas?aba=historico'
    render(<AppMotoristasPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText(/Versão 3/)).toBeTruthy()
  })

  it('sem VITE_APP_MOTORISTAS_PREVIEW_URL o preview explica como subir o App', async () => {
    render(<AppMotoristasPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Sem App para mostrar')).toBeTruthy()
  })
})

describe('Preview: mensagens', () => {
  const config = configDoPreview({ tipo: 'perfil', perfil: 'proprio' }, null, '2026-11-23', 1)
  const props = { url: 'https://org.crm2.dynamics.com/WebResources/new_app-motoristas-v2?preview=1', config, nome: 'Motorista Próprio', ver: { tipo: 'perfil', perfil: 'proprio' } as const, onVer: () => undefined, modo: 'rascunho' as const, onModo: () => undefined, motoristas: [], temPublicada: true, ocultos: [], rotuloAlvo: 'perfil Próprio' }

  it('origemDe devolve a origem ou null', () => {
    expect(origemDe(props.url)).toBe('https://org.crm2.dynamics.com')
    expect(origemDe('nao-e-url')).toBeNull()
  })

  it('só aceita "pronto" da origem do iframe e então envia a config com targetOrigin', async () => {
    render(<Preview {...props} />)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    const enviar = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: enviar }, configurable: true })
    // origem errada: ignorada
    window.dispatchEvent(new MessageEvent('message', { data: { tipo: MSG_PRONTO }, origin: 'https://evil.example', source: iframe.contentWindow }))
    await new Promise((r) => setTimeout(r, 20))
    expect(enviar).not.toHaveBeenCalled()
    // origem certa
    window.dispatchEvent(new MessageEvent('message', { data: { tipo: MSG_PRONTO }, origin: 'https://org.crm2.dynamics.com', source: iframe.contentWindow }))
    await waitFor(() => expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ tipo: MSG_CONFIG, motorista: { nome: 'Motorista Próprio' } }), 'https://org.crm2.dynamics.com'))
  })
})
