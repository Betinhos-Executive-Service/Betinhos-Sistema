import { describe, expect, it } from 'vitest'
import { COMUNICADO_ESCOPO, COMUNICADO_ESTADO, COMUNICADO_PUSH, COMUNICADO_TIPO, type Comunicado, type Destinatario, type Evidencia } from './comunicados'
import { concluido, hashConteudo, linhasEvidencia, nomeArquivo, paresDoComunicado, paresDoMotorista } from './comprovante'

const item = (id: string, tipo: Comunicado['tipo'], estado: number = COMUNICADO_ESTADO.disparado): Comunicado => ({ id, titulo: `Ação ${id}`, corpo: 'Texto', tipo, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado, disparadoEm: '2026-11-01T10:00:00Z' })
const dest = (id: string, comunicadoId: string, extra: Partial<Destinatario> = {}): Destinatario => ({ id, comunicadoId, motoristaId: 'm1', enviadoEm: '2026-11-01T10:00:00Z', abertoEm: null, lidoEm: null, cienteEm: null, nomeAssinante: '', observacao: '', assinaturaJson: '', evidenciaAbertura: null, evidenciaCiencia: null, pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra })
const nome = () => 'Márcio Lima'

const ciencia = item('c1', COMUNICADO_TIPO.ciencia)
const info = item('i1', COMUNICADO_TIPO.informativo)

describe('concluido', () => {
  it('Ciência conclui com cienteEm e Informativo com lidoEm', () => {
    expect(concluido({ comunicado: ciencia, destinatario: dest('a', 'c1', { lidoEm: 'x' }) })).toBe(false)
    expect(concluido({ comunicado: ciencia, destinatario: dest('a', 'c1', { cienteEm: 'x' }) })).toBe(true)
    expect(concluido({ comunicado: info, destinatario: dest('a', 'i1', { abertoEm: 'x' }) })).toBe(false)
    expect(concluido({ comunicado: info, destinatario: dest('a', 'i1', { lidoEm: 'x' }) })).toBe(true)
  })
})

describe('paresDoComunicado', () => {
  const rows = [dest('a', 'c1', { cienteEm: 'x' }), dest('b', 'c1', { cienteEm: 'x' }), dest('c', 'c1', { abertoEm: 'x' })]
  it('sem seleção gera de todos os concluídos e exclui pendentes', () => {
    expect(paresDoComunicado(ciencia, rows, nome, new Set()).map((p) => p.destinatario.id)).toEqual(['a', 'b'])
  })
  it('com seleção usa só os marcados e ignora pendente marcado', () => {
    expect(paresDoComunicado(ciencia, rows, nome, new Set(['b'])).map((p) => p.destinatario.id)).toEqual(['b'])
  })
  it('seleção que não casa com nenhum concluído (pendente ou id desconhecido) não gera PDF', () => {
    expect(paresDoComunicado(ciencia, rows, nome, new Set(['c']))).toEqual([])
    expect(paresDoComunicado(ciencia, rows, nome, new Set(['zz']))).toEqual([])
    expect(paresDoComunicado(ciencia, rows, nome, new Set(['c', 'a'])).map((p) => p.destinatario.id)).toEqual(['a'])
  })
  it('Informativo conclui pelo lidoEm', () => {
    expect(paresDoComunicado(info, [dest('a', 'i1', { lidoEm: 'x' }), dest('b', 'i1')], nome, new Set()).map((p) => p.destinatario.id)).toEqual(['a'])
  })
})

describe('paresDoMotorista', () => {
  const comunicados = [ciencia, info, item('r1', COMUNICADO_TIPO.informativo, COMUNICADO_ESTADO.rascunho)]
  const rows = [dest('a', 'c1', { cienteEm: 'x' }), dest('b', 'i1', { lidoEm: 'x' }), dest('c', 'i1x'), dest('d', 'r1', { lidoEm: 'x' }), dest('e', 'c1')]
  it('cruza com o comunicado disparado e só traz concluídos', () => {
    expect(paresDoMotorista('Márcio Lima', comunicados, rows, new Set()).map((p) => p.destinatario.id)).toEqual(['a', 'b'])
  })
  it('respeita a seleção', () => {
    expect(paresDoMotorista('Márcio Lima', comunicados, rows, new Set(['b'])).map((p) => p.destinatario.id)).toEqual(['b'])
  })
  it('seleção que não casa com nenhum concluído não gera PDF', () => {
    expect(paresDoMotorista('Márcio Lima', comunicados, rows, new Set(['c', 'e', 'zz']))).toEqual([])
  })
})

describe('nomeArquivo', () => {
  const par = (c: Comunicado) => ({ comunicado: c, destinatario: dest('a', c.id), motorista: 'Márcio Lima' })
  it('segue o spec por modo e par único', () => {
    expect(nomeArquivo('comunicado', 'Novo embarque', [par(ciencia), par(info)])).toBe('comunicado-novo-embarque-2-comprovantes.pdf')
    expect(nomeArquivo('motorista', 'Márcio Lima', [par(ciencia), par(info)])).toBe('comunicados-marcio-lima-2.pdf')
    expect(nomeArquivo('motorista', 'Márcio Lima', [par(ciencia)])).toBe('comprovante-acao-c1-marcio-lima.pdf')
  })
})

describe('hashConteudo', () => {
  it('é estável, hexadecimal e muda com o texto (inclusive acentos)', async () => {
    const a = await hashConteudo('Ação', 'Corpo')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashConteudo('Ação', 'Corpo')).toBe(a)
    expect(await hashConteudo('Acao', 'Corpo')).not.toBe(a)
    expect(await hashConteudo('Ação', 'Corpo!')).not.toBe(a)
  })
})

describe('linhasEvidencia', () => {
  const evidencia: Evidencia = { invalida: false, appVersion: '2.1.860', userAgent: 'Mozilla/5.0 (Linux)', platform: 'Android', model: 'SM-A546', ip: '203.0.113.7', ipVerificado: true, geo: { status: 'ok', lat: -23.18, lon: -45.88, accuracy: 29.6 } }
  const mapa = (e: Evidencia | null) => Object.fromEntries(linhasEvidencia(e))

  it('sem coluna diz que o registro é anterior à captura', () => {
    expect(linhasEvidencia(null)).toEqual([['', 'Não registrado (registro anterior à captura do aparelho).']])
  })
  it('registro ilegível não finge dados', () => {
    expect(linhasEvidencia({ ...evidencia, invalida: true })).toEqual([['', 'Registro do aparelho ilegível (formato inválido).']])
  })
  it('evidência completa traz aparelho, versão, IP verificado, coordenadas com precisão e link do mapa', () => {
    expect(mapa(evidencia)).toEqual({
      Aparelho: 'Android SM-A546 · Mozilla/5.0 (Linux)',
      'Versão do App': '2.1.860',
      'Endereço de internet (IP)': '203.0.113.7 (verificado)',
      Localização: '-23.18000, -45.88000 (±30 m)',
      Mapa: 'https://www.google.com/maps?q=-23.18000,-45.88000',
    })
  })
  it('IP não verificado, GPS negado e demais estados de localização', () => {
    const negada = mapa({ ...evidencia, ipVerificado: false, geo: { status: 'negada', lat: null, lon: null, accuracy: null } })
    expect(negada['Endereço de internet (IP)']).toBe('203.0.113.7 (não verificado)')
    expect(negada.Localização).toBe('não autorizada')
    expect(negada.Mapa).toBeUndefined()
    expect(mapa({ ...evidencia, geo: { status: 'tempo-esgotado', lat: null, lon: null, accuracy: null } }).Localização).toBe('tempo esgotado')
    expect(mapa({ ...evidencia, geo: { status: 'indisponivel', lat: null, lon: null, accuracy: null } }).Localização).toBe('indisponível')
    expect(mapa({ ...evidencia, geo: null }).Localização).toBe('não registrada')
    expect(mapa({ ...evidencia, geo: { status: 'ok', lat: null, lon: null, accuracy: null } }).Localização).toBe('indisponível')
  })
  it('sem IP e userAgent longo', () => {
    const linhas = mapa({ ...evidencia, ip: '', userAgent: 'x'.repeat(300) })
    expect(linhas['Endereço de internet (IP)']).toBe('não registrado')
    expect(linhas.Aparelho).toBe(`Android SM-A546 · ${'x'.repeat(50)}...`)
  })
})
