import { describe, expect, it } from 'vitest'
import { createMockPagantes, MOCK_CHOICES, MOCK_CONTATOS } from '../data/mock'
import { BUILTIN_VIEWS, EMPTY_FILTERS, VIEWS_KEY, filterPagantes, hasFilters, loadViews, matchView, newView, periodoStart, saveViews, total, viewFilters, type KV } from './filters'
import { linkToShare, whatsappText, whatsappUrl } from './messages'
import { ETAPA, RECIBO, STATUS, canCancel, canMarkPaid, applyPatch, statusPatch, statusTone } from './status'
import { buildTimeline } from './timeline'
import type { Pagante } from './types'

const now = new Date('2026-10-07T12:00:00-03:00')
const list = createMockPagantes(now)
const byCode = (code: string) => list.find((p) => p.codigo === code)!

function memory(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

describe('status', () => {
  it('trava Pago e Autorizado e não reabre Cancelado', () => {
    for (const status of [STATUS.pago, STATUS.autorizado, STATUS.cancelado]) {
      expect(canMarkPaid({ status })).toBe(false)
      expect(canCancel({ status })).toBe(false)
    }
    expect(canMarkPaid({ status: STATUS.negado })).toBe(true)
  })

  it('marca pago pedindo recibo só quando ainda não foi enviado', () => {
    expect(statusPatch('pago', { recibo: null }, true)).toEqual({ cr40f_status: STATUS.pago, cr40f_statusdorecibo: RECIBO.pendente })
    expect(statusPatch('pago', { recibo: RECIBO.enviado }, true)).toEqual({ cr40f_status: STATUS.pago })
    expect(statusPatch('pago', { recibo: null }, false)).toEqual({ cr40f_status: STATUS.pago })
    expect(statusPatch('cancelado', { recibo: null }, true)).toEqual({ cr40f_status: STATUS.cancelado })
    expect(applyPatch({ cr40f_status: STATUS.pago, cr40f_statusdorecibo: RECIBO.pendente })).toMatchObject({ status: STATUS.pago, recibo: RECIBO.pendente })
  })

  it('dá tom por status', () => {
    expect(statusTone(STATUS.pago)).toBe('success')
    expect(statusTone(STATUS.expirado)).toBe('danger')
    expect(statusTone(STATUS.pendente)).toBe('warning')
    expect(statusTone(STATUS.cancelado)).toBe('neutral')
  })
})

describe('filtros', () => {
  it('busca sem acento por nome, PAG, OP, telefone e cliente', () => {
    const q = (query: string) => filterPagantes(list, { ...EMPTY_FILTERS, query }, MOCK_CONTATOS).map((p) => p.codigo)
    expect(q('mariana')).toContain('PAG-1201')
    expect(q('pag-1203')).toEqual(['PAG-1203'])
    expect(q('op-402')).toEqual(['PAG-1203'])
    expect(q('98765')).toContain('PAG-1202')
    expect(q('lumen')).toContain('PAG-1205')
  })

  it('combina status, recibo e falhas', () => {
    const pagosSemRecibo = filterPagantes(list, viewFilters(BUILTIN_VIEWS.find((v) => v.id === 'pagos-sem-recibo')!), MOCK_CONTATOS)
    expect(pagosSemRecibo.map((p) => p.codigo).sort()).toEqual(['PAG-1205', 'PAG-1206'])
    const falhas = filterPagantes(list, { ...EMPTY_FILTERS, falhas: true }, MOCK_CONTATOS)
    expect(falhas.map((p) => p.codigo).sort()).toEqual(['PAG-1204', 'PAG-1210'])
  })

  it('período conta dias para trás desde a meia-noite; "tudo" não limita', () => {
    expect(periodoStart('all', now)).toBeNull()
    const start = periodoStart('30', now)!
    expect(Math.floor((now.getTime() - start.getTime()) / 86_400_000)).toBe(30)
    expect(start.getHours()).toBe(0)
  })

  it('soma os valores e reconhece filtros ativos', () => {
    expect(total([byCode('PAG-1201'), byCode('PAG-1202')])).toBe(2500)
    expect(hasFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasFilters({ ...EMPTY_FILTERS, periodo: 'all' })).toBe(true)
  })
})

describe('visões salvas', () => {
  it('salva, recarrega e reconhece a visão pelos filtros (ignorando a busca)', () => {
    const kv = memory()
    const view = newView('  Pix pendentes ', { ...EMPTY_FILTERS, query: 'x', forma: 202410002, status: [STATUS.pendente] }, 1)
    saveViews(kv, { views: [view], last: view.id })
    const loaded = loadViews(kv)
    expect(loaded.last).toBe(view.id)
    expect(loaded.views[0]).toMatchObject({ nome: 'Pix pendentes', builtin: false })
    expect(matchView([...BUILTIN_VIEWS, ...loaded.views], { ...EMPTY_FILTERS, query: 'outra', forma: 202410002, status: [STATUS.pendente] })?.id).toBe(view.id)
    expect(matchView(BUILTIN_VIEWS, EMPTY_FILTERS)?.id).toBe('todos')
  })

  it('ignora conteúdo corrompido e armazenamento que falha', () => {
    const kv = memory()
    kv.setItem(VIEWS_KEY, '{nada')
    expect(loadViews(kv)).toEqual({ views: [], last: null })
    const broken: KV = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') }, removeItem: () => undefined }
    expect(loadViews(broken)).toEqual({ views: [], last: null })
    expect(() => saveViews(broken, { views: [], last: null })).not.toThrow()
  })
})

describe('mensagens', () => {
  const contato = MOCK_CONTATOS.get('p1')!
  it('cobra com link antes de pagar e manda recibo depois', () => {
    expect(linkToShare(byCode('PAG-1201'))?.kind).toBe('pagamento')
    expect(linkToShare(byCode('PAG-1202'))?.kind).toBe('recibo')
    expect(linkToShare(byCode('PAG-1205'))).toBeNull()
    expect(whatsappText(byCode('PAG-1201'), contato)).toMatch(/^Olá, Mariana!.*\n\n.*PAG-1201, R\$\s?1\.250,00.*\nhttps:\/\/cielolink/s)
  })

  it('só monta o WhatsApp com celular válido', () => {
    expect(whatsappUrl(byCode('PAG-1201'), contato)).toMatch(/^https:\/\/wa\.me\/5511998124410\?text=/)
    expect(whatsappUrl(byCode('PAG-1203'), MOCK_CONTATOS.get('p3'))).toBeNull()
    expect(whatsappUrl(byCode('PAG-1201'))).toBeNull()
  })
})

describe('linha do tempo', () => {
  it('põe eventos datados primeiro, do mais recente, e mostra as falhas', () => {
    const p: Pagante = { ...byCode('PAG-1204'), ultimoLembrete: new Date('2026-10-06T09:00:00-03:00') }
    const events = buildTimeline(p, MOCK_CHOICES)
    expect(events[0].key).toBe('lembrete')
    expect(events.map((e) => e.title)).toEqual(expect.arrayContaining(['Falha ao gerar o link de pagamento', 'Falha ao enviar o e-mail de cobrança']))
    expect(events.find((e) => e.key === 'link')?.detail).toMatch(/Cielo/)
    expect(buildTimeline({ ...p, link: { status: ETAPA.concluido, erro: '' } }, MOCK_CHOICES).some((e) => e.title === 'Link de pagamento gerado')).toBe(true)
  })
})
