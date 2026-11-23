// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { AcessosProvider } from '../../../app/AcessosProvider'
import { MOCK_EU, createSource } from '../data/source'
import type { Dados } from '../domain/types'
import { AcessoDrawer } from './AcessoDrawer'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

async function abrir(nome: string, busca = '') {
  window.history.replaceState(null, '', `/${busca}`)
  const source = createSource(host)
  const dados: Dados = await source.load()
  const pessoa = dados.pessoas.find((p) => p.nome === nome)!
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <AcessosProvider host={host}>
      <ToastProvider>
        <AcessoDrawer pessoa={pessoa} euId={MOCK_EU} historico={dados.historico} source={source} onClose={onClose} onSaved={onSaved} />
      </ToastProvider>
    </AcessosProvider>,
  )
  await screen.findByRole('dialog', { name: nome })
  return { source, pessoa, onClose, onSaved }
}

// Os grupos seguem a ordem de AREAS: Operacional, Financeiro, Frota, RH.
const radio = (rotulo: string, grupo: number) => screen.getAllByRole('radio', { name: rotulo })[grupo]

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
})
