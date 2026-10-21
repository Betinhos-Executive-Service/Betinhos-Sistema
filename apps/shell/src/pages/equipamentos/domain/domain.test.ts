import { describe, expect, it } from 'vitest'
import { STATUS, statusLabel } from './choices'
import { opcoesAtivas, validateTipo } from './cadastros'
import { applyForm, diffForm, emptyEquipamento, emptyForm, hasChanges, isDirty, serieRepetida, toForm, validateForm, withResponsavel, withStatus } from './form'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

const S = (v: number) => String(v)
const tipos: TipoEquipamento[] = [{ id: 't1', nome: 'Notebook', ativo: true }, { id: 't2', nome: 'Pager', ativo: false }, { id: 't3', nome: 'Mouse', ativo: true }]
const pessoas: Pessoa[] = [{ id: 'p1', nome: 'Bruna Lima', ativo: true }, { id: 'p2', nome: 'Fabio Nunes', ativo: false }]
const item = (over: Partial<Equipamento> = {}): Equipamento => ({ ...emptyEquipamento('e1'), descricao: 'Notebook do Financeiro', tipoId: 't1', tipoNome: 'Notebook', numeroSerie: 'DL5440-001', status: STATUS.emUso, responsavelId: 'p1', responsavelNome: 'Bruna Lima', ...over })

describe('status e responsável', () => {
  it('escolher responsável em item Disponível sugere Em uso', () => {
    expect(withResponsavel(emptyForm(), 'p1')).toMatchObject({ responsavelId: 'p1', status: S(STATUS.emUso) })
  })
  it('limpar responsável em item Em uso sugere Disponível', () => {
    expect(withResponsavel({ ...emptyForm(), status: S(STATUS.emUso), responsavelId: 'p1' }, '')).toMatchObject({ responsavelId: '', status: S(STATUS.disponivel) })
  })
  it('não mexe em Em manutenção', () => {
    expect(withResponsavel({ ...emptyForm(), status: S(STATUS.manutencao) }, 'p1').status).toBe(S(STATUS.manutencao))
  })
  it('Baixado limpa o responsável', () => {
    expect(withStatus({ ...emptyForm(), responsavelId: 'p1' }, S(STATUS.baixado))).toMatchObject({ responsavelId: '', status: S(STATUS.baixado) })
  })
  it('rótulo do status', () => {
    expect(statusLabel(STATUS.manutencao)).toBe('Em manutenção')
    expect(statusLabel(null)).toBe('Sem status')
  })
})

describe('validação', () => {
  it('exige descrição, tipo e status', () => {
    expect(validateForm({ ...emptyForm(), status: '' })).toMatchObject({ descricao: 'Informe a descrição.', tipoId: 'Escolha o tipo.', status: 'Escolha o status.' })
  })
  it('rejeita valor inválido e aceita 3.499,90', () => {
    const base = { ...emptyForm(), descricao: 'X', tipoId: 't1' }
    expect(validateForm({ ...base, valorCompra: '-10' }).valorCompra).toBe('Valor inválido. Use o formato 1.467,35.')
    expect(validateForm({ ...base, valorCompra: '3.499,90' })).toEqual({})
  })
  it('Baixado com responsável é erro', () => {
    expect(validateForm({ ...emptyForm(), descricao: 'X', tipoId: 't1', status: S(STATUS.baixado), responsavelId: 'p1' }).responsavelId).toBe('Item baixado não fica com responsável.')
  })
  it('limita tamanho da descrição', () => {
    expect(validateForm({ ...emptyForm(), descricao: 'a'.repeat(201), tipoId: 't1' }).descricao).toBe('No máximo 200 caracteres.')
  })
})

describe('série repetida', () => {
  const list = [item(), item({ id: 'e2', numeroSerie: '' })]
  it('acha outro item ignorando caixa, espaço e traço', () => {
    expect(serieRepetida({ ...emptyForm(), numeroSerie: 'dl5440 001' }, list, null)?.id).toBe('e1')
  })
  it('ignora o próprio item e série vazia', () => {
    expect(serieRepetida(toForm(item()), list, 'e1')).toBeNull()
    expect(serieRepetida(emptyForm(), list, null)).toBeNull()
  })
})

describe('diff e aplicação', () => {
  it('cadastro manda só o preenchido e o tipo', () => {
    const c = diffForm(null, { ...emptyForm(), descricao: ' Mouse ', tipoId: 't3' })
    expect(c).toEqual({ campos: { cr40f_name: 'Mouse', cr40f_status: STATUS.disponivel }, tipoId: 't3' })
  })
  it('edição manda só o que mudou; limpar responsável vira null', () => {
    const base = toForm(item())
    const next = withResponsavel({ ...base, marcaModelo: 'Dell' }, '')
    expect(diffForm(base, next)).toEqual({ campos: { cr40f_marcamodelo: 'Dell', cr40f_status: STATUS.disponivel }, responsavelId: null })
  })
  it('sem mudança não tem alterações', () => {
    const base = toForm(item())
    expect(hasChanges(diffForm(base, { ...base }))).toBe(false)
    expect(isDirty(base, { ...base })).toBe(false)
  })
  it('data e valor vazios viram null na edição', () => {
    const base = toForm(item({ dataCompra: '2026-01-10', valorCompra: 3499.9 }))
    expect(diffForm(base, { ...base, dataCompra: '', valorCompra: '' }).campos).toEqual({ cr40f_datacompra: null, cr40f_valorcompra: null })
  })
  it('aplica nomes de tipo e responsável', () => {
    const saved = applyForm(item(), { ...toForm(item()), tipoId: 't3', responsavelId: 'p2', valorCompra: '89,90' }, tipos, pessoas)
    expect(saved).toMatchObject({ tipoNome: 'Mouse', responsavelNome: 'Fabio Nunes', valorCompra: 89.9 })
  })
})

describe('cadastros', () => {
  it('tipo exige nome único sem caixa e acento', () => {
    expect(validateTipo('  ', tipos, null)).toBe('Informe o nome do tipo.')
    expect(validateTipo('NOTEBOOK', tipos, null)).toBe('Já existe o tipo Notebook.')
    expect(validateTipo('Notebook', tipos, 't1')).toBeNull()
    expect(validateTipo('Webcam', tipos, null)).toBeNull()
  })
  it('opções mostram ativos e o atual inativo marcado', () => {
    expect(opcoesAtivas(tipos, null).map((o) => o.label)).toEqual(['Mouse', 'Notebook'])
    expect(opcoesAtivas(tipos, 't2').map((o) => o.label)).toEqual(['Mouse', 'Notebook', 'Pager (inativo)'])
  })
})
