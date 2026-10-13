import { describe, expect, it, vi } from 'vitest'
import { salvarDocumento, type SalvarDeps } from './salvar'
import type { DocEmitido, Dono, TipoDoc } from '../domain/types'

const CNH: TipoDoc = { id: 'cnh', codigo: 'CNH', nome: 'CNH', categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [100000000], ordem: 1, ativo: true }
const ASO: TipoDoc = { ...CNH, id: 'aso', codigo: 'ASO', nome: 'ASO', validadePadraoMeses: 12 }
const ANA: Dono = { id: 'ana', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: '' }
const ANTERIOR: DocEmitido = { id: 'old', tipoId: 'cnh', donoId: 'ana', categoria: 'pessoas', numero: '1', emissao: null, validade: '2026-10-01', situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: 'vencido', modificadoEm: null }

function deps(over: Partial<SalvarDeps> = {}): SalvarDeps & { chamadas: string[] } {
  const chamadas: string[] = []
  return {
    chamadas,
    envLabel: 'DEV',
    criar: vi.fn(async () => { chamadas.push('criar'); return 'novo' }),
    enviar: vi.fn(async (_doc: unknown, _file: File, nome: string) => { chamadas.push(`enviar:${nome}`); return { id: nome, nome, caminho: '', tamanho: 1, modificadoEm: null, mimeType: null } }),
    substituir: vi.fn(async (id: string) => { chamadas.push(`substituir:${id}`) }),
    dualWrite: vi.fn(async (_id: string, payload: Record<string, string | null>) => { chamadas.push(`dual:${JSON.stringify(payload)}`) }),
    ...over,
  }
}
const file = (name: string) => new File(['x'], name, { type: 'application/pdf' })

describe('salvarDocumento', () => {
  it('renova CNH: cria, envia, substitui o anterior e atualiza a ficha', async () => {
    const d = deps()
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '2', emissao: '2026-10-10', validade: '2031-10-10', observacao: '', arquivos: [file('cnh.pdf')] })
    expect(d.chamadas).toEqual(['criar', 'enviar:CNH_2031-10-10_cnh.pdf', 'substituir:old', 'dual:{"cr40f_validadedacnh":"2031-10-10"}'])
    expect(d.criar).toHaveBeenCalledWith(expect.objectContaining({ nome: 'CNH · Ana', pasta: 'Funcionarios/DEV/ana/Documentos/CNH', tipoId: 'cnh', donoId: 'ana' }))
    expect(r.doc).toMatchObject({ id: 'novo', situacao: 'vigente', validade: '2031-10-10' })
    expect(r.falhas).toEqual([])
  })

  it('ASO grava a data do exame na ficha', async () => {
    const d = deps()
    await salvarDocumento(d, { tipo: ASO, dono: ANA, anterior: null, numero: '', emissao: '2026-10-10', validade: '2027-10-10', observacao: '', arquivos: [] })
    expect(d.chamadas).toEqual(['criar', 'dual:{"cr40f_datadoaso":"2026-10-10"}'])
  })

  it('falha de upload não desfaz o documento e é reportada', async () => {
    const d = deps({ enviar: vi.fn(async () => { throw new Error('SharePoint fora') }) })
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [file('a.pdf')] })
    expect(r.falhas).toEqual([{ nome: 'a.pdf', erro: 'SharePoint fora' }])
    expect(d.substituir).toHaveBeenCalledWith('old')
  })

  it('falha ao substituir vira aviso, não erro', async () => {
    const d = deps({ substituir: vi.fn(async () => { throw new Error('sem permissão') }) })
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [] })
    expect(r.avisos).toEqual(['O documento anterior não foi marcado como substituído: sem permissão'])
  })

  it('falha ao criar propaga e não toca em mais nada', async () => {
    const d = deps({ criar: vi.fn(async () => { throw new Error('HTTP 400') }) })
    await expect(salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [file('a.pdf')] })).rejects.toThrow('HTTP 400')
    expect(d.enviar).not.toHaveBeenCalled()
    expect(d.substituir).not.toHaveBeenCalled()
  })

  it('falha no dual-write vira aviso e o documento segue salvo', async () => {
    const d = deps({ dualWrite: vi.fn(async () => { throw new Error('sem acesso') }) })
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: null, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [] })
    expect(r.avisos).toEqual(['A ficha do funcionário não foi atualizada: sem acesso'])
    expect(r.doc.id).toBe('novo')
  })

  it('documento de frota não faz dual-write', async () => {
    const d = deps()
    const CRLV: TipoDoc = { ...CNH, id: 'crlv', codigo: 'CRLV', nome: 'CRLV', categoria: 'frota' }
    const CARRO: Dono = { id: 'v1', categoria: 'frota', nome: 'ABC1D23', detalhe: '', obrigKey: 100000002, ativo: true, email: '' }
    await salvarDocumento(d, { tipo: CRLV, dono: CARRO, anterior: null, numero: '', emissao: '2026-10-10', validade: '2027-10-10', observacao: '', arquivos: [] })
    expect(d.dualWrite).not.toHaveBeenCalled()
  })

  it('ASO sem data de emissão não faz dual-write (não apaga a ficha)', async () => {
    const d = deps()
    await salvarDocumento(d, { tipo: ASO, dono: ANA, anterior: null, numero: '', emissao: null, validade: '2027-10-10', observacao: '', arquivos: [] })
    expect(d.dualWrite).not.toHaveBeenCalled()
  })

  it('CNH sem validade não faz dual-write', async () => {
    const d = deps()
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: null, numero: '', emissao: null, validade: null, observacao: '', arquivos: [] })
    expect(d.dualWrite).not.toHaveBeenCalled()
    expect(r.avisos).toEqual([])
  })

  it('tipo sem validade grava validade nula mesmo que a tela envie uma data', async () => {
    const d = deps()
    const RG: TipoDoc = { ...CNH, id: 'rg', codigo: 'RG', nome: 'RG', temValidade: false }
    const r = await salvarDocumento(d, { tipo: RG, dono: ANA, anterior: null, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [] })
    expect(d.criar).toHaveBeenCalledWith(expect.objectContaining({ validade: null }))
    expect(r.doc.validade).toBeNull()
  })

  it('falha parcial entre dois arquivos: um enviado, um na lista de falhas', async () => {
    const enviar = vi.fn(async (_doc: unknown, f: File, nome: string) => {
      if (f.name === 'ruim.pdf') throw new Error('timeout')
      return { id: nome, nome, caminho: '', tamanho: 1, modificadoEm: null, mimeType: null }
    })
    const d = deps({ enviar })
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: null, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [file('bom.pdf'), file('ruim.pdf')] })
    expect(r.enviados).toHaveLength(1)
    expect(r.falhas).toEqual([{ nome: 'ruim.pdf', erro: 'timeout' }])
  })
})
