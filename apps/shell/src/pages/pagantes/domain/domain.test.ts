import { describe, expect, it } from 'vitest'
import { createMockPagantes, MOCK_CHOICES, MOCK_CONTATOS } from '../data/mock'
import { BUILTIN_VIEWS, EMPTY_FILTERS, VIEWS_KEY, filterPagantes, hasFilters, loadViews, matchView, newView, parseStoredFilters, periodoStart, saveViews, total, viewFilters, type Filters, type KV } from './filters'
import { linkToShare, safeUrl, whatsappText, whatsappUrl } from './messages'
import { FALLBACK_CHOICES, withFallback } from './choices'
import { reciboBloqueado } from '../components/Dialogs'
import { reconcile } from '../usePagantes'
import { ETAPA, GERACAO_RECIBO, RECIBO, STATUS, canCancel, canGerarRecibo, canMarkPaid, applyPatch, statusPatch, statusTone } from './status'
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
    expect(falhas.map((p) => p.codigo).sort()).toEqual(['PAG-1204', 'PAG-1205', 'PAG-1210'])
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
    expect(loaded.views[0]).toMatchObject({ nome: 'Pix pendentes' })
    expect(loaded.views[0].builtin).toBeFalsy()
    const atual: Filters = { ...EMPTY_FILTERS, query: 'outra', forma: 202410002, status: [STATUS.pendente] }
    expect(matchView([...BUILTIN_VIEWS, ...loaded.views], atual)?.id).toBe(view.id)
    expect(matchView(BUILTIN_VIEWS, EMPTY_FILTERS)?.id).toBe('todos')
  })

  it('a visão escolhida vence outra com os mesmos filtros', () => {
    const minha = newView('Meus pendentes', viewFilters(BUILTIN_VIEWS.find((v) => v.id === 'a-receber')!), 2)
    const todas = [...BUILTIN_VIEWS, minha]
    expect(matchView(todas, minha.filters)?.id).toBe('a-receber')
    expect(matchView(todas, minha.filters, minha.id)?.id).toBe(minha.id)
    expect(matchView(todas, EMPTY_FILTERS, minha.id)?.id).toBe('todos')
  })

  it('descarta visões com campos adulterados em vez de quebrar a tela', () => {
    const kv = memory()
    const ok = { id: 'v-ok', nome: 'Boa', filters: { periodo: '30', status: [STATUS.pago], forma: null, recibo: null, falhas: false } }
    kv.setItem(VIEWS_KEY, JSON.stringify({
      views: [
        ok,
        { id: 'v1', nome: 'status nulo vira vazio', filters: { status: null } },
        { id: 'v2', nome: 'status texto', filters: { status: 'pago' } },
        { id: 'v3', nome: 'período inválido', filters: { periodo: '999' } },
        { id: 'v4', nome: 'recibo inválido', filters: { recibo: 'x' } },
        { id: 'todos', nome: 'imita pronta', filters: {} },
        { id: 'v-ok', nome: 'duplicada', filters: {} },
        { id: 'v5', nome: '   ', filters: {} },
        null, 42,
      ],
      last: 7,
    }))
    const loaded = loadViews(kv)
    expect(loaded.views.map((v) => v.id)).toEqual(['v-ok', 'v1'])
    expect(loaded.views[1].filters.status).toEqual([])
    expect(loaded.last).toBeNull()
    expect(parseStoredFilters({})).toEqual({ periodo: '90', status: [], forma: null, recibo: null, falhas: false })
    expect(parseStoredFilters(null)).toBeNull()
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

describe('links e recibo', () => {
  it('só aceita http(s) como link', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,oi')).toBeNull()
    expect(safeUrl('não é url')).toBeNull()
    expect(safeUrl(' https://cielolink.com.br/x ')).toBe('https://cielolink.com.br/x')
    expect(linkToShare({ ...byCode('PAG-1201'), linkPagamento: 'javascript:alert(1)' })).toBeNull()
  })

  it('pendente sem link de pagamento compartilha o recibo já emitido; cancelado não compartilha nada', () => {
    const p = byCode('PAG-1212')
    expect(linkToShare(p)).toEqual({ kind: 'recibo', url: 'https://onedrive.exemplo/recibo-12.pdf' })
    expect(whatsappText(p)).toMatch(/Segue o recibo do seu serviço/)
    expect(linkToShare({ ...byCode('PAG-1201'), status: STATUS.cancelado })).toBeNull()
  })

  it('bloqueia o recibo automático sem pessoa ou sem cliente', () => {
    expect(reciboBloqueado(byCode('PAG-1212'))).toMatch(/não tem pessoa/)
    expect(reciboBloqueado(byCode('PAG-1201'), { nome: 'Ana', telefone: '', email: '', cliente: '' })).toMatch(/cliente/)
    expect(reciboBloqueado(byCode('PAG-1201'), MOCK_CONTATOS.get('p1'))).toBeNull()
    expect(canGerarRecibo({ status: STATUS.cancelado })).toBe(false)
    expect(canGerarRecibo({ status: STATUS.pendente })).toBe(true)
  })

  it('usa rótulos conhecidos quando a metadata falha', () => {
    expect(withFallback({ status: [], forma: undefined, recibo: [{ value: 1, label: 'X' }] })).toMatchObject({ status: FALLBACK_CHOICES.status, forma: FALLBACK_CHOICES.forma, recibo: [{ value: 1, label: 'X' }] })
  })
})

describe('reconciliação', () => {
  const at = new Date('2026-10-07T12:00:00Z').getTime()
  const base = { ...byCode('PAG-1201'), alteradoEm: new Date(at - 60_000) }
  it('recarga lida antes da gravação não desfaz o status; a lida depois vence', () => {
    const confirmed = new Map([[base.id, { at, patch: { status: STATUS.pago } as Partial<Pagante> }]])
    expect(reconcile([base], confirmed, at + 1000)[0].status).toBe(STATUS.pago)
    expect(confirmed.size).toBe(1)
    const newer = { ...base, status: STATUS.cancelado as number, alteradoEm: new Date(at + 2000) }
    expect(reconcile([newer], confirmed, at + 3000)[0].status).toBe(STATUS.cancelado)
    expect(confirmed.size).toBe(0)
  })
  it('entrada vence depois de 2 minutos', () => {
    const confirmed = new Map([[base.id, { at, patch: { status: STATUS.pago } as Partial<Pagante> }]])
    expect(reconcile([base], confirmed, at + 121_000)[0].status).toBe(STATUS.pendente)
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
    const recibo = buildTimeline({ ...p, reciboGeracao: { status: GERACAO_RECIBO.erro, erro: 'PDF falhou' }, pagoEm: new Date('2026-10-06T10:00:00-03:00') }, MOCK_CHOICES)
    expect(recibo.find((e) => e.key === 'recibo-erro')?.detail).toBe('PDF falhou')
    expect(recibo.some((e) => e.key === 'pago')).toBe(true)
  })
})
