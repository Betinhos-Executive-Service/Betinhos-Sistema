// data/mock.ts
import { addMonths } from '../../funcionarios/data/dates'
import type { DocEmitido, DocsData, Dono, TipoDoc } from '../domain/types'

const dia = (hoje: string, delta: number) => {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
const t = (id: string, codigo: string, nome: string, categoria: TipoDoc['categoria'], temValidade: boolean, obrigatorioPara: number[], ordem: number, validadePadraoMeses: number | null = null): TipoDoc =>
  ({ id, codigo, nome, categoria, temValidade, validadePadraoMeses, obrigatorioPara, ordem, ativo: true })

export const MOCK_TIPOS: TipoDoc[] = [
  t('t-cnh', 'CNH', 'CNH', 'pessoas', true, [100000000], 1),
  t('t-aso', 'ASO', 'ASO', 'pessoas', true, [100000000, 100000001], 2, 12),
  t('t-ant', 'ANTECEDENTES', 'Antecedentes criminais', 'pessoas', true, [100000000], 3),
  t('t-cert', 'CERTIDAO', 'Certidões', 'pessoas', true, [], 4),
  t('t-rg', 'RG', 'RG', 'pessoas', false, [100000000, 100000001], 5),
  t('t-cpf', 'CPF', 'CPF', 'pessoas', false, [100000000, 100000001], 6),
  t('t-res', 'RESIDENCIA', 'Comprovante de residência', 'pessoas', false, [100000000, 100000001], 7),
  t('t-ctr', 'CONTRATO', 'Contrato', 'pessoas', false, [100000000, 100000001], 8),
  t('t-crlv', 'CRLV', 'CRLV / Licenciamento', 'frota', true, [100000002, 100000003, 100000004], 1),
  t('t-ipva', 'IPVA', 'IPVA', 'frota', true, [100000002], 2),
  t('t-seg', 'SEGURO', 'Seguro', 'frota', true, [100000002, 100000003, 100000004], 3),
]

const pessoa = (id: string, nome: string, motorista: boolean): Dono =>
  ({ id, categoria: 'pessoas', nome, detalhe: motorista ? 'Motorista' : 'Administrativo', obrigKey: motorista ? 100000000 : 100000001, ativo: true, email: `${id}@betinhos.com.br` })
const carro = (id: string, placa: string, detalhe: string, obrigKey: number): Dono =>
  ({ id, categoria: 'frota', nome: placa, detalhe, obrigKey, ativo: true, email: '' })

export function createMockData(hoje: string): DocsData {
  const donos = [
    // Mesmos ids e apelidos dos mocks de Funcionários (m1…) e Frota (v1…): a ficha aberta pela central encontra o cadastro no `pnpm dev`.
    pessoa('m1', 'Carlão', true), pessoa('m2', 'Bruna', true), pessoa('m4', 'Elaine', false), pessoa('m3', 'Diego', true),
    carro('v1', 'TST1A11', 'Toyota Corolla', 100000002), carro('v4', 'TST4D44', 'Kia Carnival', 100000003), carro('v2', 'TST2B22', 'VW Virtus', 100000004),
  ]
  let n = 0
  const d = (tipoId: string, donoId: string, validade: string | null, extra: Partial<DocEmitido> = {}): DocEmitido => ({
    id: `d-${++n}`, tipoId, donoId, categoria: donoId.startsWith('v') ? 'frota' : 'pessoas', numero: '', emissao: null, validade,
    situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: null, modificadoEm: null, ...extra,
  })
  const docs = [
    d('t-cnh', 'm1', dia(hoje, -5)),
    d('t-cnh', 'm1', dia(hoje, -370), { situacao: 'substituido' }),
    d('t-aso', 'm1', dia(hoje, 25), { emissao: addMonths(dia(hoje, 25), -12) }),
    d('t-rg', 'm1', null),
    d('t-cnh', 'm2', dia(hoje, 6)),
    d('t-aso', 'm2', dia(hoje, 200)),
    d('t-aso', 'm4', dia(hoje, 50)),
    d('t-cnh', 'm3', dia(hoje, 900)),
    d('t-crlv', 'v1', dia(hoje, 3)),
    d('t-ipva', 'v1', dia(hoje, -20), { observacao: 'Parcela 3 de 3' }),
    d('t-seg', 'v1', dia(hoje, 120), { observacao: 'Porto Seguro' }),
    d('t-crlv', 'v4', dia(hoje, 40)),
  ]
  const destinatarios = [{ id: 'a-1', categoria: 'pessoas' as const, funcionarioId: 'm4', nome: 'Elaine' }]
  return { tipos: MOCK_TIPOS.map((x) => ({ ...x, obrigatorioPara: [...x.obrigatorioPara] })), donos, docs, destinatarios }
}
