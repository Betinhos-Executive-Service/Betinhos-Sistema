import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { gerarComprovantePdf, paraWinAnsi } from './comprovantePdf'
import type { DadosComprovante } from '../domain/comprovante'

const dados: DadosComprovante = {
  arquivo: 'comprovante-x-y.pdf', titulo: 'Embarque no GRU', funcionario: 'Márcio Lima', publicadoEm: '01/11/2026 10:00', concluidoEm: '02/11/2026 10:00',
  abertoEm: '02/11/2026 09:00', confirmadoEm: '02/11/2026 09:30', assinadoEm: '02/11/2026 09:40', nota: '85% · aprovado · 2 tentativas',
  versao: 'lida', aviso: '', descricao: 'Ponto de encontro', conteudo: '# Porta 4\n- Chegue 30 min antes 🚗\n\n' + 'Texto longo. '.repeat(600),
  videoUrl: 'https://youtu.be/x', anexos: ['mapa.pdf'], hash: 'ab'.repeat(32), assinatura: [[[0.1, 0.5], [0.5, 0.2], [0.9, 0.6]]], nomeAssinante: 'Márcio Lima',
}

describe('comprovante PDF', () => {
  it('gera PDF válido, com mais de uma página quando o texto é longo', async () => {
    const bytes = await gerarComprovantePdf(dados)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    expect(doc.getTitle()).toBe('Comprovante · Embarque no GRU · Márcio Lima')
  })
  it('remove o que a Helvetica não codifica e mantém os acentos', () => {
    expect(paraWinAnsi('Ação 🚗 · “ok”')).toBe('Ação  · “ok”')
  })
})
