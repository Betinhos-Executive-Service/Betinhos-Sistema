// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cifrar, conferirSenha, decifrar, hashSenha } from './cripto'
import { mapearModulos, mapearPedido, mapearServico } from './mapear'
import { NAV } from './schema'
import { nomeDoEmail, normalizarPedido, validarPedido } from '../src/domain/pedidos'
import { listarServicos, servicosPorIds, tacitaVencida } from './odata'
import { feriados, prazoTacito, venceu } from './prazo'

const CHAVE = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
const TENARIS = '11111111-1111-1111-1111-111111111111'

describe('senha (PBKDF2)', () => {
  it('confere a certa, recusa a errada e usa sal novo a cada hash', async () => {
    const h = await hashSenha('senha-boa-123')
    expect(h).toMatch(/^pbkdf2\$100000\$[\w-]{22}\$[\w-]{43}$/)
    expect(await conferirSenha('senha-boa-123', h)).toBe(true)
    expect(await conferirSenha('senha-boa-124', h)).toBe(false)
    expect(await hashSenha('senha-boa-123')).not.toBe(h)
  })
  it('recusa formato estranho e iterações acima do limite do Workers', async () => {
    const [, , sal, hash] = (await hashSenha('x')).split('$')
    expect(await conferirSenha('x', '')).toBe(false)
    expect(await conferirSenha('x', `sha1$100000$${sal}$${hash}`)).toBe(false)
    expect(await conferirSenha('x', `pbkdf2$100001$${sal}$${hash}`)).toBe(false)
    expect(await conferirSenha('x', `pbkdf2$abc$${sal}$${hash}`)).toBe(false)
  })
})

describe('AES-GCM', () => {
  it('decifra no mesmo contexto e falha em outro, com outra chave ou adulterado', async () => {
    const c = await cifrar('segredo', CHAVE, 'sessao')
    expect(await decifrar(c, CHAVE, 'sessao')).toBe('segredo')
    expect(await decifrar(c, CHAVE, 'etapa')).toBeNull()
    expect(await decifrar(c, btoa(String.fromCharCode(...new Uint8Array(32))), 'sessao')).toBeNull()
    expect(await decifrar(c.slice(0, -2) + 'AA', CHAVE, 'sessao')).toBeNull()
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
  it('usa os nomes reais do Dataverse (metadata DEV/PROD 23/11/2026)', () => {
    const f = decodeURIComponent(listarServicos(TENARIS))
    expect(f).toContain('$expand=new_ComposicaodePreco(')
    expect(f).toContain('cr40f_tipodeveiculo')
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
      [NAV.passageiros]: [
        { _cr40f_bancodedados_value: 'p1', [`_cr40f_bancodedados_value${FV}`]: 'Ana', cr40f_ordemdeselecao: 1 },
        { _cr40f_bancodedados_value: 'p2', [`_cr40f_bancodedados_value${FV}`]: 'Bruno', cr40f_ordemdeselecao: 2 },
      ],
      [`_cr40f_solicitante_value${FV}`]: 'Carla',
      [NAV.composicao]: { new_valortotal: 1000, cr40f_valorhoramotorista: 800, new_valorpedagios: 200, new_ajuste: 0 },
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

describe('pedidos', () => {
  const T0 = Date.parse('2026-11-01T12:00:00Z')
  const ana = { nome: ' Ana ', telefone: '(12) 99999-0001' }
  const bia = { nome: 'Bia', email: 'bia@exemplo.com' }
  const base = normalizarPedido({ passageiros: [ana, { nome: '' }, bia], origem: ' Pinda ', destino: 'GRU', saida: '2026-11-03T10:00:00Z', observacao: ' ', tipoVeiculo: 202410001 })
  it('normaliza e valida campo a campo', () => {
    expect(base).toEqual({ passageiros: [{ nome: 'Ana', telefone: '(12) 99999-0001' }, bia], origem: 'Pinda', destino: 'GRU', saida: '2026-11-03T10:00:00Z', tipoVeiculo: 202410001 })
    expect(validarPedido(base, T0)).toEqual({})
    expect(validarPedido({ ...base, passageiros: [], origem: '', destino: '' }, T0)).toEqual({
      passageiros: 'Informe pelo menos um passageiro.', origem: 'Informe o endereço de saída.', destino: 'Informe o destino.',
    })
    expect(validarPedido({ ...base, saida: '2026-11-01T11:59:00Z' }, T0).saida).toMatch(/daqui para a frente/)
    expect(validarPedido({ ...base, saida: 'ontem' }, T0).saida).toMatch(/data e a hora/)
    expect(validarPedido({ ...base, saida: '2028-01-01T10:00:00Z' }, T0).saida).toMatch(/um ano/)
    expect(validarPedido({ ...base, passageiros: [{ nome: 'x'.repeat(101), email: 'a@b.co' }], origem: 'y'.repeat(301) }, T0)).toMatchObject({ passageiros: /100 caracteres/, origem: /300 caracteres/ })
  })
  it('nome a partir do e-mail e módulos da choice múltipla', () => {
    expect(nomeDoEmail('paula.ribeiro@latasa.com.br')).toBe('Paula Ribeiro')
    expect(nomeDoEmail('compras@latasa.com.br')).toBe('Compras')
    expect(mapearModulos('100000001,100000002')).toEqual(['pedir', 'meus_servicos'])
    expect(mapearModulos(null)).toEqual([])
    expect(mapearModulos('100000000,999')).toEqual(['validar'])
  })
  it('mapeia a reserva pela coluna do portal (JSON); voucher só depois de programado', () => {
    const r = {
      cr40f_reservadeveculosid: 'id1', cr40f_id: 'RV-1', cr40f_status: 202410004, cr40f_dataehorriodesada: '2026-11-03T10:00:00Z', cr40f_endereodesada: 'A', cr40f_destino: 'B',
      cr40f_portalpedido: '{"passageiros":["Ana","Bia"],"observacao":"Voo LA1"}', new_linkdovoucher: 'https://v/1.pdf', createdon: '2026-11-01T12:00:00Z', _cr40f_portalusuario_value: 'U1',
    }
    expect(mapearPedido(r, 'u1')).toEqual({ id: 'id1', numero: 'RV-1', status: 'solicitado', saida: '2026-11-03T10:00:00Z', origem: 'A', destino: 'B', passageiros: ['Ana', 'Bia'], pessoas: [{ nome: 'Ana' }, { nome: 'Bia' }], criadoEm: '2026-11-01T12:00:00Z', observacao: 'Voo LA1' })
    // Quem não pediu (só é passageiro) recebe o pedido marcado como só leitura.
    expect(mapearPedido(r, 'u2').comoPassageiro).toBe(true)
    expect(mapearPedido({ ...r, cr40f_status: 202410005 }, 'u1')).toMatchObject({ status: 'programado', voucherUrl: 'https://v/1.pdf' })
    expect(mapearPedido({ ...r, cr40f_status: 202410010 }, 'u1').status).toBe('cancelado')
    // Coluna editada à mão: não quebra, só fica sem passageiros.
    expect(mapearPedido({ ...r, cr40f_portalpedido: 'x' }, 'u1').passageiros).toEqual([])
  })
  it('passageiros e contato vêm de Serviços por Passageiro, em ordem; o tipo de veículo pedido sai como número', () => {
    const vinculo = (id: string, ordem: number, nome: string, extra = {}) => ({ _cr40f_bancodedados_value: id, cr40f_ordemdeselecao: ordem, [NAV.vinculoPessoa]: { cr40f_nomedopassageiro: nome, ...extra } })
    const r = {
      cr40f_reservadeveculosid: 'id1', cr40f_id: 'RV-1', cr40f_status: 202410004, cr40f_dataehorriodesada: '2026-11-03T10:00:00Z', cr40f_endereodesada: 'A', cr40f_destino: 'B', createdon: '2026-11-01T12:00:00Z',
      cr40f_portalpedido: '{"passageiros":["Antigo"]}', cr40f_tipodeveiculo: 202410003,
      [NAV.passageiros]: [vinculo('p2', 2, 'Bia', { cr40f_email: 'bia@exemplo.com' }), vinculo('p1', 1, 'Ana', { cr40f_telefone: '12999990001' })],
    }
    expect(mapearPedido(r, 'u1')).toMatchObject({ passageiros: ['Ana', 'Bia'], tipoVeiculo: 202410003, pessoas: [{ id: 'p1', nome: 'Ana', telefone: '12999990001' }, { id: 'p2', nome: 'Bia', email: 'bia@exemplo.com' }] })
  })
})
