import { describe, expect, it } from 'vitest'
import { entradaDoCatalogo } from '@betinhos/app-config'
import {
  afetadosPorMudanca, celula, codigoDoErro, contarMudancas, definirCelula, linhaDoTempo, materializar, mensagemDoErro, normalizarMarca, ocultos, origemPorChave,
  readMotorista, statusExcecao, validarExcecao, configDoPreview,
} from './domain/regras'
import type { Motorista, Registro, Versao } from './domain/types'
import { escreverVer, lerAba, lerModo, lerMotorista, lerVer } from './domain/url'

const HOJE = '2026-11-23'
const reg = (p: Partial<Registro>): Registro => ({ id: 'r1', funcionarioId: 'm1', tipo: 'excecao', chave: 'multas', ligado: true, motivo: 'teste', validade: null, encerradoEm: null, criadoPor: 'Renan', encerradoPor: '', criadoEm: '2026-11-10T12:00:00Z', ...p })
const mot = (p: Partial<Motorista>): Motorista => ({ id: 'm1', nome: 'Motorista', vinculo: 0, piloto: false, push: true, registros: [], ...p })
const versao = (p: Partial<Versao>): Versao => ({ id: 'v', numero: 1, estado: 'publicada', matriz: {}, nota: '', publicadoEm: '2026-11-01T10:00:00Z', publicadoPor: 'Renan', alteradoPor: 'Renan', alteradoEm: '2026-11-01T09:00:00Z', marca: '', ...p })

describe('matriz', () => {
  it('materializar escreve todas as chaves editáveis com o padrão do catálogo', () => {
    const m = materializar(null)
    expect(m.proprio?.multas).toBe(false)
    expect(m.terceiro?.history).toBe(true)
    expect('services' in (m.proprio ?? {})).toBe(false)
  })

  it('definirCelula muda só a célula pedida e contarMudancas conta contra o publicado', () => {
    const publicada = materializar(null)
    const rascunho = definirCelula(publicada, 'terceiro', 'history', false)
    expect(contarMudancas(publicada, rascunho)).toBe(1)
    expect(contarMudancas(publicada, definirCelula(rascunho, 'terceiro', 'history', true))).toBe(0)
  })

  it('célula alterada diz "era ligado" ou "era desligado"; chave fixa e Admin ficam travadas', () => {
    const publicada = materializar(null)
    const rascunho = definirCelula(definirCelula(publicada, 'proprio', 'history', false), 'proprio', 'multas', true)
    expect(celula(entradaDoCatalogo('history')!, 'proprio', publicada, rascunho)).toMatchObject({ ligado: false, mudou: 'era-ligado' })
    expect(celula(entradaDoCatalogo('multas')!, 'proprio', publicada, rascunho)).toMatchObject({ ligado: true, mudou: 'era-desligado' })
    expect(celula(entradaDoCatalogo('services')!, 'terceiro', publicada, rascunho)).toMatchObject({ ligado: true, travada: true })
    expect(celula(entradaDoCatalogo('history')!, 'admin', publicada, rascunho)).toMatchObject({ ligado: true, travada: true, mudou: null })
  })
})

describe('afetados por mudança', () => {
  const publicada = materializar(null)
  const rascunho = definirCelula(publicada, 'terceiro', 'history', false)
  const mudanca = { chave: 'history', perfil: 'terceiro' as const, de: true, para: false }
  const motoristas = [
    mot({ id: 'a', vinculo: 1 }),
    mot({ id: 'b', vinculo: 1, piloto: true }),
    mot({ id: 'c', vinculo: 1, registros: [reg({ chave: 'history', ligado: true })] }),
    mot({ id: 'd', vinculo: 1, registros: [reg({ chave: 'history', ligado: true, validade: '2026-11-01' })] }),
    mot({ id: 'e', vinculo: 0 }),
  ]

  it('desconta piloto, exceção vigente e outro perfil; exceção vencida não protege', () => {
    expect(afetadosPorMudanca(mudanca, publicada, rascunho, motoristas, HOJE).map((m) => m.id)).toEqual(['a', 'd'])
  })
})

describe('origem por chave', () => {
  it('mostra exceção, piloto, perfil, fixa e módulo desligado', () => {
    const matriz = definirCelula(materializar(null), 'proprio', 'services.qrCharge', true)
    const c = origemPorChave(mot({ registros: [reg({ chave: 'multas', ligado: true })] }), matriz, HOJE, 7)
    const por = Object.fromEntries(c.linhas.map((l) => [l.chave, l]))
    expect(c.config.versao).toBe(7)
    expect(por.multas).toMatchObject({ ligado: true, origem: 'excecao', texto: 'Exceção' })
    expect(por.history).toMatchObject({ ligado: true, origem: 'perfil', texto: 'Perfil Próprio' })
    expect(por.services).toMatchObject({ origem: 'fixa', texto: 'Sempre ligado' })
    const piloto = origemPorChave(mot({ piloto: true }), matriz, HOJE).linhas.find((l) => l.chave === 'multas')
    expect(piloto).toMatchObject({ ligado: true, origem: 'piloto' })
  })

  it('preview por perfil ignora exceções; por motorista as usa; Admin é tudo ligado', () => {
    const matriz = materializar(null)
    expect(configDoPreview({ tipo: 'perfil', perfil: 'terceiro' }, matriz, HOJE, 1).chaves.multas).toBe(false)
    expect(configDoPreview({ tipo: 'motorista', motorista: mot({ registros: [reg({})] }) }, matriz, HOJE, 1).chaves.multas).toBe(true)
    expect(Object.values(configDoPreview({ tipo: 'perfil', perfil: 'admin' }, matriz, HOJE, 1).chaves).every(Boolean)).toBe(true)
  })

  it('"Oculto para" marca o que só o rascunho desliga', () => {
    const publicada = configDoPreview({ tipo: 'perfil', perfil: 'proprio' }, materializar(null), HOJE, 1)
    const rascunho = configDoPreview({ tipo: 'perfil', perfil: 'proprio' }, definirCelula(materializar(null), 'proprio', 'history', false), HOJE, 1)
    const lista = ocultos(rascunho, publicada)
    expect(lista.find((o) => o.chave === 'history')).toMatchObject({ soRascunho: true })
    expect(lista.find((o) => o.chave === 'multas')).toMatchObject({ soRascunho: false })
  })
})

describe('exceções e lista de motoristas', () => {
  it('status da exceção: vigente, vencida (validade passou) e encerrada', () => {
    expect(statusExcecao(reg({}), HOJE)).toBe('vigente')
    expect(statusExcecao(reg({ validade: HOJE }), HOJE)).toBe('vigente')
    expect(statusExcecao(reg({ validade: '2026-11-22' }), HOJE)).toBe('vencida')
    expect(statusExcecao(reg({ encerradoEm: '2026-11-12T10:00:00Z', validade: '2026-11-22' }), HOJE)).toBe('encerrada')
  })

  it('validação: motivo obrigatório, validade opcional e nunca no passado', () => {
    expect(validarExcecao({ chave: 'multas', motivo: '', validade: '' }, HOJE)).toEqual({ motivo: 'Explique o motivo da exceção.' })
    expect(validarExcecao({ chave: 'multas', motivo: 'x', validade: '2026-11-22' }, HOJE).validade).toMatch(/passado/)
    expect(validarExcecao({ chave: 'multas', motivo: 'x', validade: HOJE }, HOJE)).toEqual({})
    expect(validarExcecao({ chave: 'services', motivo: 'x', validade: '' }, HOJE).chave).toBeTruthy()
  })

  it('campos de filtro: perfil, sem vínculo, sem push, exceção vigente e piloto', () => {
    expect(readMotorista(mot({ vinculo: null }), 'perfil', HOJE)).toBe('sem-vinculo')
    expect(readMotorista(mot({ vinculo: 1 }), 'perfil', HOJE)).toBe('terceiro')
    expect(readMotorista(mot({ vinculo: 0 }), 'perfil', HOJE)).toBe('proprio')
    expect(readMotorista(mot({ vinculo: null }), 'semVinculo', HOJE)).toBe(true)
    expect(readMotorista(mot({ push: false }), 'semPush', HOJE)).toBe(true)
    expect(readMotorista(mot({ registros: [reg({ validade: '2026-11-01' })] }), 'excecao', HOJE)).toBe(false)
    expect(readMotorista(mot({ registros: [reg({})] }), 'excecao', HOJE)).toBe(true)
    expect(readMotorista(mot({ piloto: true }), 'piloto', HOJE)).toBe(true)
  })
})

describe('linha do tempo', () => {
  it('junta versões (com o que mudou vs a anterior) e eventos por pessoa, do mais recente ao mais antigo', () => {
    const v1 = versao({ id: 'v1', numero: 1, matriz: materializar(null) })
    const v2 = versao({ id: 'v2', numero: 2, publicadoEm: '2026-11-05T10:00:00Z', matriz: definirCelula(v1.matriz, 'terceiro', 'history', false) })
    const rasc = versao({ id: 'v3', numero: 3, estado: 'rascunho', publicadoEm: null })
    const m = mot({
      nome: 'Ana',
      registros: [
        reg({ id: 'x', validade: '2026-11-15', criadoEm: '2026-11-10T12:00:00Z' }),
        reg({ id: 'y', chave: 'history', ligado: false, criadoEm: '2026-11-08T12:00:00Z', encerradoEm: '2026-11-09T12:00:00Z' }),
        reg({ id: 'p', tipo: 'piloto', chave: '', criadoEm: '2026-11-02T12:00:00Z', encerradoEm: '2026-11-03T12:00:00Z' }),
      ],
    })
    const linhas = linhaDoTempo([rasc, v2, v1], [m], HOJE)
    expect(linhas.map((l) => l.tipo)).toEqual(['excecao-vencida', 'excecao-criada', 'excecao-encerrada', 'excecao-criada', 'versao', 'piloto-saiu', 'piloto-entrou', 'versao'])
    const [, , , , v2Linha, , , v1Linha] = linhas
    expect(v2Linha.tipo === 'versao' && v2Linha.mudancas).toEqual([{ chave: 'history', perfil: 'terceiro', de: true, para: false }])
    expect(v1Linha.tipo === 'versao' && v1Linha.mudancas.length).toBe(0)
  })
})

describe('marca do rascunho', () => {
  it('normaliza o modifiedon da Web API para o formato "o" do servidor', () => {
    expect(normalizarMarca('2026-11-23T14:32:11Z')).toBe('2026-11-23T14:32:11.0000000Z')
    expect(normalizarMarca('2026-11-23T14:32:11.123Z')).toBe('2026-11-23T14:32:11.1230000Z')
    expect(normalizarMarca('2026-11-23T14:32:11.1234567Z')).toBe('2026-11-23T14:32:11.1234567Z')
    expect(normalizarMarca('')).toBe('')
    expect(normalizarMarca(null)).toBe('')
  })
})

describe('erros do servidor', () => {
  it('mapeia o código no texto para a mensagem em português', () => {
    expect(codigoDoErro(new Error('SEM_PERMISSAO: Só quem tem...'))).toBe('SEM_PERMISSAO')
    expect(mensagemDoErro(new Error('SEM_PERMISSAO: x'))).toBe('Você não tem permissão para alterar a configuração do App.')
    expect(mensagemDoErro(new Error('RASCUNHO_ALTERADO: x'), { quemAlterou: 'Fulano', quando: '11:32' })).toBe('Fulano alterou o rascunho às 11:32. Revise antes de publicar.')
    expect(mensagemDoErro(new Error('falha de rede'))).toBe('falha de rede')
  })
})

describe('acesso e URL', () => {
  it('lê aba, ver, modo e motorista com padrões seguros', () => {
    const q = new URLSearchParams('aba=historico&ver=motorista:abc&modo=publicado&motorista=m1')
    expect(lerAba(q)).toBe('historico')
    expect(lerVer(q)).toEqual({ tipo: 'motorista', id: 'abc' })
    expect(lerModo(q)).toBe('publicado')
    expect(lerMotorista(q)).toBe('m1')
    const vazio = new URLSearchParams('aba=xyz&ver=lixo&modo=zzz')
    expect(lerAba(vazio)).toBe('perfis')
    expect(lerVer(vazio)).toEqual({ tipo: 'perfil', perfil: 'proprio' })
    expect(lerModo(vazio)).toBe('rascunho')
    expect(lerMotorista(vazio)).toBeNull()
    expect(lerVer(new URLSearchParams('ver=perfil:admin'))).toEqual({ tipo: 'perfil', perfil: 'admin' })
    expect(escreverVer({ tipo: 'perfil', perfil: 'terceiro' })).toBe('perfil:terceiro')
    expect(escreverVer({ tipo: 'motorista', id: 'z' })).toBe('motorista:z')
  })
})
