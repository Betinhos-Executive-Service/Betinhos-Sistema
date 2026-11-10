import { describe, expect, it } from 'vitest'
import {
  COMUNICADO_ESCOPO, COMUNICADO_PUSH, COMUNICADO_TIPO, buildResultadosCsv, canResendPush, draftPayload, duplicateComunicado, emptyDraft,
  mapDestinatario, mapMotoristas, matchResultado, parseEvidencia, parseTargetIds, statusLabel, validateDraft, type Destinatario,
} from './comunicados'

const GUID = 'b4f87f6c-a6ec-f011-8406-7ced8da7f336'
const row = (extra: Partial<Destinatario> = {}): Destinatario => ({
  id: '1', comunicadoId: 'c', motoristaId: 'm', enviadoEm: '2026-10-16T12:00:00Z', abertoEm: null, lidoEm: null, cienteEm: null,
  nomeAssinante: '', observacao: '', assinaturaJson: '', evidenciaAbertura: null, evidenciaCiencia: null, pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra,
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

describe('evidência do aparelho', () => {
  const completa = JSON.stringify({
    v: 1, appVersion: '2.1.860', userAgent: 'Mozilla/5.0', platform: 'Android', model: 'SM-A546',
    ipStamp: { ip: '203.0.113.7', ts: '2026-11-10T13:40:00.000Z', sig: 'x' }, ipVerificado: true,
    geo: { status: 'ok', lat: -23.18, lon: -45.88, accuracy: 30, ts: '2026-11-10T13:40:00.000Z' }, servidorEm: '2026-11-10T13:40:01.000Z',
  })

  it('lê a evidência completa', () => {
    expect(parseEvidencia(completa)).toEqual({
      invalida: false, appVersion: '2.1.860', userAgent: 'Mozilla/5.0', platform: 'Android', model: 'SM-A546', ip: '203.0.113.7', ipVerificado: true,
      geo: { status: 'ok', lat: -23.18, lon: -45.88, accuracy: 30 },
    })
  })

  it('vazio, nulo e JSON que não é objeto viram null', () => {
    for (const value of [undefined, null, '', '  ', 'não é json', '[1]', '"x"', '42']) expect(parseEvidencia(value)).toBeNull()
  })

  it('marca de erro do plugin vira evidência inválida', () => {
    expect(parseEvidencia('{"v":1,"erro":"formato","servidorEm":"2026-11-10T13:40:01.000Z"}')).toMatchObject({ invalida: true, ip: '', geo: null })
  })

  it('sem carimbo o IP não conta como verificado; GPS negado não traz coordenadas', () => {
    const evidence = parseEvidencia('{"v":1,"ipStamp":null,"ipVerificado":true,"geo":{"status":"negada"}}')
    expect(evidence).toMatchObject({ ip: '', ipVerificado: false, geo: { status: 'negada', lat: null, lon: null, accuracy: null } })
  })

  it('status de geo desconhecido e números inválidos são descartados', () => {
    expect(parseEvidencia('{"geo":{"status":"qualquer"}}')?.geo).toBeNull()
    expect(parseEvidencia('{"geo":{"status":"ok","lat":"x","lon":null}}')?.geo).toEqual({ status: 'ok', lat: null, lon: null, accuracy: null })
  })

  it('mapDestinatario interpreta as duas colunas e deixa null as vazias', () => {
    const mapped = mapDestinatario({ new_comunicadodestinatarioid: 'd', new_evidenciaaberturajson: completa, new_evidenciacienciajson: null })
    expect(mapped.evidenciaAbertura?.ip).toBe('203.0.113.7')
    expect(mapped.evidenciaCiencia).toBeNull()
  })
})
