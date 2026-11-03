import { describe, expect, it } from 'vitest'
import { dadosComprovante } from './comprovante'
import { emptyDraft, ESTADO, mapParticipacao } from './treinamentos'

const item = { ...emptyDraft(), id: 't1', titulo: 'Embarque no GRU', conteudo: 'Texto atual', estado: ESTADO.publicado, publicadoEm: '2026-11-01T13:00:00Z', exigeQuiz: true }
const base = mapParticipacao({ cr40f_treinamentoparticipacaoid: 'p1', cr40f_concluidoem: '2026-11-02T13:00:00Z', cr40f_nota: 85, cr40f_aprovado: true, cr40f_tentativas: 2 })

describe('dadosComprovante', () => {
  it('usa a versão lida quando há snapshot', () => {
    const p = { ...base, conteudoSnapshot: JSON.stringify({ v: 1, titulo: 'Embarque no GRU', descricao: '', conteudo: 'Texto lido', videoUrl: '', anexos: [{ nome: 'mapa.pdf', tamanho: 1 }] }), conteudoHash: 'ab'.repeat(32) }
    const d = dadosComprovante(item, p, 'Carlos Alberto')
    expect(d).toMatchObject({ versao: 'lida', conteudo: 'Texto lido', anexos: ['mapa.pdf'], hash: 'ab'.repeat(32), aviso: '', nota: '85% · aprovado · 2 tentativas' })
    expect(d.arquivo).toBe('comprovante-embarque-no-gru-carlos-alberto.pdf')
  })

  it('cai no conteúdo atual com aviso quando não há snapshot', () => {
    const d = dadosComprovante(item, { ...base, conteudoSnapshot: '', conteudoHash: '' }, 'Carlos')
    expect(d.versao).toBe('atual')
    expect(d.conteudo).toBe('Texto atual')
    expect(d.hash).toBe('')
    expect(d.aviso).toBe('Concluído antes do registro da versão lida: este comprovante mostra o conteúdo atual do treinamento.')
  })

  it('snapshot ilegível também cai no conteúdo atual com aviso', () => {
    expect(dadosComprovante(item, { ...base, conteudoSnapshot: '{quebrado', conteudoHash: 'x' }, 'Carlos').versao).toBe('atual')
  })

  it('recusa participação não concluída', () => {
    expect(() => dadosComprovante(item, { ...base, concluidoEm: null, conteudoSnapshot: '', conteudoHash: '' }, 'Carlos')).toThrow('Só participação concluída tem comprovante.')
  })
})
