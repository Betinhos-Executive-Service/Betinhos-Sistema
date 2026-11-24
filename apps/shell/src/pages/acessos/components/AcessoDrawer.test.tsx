// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { AcessosProvider } from '../../../app/AcessosProvider'
import { MOCK_EU, createSource, type Source } from '../data/source'
import type { Dados } from '../domain/types'
import { AcessoDrawer } from './AcessoDrawer'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

async function abrir(nome: string, busca = '', fonte?: (s: Source) => Source) {
  window.history.replaceState(null, '', `/${busca}`)
  const source = fonte ? fonte(createSource(host)) : createSource(host)
  const dados: Dados = await source.load()
  const pessoa = dados.pessoas.find((p) => p.nome === nome)!
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const tree = (p: typeof pessoa) => (
    <AcessosProvider host={host}>
      <ToastProvider>
        <AcessoDrawer pessoa={p} euId={MOCK_EU} historico={dados.historico} source={source} onClose={onClose} onSaved={onSaved} />
      </ToastProvider>
    </AcessosProvider>
  )
  const { rerender } = render(tree(pessoa))
  await screen.findByRole('dialog', { name: nome })
  return { source, pessoa, onClose, onSaved, recarregar: (p: typeof pessoa) => rerender(tree(p)) }
}

// Os grupos seguem a ordem de AREAS: Operacional, Financeiro, Frota, RH.
const radio = (rotulo: string, grupo: number) => screen.getAllByRole('radio', { name: rotulo })[grupo]

const pressionarEsc = () => fireEvent(screen.getByRole('dialog', { name: 'Bruno Modelo' }), new Event('cancel', { cancelable: true }))

describe('AcessoDrawer', () => {
  it('mostra o que muda, salva pela fonte e avisa a página', async () => {
    const { source, pessoa, onSaved } = await abrir('Bruno Modelo')
    expect((radio('Operador', 1) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(radio('Gestor', 1))
    expect(screen.getByText('Financeiro: Operador → Gestor')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const depois = (await source.load()).pessoas.find((p) => p.id === pessoa.id)
    expect(depois?.perfis.areas).toEqual({ financeiro: 'gestor' })
  })

  it('a própria linha é só leitura', async () => {
    await abrir('Ana Exemplo')
    expect(screen.getByText('Ninguém altera o próprio acesso.')).toBeTruthy()
    expect((radio('Gestor', 0) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  })

  it('erro do servidor fica na gaveta, que continua aberta, e marca o perfil que falta', async () => {
    const { onClose, onSaved } = await abrir('Bruno Modelo', '?falha=salvar')
    fireEvent.click(radio('Gestor', 2))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/Perfil ainda não publicado neste ambiente/)).toBeTruthy()
    expect(screen.getByText('Ainda não publicado neste ambiente')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fechar com alteração pergunta antes de descartar', async () => {
    const { onClose } = await abrir('Bruno Modelo')
    fireEvent.click(radio('Operador', 3))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('quem não é Administrador do Sistema não concede Administrador de acessos', async () => {
    await abrir('Bruno Modelo', '?acessos=acessos')
    expect((screen.getByRole('switch', { name: 'Administrador de acessos' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Só o Administrador do Sistema concede este perfil.')).toBeTruthy()
  })

  it('Esc sem alteração fecha', async () => {
    const { onClose } = await abrir('Bruno Modelo')
    pressionarEsc()
    expect(onClose).toHaveBeenCalled()
  })

  it('Esc com alteração pergunta e "Continuar editando" mantém a gaveta', async () => {
    const { onClose } = await abrir('Bruno Modelo')
    fireEvent.click(radio('Operador', 3))
    pressionarEsc()
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Bruno Modelo' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('durante o salvamento fechar não faz nada', async () => {
    let soltar: () => void = () => undefined
    const { onClose, onSaved } = await abrir('Bruno Modelo', '', (s) => ({ ...s, definir: () => new Promise<void>((resolve) => { soltar = resolve }) }))
    fireEvent.click(radio('Gestor', 1))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true))
    pressionarEsc()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()
    soltar()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('o rascunho acompanha a recarga: sem edição, perfis novos não contam como alteração', async () => {
    const { pessoa, onClose, recarregar } = await abrir('Bruno Modelo')
    recarregar({ ...pessoa, perfis: { areas: { financeiro: 'gestor' }, acessos: false } })
    expect((radio('Gestor', 1) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('o erro de salvar aparece também na aba Histórico', async () => {
    await abrir('Bruno Modelo', '?falha=salvar')
    fireEvent.click(radio('Gestor', 2))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Perfil ainda não publicado neste ambiente/)
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    expect(screen.getByText(/Perfil ainda não publicado neste ambiente/)).toBeTruthy()
  })
})
