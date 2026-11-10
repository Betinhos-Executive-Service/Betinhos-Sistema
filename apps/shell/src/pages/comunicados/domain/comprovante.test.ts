import { describe, expect, it } from 'vitest'
import { COMUNICADO_ESCOPO, COMUNICADO_ESTADO, COMUNICADO_PUSH, COMUNICADO_TIPO, type Comunicado, type Destinatario } from './comunicados'
import { concluido, hashConteudo, nomeArquivo, paresDoComunicado, paresDoMotorista } from './comprovante'

const item = (id: string, tipo: Comunicado['tipo'], estado: number = COMUNICADO_ESTADO.disparado): Comunicado => ({ id, titulo: `Ação ${id}`, corpo: 'Texto', tipo, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado, disparadoEm: '2026-11-01T10:00:00Z' })
const dest = (id: string, comunicadoId: string, extra: Partial<Destinatario> = {}): Destinatario => ({ id, comunicadoId, motoristaId: 'm1', enviadoEm: '2026-11-01T10:00:00Z', abertoEm: null, lidoEm: null, cienteEm: null, nomeAssinante: '', observacao: '', assinaturaJson: '', pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra })
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
    expect(paresDoComunicado(ciencia, rows, nome, new Set(['c'])).map((p) => p.destinatario.id)).toEqual(['a', 'b'])
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
