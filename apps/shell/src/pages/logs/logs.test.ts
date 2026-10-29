import { describe, expect, it } from 'vitest'
import { MAX_LOGS, createMockLogs, logsPath, mapLog } from './data'
import { formatPayload, logFields, matchesKeyword, periodoStart, periodoValido, severidadeLabel, severidadeTone, sortLogs } from './lista'
import { promptCorrecao, recorrencia } from './prompt'

describe('logs dos apps', () => {
  it('consulta só o período, do mais novo ao mais antigo, com teto', () => {
    const path = decodeURIComponent(logsPath('new_appmotoristaslogs', new Date('2026-10-21T03:00:00Z')))
    expect(path).toContain('createdon ge 2026-10-21T03:00:00.000Z')
    expect(path).toContain('createdon desc')
    expect(path).toContain(`$top=${MAX_LOGS}`)
  })

  it('mapeia a linha do Dataverse tolerando campos vazios', () => {
    const l = mapLog({ new_appmotoristaslogid: '{ABC}', createdon: 'lixo', new_severity: 'ERROR', new_isoffline: null })
    expect(l).toMatchObject({ id: 'abc', data: null, severidade: 'error', app: '', offline: null })
  })

  it('período inválido cai no padrão de 7 dias', () => {
    expect(periodoValido('999')).toBe('7')
    const now = new Date('2026-10-28T12:00:00Z')
    expect(periodoStart('30', now).toISOString()).toBe('2026-09-28T12:00:00.000Z')
  })

  it('severidade desconhecida fica neutra e com o texto original', () => {
    expect(severidadeTone('critical')).toBe('danger')
    expect(severidadeTone('debug')).toBe('neutral')
    expect(severidadeLabel('debug')).toBe('debug')
    expect(severidadeLabel('')).toBe('Sem severidade')
  })

  it('payload cortado aparece como chegou; válido sai formatado', () => {
    expect(formatPayload('{"a": 1, "corte')).toBe('{"a": 1, "corte')
    expect(formatPayload('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(formatPayload('')).toBe('')
  })

  it('opções de App vêm dos dados e a busca ignora acento e caixa', () => {
    const logs = createMockLogs(new Date('2026-10-28T12:00:00Z'))
    const app = logFields(logs).find((f) => f.key === 'app')
    expect(app && 'options' in app ? app.options?.map((o) => o.value) : []).toEqual(['App Motoristas', 'Escala FDS', 'Sistema Betinhos'])
    expect(logs.filter((l) => matchesKeyword(l, 'FINALIZAR servico')).length).toBeGreaterThan(0)
  })

  it('ordena por severidade pelo peso, não pelo texto', () => {
    const logs = createMockLogs(new Date()).slice(0, 5)
    expect(sortLogs(logs, { key: 'severidade', dir: 'desc' })[0].severidade).toBe('critical')
  })
})

describe('prompt de correção', () => {
  const logs = createMockLogs(new Date('2026-10-28T12:00:00Z'))

  it('conta o mesmo erro (app + tipo + mensagem) no período', () => {
    const alvo = logs[0]
    const rec = recorrencia(alvo, logs)
    expect(rec.total).toBe(logs.filter((l) => l.app === alvo.app && l.erro === alvo.erro && l.mensagem === alvo.mensagem).length)
    expect(rec.ultima?.getTime()).toBe(alvo.data?.getTime())
  })

  it('leva repositório, dados, stack, payload e instruções', () => {
    const log = logs.find((l) => l.app === 'App Motoristas' && l.payload.startsWith('{"status":500'))!
    const texto = promptCorrecao(log, recorrencia(log, logs), 'Últimos 7 dias')
    expect(texto).toContain('repositório App Motoristas')
    expect(texto).toContain(log.mensagem)
    expect(texto).toContain(log.versao)
    expect(texto).toContain(log.id)
    expect(texto).toContain('### Stack')
    expect(texto).toContain('"status": 500')
    expect(texto).toContain('## O que fazer')
    expect(texto).toContain('Recorrência (últimos 7 dias)')
  })

  it('app desconhecido, campos vazios e stack enorme não quebram', () => {
    const base = logs[0]
    const log = { ...base, app: 'App Novo', erro: '', codigo: '', payload: '', stack: 'x'.repeat(9000) }
    const texto = promptCorrecao(log, recorrencia(log, []), 'Últimas 24 horas')
    expect(texto).toContain('identifique o repositório pelo nome do app (“App Novo”)')
    expect(texto).not.toContain('### Payload')
    expect(texto).not.toContain('**Código:**')
    expect(texto).toContain('[cortado: 1000 caracteres a mais]')
  })
})
