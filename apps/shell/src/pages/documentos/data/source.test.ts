import { describe, expect, it } from 'vitest'
import { createMockDocsSource } from './source'

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
})
