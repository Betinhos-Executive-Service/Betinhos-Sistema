import { describe, expect, it } from 'vitest'
import { matchesFilters, readFilters, type TableFilters } from '@betinhos/ui'
import { EQUIPAMENTO_DEFAULT_FILTERS, builtinViews, equipamentoFields, matchesKeyword, readEquipamento, sortEquipamentos } from './lista'
import { STATUS, statusLabel, statusTone } from './choices'
import { opcoesAtivas, validateTipo } from './cadastros'
import { applyForm, diffForm, emptyEquipamento, emptyForm, hasChanges, isDirty, serieRepetida, toForm, validateForm, withResponsavel, withStatus } from './form'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'
import { mapEquipamento, mapPessoa, mapTipo, responsavelRefPath, toPayload } from '../data/queries'
import { createMockEquipamentos, createMockPessoas, createMockTipos } from '../data/mock'

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
  it('tom do status', () => {
    expect(statusTone(STATUS.emUso)).toBe('info')
    expect(statusTone(STATUS.disponivel)).toBe('success')
    expect(statusTone(STATUS.manutencao)).toBe('warning')
    expect(statusTone(STATUS.baixado)).toBe('neutral')
    expect(statusTone(null)).toBe('neutral')
  })
  it('status diferente de Baixado mantém o responsável', () => {
    expect(withStatus({ ...emptyForm(), responsavelId: 'p1' }, S(STATUS.manutencao))).toMatchObject({ responsavelId: 'p1', status: S(STATUS.manutencao) })
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
  it('rejeita data impossível e aceita data real', () => {
    const base = { ...emptyForm(), descricao: 'X', tipoId: 't1' }
    expect(validateForm({ ...base, dataCompra: '2026-13-45' }).dataCompra).toBe('Data inválida.')
    expect(validateForm({ ...base, dataCompra: '2026-02-30' }).dataCompra).toBe('Data inválida.')
    expect(validateForm({ ...base, dataCompra: '10/01/2026' }).dataCompra).toBe('Data inválida.')
    expect(validateForm({ ...base, dataCompra: '2024-02-29' })).toEqual({})
  })
})

describe('série repetida', () => {
  const list = [item(), item({ id: 'e2', numeroSerie: '' })]
  it('acha outro item ignorando caixa, espaço e traço', () => {
    expect(serieRepetida({ ...emptyForm(), numeroSerie: 'dl5440 001' }, list, null)?.id).toBe('e1')
  })
  it('ignora ponto, barra e acento', () => {
    expect(serieRepetida({ ...emptyForm(), numeroSerie: 'DL5440.001' }, list, null)?.id).toBe('e1')
    expect(serieRepetida({ ...emptyForm(), numeroSerie: 'DL5440/001' }, list, null)?.id).toBe('e1')
    expect(serieRepetida({ ...emptyForm(), numeroSerie: 'SÉRIE-1' }, [item({ numeroSerie: 'serie 1' })], null)?.id).toBe('e1')
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
  it('cadastro com responsável manda o responsável', () => {
    const f = withResponsavel({ ...emptyForm(), descricao: 'Mouse', tipoId: 't3' }, 'p1')
    expect(diffForm(null, f)).toEqual({ campos: { cr40f_name: 'Mouse', cr40f_status: STATUS.emUso }, tipoId: 't3', responsavelId: 'p1' })
  })
  it('edição trocando o tipo manda só o tipo', () => {
    const base = toForm(item())
    expect(diffForm(base, { ...base, tipoId: 't3' })).toEqual({ campos: {}, tipoId: 't3' })
  })
  it('mudança só de formatação não gera alteração', () => {
    const base = { ...toForm(item({ valorCompra: 3499.9 })), descricao: ' Mouse' }
    const c = diffForm(base, { ...base, valorCompra: '3499,9', descricao: 'Mouse ' })
    expect(c).toEqual({ campos: {} })
    expect(hasChanges(c)).toBe(false)
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
  it('preserva os nomes quando o id não mudou e não está na lista', () => {
    const saved = applyForm(item(), toForm(item()), [], [])
    expect(saved).toMatchObject({ tipoId: 't1', tipoNome: 'Notebook', responsavelId: 'p1', responsavelNome: 'Bruna Lima' })
  })
  it('limpar responsável zera id e nome', () => {
    const saved = applyForm(item(), withResponsavel(toForm(item()), ''), tipos, pessoas)
    expect(saved).toMatchObject({ responsavelId: null, responsavelNome: '', status: STATUS.disponivel })
  })
})

describe('cadastros', () => {
  it('tipo exige nome único sem caixa e acento', () => {
    expect(validateTipo('  ', tipos, null)).toBe('Informe o nome do tipo.')
    expect(validateTipo('NOTEBOOK', tipos, null)).toBe('Já existe o tipo Notebook.')
    expect(validateTipo('Notebook', tipos, 't1')).toBeNull()
    expect(validateTipo('Webcam', tipos, null)).toBeNull()
  })
  it('tipo ignora acento e limita o tamanho', () => {
    const comAcento: TipoEquipamento[] = [{ id: 't9', nome: 'Máquina de cartão', ativo: true }]
    expect(validateTipo('maquina de cartao', comAcento, null)).toBe('Já existe o tipo Máquina de cartão.')
    expect(validateTipo('a'.repeat(101), tipos, null)).toBe('No máximo 100 caracteres.')
    expect(validateTipo('a'.repeat(100), tipos, null)).toBeNull()
  })
  it('opções mostram ativos e o atual inativo marcado', () => {
    expect(opcoesAtivas(tipos, null).map((o) => o.label)).toEqual(['Mouse', 'Notebook'])
    expect(opcoesAtivas(tipos, 't2').map((o) => o.label)).toEqual(['Mouse', 'Notebook', 'Pager (inativo)'])
  })
})

describe('lista', () => {
  const list = [
    item(),
    item({ id: 'e2', descricao: 'Notebook reserva', responsavelId: null, responsavelNome: '', status: STATUS.disponivel, numeroSerie: '' }),
    item({ id: 'e3', descricao: 'Impressora antiga', tipoNome: 'Impressora', numeroSerie: 'HP-M404-77', responsavelId: null, responsavelNome: '', status: STATUS.baixado }),
  ]
  const fields = equipamentoFields(tipos, pessoas)
  const apply = (filters: TableFilters) => list.filter((e) => matchesFilters(e, readFilters(filters, fields), fields, readEquipamento)).map((e) => e.id)
  const view = (id: string) => JSON.parse(builtinViews().find((v) => v.id === id)!.config).filters as TableFilters

  it('visão padrão esconde baixados', () => {
    expect(apply(EQUIPAMENTO_DEFAULT_FILTERS)).toEqual(['e1', 'e2'])
  })
  it('na visão padrão, o Status rápido traz os baixados de volta', () => {
    const { status, ...semStatus } = EQUIPAMENTO_DEFAULT_FILTERS.quick
    expect(status).toMatchObject({ id: 'rapido-status', field: 'status', op: 'in' })
    const soBaixados = { type: 'condition' as const, id: 'rapido-status', field: 'status', op: 'in' as const, values: [{ value: S(STATUS.baixado), label: 'Baixado' }] }
    expect(apply({ ...EQUIPAMENTO_DEFAULT_FILTERS, quick: { ...EQUIPAMENTO_DEFAULT_FILTERS.quick, status: soBaixados } })).toEqual(['e3'])
    expect(apply({ ...EQUIPAMENTO_DEFAULT_FILTERS, quick: semStatus })).toEqual(['e1', 'e2', 'e3'])
  })
  it('filtro de tipo e responsável marca inativos', () => {
    expect(fields.find((f) => f.key === 'tipo')!.options).toEqual([{ value: 't3', label: 'Mouse' }, { value: 't1', label: 'Notebook' }, { value: 't2', label: 'Pager (inativo)' }])
    expect(fields.find((f) => f.key === 'responsavel')!.options).toEqual([{ value: 'p1', label: 'Bruna Lima' }, { value: 'p2', label: 'Fabio Nunes (inativo)' }])
  })
  it('Compra filtra pela data; o valor é campo do avançado', () => {
    const e = item({ dataCompra: '2026-03-10', valorCompra: 3499.9 })
    expect(readEquipamento(e, 'compra')).toBe('2026-03-10')
    expect(readEquipamento(e, 'valorCompra')).toBe(3499.9)
    expect(fields.find((f) => f.key === 'compra')).toMatchObject({ kind: 'date' })
    expect(fields.find((f) => f.key === 'valorCompra')).toMatchObject({ kind: 'number', money: true, advancedOnly: true })
    const desde = (value: string): TableFilters => ({ quick: { compra: { type: 'condition', id: 'rapido-compra', field: 'compra', op: 'after', value } }, advanced: { type: 'group', id: 'raiz', logic: 'and', items: [] } })
    const comDatas = [item({ dataCompra: '2026-03-10' }), item({ id: 'e2', dataCompra: '2025-01-05' })]
    expect(comDatas.filter((x) => matchesFilters(x, readFilters(desde('2026-01-01'), fields), fields, readEquipamento)).map((x) => x.id)).toEqual(['e1'])
  })
  it('visões prontas: sem responsável e baixados', () => {
    expect(apply(view('sem-responsavel'))).toEqual(['e2'])
    expect(apply(view('baixados'))).toEqual(['e3'])
    expect(apply(view('todos'))).toEqual(['e1', 'e2', 'e3'])
  })
  it('busca por responsável, série e tipo sem acento', () => {
    expect(list.filter((e) => matchesKeyword(e, 'bruna')).map((e) => e.id)).toEqual(['e1'])
    expect(list.filter((e) => matchesKeyword(e, 'dl5440')).map((e) => e.id)).toEqual(['e1'])
    expect(list.filter((e) => matchesKeyword(e, 'impressora')).map((e) => e.id)).toEqual(['e3'])
  })
  it('ordena por descrição', () => {
    expect(sortEquipamentos(list, { key: 'equipamento', dir: 'asc' }).map((e) => e.id)).toEqual(['e3', 'e1', 'e2'])
  })
})

describe('dados', () => {
  const F = '@OData.Community.Display.V1.FormattedValue'
  const sets = { equipamento: 'cr40f_equipamentos', tipo: 'cr40f_tipoequipamentos', funcionario: 'cr40f_funcionarioses' }

  it('mapeia equipamento com rótulos formatados e data só dia', () => {
    const e = mapEquipamento({
      cr40f_equipamentoid: 'E1', cr40f_name: 'Notebook', _cr40f_tipo_value: 'T1', [`_cr40f_tipo_value${F}`]: 'Notebook', cr40f_status: 100000000,
      _cr40f_responsavel_value: 'P1', [`_cr40f_responsavel_value${F}`]: 'Bruna', cr40f_datacompra: '2026-01-10', cr40f_valorcompra: 3499.9, cr40f_numeroserie: 'null',
    })
    expect(e).toMatchObject({ id: 'e1', tipoId: 't1', tipoNome: 'Notebook', responsavelId: 'p1', responsavelNome: 'Bruna', dataCompra: '2026-01-10', valorCompra: 3499.9, numeroSerie: '' })
  })
  it('sem lookups vira null', () => {
    expect(mapEquipamento({ cr40f_equipamentoid: 'E2', cr40f_name: 'Mouse' })).toMatchObject({ tipoId: null, responsavelId: null, dataCompra: null })
  })
  it('tipo e pessoa leem o estado', () => {
    expect(mapTipo({ cr40f_tipoequipamentoid: 'T1', cr40f_name: 'Pager', statecode: 1 })).toEqual({ id: 't1', nome: 'Pager', ativo: false })
    expect(mapPessoa({ cr40f_funcionariosid: 'P1', cr40f_nomecompleto: 'Bruna', statecode: 0 })).toEqual({ id: 'p1', nome: 'Bruna', ativo: true })
  })
  it('payload liga lookups por @odata.bind e não manda responsável limpo', () => {
    expect(toPayload({ campos: { cr40f_name: 'X' }, tipoId: 't1', responsavelId: 'p1' }, sets)).toEqual({
      cr40f_name: 'X', 'cr40f_Tipo@odata.bind': '/cr40f_tipoequipamentos(t1)', 'cr40f_Responsavel@odata.bind': '/cr40f_funcionarioses(p1)',
    })
    expect(toPayload({ campos: {}, responsavelId: null }, sets)).toEqual({})
    expect(responsavelRefPath('cr40f_equipamentos', '{E1}')).toBe('cr40f_equipamentos(e1)/cr40f_Responsavel/$ref')
  })
  it('mock cobre baixado, sem responsável e responsável inativo', () => {
    const list = createMockEquipamentos()
    const pessoas = createMockPessoas()
    expect(list.some((e) => e.status === STATUS.baixado)).toBe(true)
    expect(list.some((e) => !e.responsavelId && e.status !== STATUS.baixado)).toBe(true)
    expect(list.some((e) => pessoas.find((p) => p.id === e.responsavelId)?.ativo === false)).toBe(true)
    expect(createMockTipos().some((t) => !t.ativo)).toBe(true)
  })
})
