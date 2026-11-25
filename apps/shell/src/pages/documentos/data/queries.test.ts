import { describe, expect, it } from 'vitest'
import { docPayload, mapDoc, mapFuncionarioDono, mapTipo, mapVeiculoDono, tipoPayload } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const SETS = { tipo: 'cr40f_tipodocumentos', documento: 'cr40f_documentos', destinatario: 'cr40f_avisodestinatarios', funcionario: 'cr40f_funcionarioses', veiculo: 'cr40f_veiculoses' }

describe('queries de documentos', () => {
  it('mapeia tipo com multi-choice', () => {
    expect(mapTipo({ cr40f_tipodocumentoid: '{AA}', cr40f_codigo: 'ASO', cr40f_name: 'ASO', cr40f_categoria: 100000000, cr40f_temvalidade: true, cr40f_validadepadraomeses: 12, cr40f_obrigatoriopara: '100000001,100000000', cr40f_ordem: 2, statecode: 0 }))
      .toEqual({ id: 'aa', codigo: 'ASO', nome: 'ASO', categoria: 'pessoas', temValidade: true, validadePadraoMeses: 12, obrigatorioPara: [100000000, 100000001], ordem: 2, ativo: true })
  })

  it('mapeia documento de veículo', () => {
    expect(mapDoc({ cr40f_documentoid: 'D1', _cr40f_tipo_value: 'T1', _cr40f_funcionario_value: null, _cr40f_veiculo_value: 'V1', cr40f_numero: '123', cr40f_emissao: '2026-01-10', cr40f_validade: '2027-01-10', cr40f_situacao: 100000000, cr40f_pasta: 'Veiculos/v1/Documentos/CRLV', cr40f_observacao: null, cr40f_ultimomarcoavisado: 100000001, modifiedon: '2026-10-01T10:00:00Z' }))
      .toEqual({ id: 'd1', tipoId: 't1', donoId: 'v1', categoria: 'frota', numero: '123', emissao: '2026-01-10', validade: '2027-01-10', situacao: 'vigente', pasta: 'Veiculos/v1/Documentos/CRLV', observacao: '', ultimoMarco: '30', modificadoEm: '2026-10-01T10:00:00Z' })
  })

  it('mapeia donos', () => {
    expect(mapFuncionarioDono({ cr40f_funcionariosid: 'F1', new_apelido: 'Ana', cr40f_nomecompleto: 'Ana Souza', cr40f_funcao: 202410000, [`cr40f_funcao${F}`]: 'Motorista', cr40f_status: 2, cr40f_emailbetinhos: 'ana@x' }))
      .toEqual({ id: 'f1', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: 'ana@x' })
    expect(mapFuncionarioDono({ cr40f_funcionariosid: 'F2', new_apelido: '', cr40f_nomecompleto: 'Caio', cr40f_funcao: 202410001, cr40f_status: 1 }).ativo).toBe(false)
    expect(mapVeiculoDono({ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_marca: 'Toyota', cr40f_modelo: 'Corolla', new_categoriadoveiculo: 100000001, cr40f_statusdoveiculo: null }))
      .toEqual({ id: 'v1', categoria: 'frota', nome: 'ABC1D23', detalhe: 'Toyota Corolla', obrigKey: 100000003, ativo: true, email: '' })
    expect(mapVeiculoDono({ cr40f_veiculosid: 'V2', cr40f_placa: 'X', cr40f_statusdoveiculo: 202410000 }).ativo).toBe(false)
  })

  it('payload do documento com binds e sem campos vazios', () => {
    expect(docPayload({ nome: 'CRLV · ABC', tipoId: 't1', categoria: 'frota', donoId: 'v1', numero: '', emissao: null, validade: '2027-01-10', pasta: 'p', observacao: '' }, SETS)).toEqual({
      cr40f_name: 'CRLV · ABC', cr40f_numero: null, cr40f_emissao: null, cr40f_validade: '2027-01-10', cr40f_situacao: 100000000, cr40f_pasta: 'p', cr40f_observacao: null,
      'cr40f_Tipo@odata.bind': '/cr40f_tipodocumentos(t1)', 'cr40f_Veiculo@odata.bind': '/cr40f_veiculoses(v1)',
    })
  })

  it('payload do tipo', () => {
    expect(tipoPayload({ codigo: 'cnh ', nome: 'CNH', categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [100000001, 100000000], ordem: 1 }))
      .toEqual({ cr40f_codigo: 'CNH', cr40f_name: 'CNH', cr40f_categoria: 100000000, cr40f_temvalidade: true, cr40f_validadepadraomeses: null, cr40f_obrigatoriopara: '100000000,100000001', cr40f_ordem: 1 })
  })
})
