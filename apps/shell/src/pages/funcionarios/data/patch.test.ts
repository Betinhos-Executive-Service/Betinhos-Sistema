import { describe, expect, it } from 'vitest'
import { formatPhone, isValidCpf } from './format'
import { buildPatch, draftFrom, emptyDraft, validateDraft, type PatchContext } from './patch'
import type { Funcionario } from './types'

const context: PatchContext = { veiculoNav: 'cr40f_VeiculoAtual', veiculoSet: 'cr40f_veiculoses', dateBehaviors: { cr40f_validadedacnh: 'UserLocal', cr40f_datadoaso: 'TimeZoneIndependent' } }

const original: Funcionario = {
  id: 'f1',
  values: { cr40f_nomecompleto: 'Ana Souza', new_apelido: 'Ana', cr40f_status: 0, cr40f_funcao: 202410000, cr40f_telefonepessoal: '+55 12 99999-0000', cr40f_validadedacnh: '2027-01-10' },
  veiculo: { id: 'v1', label: 'ABC1D23' },
  fotoThumb: null, fotoUrl: null, assinaturaUrl: null, loginsesenhas: null, modifiedon: null,
}

describe('buildPatch', () => {
  it('envia só o que mudou', () => {
    const draft = draftFrom(original)
    draft.values.cr40f_telefonepessoal = '+55 12 98888-1111'
    draft.values.cr40f_nomecompleto = '  Ana Souza  '
    expect(buildPatch(original, draft, context)).toEqual({ cr40f_telefonepessoal: '+55 12 98888-1111' })
  })

  it('troca e limpa o lookup de veículo', () => {
    const draft = draftFrom(original)
    draft.veiculo = { id: 'v2', label: 'XYZ9K87' }
    expect(buildPatch(original, draft, context)).toEqual({ 'cr40f_VeiculoAtual@odata.bind': '/cr40f_veiculoses(v2)' })
    draft.veiculo = null
    expect(buildPatch(original, draft, context)).toEqual({ cr40f_VeiculoAtual: null })
  })

  it('grava data UserLocal como meia-noite de São Paulo e limpa texto vazio', () => {
    const draft = draftFrom(original)
    draft.values.cr40f_validadedacnh = '2027-02-01'
    draft.values.cr40f_telefonepessoal = ''
    expect(buildPatch(original, draft, context)).toEqual({ cr40f_validadedacnh: '2027-02-01T03:00:00Z', cr40f_telefonepessoal: null })
    draft.values.cr40f_datadoaso = '2026-09-15'
    expect(buildPatch(original, draft, context)).toMatchObject({ cr40f_datadoaso: '2026-09-15T00:00:00Z' })
  })

  it('na criação não envia lookup vazio', () => {
    const draft = emptyDraft()
    draft.values.cr40f_nomecompleto = 'Novo'
    draft.values.new_apelido = 'Novo'
    const payload = buildPatch(null, draft, context)
    expect(payload).toMatchObject({ cr40f_nomecompleto: 'Novo', cr40f_status: 0, new_notificacoesmotoristas: false })
    expect(payload).not.toHaveProperty('cr40f_VeiculoAtual')
  })
})

describe('validateDraft', () => {
  it('exige obrigatórios e valida formatos', () => {
    const draft = emptyDraft()
    draft.values.cr40f_numerodocpf = '111.111.111-11'
    draft.values.cr40f_emailbetinhos = 'sem-arroba'
    draft.values.cr40f_datadeadmissao = '2026-05-01'
    draft.values.cr40f_datadedemissao = '2026-04-01'
    expect(validateDraft(draft)).toEqual({
      cr40f_nomecompleto: 'Obrigatório',
      new_apelido: 'Obrigatório',
      cr40f_numerodocpf: 'CPF inválido',
      cr40f_emailbetinhos: 'E-mail inválido',
      cr40f_datadedemissao: 'Anterior à admissão',
    })
  })

  it('formata telefone e CPF', () => {
    expect(formatPhone('1290000x00')).toBe('+55 12 90000x00')
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })
})
