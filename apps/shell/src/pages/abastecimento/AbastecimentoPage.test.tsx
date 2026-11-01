// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from './data/source'
import { chaveDe } from './domain/importacao'
import { AbastecimentoPage } from './AbastecimentoPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/abastecimento'
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const CSV = '﻿Data Transação;Hora;Placa;Motorista;Produto;Litros;Valor Unitário;Valor Total;Hodômetro;Estabelecimento\r\n'
  + '20/10/2026;08:15;TST-1A11;Carlos Alberto Teste;Gasolina;"41,5";"6,29";"261,04";171400;Posto Shell Faria Lima\r\n'
  + '21/10/2026;09:00;ZZZ0Z00;;Gasolina;"30,0";"6,10";"183,00";;Posto Novo\r\n'
  + '21/10/2026;09:00;ZZZ0Z00;;Gasolina;"30,0";"6,10";"183,00";;Posto Novo\r\n'
  + ';;TST-1A11;;Gasolina;10;6;60;;\r\n'

const aba = (nome: string) => screen.getByRole('tab', { name: new RegExp(`^${nome}`) })
/** Abre o Select do DS pelo rótulo e escolhe a opção pelo texto. */
async function escolher(rotulo: string, opcao: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: rotulo }))
  const item = await waitFor(() => {
    const el = screen.getAllByText(opcao).map((e) => e.closest('[role="option"]')).find(Boolean)
    if (!el) throw new Error(`opção ${opcao} não apareceu`)
    return el
  })
  fireEvent.click(item)
}
/** Renderiza em mock e espera o painel por veículo (a placa também aparece em "Por motorista"). */
async function carregar() {
  render(<AbastecimentoPage host={{ mode: 'mock' }} />)
  await screen.findAllByText('TST1A11')
  return screen.getByRole('region', { name: 'Por veículo' })
}
async function importar(csv = CSV, nome = 'ctf.csv') {
  fireEvent.click(screen.getByRole('button', { name: 'Importar extrato' }))
  const drawer = await screen.findByRole('dialog', { name: 'Importar extrato' })
  const input = drawer.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([csv], nome, { type: 'text/csv' })] } })
  return drawer
}

describe('Abastecimento', () => {
  it('mostra o painel por veículo com litros, gasto, km/l e preço médio, e filtra por motorista', async () => {
    const painel = await carregar()
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
    expect(within(painel).getByText('Toyota Corolla')).toBeTruthy()
    // TST4D44 roda 420 km com 60 L: 7,0 km/l.
    const linha = within(painel).getByText('TST4D44').closest('.bt-table__row') as HTMLElement
    expect(within(linha).getByText('7,0 km/l')).toBeTruthy()
    // Placa sem cadastro aparece no painel com o aviso.
    expect(within(painel).getByText('Sem cadastro')).toBeTruthy()
    await escolher('Motorista', 'Bruna Ficticia Lima')
    await waitFor(() => expect(within(painel).queryByText('TST4D44')).toBeNull())
    expect(within(painel).getByText('TST2B22')).toBeTruthy()
    expect(window.location.hash).toContain('motorista=m2')
  })

  it('lista anomalias com motivo e gera alertas e dicas', async () => {
    await carregar()
    fireEvent.click(aba('Anomalias'))
    expect(await screen.findByText('54,0 L em um tanque de 50 L')).toBeTruthy()
    expect(screen.getByText(/^35 min depois do anterior/)).toBeTruthy()
    expect(screen.getAllByText('Consumo fora da curva').length).toBeGreaterThan(0)
    fireEvent.click(aba('Dicas e alertas'))
    expect(await screen.findByRole('article', { name: /^TST1A11: \d+ anomalias de abastecimento$/ })).toBeTruthy()
    expect(screen.getByRole('article', { name: /^Diego Exemplo Rocha: paga/ })).toBeTruthy()
    expect(screen.getByRole('article', { name: /^Bruna Ficticia Lima: odômetro em branco/ })).toBeTruthy()
  })

  it('importa um CSV do CTF com mapeamento sugerido, ignora duplicados e, na segunda vez, não cria nada', async () => {
    await carregar()
    const drawer = await importar()
    // Mapeamento sugerido pelos cabeçalhos do CTF; prévia com a placa normalizada.
    expect(await within(drawer).findByText('2 abastecimentos novos para importar')).toBeTruthy()
    expect(within(drawer).getByText('1 linha já importada (ignoradas)')).toBeTruthy()
    expect(within(drawer).getByText('1 linha com placa sem cadastro (entram na fila de pendências)')).toBeTruthy()
    expect(within(drawer).getByText(/1 linha inválida: linha 5 sem data/)).toBeTruthy()
    expect(within(drawer).getAllByText('TST1A11').length).toBeGreaterThan(0)
    fireEvent.click(within(drawer).getByRole('button', { name: 'Importar 2 abastecimentos' }))
    expect(await within(drawer).findByText('2 abastecimentos importados')).toBeTruthy()
    expect(window.localStorage.getItem('betinhos.abastecimento.mapeamento.ctf')).toContain('"odometro":"Hodômetro"')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Ver pendências' }))
    expect(await screen.findByText('ZZZ0Z00')).toBeTruthy()
    // Segunda importação do mesmo arquivo: nada novo.
    const de_novo = await importar()
    expect(await within(de_novo).findByText('Nada novo para importar')).toBeTruthy()
    expect(within(de_novo).getByText('3 linhas já importadas (ignoradas)')).toBeTruthy()
    expect((within(de_novo).getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('fechar a importação com arquivo lido pede confirmação', async () => {
    await carregar()
    const drawer = await importar()
    await within(drawer).findByText('2 abastecimentos novos para importar')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Trocar arquivo' }))
    expect(await within(drawer).findByText('Arraste o extrato ou escolha o arquivo')).toBeTruthy()
    fireEvent.change(drawer.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([CSV], 'ctf.csv')] } })
    await within(drawer).findByText('2 abastecimentos novos para importar')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar painel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Descartar importação?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('dialog', { name: 'Importar extrato' })).toBeTruthy()
  })

  it('arquivo sem colunas obrigatórias pede o mapeamento e bloqueia a importação', async () => {
    await carregar()
    const drawer = await importar('Data;Descrição;Valor\n01/10/2026;Posto X;100,00\n', 'fatura.csv')
    expect(await within(drawer).findAllByText('Escolha a coluna')).toHaveLength(2)
    expect((within(drawer).getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('vincula uma pendência ao veículo', async () => {
    await carregar()
    fireEvent.click(aba('Pendências'))
    expect(await screen.findByText('XYZ9Z99')).toBeTruthy()
    await escolher('Veículo para XYZ9Z99', 'TST2B22')
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))
    expect(await screen.findByText('Nenhuma pendência')).toBeTruthy()
  })

  it('as chaves já gravadas no servidor (fora da janela da tela) contam como duplicadas', async () => {
    const real = sourceModule.createSource
    vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), chaves: async () => [chaveDe('ctf', new Date(2026, 9, 20, 8, 15), 'TST1A11', 41.5, 261.04)] }))
    await carregar()
    const drawer = await importar()
    // Das 3 linhas válidas: a do TST1A11 já está no servidor e a segunda do ZZZ0Z00 repete a primeira; sobra uma.
    expect(await within(drawer).findByText('1 abastecimento novo para importar')).toBeTruthy()
    expect(within(drawer).getByText('2 linhas já importadas (ignoradas)')).toBeTruthy()
  })

  it('falha ao conferir as chaves no servidor bloqueia a importação', async () => {
    const real = sourceModule.createSource
    vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), chaves: () => Promise.reject(new Error('Sem permissão em cr40f_abastecimento.')) }))
    await carregar()
    const drawer = await importar()
    expect(await within(drawer).findByText('Não foi possível conferir os já importados')).toBeTruthy()
    expect((within(drawer).getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('avisa quando as despesas do App não carregaram', async () => {
    const real = sourceModule.createSource
    vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), load: async (since) => ({ ...(await real(host).load(since)), aviso: 'Despesas do App não carregaram (sem acesso).' }) }))
    await carregar()
    expect(await screen.findByText('Totais só com os extratos')).toBeTruthy()
  })

  it('falha na carga mostra o erro com tentar de novo', async () => {
    const real = sourceModule.createSource
    vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), load: () => Promise.reject(new Error('Tabela cr40f_abastecimento não encontrada na metadata.')) }))
    render(<AbastecimentoPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Tabela cr40f_abastecimento não encontrada na metadata.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})
