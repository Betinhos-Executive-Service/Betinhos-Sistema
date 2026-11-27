import { describe, expect, it } from 'vitest'
import { amploTexto, cicloExigeAdmin, doAmplo, doPedido, erroDaApi, ultimaDoAmplo, iguais, oQueMuda, paraPedido, perfisIndisponiveis, rotulos } from './perfis'
import { montar } from '../data/source'
import { VAZIO, type Historico, type PerfisPessoa } from './types'

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

describe('histórico de encerrar e reativar', () => {
  it('doAmplo lê encerrar e reativar; amploTexto mostra Encerrado e Reativado sem mexer em retirar/devolver', () => {
    const encerrar = doAmplo('{"acao":"encerrar","papeis":[{"id":"p","nome":"Perfil - Base"}],"perfisColuna":[],"equipes":[]}')
    expect(encerrar).toEqual({ acao: 'encerrar', papeis: [{ id: 'p', nome: 'Perfil - Base' }], perfisColuna: [], equipes: [] })
    expect(amploTexto(encerrar!)).toBe('Encerrado: Perfil - Base')
    expect(amploTexto(doAmplo('{"acao":"reativar","papeis":[]}')!)).toBe('Reativado')
    expect(amploTexto({ acao: 'retirar', papeis: [{ id: '1', nome: 'X' }] })).toBe('Acesso amplo retirado: X')
    expect(amploTexto({ acao: 'devolver', papeis: [] })).toBe('Acesso amplo devolvido')
    expect(doAmplo('{"acao":"outra"}')).toBeNull()
  })

  it('doAmplo aceita item sem nome e amploTexto avisa; cicloExigeAdmin vê amplo, Administrador de acessos e equipe restrita', () => {
    const grande = doAmplo('{"acao":"encerrar","papeis":[{"id":"p1"}],"perfisColuna":[],"equipes":[{"id":"E1"}]}')!
    expect(grande.papeis).toEqual([{ id: 'p1', nome: '' }])
    expect(amploTexto(grande)).toBe('Encerrado: item sem nome')
    const livre = { areas: {}, acessos: false }
    expect(cicloExigeAdmin(grande, livre)).toBe(false)
    expect(cicloExigeAdmin(grande, livre, ['e1'])).toBe(true)
    expect(cicloExigeAdmin(grande, { areas: {}, acessos: true })).toBe(true)
    expect(cicloExigeAdmin(doAmplo('{"acao":"encerrar","papeis":[{"id":"p","nome":"Administrador do Sistema"}]}'), livre)).toBe(true)
    expect(cicloExigeAdmin(doAmplo('{"acao":"encerrar","papeis":[{"id":"p","nome":"Perfil - Base"}]}'), livre)).toBe(false)
    expect(cicloExigeAdmin(null, livre)).toBe(false)
  })

  it('montar põe encerrar e reativar no histórico e o Devolver ignora os dois', () => {
    const usuario = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const linha = (id: string, amplo: string, createdon: string) => ({ cr40f_acessohistoricoid: id, _cr40f_usuario_value: usuario, _cr40f_alteradopor_value: usuario, cr40f_perfisantes: '[]', cr40f_perfisdepois: '[]', cr40f_amplo: amplo, createdon })
    const dados = montar([{ systemuserid: usuario, fullname: 'Bruno Modelo', internalemailaddress: 'b@exemplo.test', systemuserroles_association: [] }], [], [
      linha('3', '{"acao":"reativar","papeis":[]}', '2026-11-26T00:00:00Z'),
      linha('2', '{"acao":"encerrar","papeis":[]}', '2026-11-25T00:00:00Z'),
      linha('1', '{"acao":"retirar","papeis":[{"id":"p","nome":"DEV - Usuário"}]}', '2026-11-24T00:00:00Z'),
    ], usuario)
    expect(dados.historico.map((h: Historico) => h.amplo?.acao)).toEqual(['reativar', 'encerrar', 'retirar'])
    expect(ultimaDoAmplo(dados.historico, usuario)?.id).toBe('1')
  })
})
