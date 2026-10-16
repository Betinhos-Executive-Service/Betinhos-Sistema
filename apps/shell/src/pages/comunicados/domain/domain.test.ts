import { describe, expect, it } from 'vitest'
import {
  COMUNICADO_ESCOPO, COMUNICADO_PUSH, COMUNICADO_TIPO, buildResultadosCsv, canResendPush, draftPayload, duplicateComunicado, emptyDraft,
  mapMotoristas, matchResultado, parseTargetIds, statusLabel, validateDraft, type Destinatario,
} from './comunicados'

const GUID = 'b4f87f6c-a6ec-f011-8406-7ced8da7f336'
const row = (extra: Partial<Destinatario> = {}): Destinatario => ({
  id: '1', comunicadoId: 'c', motoristaId: 'm', enviadoEm: '2026-10-16T12:00:00Z', abertoEm: null, lidoEm: null, cienteEm: null,
  nomeAssinante: '', observacao: '', assinaturaJson: '', pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra,
})

describe('comunicados', () => {
  it('lê alvos do JSON limpando chaves, duplicados e lixo', () => {
    expect(parseTargetIds(`["{${GUID.toUpperCase()}}","${GUID}","x"]`)).toEqual([GUID])
    expect(parseTargetIds('não é json')).toEqual([])
    expect(parseTargetIds('{"a":1}')).toEqual([])
  })

  it('valida título, mensagem e seleção', () => {
    const draft = { ...emptyDraft(), titulo: 'Aviso', corpo: 'Texto' }
    expect(validateDraft(draft)).toBe('')
    expect(validateDraft({ ...draft, titulo: '  ' })).toMatch(/título/)
    expect(validateDraft({ ...draft, corpo: 'x'.repeat(4001) })).toMatch(/mensagem/)
    expect(validateDraft({ ...draft, escopo: COMUNICADO_ESCOPO.selecionados })).toMatch(/Selecione/)
  })

  it('payload de "todos" grava alvos vazios e sempre como rascunho', () => {
    const payload = draftPayload({ ...emptyDraft(), titulo: ' A ', corpo: 'B', alvoIds: [GUID] })
    expect(payload).toMatchObject({ new_titulo: 'A', new_name: 'A', new_alvosjson: '[]', new_estado: 100000000 })
  })

  it('informativo conclui na leitura; ciência só na assinatura', () => {
    const lido = row({ abertoEm: 'x', lidoEm: 'x' })
    expect(matchResultado('concluidos', lido, COMUNICADO_TIPO.informativo)).toBe(true)
    expect(matchResultado('pendentes', lido, COMUNICADO_TIPO.ciencia)).toBe(true)
    expect(statusLabel(row({ cienteEm: 'x' }))).toBe('Ciência assinada')
    expect(statusLabel(row({ abertoEm: 'x' }))).toBe('Visualizado')
  })

  it('reenvia após falha ou como lembrete enquanto pendente', () => {
    expect(canResendPush(row({ pushStatus: COMUNICADO_PUSH.falhou, lidoEm: 'x' }), COMUNICADO_TIPO.informativo)).toBe(true)
    expect(canResendPush(row(), COMUNICADO_TIPO.informativo)).toBe(true)
    expect(canResendPush(row({ lidoEm: 'x' }), COMUNICADO_TIPO.informativo)).toBe(false)
    expect(canResendPush(row({ pushStatus: COMUNICADO_PUSH.pendente }), COMUNICADO_TIPO.informativo)).toBe(false)
  })

  it('duplica como rascunho sem id e respeita o limite do título', () => {
    const copy = duplicateComunicado({ ...emptyDraft(), id: 'x', titulo: 'a'.repeat(150), estado: 100000001, disparadoEm: 'x' })
    expect(copy).toMatchObject({ id: '', estado: 100000000, disparadoEm: null })
    expect(copy.titulo).toHaveLength(150)
    expect(copy.titulo.endsWith(' (cópia)')).toBe(true)
  })

  it('marca motoristas sem acesso ao app', () => {
    const list = mapMotoristas(
      [
        { cr40f_funcionariosid: 'A', cr40f_nomecompleto: 'Bruno', cr40f_emailmicrosoft: 'b@x', cr40f_tipodevinculo: 0 },
        { cr40f_funcionariosid: 'B', cr40f_nomecompleto: 'Ana', cr40f_emailmicrosoft: '', cr40f_tipodevinculo: 1 },
        { cr40f_funcionariosid: 'C', cr40f_nomecompleto: 'Caio', cr40f_emailmicrosoft: 'c@x', cr40f_tipodevinculo: null },
        { cr40f_funcionariosid: 'D', cr40f_nomecompleto: 'Davi', cr40f_emailmicrosoft: 'd@x', cr40f_tipodevinculo: 0 },
      ],
      [{ internalemailaddress: 'B@X' }],
    )
    expect(list.map((m) => [m.nome, m.problema])).toEqual([
      ['Ana', 'Sem e-mail Microsoft'], ['Bruno', ''], ['Caio', 'Tipo de vínculo não definido'], ['Davi', 'Sem usuário ativo'],
    ])
    expect(list[1].id).toBe('a')
  })

  it('CSV com BOM, separador ; e aspas quando precisa', () => {
    const csv = buildResultadosCsv([row({ observacao: 'ok; "certo"' })], () => 'Ana')
    expect(csv.startsWith('﻿Motorista;Status')).toBe(true)
    expect(csv).toContain('"ok; ""certo"""')
  })
})
