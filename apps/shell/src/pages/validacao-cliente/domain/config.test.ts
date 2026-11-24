import { describe, expect, it } from 'vitest'
import { dominiosDoForm, gravarModulos, lerModulos, normalizarDominio, normalizarDominios, quemEntra, validarConfig, type ConfigForm } from './config'
import type { PortalConfig } from './types'

const cliente = (id: string, nome: string) => ({ id, nome })
const config = (id: string, nome: string, over: Partial<PortalConfig> = {}): PortalConfig => ({ cliente: cliente(id, nome), ligado: true, modulos: ['validar'], dominios: [], ...over })
const form = (over: Partial<ConfigForm> = {}): ConfigForm => ({ ligado: true, modulos: ['validar'], restringir: false, dominiosTexto: '', ...over })

describe('normalizarDominio', () => {
  it('tira @, protocolo, www, caminho e caixa', () => {
    expect(normalizarDominio('@Tenaris.com')).toBe('tenaris.com')
    expect(normalizarDominio(' https://www.Ternium.com.br/pt ')).toBe('ternium.com.br')
  })
  it('rejeita sem ponto', () => {
    expect(normalizarDominio('tenaris')).toBeNull()
    expect(normalizarDominio('')).toBeNull()
  })
})

describe('normalizarDominios', () => {
  it('separa por ; , e espaço, deduplica e separa os inválidos', () => {
    expect(normalizarDominios('@a.com; B.com, a.com  x')).toEqual({ dominios: ['a.com', 'b.com'], invalidos: ['x'] })
  })
})

describe('módulos', () => {
  it('lê e grava a choice múltipla', () => {
    expect(lerModulos('100000002,100000001')).toEqual(['pedir', 'meus_servicos'])
    expect(lerModulos(null)).toEqual([])
    expect(gravarModulos(['meus_servicos', 'validar'])).toBe('100000000,100000002')
    expect(gravarModulos([])).toBeNull()
  })
})

describe('validarConfig', () => {
  it('portal ligado sem módulo é erro; desligado sem módulo não', () => {
    expect(validarConfig(form({ modulos: [] }), 'a', []).erros.modulos).toMatch(/ao menos um módulo/)
    expect(validarConfig(form({ ligado: false, modulos: [] }), 'a', []).erros.modulos).toBeUndefined()
  })
  it('domínio de outro cliente ligado é erro; de outro desligado ou do próprio não', () => {
    const outros = [config('b', 'Ternium', { dominios: ['ternium.com'] }), config('c', 'Antigo', { ligado: false, dominios: ['antigo.com'] }), config('a', 'Tenaris', { dominios: ['tenaris.com'] })]
    expect(validarConfig(form({ restringir: true, dominiosTexto: '@ternium.com' }), 'a', outros).erros.dominios).toBe('@ternium.com já é do cliente Ternium.')
    expect(validarConfig(form({ restringir: true, dominiosTexto: 'antigo.com; tenaris.com' }), 'a', outros).erros.dominios).toBeUndefined()
  })
  it('com o portal desligado o domínio de outro cliente não bloqueia', () => {
    const outros = [config('b', 'Ternium', { dominios: ['ternium.com'] })]
    expect(validarConfig(form({ ligado: false, modulos: [], restringir: true, dominiosTexto: 'ternium.com' }), 'a', outros).erros).toEqual({})
  })
  it('domínio público só avisa', () => {
    const r = validarConfig(form({ restringir: true, dominiosTexto: 'gmail.com' }), 'a', [])
    expect(r.erros).toEqual({})
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/@gmail\.com/)
  })
  it('restringir exige domínio válido', () => {
    expect(validarConfig(form({ restringir: true, dominiosTexto: '' }), 'a', []).erros.dominios).toMatch(/ao menos um domínio/)
    expect(validarConfig(form({ restringir: true, dominiosTexto: 'semponto' }), 'a', []).erros.dominios).toMatch(/inválido/)
  })
})

describe('gravação', () => {
  it('"só cadastrados" não leva domínio', () => {
    expect(dominiosDoForm(form({ restringir: false, dominiosTexto: 'a.com' }))).toEqual([])
    expect(dominiosDoForm(form({ restringir: true, dominiosTexto: 'A.com; b.com' }))).toEqual(['a.com', 'b.com'])
  })
  it('descreve quem entra', () => {
    expect(quemEntra([])).toBe('Só cadastrados')
    expect(quemEntra(['a.com', 'b.com'])).toBe('Cadastrados + @a.com, @b.com')
  })
})
