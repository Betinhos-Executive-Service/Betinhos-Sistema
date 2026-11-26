// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { AcessosProvider } from '../../../app/AcessosProvider'
import { MOCK_EU, createSource, type Source } from '../data/source'
import type { Dados } from '../domain/types'
import { AcessoDrawer } from './AcessoDrawer'
import { salvar } from '../testUtils'

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
  const onGravado = vi.fn()
  const tree = (p: typeof pessoa) => (
    <AcessosProvider host={host}>
      <ToastProvider>
        <AcessoDrawer pessoa={p} euId={MOCK_EU} historico={dados.historico} source={source} onClose={onClose} onGravado={onGravado} />
      </ToastProvider>
    </AcessosProvider>
  )
  const { rerender } = render(tree(pessoa))
  await screen.findByRole('dialog', { name: nome })
  return { source, pessoa, onClose, onGravado, recarregar: (p: typeof pessoa) => rerender(tree(p)) }
}

// Os grupos seguem a ordem de AREAS: Operacional, Financeiro, Frota, RH.
const radio = (rotulo: string, grupo: number) => screen.getAllByRole('radio', { name: rotulo })[grupo]

const pressionarEsc = () => fireEvent(screen.getByRole('dialog', { name: 'Bruno Modelo' }), new Event('cancel', { cancelable: true }))

describe('AcessoDrawer', () => {
  it('mostra o que muda, salva pela fonte e avisa a página', async () => {
    const { source, pessoa, onGravado } = await abrir('Bruno Modelo')
    expect((radio('Operador', 1) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(radio('Gestor', 1))
    expect(screen.getByText('Financeiro: Operador → Gestor')).toBeTruthy()
    await salvar('Salvar')
    await waitFor(() => expect(onGravado).toHaveBeenCalled())
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
    const { onClose, onGravado } = await abrir('Bruno Modelo', '?falha=salvar')
    fireEvent.click(radio('Gestor', 2))
    await salvar('Salvar')
    expect(await screen.findByText(/Perfil ainda não publicado neste ambiente/)).toBeTruthy()
    expect(screen.getByText('Ainda não publicado neste ambiente')).toBeTruthy()
    expect(onGravado).not.toHaveBeenCalled()
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
    const { onClose, onGravado } = await abrir('Bruno Modelo', '', (s) => ({ ...s, definir: () => new Promise<void>((resolve) => { soltar = resolve }) }))
    fireEvent.click(radio('Gestor', 1))
    await salvar('Salvar')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true))
    pressionarEsc()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()
    soltar()
    await waitFor(() => expect(onGravado).toHaveBeenCalled())
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
    await salvar('Salvar')
    await screen.findByText(/Perfil ainda não publicado neste ambiente/)
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    expect(screen.getByText(/Perfil ainda não publicado neste ambiente/)).toBeTruthy()
  })
})

describe('O que deixa de ter', () => {
  it('só ganho: diz que não perde nada e salva direto, sem confirmação', async () => {
    const { source, pessoa, onGravado } = await abrir('Bruno Modelo')
    fireEvent.click(radio('Operador', 2))
    expect(await screen.findByText('Não perde nada.')).toBeTruthy()
    await salvar('Salvar')
    await waitFor(() => expect(onGravado).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Confirmar retirada' })).toBeNull()
    expect((await source.load()).pessoas.find((p) => p.id === pessoa.id)?.perfis.areas).toMatchObject({ frota: 'operador' })
  })

  it('perder a área mostra o bloco, o uso e só grava depois de "Tirar acesso"', async () => {
    const { source, pessoa, onGravado } = await abrir('Bruno Modelo')
    fireEvent.click(radio('Sem acesso', 1))
    expect(screen.getByRole('status', { name: 'Calculando' })).toBeTruthy()
    const bloco = await screen.findByRole('region', { name: 'O que deixa de ter' })
    await waitFor(() => expect(bloco.textContent).toMatch(/perde ver/))
    await waitFor(() => expect(bloco.textContent).toMatch(/em 90 dias|sem gravação em 90 dias/))
    await salvar('Salvar')
    expect(await screen.findByRole('dialog', { name: 'Confirmar retirada' })).toBeTruthy()
    expect(onGravado).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmar retirada' })).toBeNull())
    await salvar('Salvar')
    fireEvent.click(await screen.findByRole('button', { name: 'Tirar acesso' }))
    await waitFor(() => expect(onGravado).toHaveBeenCalled())
    expect((await source.load()).pessoas.find((p) => p.id === pessoa.id)?.perfis.areas).toEqual({})
  })

  it('prévia que falha avisa e só deixa salvar com "Salvar sem a prévia"', async () => {
    const { onGravado } = await abrir('Bruno Modelo', '?falha=previa')
    fireEvent.click(radio('Sem acesso', 1))
    expect(await screen.findByText('Não foi possível calcular o que a pessoa deixa de ter')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salvar sem a prévia' }))
    await salvar('Salvar')
    await waitFor(() => expect(onGravado).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Confirmar retirada' })).toBeNull()
  })

  it('o interruptor de acesso amplo só aparece para quem tem acesso amplo e é visto por um Administrador do Sistema', async () => {
    await abrir('Bruno Modelo')
    expect(screen.queryByRole('switch', { name: 'Tirar acesso amplo (legado)' })).toBeNull()
    cleanup()
    await abrir('Carlos Alberto Teste', '?acessos=acessos')
    expect(screen.queryByRole('switch', { name: 'Tirar acesso amplo (legado)' })).toBeNull()
    cleanup()
    await abrir('Carlos Alberto Teste')
    expect(screen.getByRole('switch', { name: 'Tirar acesso amplo (legado)' })).toBeTruthy()
  })

  it('tirar acesso amplo: avisa do grupo do Entra, confirma e grava com RetirarAmplo', async () => {
    const { source, onGravado } = await abrir('Carlos Alberto Teste')
    const definir = vi.spyOn(source, 'definir')
    fireEvent.click(screen.getByRole('switch', { name: 'Tirar acesso amplo (legado)' }))
    expect(await screen.findByText(/Continua com acesso pelo grupo Equipe de exemplo \(Entra\)/)).toBeTruthy()
    await salvar('Salvar')
    fireEvent.click(await screen.findByRole('button', { name: 'Tirar acesso' }))
    await waitFor(() => expect(onGravado).toHaveBeenCalled())
    expect(definir).toHaveBeenCalledWith(expect.any(String), expect.anything(), { retirarAmplo: true })
  })

  it('depois da retirada a pessoa fica sem acesso amplo e o Histórico ainda oferece devolver', async () => {
    const { source, recarregar } = await abrir('Carlos Alberto Teste')
    fireEvent.click(screen.getByRole('switch', { name: 'Tirar acesso amplo (legado)' }))
    await salvar('Salvar')
    fireEvent.click(await screen.findByRole('button', { name: 'Tirar acesso' }))
    await waitFor(async () => expect((await source.load()).pessoas.find((p) => p.nome === 'Carlos Alberto Teste')!.amplo).toBe(false))
    const dados = await source.load()
    const depois = dados.pessoas.find((p) => p.nome === 'Carlos Alberto Teste')!
    cleanup()
    render(
      <AcessosProvider host={host}>
        <ToastProvider>
          <AcessoDrawer pessoa={depois} euId={MOCK_EU} historico={dados.historico} source={source} onClose={vi.fn()} onGravado={vi.fn()} />
        </ToastProvider>
      </AcessosProvider>,
    )
    await screen.findByRole('dialog', { name: 'Carlos Alberto Teste' })
    expect(screen.queryByRole('switch', { name: 'Tirar acesso amplo (legado)' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    const definir = vi.spyOn(source, 'definir')
    fireEvent.click(await screen.findByRole('button', { name: 'Devolver acesso amplo' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Devolver acesso amplo' }).at(-1)!)
    await waitFor(() => expect(definir).toHaveBeenCalledWith(depois.id, expect.anything(), { devolverAmplo: true }))
    void recarregar
  })
})
