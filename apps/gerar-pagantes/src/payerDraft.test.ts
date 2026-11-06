import { describe, expect, it } from 'vitest'
import type { Payer, Person } from './domain'
import { changeCount, diffDrafts, draftReducer, initialState, toSubmitPayers, validate, type DraftState } from './payerDraft'

const person = (n: number, role: Person['role'] = 'Passageiro', email = `p${n}@x.com`): Person => ({ id: `00000000-0000-0000-0000-00000000000${n}`, name: `Pessoa ${n}`, email, phone: '', role })
const saved = (n: number, amountCents: number, extra: Partial<Payer> = {}): Payer => ({ ...person(n), existingPayerId: `r${n}`, amountCents, paymentMethod: 202410000, generateLink: true, sendEmail: true, linkStatus: 'Generated', emailStatus: 'Sent', paymentStatus: 'Pendente', ...extra })
const TOTAL = 10000
const run = (state: DraftState, ...actions: Parameters<typeof draftReducer>[1][]) => actions.reduce(draftReducer, state)
const empty: DraftState = { drafts: [], pendingEmails: {} }

describe('initialState', () => {
  it('sugere o solicitante único com o total da OP', () => {
    const state = initialState([], [person(1, 'Solicitante'), person(2)], TOTAL)
    expect(state.drafts.map((draft) => [draft.id, draft.amountCents])).toEqual([[person(1).id, TOTAL]])
  })

  it('não sugere quando há mais de um solicitante', () => {
    expect(initialState([], [person(1, 'Solicitante'), person(2, 'Solicitante')], TOTAL).drafts).toEqual([])
  })

  it('carrega pagantes gravados travados e marca pagos', () => {
    const state = initialState([saved(1, 6000), saved(2, 4000, { paymentStatus: 'Pago' })], [], TOTAL)
    expect(state.drafts.every((draft) => draft.amountLocked)).toBe(true)
    expect(state.drafts[1].settled).toBe(true)
  })
})

describe('rateio', () => {
  it('redistribui entre não travados ao adicionar', () => {
    const state = run(empty, { type: 'add', person: person(1), totalCents: TOTAL }, { type: 'add', person: person(2), totalCents: TOTAL })
    expect(state.drafts.map((draft) => draft.amountCents)).toEqual([5000, 5000])
  })

  it('mantém valor digitado e divide o saldo entre os demais', () => {
    let state = run(empty, { type: 'add', person: person(1), totalCents: TOTAL }, { type: 'add', person: person(2), totalCents: TOTAL })
    state = run(state, { type: 'setAmount', key: person(1).id, amountCents: 7000, totalCents: TOTAL }, { type: 'add', person: person(3), totalCents: TOTAL })
    expect(state.drafts.map((draft) => draft.amountCents)).toEqual([7000, 1500, 1500])
  })

  it('dividir igualmente ignora pagos e destrava os demais', () => {
    const state = run(initialState([saved(1, 4000, { paymentStatus: 'Pago' }), saved(2, 6000)], [], TOTAL), { type: 'add', person: person(3), totalCents: TOTAL }, { type: 'splitEvenly', totalCents: TOTAL })
    expect(state.drafts.map((draft) => draft.amountCents)).toEqual([4000, 3000, 3000])
  })

  it('não altera nem remove pagante pago', () => {
    const state = run(initialState([saved(1, TOTAL, { paymentStatus: 'Autorizado' })], [], TOTAL), { type: 'setAmount', key: 'r1', amountCents: 1, totalCents: TOTAL }, { type: 'remove', key: 'r1', totalCents: TOTAL })
    expect(state.drafts[0]).toMatchObject({ amountCents: TOTAL, removed: false })
  })
})

describe('remoção', () => {
  it('marca gravado como removido e permite desfazer', () => {
    let state = run(initialState([saved(1, 5000), saved(2, 5000)], [], TOTAL), { type: 'remove', key: 'r2', totalCents: TOTAL })
    expect(state.drafts[1].removed).toBe(true)
    expect(validate(state.drafts, TOTAL).differenceCents).toBe(5000)
    state = run(state, { type: 'undoRemove', key: 'r2', totalCents: TOTAL })
    expect(validate(state.drafts, TOTAL).differenceCents).toBe(0)
  })

  it('remove linha nova da lista', () => {
    const state = run(empty, { type: 'add', person: person(1), totalCents: TOTAL }, { type: 'remove', key: person(1).id, totalCents: TOTAL })
    expect(state.drafts).toEqual([])
  })
})

describe('validação', () => {
  it('exige e-mail válido do destinatário quando envia', () => {
    const state = run(empty, { type: 'add', person: person(1, 'Passageiro', ''), totalCents: TOTAL }, { type: 'setEmail', key: person(1).id, sendEmail: true })
    expect(validate(state.drafts, TOTAL).rowErrors.get(person(1).id)).toEqual(['Informe um e-mail válido para o envio.'])
    const fixed = run(state, { type: 'setPersonEmail', personId: person(1).id, email: 'novo@x.com' })
    expect(validate(fixed.drafts, TOTAL).blocking).toBe(false)
    expect(fixed.pendingEmails).toEqual({ [person(1).id]: 'novo@x.com' })
    expect(fixed.drafts[0].email).toBe('novo@x.com')
  })

  it('total divergente não bloqueia', () => {
    const state = run(empty, { type: 'add', person: person(1), totalCents: TOTAL }, { type: 'setAmount', key: person(1).id, amountCents: 9000, totalCents: TOTAL })
    expect(validate(state.drafts, TOTAL)).toMatchObject({ blocking: false, differenceCents: 1000 })
  })
})

describe('diff e envio', () => {
  it('conta troca de destinatário como alteração com reenvio', () => {
    const original = [saved(1, TOTAL)]
    const state = run(initialState(original, [], TOTAL), { type: 'setRecipient', key: 'r1', person: person(2) })
    const changes = diffDrafts(original, state.drafts)
    expect(changes.edited).toHaveLength(1)
    expect(state.drafts[0].resendEmail).toBe(true)
  })

  it('reenvio sem outra mudança conta como alteração', () => {
    const original = [saved(1, TOTAL)]
    const state = run(initialState(original, [], TOTAL), { type: 'toggleResend', key: 'r1' })
    expect(changeCount(diffDrafts(original, state.drafts))).toBe(1)
  })

  it('sem mudança não há alteração', () => {
    const original = [saved(1, TOTAL)]
    expect(changeCount(diffDrafts(original, initialState(original, [], TOTAL).drafts))).toBe(0)
  })

  it('payload omite removidos e leva resendEmail', () => {
    const original = [saved(1, 5000), saved(2, 5000)]
    const state = run(initialState(original, [], TOTAL), { type: 'remove', key: 'r2', totalCents: TOTAL }, { type: 'toggleResend', key: 'r1' })
    expect(toSubmitPayers(state.drafts)).toEqual([expect.objectContaining({ paganteId: person(1).id, existingPaganteId: 'r1', resendEmail: true })])
  })
})
