import { describe, expect, it } from 'vitest'
import { alertasQualidade } from './alertas'
import { FAT_PAGO } from './codes'
import {
  detalheAReceber, detalheCnh, detalheCpPendente, detalheMultasPendentes, detalheQualidade, detalheServicosMotorista, linkRegistro,
} from './detalhes'
import { aReceber, cpPendentes } from './kpis'
import { funcionario, multa, reserva } from './test-utils'

const NOW = new Date('2026-10-15T15:00:00Z')
const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('detalhes (drill-down)', () => {
  it('CP pendente: as mesmas linhas do número do card, em ordem cronológica, com código, cliente, motorista e valor', () => {
    const rv = [
      reserva({ saidaRaw: '2026-10-08T12:00:00Z', cpId: 'cp2', cpCodigo: 'CP-2', cpPendente: true, fatStatusLabel: 'Pendente', valor: 200, cliente: 'Tenaris', motorista: 'Oliveira' }),
      reserva({ saidaRaw: '2026-10-02T12:00:00Z', cpId: 'cp1', cpCodigo: 'CP-1', cpPendente: true, fatStatusLabel: 'Pendente', valor: 100 }),
      // Mesma CP repetida: conta uma vez, como `getSemValorRows`.
      reserva({ saidaRaw: '2026-10-03T12:00:00Z', cpId: 'cp1', cpCodigo: 'CP-1', cpPendente: true, fatStatusLabel: 'Pendente', valor: 100 }),
      reserva({ cpId: 'cp3', cpPendente: false, fatStatusLabel: 'Pendente' }),
    ]
    const d = detalheCpPendente(rv)
    expect(d.tipo).toBe('servicos')
    expect(d.linhas.length).toBe(cpPendentes(rv).length)
    expect(d.linhas.map((l) => ('codigo' in l ? l.codigo : ''))).toEqual(['CP-1', 'CP-2'])
    expect(d.linhas[1]).toMatchObject({ dia: '2026-10-08', cliente: 'Tenaris', motorista: 'Oliveira', valor: 200 })
  })

  it('A receber: soma das linhas igual ao KPI e coluna OP', () => {
    const rv = [
      reserva({ cpConcluida: true, opId: 'op1', opCodigo: 'OP-1', valor: 300 }),
      reserva({ cpConcluida: true, opId: 'op2', opCodigo: 'OP-2', valor: 500, fatStatus: FAT_PAGO }),
      reserva({ cpConcluida: true, opId: '', valor: 700 }),
    ]
    const d = detalheAReceber(rv)
    if (d.tipo !== 'servicos') throw new Error('tipo')
    expect(d.comOp).toBe(true)
    expect(d.linhas.map((l) => l.op)).toEqual(['OP-1'])
    expect(d.linhas.reduce((s, l) => s + l.valor, 0)).toBe(aReceber(rv))
  })

  it('qualidade: o tamanho de cada lista bate com o número do alerta', () => {
    const rv = [
      reserva({ saidaRaw: '2026-10-05T15:00:00Z', motoristaId: 'm1', veiculoId: '' }),
      reserva({ saidaRaw: '2026-10-05T15:00:00Z', motoristaId: '', status: 202410008 }),
      reserva({ saidaRaw: '2026-10-05T15:00:00Z', cliente: 'Sem cliente', motoristaId: 'm1', veiculoId: 'v1' }),
    ]
    const alertas = new Map(alertasQualidade(rv, NOW.getTime()).map((a) => [a.id, a.valor]))
    for (const id of ['semVeiculo', 'semMotorista', 'semCliente'] as const) {
      expect(String(detalheQualidade(id, rv, NOW.getTime()).linhas.length)).toBe(alertas.get(id))
    }
  })

  it('serviços do motorista: por id ou, sem id, pelo nome exibido', () => {
    const rv = [reserva({ motoristaId: 'm1', motorista: 'Oliveira' }), reserva({ motoristaId: '', motorista: 'Avulso' }), reserva({ motoristaId: 'm2', motorista: 'Avulso' })]
    expect(detalheServicosMotorista(rv, { key: 'm1', nome: 'Oliveira' }).linhas.length).toBe(1)
    expect(detalheServicosMotorista(rv, { key: 'nome:avulso', nome: 'Avulso' }).linhas.length).toBe(2)
    expect(detalheServicosMotorista(rv, { key: 'm1', nome: 'Oliveira' }).titulo).toBe('Serviços de Oliveira')
  })

  it('CNH em atenção (validade e dias) e multas pendentes no período', () => {
    const cnh = detalheCnh([
      funcionario({ id: 'f1', apelido: 'Ana', cnhMs: Date.parse('2026-10-25T12:00:00Z') }),
      funcionario({ id: 'f2', apelido: 'Bia', cnhMs: Date.parse('2026-10-05T12:00:00Z') }),
      funcionario({ id: 'f3', apelido: 'Caio', cnhMs: Date.parse('2027-12-01T12:00:00Z') }),
    ], NOW)
    expect(cnh.linhas).toEqual([
      { id: 'f2', motorista: 'Bia', validade: '2026-10-05', dias: -10 },
      { id: 'f1', motorista: 'Ana', validade: '2026-10-25', dias: 10 },
    ])
    const mu = detalheMultasPendentes([
      multa({ id: 'm1', dia: '2026-10-02', status: 202410000, statusLabel: 'Notificar o Condutor', motorista: 'Ana', infracaoCodigo: '745-50' }),
      multa({ id: 'm2', dia: '2026-10-03', status: 202410006, statusLabel: 'Pago' }),
      multa({ id: 'm3', dia: '2026-08-03', status: 202410000 }),
    ], { inicio: '2026-10-01', fim: '2026-10-31' })
    expect(mu.linhas).toEqual([{ id: 'm1', dia: '2026-10-02', motorista: 'Ana', infracao: '745-50', status: 'Notificar o Condutor' }])
  })

  it('link do Dataverse só com clientUrl e GUID', () => {
    expect(linkRegistro('https://org.crm2.dynamics.com', 'reserva', GUID)).toBe(`https://org.crm2.dynamics.com/main.aspx?etn=cr40f_reservadeveculos&id=${GUID}&pagetype=entityrecord`)
    expect(linkRegistro('https://org.crm2.dynamics.com', 'multa', GUID)).toContain('etn=cr40f_multas&')
    expect(linkRegistro(null, 'reserva', GUID)).toBeNull()
    expect(linkRegistro('https://org.crm2.dynamics.com', 'reserva', 'legacy-2026-0001')).toBeNull()
  })
})
