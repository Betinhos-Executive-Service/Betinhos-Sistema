// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { base32, cifrar, decifrar, deBase32, totp, verificarTotp } from './cripto'
import { mapearServico } from './mapear'
import { listarServicos, servicosPorIds, tacitaVencida } from './odata'
import { feriados, prazoTacito, venceu } from './prazo'

const CHAVE = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
// RFC 6238, apêndice B: segredo ASCII "12345678901234567890", SHA-1, 8 dígitos → os 6 finais.
const RFC = base32(new TextEncoder().encode('12345678901234567890'))
const TENARIS = '11111111-1111-1111-1111-111111111111'

describe('TOTP', () => {
  it('bate com os vetores da RFC 6238', async () => {
    expect(await totp(RFC, Math.floor(59 / 30))).toBe('287082')
    expect(await totp(RFC, Math.floor(1111111109 / 30))).toBe('081804')
  })
  it('aceita ±1 passo e recusa 2 passos ou formato errado', async () => {
    const t = 1111111109_000
    const atual = await totp(RFC, Math.floor(t / 30000))
    expect(await verificarTotp(RFC, atual, t + 30_000)).toBe(true)
    expect(await verificarTotp(RFC, atual, t - 30_000)).toBe(true)
    expect(await verificarTotp(RFC, atual, t + 61_000)).toBe(false)
    expect(await verificarTotp(RFC, '12a456', t)).toBe(false)
  })
  it('base32 ida e volta', () => {
    const b = new Uint8Array([0, 1, 2, 250, 255, 9, 8])
    expect([...deBase32(base32(b))]).toEqual([...b])
  })
})

describe('AES-GCM', () => {
  it('decifra no mesmo contexto e falha em outro, com outra chave ou adulterado', async () => {
    const c = await cifrar('segredo', CHAVE, 'totp:a')
    expect(await decifrar(c, CHAVE, 'totp:a')).toBe('segredo')
    expect(await decifrar(c, CHAVE, 'totp:b')).toBeNull()
    expect(await decifrar(c, btoa(String.fromCharCode(...new Uint8Array(32))), 'totp:a')).toBeNull()
    expect(await decifrar(c.slice(0, -2) + 'AA', CHAVE, 'totp:a')).toBeNull()
  })
})

describe('prazo tácito', () => {
  it('liberado na sexta com feriado na segunda pula o feriado (mesma conta de src/domain/regras.ts)', () => {
    // 30/10/2026 sexta; 02/11 segunda é Finados → dias úteis 03, 04, 05, 06 e 09/11.
    expect(prazoTacito(Date.parse('2026-10-30T15:00:00-03:00'))).toBe('2026-11-09')
  })
  it('usa o dia de São Paulo (23h de quarta em SP é quinta em UTC)', () => {
    expect(prazoTacito(Date.parse('2026-10-28T23:30:00-03:00'))).toBe('2026-11-05')
  })
  it('inclui a Sexta-feira Santa calculada', () => {
    expect(feriados(2027).has('2027-03-26')).toBe(true)
    expect(feriados(2026).has('2026-04-03')).toBe(true)
  })
  it('vence só depois do último dia', () => {
    expect(venceu('2026-11-06', Date.parse('2026-11-06T20:00:00-03:00'))).toBe(false)
    expect(venceu('2026-11-06', Date.parse('2026-11-07T08:00:00-03:00'))).toBe(true)
  })
})

describe('filtros OData', () => {
  it('lista e id direto sempre filtram pelo cliente e excluem Retirado', () => {
    for (const q of [listarServicos(TENARIS), servicosPorIds(['22222222-2222-2222-2222-222222222222'], TENARIS)]) {
      const f = decodeURIComponent(q)
      expect(f).toContain(`_cr40f_cliente_value eq ${TENARIS}`)
      expect(f).not.toContain('100000005')
    }
  })
  it('recusa id que não é GUID (sem injeção no $filter)', () => {
    expect(() => servicosPorIds(["x' or 1 eq 1"], TENARIS)).toThrow()
    expect(() => listarServicos('qualquer')).toThrow()
  })
  it('tácita pega Liberado/Respondido com prazo antes de hoje', () => {
    expect(decodeURIComponent(tacitaVencida('2026-11-07'))).toContain('cr40f_prazotacita lt 2026-11-07')
  })
})

describe('mapearServico', () => {
  const FV = '@OData.Community.Display.V1.FormattedValue'
  const registro = {
    cr40f_validacaoservicoid: 'v1', cr40f_status: 100000002, cr40f_liberadoem: '2026-10-28T12:00:00Z', cr40f_prazotacita: '2026-11-04',
    cr40f_valoranterior: 900, cr40f_observacao: 'Espera de 1 h',
    cr40f_Reserva: {
      cr40f_id: '10801', cr40f_idtenaris: 'PO-1', cr40f_cr: 'CR9', cr40f_dataehorriodesada: '2026-10-27T10:00:00Z',
      cr40f_endereodesada: 'GRU', cr40f_destino: 'Centro', new_linkdovoucher: 'https://x/v.pdf',
      [`_cr40f_passageiro1_value${FV}`]: 'Ana', _cr40f_passageiro1_value: 'p1', [`_cr40f_passageiro2_value${FV}`]: 'Bruno',
      [`_cr40f_solicitante_value${FV}`]: 'Carla',
      new_composicaodepreco: { new_valortotal: 1000, cr40f_valorhoramotorista: 800, new_valorpedagios: 200, new_ajuste: 0 },
    },
  }
  it('monta o Servico com composição sem linhas zeradas e só o nome dos passageiros', () => {
    const s = mapearServico(registro)!
    expect(s).toMatchObject({ id: 'v1', numero: '10801', status: 'respondido', valorTotal: 1000, valorAnterior: 900, passageiros: ['Ana', 'Bruno'], solicitante: 'Carla', voucherUrl: 'https://x/v.pdf' })
    expect(s.composicao).toEqual([{ rotulo: 'Hora motorista', valor: 800 }, { rotulo: 'Pedágios', valor: 200 }])
    expect(JSON.stringify(s)).not.toContain('p1')
  })
  it('Retirado não sai do Worker', () => {
    expect(mapearServico({ ...registro, cr40f_status: 100000005 })).toBeNull()
  })
})
