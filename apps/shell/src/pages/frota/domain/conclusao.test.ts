// apps/shell/src/pages/frota/domain/conclusao.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ANEXO_DESPESA, MANUT, PAGAMENTO } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { agoraLocalSP, concluirPeloShell, validarConclusao, valoresConclusaoIniciais, type ValoresConclusao } from './conclusao'

const detalhe = (extra: Partial<DetalheManutencao> = {}): DetalheManutencao => ({ id: 'm1', codigo: 'MAN-1', descricao: 'Freio', status: MANUT.AGENDADO, grau: 3, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 85000, veiculo: { id: 'v1', label: 'ABC1D23' }, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [], linkNotaFiscal: null, fotosFinais: [], ...extra })
const nota = new File(['nf'], 'nf.jpg', { type: 'image/jpeg' })
const validos = (extra: Partial<ValoresConclusao> = {}): ValoresConclusao => ({ servicos: [100000007, 100000007], km: '85200', data: '2026-11-17T10:00', valor: '350,5', pagamento: String(PAGAMENTO.DINHEIRO), estabelecimento: ' Oficina Teste ', cidadeId: 'c1', realizadoPorId: 'f1', servicoRealizado: '', comentario: ' ok ', notas: [nota], fotos: [], ...extra })
const ctx = { manutencaoId: 'm1', kmPedido: 85000, temNotaGravada: false }

describe('validarConclusao', () => {
  it('monta o pedido da Custom API: serviços sem repetição, data com fuso, valor com vírgula e textos aparados', () => {
    expect(validarConclusao(validos(), ctx)).toEqual({ erros: {}, aviso: null, pedido: { manutencaoId: 'm1', servicos: [100000007], km: 85200, data: '2026-11-17T10:00:00-03:00', valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina Teste', cidadeId: 'c1', realizadoPorId: 'f1', servicoRealizado: null, comentario: 'ok' } })
  })

  it('exige serviços, km, data, valor, pagamento, estabelecimento, cidade, quem realizou e a nota', () => {
    const r = validarConclusao({ servicos: [], km: '', data: '', valor: '0', pagamento: '', estabelecimento: ' ', cidadeId: '', realizadoPorId: '', servicoRealizado: '', comentario: '', notas: [], fotos: [] }, ctx)
    expect(r.pedido).toBeNull()
    expect(r.erros).toEqual({
      servicos: 'Escolha pelo menos um serviço realizado', km: 'Informe o km do veículo (número inteiro)', data: 'Informe a data e a hora', valor: 'Informe o valor pago',
      pagamento: 'Escolha a forma de pagamento', estabelecimento: 'Informe o estabelecimento', cidadeId: 'Escolha a cidade', realizadoPorId: 'Escolha quem realizou', notas: 'Anexe a nota fiscal',
    })
  })

  it('nota já gravada na manutenção dispensa outra; mais de 3 fotos é recusado', () => {
    expect(validarConclusao(validos({ notas: [] }), { ...ctx, temNotaGravada: true }).erros).toEqual({})
    const foto = new File(['f'], 'f.jpg', { type: 'image/jpeg' })
    expect(validarConclusao(validos({ fotos: [foto, foto, foto, foto] }), ctx).erros).toEqual({ fotos: 'No máximo 3 fotos' })
  })

  it('o km vai ao servidor como inteiro (o servidor lê int): decimal, texto e número grande demais são recusados', () => {
    const r = validarConclusao(validos({ km: ' 85200 ' }), ctx)
    expect(Number.isInteger(r.pedido?.km)).toBe(true)
    for (const km of ['85200.5', '85200,5', '85.200', '8e4', '-5', '0', 'abc', '2147483648', '99999999999']) {
      const recusado = validarConclusao(validos({ km }), ctx)
      expect(recusado.erros.km, km).toBe('Informe o km do veículo (número inteiro)')
      expect(recusado.pedido).toBeNull()
    }
    expect(validarConclusao(validos({ km: '2147483647' }), ctx).pedido?.km).toBe(2147483647)
  })

  it('formato de arquivo fora da lista é recusado já na tela (mesma lista da camada de dados)', () => {
    const pdf = new File(['x'], 'foto.pdf', { type: 'application/pdf' })
    const heic = new File(['x'], 'nf.heic', { type: 'image/heic' })
    expect(validarConclusao(validos({ notas: [heic] }), ctx).erros).toEqual({ notas: 'nf.heic: formato não aceito (use JPG, PNG, WEBP ou PDF)' })
    expect(validarConclusao(validos({ fotos: [pdf] }), ctx).erros).toEqual({ fotos: 'foto.pdf: formato não aceito (use JPG, PNG ou WEBP)' })
    expect(validarConclusao(validos({ notas: [new File(['x'], 'nf.pdf', { type: 'application/pdf' })] }), ctx).erros).toEqual({}) // PDF vale como nota
  })

  it('km menor que o do pedido avisa, sem bloquear', () => {
    const r = validarConclusao(validos({ km: '84000' }), ctx)
    expect(r.aviso).toBe('O km informado (84.000) é menor que o km do pedido (85.000). Confira antes de concluir.')
    expect(r.pedido).not.toBeNull()
  })

  it('valores iniciais vêm do que a manutenção já tem; a data é agora em São Paulo', () => {
    const v = valoresConclusaoIniciais(detalhe({ servicos: [100000007], valor: 200, pagamento: 202410002, estabelecimento: 'Oficina', realizadoPor: { id: 'f2', label: 'Bruno' } }), new Date('2026-11-17T13:05:00Z'))
    expect(v).toMatchObject({ servicos: [100000007], km: '', data: '2026-11-17T10:05', valor: '200', pagamento: '202410002', estabelecimento: 'Oficina', realizadoPorId: 'f2', cidadeId: '', notas: [], fotos: [] })
    expect(agoraLocalSP(new Date('2026-11-18T02:30:00Z'))).toBe('2026-11-17T23:30')
  })
})

describe('concluirPeloShell', () => {
  const pedido = validarConclusao(validos(), ctx).pedido!
  const alvo = { id: 'm1', codigo: 'MAN-1', veiculo: { id: 'v1', label: 'ABC1D23' } }
  const foto = (n: number) => new File(['f'], `f${n}.jpg`, { type: 'image/jpeg' })
  function fonte(statusAnexo: number) {
    return {
      enviarArquivoManutencao: vi.fn(async (_alvo: unknown, arquivo: File, origem: string, ordem: number) => ({ link: `https://x.invalid/${origem}/${ordem}/${arquivo.name}`, nomeArquivo: arquivo.name, caminho: 'p' })),
      concluirManutencao: vi.fn(async () => ({ despesaId: 'd1', statusAnexo, geralId: 'g1' })),
      anexarNotaFiscalDespesa: vi.fn(async () => {}),
    }
  }

  it('sobe notas e fotos antes da Custom API, junta os links e anexa a nota na despesa pendente', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    const nota2 = new File(['nf2'], 'nf2.jpg', { type: 'image/jpeg' })
    const r = await concluirPeloShell(source, alvo, pedido, { notas: [nota, nota2], fotos: [foto(1), foto(2)] })
    expect(source.enviarArquivoManutencao.mock.calls.map((c) => [c[2], c[3]])).toEqual([['NOTA_FISCAL', 1], ['NOTA_FISCAL', 2], ['POS_MANUTENCAO', 1], ['POS_MANUTENCAO', 2]])
    expect(source.concluirManutencao).toHaveBeenCalledWith({ ...pedido, linkNotaFiscal: 'https://x.invalid/NOTA_FISCAL/1/nf.jpg\nhttps://x.invalid/NOTA_FISCAL/2/nf2.jpg', linkFotoFinal1: 'https://x.invalid/POS_MANUTENCAO/1/f1.jpg', linkFotoFinal2: 'https://x.invalid/POS_MANUTENCAO/2/f2.jpg', linkFotoFinal3: null })
    expect(Math.max(...source.enviarArquivoManutencao.mock.invocationCallOrder)).toBeLessThan(source.concluirManutencao.mock.invocationCallOrder[0])
    expect(source.anexarNotaFiscalDespesa).toHaveBeenCalledWith('d1', [nota, nota2], 'f1')
    expect(r).toEqual({ resposta: { despesaId: 'd1', statusAnexo: ANEXO_DESPESA.PENDENTE, geralId: 'g1' }, avisoNota: null })
  })

  it('despesa que já tem o comprovante não recebe a nota de novo', async () => {
    const source = fonte(ANEXO_DESPESA.ENVIADO)
    expect((await concluirPeloShell(source, alvo, pedido, { notas: [nota], fotos: [] })).avisoNota).toBeNull()
    expect(source.anexarNotaFiscalDespesa).not.toHaveBeenCalled()
  })

  it('falha no envio de arquivo não chega à Custom API', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    source.enviarArquivoManutencao.mockRejectedValueOnce(new Error('O envio do arquivo falhou (HTTP 500)'))
    await expect(concluirPeloShell(source, alvo, pedido, { notas: [nota], fotos: [] })).rejects.toThrow('O envio do arquivo falhou (HTTP 500)')
    expect(source.concluirManutencao).not.toHaveBeenCalled()
  })

  it('falha ao anexar a nota na despesa vira aviso, sem desfazer a conclusão', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    source.anexarNotaFiscalDespesa.mockRejectedValueOnce(new Error('Sem privilégio'))
    const r = await concluirPeloShell(source, alvo, pedido, { notas: [nota], fotos: [] })
    expect(r.resposta.despesaId).toBe('d1')
    expect(r.avisoNota).toBe('A manutenção foi concluída, mas a nota fiscal não subiu na despesa (Sem privilégio). Anexe a nota na tela Despesas.')
  })

  it('despesa pendente sem nota nova (a nota já estava gravada) avisa para anexar em Despesas', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    const r = await concluirPeloShell(source, alvo, pedido, { notas: [], fotos: [] })
    expect(source.concluirManutencao).toHaveBeenCalledWith(expect.objectContaining({ linkNotaFiscal: null }))
    expect(r.avisoNota).toBe('A manutenção foi concluída, mas a despesa ficou sem a nota fiscal. Anexe a nota na tela Despesas.')
  })
})
