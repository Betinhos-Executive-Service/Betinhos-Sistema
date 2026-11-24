import { describe, expect, it } from 'vitest'
import { doPedido, erroDaApi, iguais, oQueMuda, paraPedido, perfisIndisponiveis, rotulos } from './perfis'
import { VAZIO, type PerfisPessoa } from './types'

const fin: PerfisPessoa = { areas: { financeiro: 'operador' }, acessos: false }
const finGestor: PerfisPessoa = { areas: { financeiro: 'gestor', rh: 'operador' }, acessos: true }

describe('pedido', () => {
  it('monta o JSON na ordem das áreas, com o Administrador de acessos no fim', () => {
    expect(paraPedido(finGestor)).toEqual([{ perfil: 'financeiro', nivel: 'gestor' }, { perfil: 'rh', nivel: 'operador' }, { perfil: 'acessos' }])
    expect(paraPedido(VAZIO)).toEqual([])
  })
  it('lê o JSON do histórico e tolera lixo', () => {
    expect(doPedido(JSON.stringify(paraPedido(finGestor)))).toEqual(finGestor)
    expect(doPedido('nao é json')).toEqual(VAZIO)
    expect(doPedido(null)).toEqual(VAZIO)
    expect(doPedido('[{"perfil":"desconhecido"},{"perfil":"frota"}]')).toEqual({ areas: { frota: 'operador' }, acessos: false })
  })
})

describe('comparação', () => {
  it('iguais ignora a ordem das chaves', () => {
    expect(iguais(fin, { acessos: false, areas: { financeiro: 'operador' } })).toBe(true)
    expect(iguais(fin, finGestor)).toBe(false)
  })
  it('oQueMuda descreve cada diferença', () => {
    expect(oQueMuda(fin, finGestor)).toEqual(['Financeiro: Operador → Gestor', 'RH: sem acesso → Operador', 'Administrador de acessos: não → sim'])
    expect(oQueMuda(fin, VAZIO)).toEqual(['Financeiro: Operador → sem acesso'])
    expect(oQueMuda(fin, fin)).toEqual([])
  })
  it('rotulos para os chips', () => {
    expect(rotulos(finGestor)).toEqual(['Financeiro · Gestor', 'RH · Operador', 'Administrador de acessos'])
    expect(rotulos(VAZIO)).toEqual([])
  })
})

describe('erro da Custom API', () => {
  it('separa código e mensagem', () => {
    expect(erroDaApi(new Error('400 PROPRIO_ACESSO: Ninguém altera o próprio acesso.'))).toEqual({ codigo: 'PROPRIO_ACESSO', mensagem: 'Ninguém altera o próprio acesso.' })
    expect(erroDaApi(new Error('Falha de rede'))).toEqual({ codigo: null, mensagem: 'Falha de rede' })
  })
  it('acha os perfis que o ambiente ainda não tem', () => {
    const erro = erroDaApi(new Error('PERFIL_INDISPONIVEL: Perfil ainda não publicado neste ambiente: Perfil - Frota - Gestor; Perfil - Administrador de acessos.'))
    expect(perfisIndisponiveis(erro)).toEqual(['frota', 'acessos'])
    expect(perfisIndisponiveis({ codigo: 'SEM_PERMISSAO', mensagem: 'Perfil - Frota - Gestor' })).toEqual([])
  })
})
