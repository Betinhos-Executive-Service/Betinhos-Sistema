import { describe, expect, it } from 'vitest'
import { codigoDoDoc, createMockDocsSource } from './source'

describe('createMockDocsSource', () => {
  it('renovar troca o vigente e mantém o histórico', async () => {
    const source = createMockDocsSource('2026-10-13')
    const antes = await source.carregar()
    const cnh = antes.tipos.find((t) => t.codigo === 'CNH')!
    const ana = antes.donos.find((d) => d.nome === 'Ana')!
    const anterior = antes.docs.find((d) => d.donoId === ana.id && d.tipoId === cnh.id && d.situacao === 'vigente')!
    const r = await source.salvarDocumento({ tipo: cnh, dono: ana, anterior, numero: '9', emissao: '2026-10-13', validade: '2031-10-13', observacao: '', arquivos: [new File(['x'], 'cnh.pdf')] })
    expect(r.enviados).toHaveLength(1)
    const depois = await source.carregar()
    const daAna = depois.docs.filter((d) => d.donoId === ana.id && d.tipoId === cnh.id)
    expect(daAna.filter((d) => d.situacao === 'vigente').map((d) => d.validade)).toEqual(['2031-10-13'])
    expect(daAna.filter((d) => d.situacao === 'substituido')).toHaveLength(2)
    expect(await source.arquivos(r.doc)).toHaveLength(1)
  })

  it('destinatários: adicionar e remover', async () => {
    const source = createMockDocsSource('2026-10-13')
    const novo = await source.adicionarDestinatario('frota', 'f-bruno', 'Bruno')
    expect((await source.carregar()).destinatarios.map((d) => d.nome)).toContain('Bruno')
    await source.removerDestinatario(novo)
    expect((await source.carregar()).destinatarios.map((d) => d.nome)).not.toContain('Bruno')
  })

  it('enviarArquivo nomeia como o salvarDocumento (código_validade_original, sanitizado)', async () => {
    const source = createMockDocsSource('2026-10-13')
    const data = await source.carregar()
    const cnh = data.tipos.find((t) => t.codigo === 'CNH')!
    const bruno = data.donos.find((d) => d.nome === 'Bruno')!
    const doc = data.docs.find((d) => d.donoId === bruno.id && d.tipoId === cnh.id)!
    const arq = await source.enviarArquivo(doc, new File(['x'], 'frente/verso.pdf'))
    expect(arq.nome).toBe(`CNH_${doc.validade}_frente_verso.pdf`)
    expect((await source.arquivos(doc)).map((a) => a.nome)).toEqual([arq.nome])
  })
})

describe('codigoDoDoc', () => {
  const tipos = [{ id: 't1', codigo: 'ASO' }]
  it('usa o último trecho da pasta quando existe', () => {
    expect(codigoDoDoc({ pasta: 'Funcionarios/DEV/ana/Documentos/CNH', tipoId: 't1' }, tipos)).toBe('CNH')
  })
  it('sem pasta, usa o código do tipo na lista carregada', () => {
    expect(codigoDoDoc({ pasta: '', tipoId: 't1' }, tipos)).toBe('ASO')
  })
  it('sem pasta e sem tipo conhecido, falha com mensagem clara', () => {
    expect(() => codigoDoDoc({ pasta: '', tipoId: 'x' }, tipos)).toThrow('Não foi possível identificar a pasta do documento')
    expect(() => codigoDoDoc({ pasta: '', tipoId: 't1' }, null)).toThrow('Não foi possível identificar a pasta do documento')
  })
})
