import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import { EMPTY_DATA } from '../data/source'
import type { FrotaData } from '../data/types'
import { toCsv } from '../../../app/csv'
import { linhas } from './linhas'
import { matchesRegistroKeyword, MULTA_FILTROS_PADRAO, MULTA_VISAO_PADRAO, readRegistro, registroBuiltins, registroColumns, sortRegistros } from './listas'
import type { Linha } from './linhas'
import { buildTimeline } from './timeline'

const v1 = { id: 'v1', label: 'ABC1D23' }
const data: FrotaData = {
  ...EMPTY_DATA,
  manutencoes: [
    { id: 'm1', codigo: 'M1', descricao: 'Troca de óleo', status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: '2026-09-20T12:00:00Z', valor: 200, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: v1, solicitante: null, criadoEm: '2026-09-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
    { id: 'm2', codigo: 'M2', descricao: 'Pneu', status: MANUT.SOLICITADO, grau: 3, tipo: 2, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v2', label: 'EFG4H56' }, solicitante: null, criadoEm: '2026-10-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
  ],
  multas: [{ id: 'u1', codigo: 'NT-1073', titulo: 'AIT 1', status: 202410000, dataHora: '2026-09-25T12:00:00Z', local: 'Av. Brasil', dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: v1, motorista: { id: 'f1', label: 'Ana' }, infracaoId: null, criadoEm: '2026-09-26T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }],
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
      { ...base, id: 'f', status: 202410006, competencia: '2026-12-01', acertoEm: '2026-11-17' },
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
    expect(porId.f.situacoes).toEqual(['descontando'])
    expect(porId.e.pessoa).toEqual({ id: 'empresa', label: 'Empresa' })
    expect(porId.e.proximoPrazo).toBe('2026-11-20')
    expect(readRegistro(porId.a, 'situacao')).toEqual(['comigo', 'prazo-vencido'])
  })

  it('Comigo: status legado ou desconhecido e responsável vazio entram; Descontado, Encerrada e Cancelada ficam fora', () => {
    const lista: FrotaData = {
      ...data,
      multas: [
        { ...base, id: 'sem-status', status: null, responsavel: null, motorista: null },
        { ...base, id: 'desconhecido', status: 999, responsavel: null },
        { ...base, id: 'recurso', status: 202410002 },
        { ...base, id: 'descontado', status: 202410003 },
        { ...base, id: 'encerrada', status: 202410005 },
        { ...base, id: 'cancelada', status: 202410007 },
      ],
    }
    const comigo = linhas('multa', lista, hoje).filter((l) => l.situacoes?.includes('comigo')).map((l) => l.id).sort()
    expect(comigo).toEqual(['desconhecido', 'recurso', 'sem-status'])
  })

  it('visões: Comigo é a padrão; depois Prazo vencido, Aguardando penalidade, Aguardando acerto, Descontando, Encerradas e canceladas, Todas', () => {
    expect(MULTA_VISAO_PADRAO).toBe('Comigo')
    expect(MULTA_FILTROS_PADRAO.advanced.items).toMatchObject([{ field: 'situacao', op: 'in', values: [{ value: 'comigo' }] }])
    expect(registroBuiltins('multa').map((v) => v.name)).toEqual(['Prazo vencido', 'Aguardando penalidade', 'Aguardando acerto', 'Descontando', 'Encerradas e canceladas', 'Todas'])
    expect(registroBuiltins('multa').map((v) => v.id)).toEqual(['prazo-vencido', 'aguardando-penalidade', 'aguardando-acerto', 'descontando', 'encerradas', 'todas'])
  })

  it('Manutenções: Em aberto e A encaixar', () => {
    // Manutenções: "Em aberto" (ordem 1); "A encaixar" (ex-sub-aba) filtra Solicitado, a de maior grau e mais antiga primeiro.
    const [abertas, encaixar] = registroBuiltins('manutencao')
    expect([abertas.name, abertas.ordem, encaixar.id, encaixar.name, encaixar.ordem]).toEqual(['Em aberto', 1, 'encaixar', 'A encaixar', 2])
    const config = JSON.parse(encaixar.config)
    expect(config.filters.quick.status.values.map((v: { value: string }) => v.value)).toEqual([String(MANUT.SOLICITADO)])
    expect(config.sort).toEqual({ key: 'grau', dir: 'desc' })
    expect(config.columns.find((c: { key: string }) => c.key === 'grau').visible).toBe(false) // Grau é coluna oculta por padrão
  })

  it('ordenar por grau: maior grau primeiro; no mesmo grau, o pedido mais antigo; sem grau no fim', () => {
    const linha = (id: string, grau: number | null, dia: string) => ({ kind: 'manutencao', id, titulo: id, veiculo: null, pessoa: null, status: MANUT.SOLICITADO, dia, extra: '', categorias: [], termo: '', termoStatus: null, grau }) as Linha
    const lista = [linha('media', 2, '2026-11-01'), linha('sem', null, '2026-10-01'), linha('alta-nova', 3, '2026-11-10'), linha('alta-velha', 3, '2026-11-02')]
    expect(sortRegistros(lista, 'manutencao', { key: 'grau', dir: 'desc' }).map((l) => l.id)).toEqual(['alta-velha', 'alta-nova', 'media', 'sem'])
  })
})

describe('toCsv', () => {
  it('usa BOM, ponto e vírgula, vírgula decimal e aspas quando necessário', () => {
    expect(toCsv(['Placa', 'Valor', 'Obs'], [['ABC1D23', 1234.5, 'a;b "c"'], ['EFG4H56', null, '']])).toBe('﻿Placa;Valor;Obs\r\nABC1D23;1234,5;"a;b ""c"""\r\nEFG4H56;;\r\n')
  })
})

describe('busca de registros', () => {
  it('acha a multa pelo código citado no resumo diário', () => {
    const [linha] = linhas('multa', data)
    expect(matchesRegistroKeyword(linha, 'nt-1073')).toBe(true)
    expect(matchesRegistroKeyword(linha, 'NT-9999')).toBe(false)
  })
})
