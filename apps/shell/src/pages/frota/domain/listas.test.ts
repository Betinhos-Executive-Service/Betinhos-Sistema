import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import { EMPTY_DATA } from '../data/source'
import type { FrotaData } from '../data/types'
import { toCsv } from '../../../app/csv'
import { linhas } from './linhas'
import { MULTA_FILTROS_PADRAO, MULTA_VISAO_PADRAO, readRegistro, registroBuiltins, registroColumns } from './listas'
import { buildTimeline } from './timeline'

const v1 = { id: 'v1', label: 'ABC1D23' }
const data: FrotaData = {
  ...EMPTY_DATA,
  manutencoes: [
    { id: 'm1', codigo: 'M1', descricao: 'Troca de óleo', status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-09-20T12:00:00Z', valor: 200, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: v1, solicitante: null, criadoEm: '2026-09-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
    { id: 'm2', codigo: 'M2', descricao: 'Pneu', status: MANUT.SOLICITADO, grau: 3, tipo: 2, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v2', label: 'EFG4H56' }, solicitante: null, criadoEm: '2026-10-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
  ],
  multas: [{ id: 'u1', titulo: 'AIT 1', status: 202410000, dataHora: '2026-09-25T12:00:00Z', local: 'Av. Brasil', dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: v1, motorista: { id: 'f1', label: 'Ana' }, infracaoId: null, criadoEm: '2026-09-26T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }],
  posses: [{ id: 'p1', inicio: '2026-08-01T12:00:00Z', fim: null, veiculo: v1, motorista: { id: 'f1', label: 'Ana' }, localBase: null }],
}

describe('buildTimeline', () => {
  it('junta os eventos do veículo em ordem decrescente', () => {
    expect(buildTimeline('v1', data).map((item) => [item.kind, item.id, item.dia])).toEqual([['multa', 'u1', '2026-09-25'], ['manutencao', 'm1', '2026-09-20'], ['posse', 'p1', '2026-08-01']])
  })
})

describe('linhas', () => {
  it('monta as linhas de manutenção da mais recente para a mais antiga', () => {
    expect(linhas('manutencao', data).map((item) => [item.id, item.dia, item.extra])).toEqual([['m2', '2026-10-01', 'Alta'], ['m1', '2026-09-20', 'R$ 200,00']])
  })
})

describe('lista de multas (fase 1)', () => {
  const hoje = '2026-11-17'
  const base = data.multas[0]
  const comEtapas: FrotaData = {
    ...data,
    multas: [
      { ...base, id: 'a', dataParaIndicar: '2026-11-10' },
      { ...base, id: 'b', status: 202410001 },
      { ...base, id: 'c', status: 202410006 },
      { ...base, id: 'd', status: 202410005 },
      { ...base, id: 'e', status: 202410001, vencimento: '2026-11-20', responsavel: 100000001 },
    ],
  }

  it('colunas: auto, data, placa, responsável, etapa, próximo passo e próximo prazo', () => {
    expect(registroColumns('multa').map((c) => c.label)).toEqual(['Auto', 'Data', 'Placa', 'Responsável', 'Etapa', 'Próximo passo', 'Próximo prazo'])
    expect(registroColumns('manutencao').map((c) => c.key)).not.toContain('termo')
  })

  it('linhas com responsável, próximo passo, próximo prazo e filas', () => {
    const porId = Object.fromEntries(linhas('multa', comEtapas, hoje).map((l) => [l.id, l]))
    expect(porId.a).toMatchObject({ proximoPasso: 'Prazo vencido: responder', proximoPrazo: '2026-11-10', situacoes: ['comigo', 'prazo-vencido'] })
    expect(porId.b.situacoes).toEqual(['aguardando-penalidade'])
    expect(porId.c.situacoes).toEqual(['comigo', 'aguardando-acerto'])
    expect(porId.d.situacoes).toEqual(['encerradas'])
    expect(porId.e.pessoa).toEqual({ id: 'empresa', label: 'Empresa' })
    expect(porId.e.proximoPrazo).toBe('2026-11-20')
    expect(readRegistro(porId.a, 'situacao')).toEqual(['comigo', 'prazo-vencido'])
  })

  it('visões: Comigo é a padrão; depois Prazo vencido, Aguardando penalidade, Aguardando acerto, Encerradas e canceladas, Todas', () => {
    expect(MULTA_VISAO_PADRAO).toBe('Comigo')
    expect(MULTA_FILTROS_PADRAO.advanced.items).toMatchObject([{ field: 'situacao', op: 'in', values: [{ value: 'comigo' }] }])
    expect(registroBuiltins('multa').map((v) => v.name)).toEqual(['Prazo vencido', 'Aguardando penalidade', 'Aguardando acerto', 'Encerradas e canceladas', 'Todas'])
  })
})

describe('toCsv', () => {
  it('usa BOM, ponto e vírgula, vírgula decimal e aspas quando necessário', () => {
    expect(toCsv(['Placa', 'Valor', 'Obs'], [['ABC1D23', 1234.5, 'a;b "c"'], ['EFG4H56', null, '']])).toBe('﻿Placa;Valor;Obs\r\nABC1D23;1234,5;"a;b ""c"""\r\nEFG4H56;;\r\n')
  })
})
