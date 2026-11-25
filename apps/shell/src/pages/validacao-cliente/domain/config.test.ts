import { describe, expect, it } from 'vitest'
import { LOGO_MAX_BYTES, corLegivel, dominiosDoForm, gravarModulos, lerModulos, normalizarDominio, normalizarDominios, quemEntra, validarConfig, validarLogo, type ConfigForm } from './config'
import type { PortalConfig } from './types'

const cliente = (id: string, nome: string) => ({ id, nome })
const config = (id: string, nome: string, over: Partial<PortalConfig> = {}): PortalConfig => ({ cliente: cliente(id, nome), ligado: true, modulos: ['validar'], dominios: [], nomeExibicao: '', cor: '', ...over })
const form = (over: Partial<ConfigForm> = {}): ConfigForm => ({ ligado: true, modulos: ['validar'], restringir: false, dominiosTexto: '', nomeExibicao: '', cor: '', logo: null, logoMudou: false, ...over })

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

describe('identidade', () => {
  it('cor inválida bloqueia; vazia e válida passam', () => {
    expect(validarConfig(form({ cor: 'verde' }), 'a', []).erros.cor).toMatch(/#RRGGBB/)
    expect(validarConfig(form({ cor: '#12345' }), 'a', []).erros.cor).toBeTruthy()
    expect(validarConfig(form({ cor: '' }), 'a', []).erros.cor).toBeUndefined()
    expect(validarConfig(form({ cor: '#0a7d4a' }), 'a', [])).toEqual({ erros: {}, avisos: [] })
  })
  it('cor com pouco contraste só avisa e cai na padrão', () => {
    const r = validarConfig(form({ cor: '#ffff00' }), 'a', [])
    expect(r.erros.cor).toBeUndefined()
    expect(r.avisos[0]).toMatch(/cor padrão da Betinhos/)
    expect(corLegivel('#ffff00')).toBeUndefined()
    expect(corLegivel('#0A7D4A')).toBe('#0a7d4a')
  })
  it('nome de exibição acima de 100 caracteres bloqueia', () => {
    expect(validarConfig(form({ nomeExibicao: 'a'.repeat(101) }), 'a', []).erros.nomeExibicao).toBeTruthy()
    expect(validarConfig(form({ nomeExibicao: 'a'.repeat(100) }), 'a', []).erros.nomeExibicao).toBeUndefined()
  })
  it('logo: aceita só PNG e JPG até 1 MB; recusa o resto', () => {
    for (const type of ['image/png', 'image/jpeg']) expect(validarLogo({ type, size: 1000 })).toBeNull()
    expect(validarLogo({ type: 'image/png', size: LOGO_MAX_BYTES })).toBeNull()
    expect(validarLogo({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toMatch(/limite é 1 MB/)
    expect(validarLogo({ type: 'application/pdf', size: 10 })).toMatch(/Formato não aceito/)
    expect(validarLogo({ type: 'image/gif', size: 10 })).toMatch(/Formato não aceito/)
    for (const type of ['image/webp', 'image/svg+xml']) expect(validarLogo({ type, size: 10 })).toMatch(/PNG ou JPG/)
  })
})
