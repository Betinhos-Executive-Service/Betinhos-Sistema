import { describe, expect, it } from 'vitest'
import { createMockEtapas, createMockProjetos } from './data/mock'
import { atualizacaoPayload, atualizacoesPath, etapaPayload, mapAtualizacao, mapEtapa, mapProjeto, projetosPath } from './data/queries'
import { MAX_ANEXO_BYTES, erroDoAnexo } from './domain/anexos'
import { AUTOR, STATUS, autorDoPerfil } from './domain/choices'
import { gravarChecklist, lerChecklist, progresso } from './domain/checklist'
import { codigoEtapa1, etapaDoProjeto } from './domain/regras'
import type { Etapa } from './domain/types'
import { compararPrazo, faltaPrazo, gravarPrazo, lerPrazo, prazoMes, prazoSemana, rotuloPrazo, semanasDoMes, situacaoPrazo } from './domain/prazo'

const et = (over: Partial<Etapa>): Etapa => ({ id: 'e1', projetoId: 'p', numero: 1, codigo: 'PRJ-1.1', nome: 'E', status: STATUS.ideia, prazo: null, andamento: 0, linkPr: '', publicadoProd: null, motivoPausa: '', ...over })

describe('checklist', () => {
  it('lê o JSON da coluna; vazio, inválido e item sem texto viram nada', () => {
    expect(lerChecklist('[{"texto":" A ","feito":true},{"texto":"B"},{"texto":""},{"feito":true}]')).toEqual([{ texto: 'A', feito: true }, { texto: 'B', feito: false }])
    expect(lerChecklist('')).toEqual([])
    expect(lerChecklist(null)).toEqual([])
    expect(lerChecklist('não é json')).toEqual([])
    expect(lerChecklist('{"texto":"A"}')).toEqual([])
  })
  it('grava em JSON (lista vazia limpa a coluna) e mostra o progresso', () => {
    const itens = [{ texto: 'A', feito: true }, { texto: 'B', feito: false }]
    expect(lerChecklist(gravarChecklist(itens))).toEqual(itens)
    expect(gravarChecklist([])).toBeNull()
    expect(progresso(itens)).toBe('1/2')
    expect(progresso([])).toBe('')
  })
})

describe('etapa escondida do projeto', () => {
  it('usa a de menor número e ignora as outras; sem etapa = null', () => {
    const etapas = [et({ id: 'b', numero: 2 }), et({ id: 'a', numero: 1 }), et({ id: 'z', projetoId: 'outro' })]
    expect(etapaDoProjeto(etapas, 'p')?.id).toBe('a')
    expect(etapaDoProjeto([], 'p')).toBeNull()
    expect(etapaDoProjeto(createMockEtapas(), createMockProjetos()[3].id)).toBeNull()
  })
  it('código da etapa é <código do projeto>.1', () => {
    expect(codigoEtapa1('PRJ-9')).toBe('PRJ-9.1')
    expect(codigoEtapa1('')).toBe('')
  })
})

describe('anexos', () => {
  it('aceita imagem, vídeo, áudio e PDF; recusa o resto, o grande e o vazio', () => {
    expect(erroDoAnexo({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.mp4', type: 'video/mp4', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.webm', type: 'audio/webm', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.exe', type: 'application/x-msdownload', size: 100 })).toMatch(/só imagem/)
    expect(erroDoAnexo({ name: 'g.png', type: 'image/png', size: MAX_ANEXO_BYTES + 1 })).toMatch(/limite de 5 MB/)
    expect(erroDoAnexo({ name: 'v.png', type: 'image/png', size: 0 })).toMatch(/vazio/)
  })
  it('autor vem do perfil', () => {
    expect(autorDoPerfil('renan')).toBe(AUTOR.renan)
    expect(autorDoPerfil('gestor')).toBe(AUTOR.gestor)
  })
})

describe('consultas, payloads e mapeamento do Dataverse', () => {
  it('projeto lê título, descrição e checklist', () => {
    expect(projetosPath('cr40f_projetos')).toContain('cr40f_checklist')
    expect(mapProjeto({ cr40f_projetoid: 'P1', cr40f_codigo: 'PRJ-1', cr40f_name: 'X', cr40f_briefing: 'd', cr40f_checklist: '[{"texto":"A","feito":true}]' }))
      .toEqual({ id: 'p1', codigo: 'PRJ-1', nome: 'X', briefing: 'd', checklist: [{ texto: 'A', feito: true }], prazo: null })
    expect(mapProjeto({ cr40f_projetoid: 'P1', cr40f_prazo: '2026-12-13T00:00:00Z', cr40f_prazotipo: 100000001 }))
      .toMatchObject({ prazo: { tipo: 'semana', fim: '2026-12-13' } })
    expect(mapEtapa({ cr40f_projetoetapaid: 'E1', cr40f_motivopausa: ' Esperando ' }).motivoPausa).toBe('Esperando')
  })
  it('atualizações, etapas e payloads', () => {
    const path = atualizacoesPath('cr40f_projetoatualizacaos')
    expect(path).toContain('cr40f_transcricao')
    const a = mapAtualizacao({ cr40f_projetoatualizacaoid: 'ID1', _cr40f_projeto_value: 'P1', cr40f_data: '2026-11-20T10:00:00Z', cr40f_autor: AUTOR.gestor, cr40f_texto: '', cr40f_transcricao: 'oi', cr40f_projetoatualizacao_Annotations: [{ annotationid: 'N1', filename: 'a.webm', mimetype: 'audio/webm', filesize: 5 }] })
    expect(a).toMatchObject({ id: 'id1', projetoId: 'p1', etapaId: null, data: '2026-11-20T07:00:00', transcricao: 'oi' })
    expect(a.anexos).toEqual([{ id: 'n1', nome: 'a.webm', tipo: 'audio/webm', tamanho: 5 }])
    const e = mapEtapa({ cr40f_projetoetapaid: 'E1', _cr40f_projeto_value: 'P1', cr40f_numero: 1, cr40f_codigo: 'PRJ-1.1', cr40f_status: STATUS.validacao })
    expect(e).toMatchObject({ id: 'e1', projetoId: 'p1', numero: 1, status: STATUS.validacao })
    const sets = { projeto: 'cr40f_projetos', etapa: 'cr40f_projetoetapas', atualizacao: 'cr40f_projetoatualizacaos' }
    const payload = atualizacaoPayload({ projetoId: 'p1', etapaId: null, data: '2026-11-20T10:00:00', autor: AUTOR.renan, texto: '', prova: false }, sets)
    expect(payload).toMatchObject({ 'cr40f_Projeto@odata.bind': '/cr40f_projetos(p1)' })
    expect(JSON.stringify(payload)).not.toContain('cr40f_Etapa@odata.bind')
    expect(etapaPayload({ cr40f_status: STATUS.ideia }, { projetoId: 'p1', numero: 1, codigo: 'PRJ-1.1' }, sets)).toMatchObject({ cr40f_numero: 1, cr40f_codigo: 'PRJ-1.1' })
  })
})

describe('prazo', () => {
  it('semanas de segunda a domingo, cortadas no mês', () => {
    expect(semanasDoMes(2026, 11).map((s) => [s.ini, s.fim])).toEqual([[1, 6], [7, 13], [14, 20], [21, 27], [28, 31]])
    expect(semanasDoMes(2026, 1).map((s) => [s.ini, s.fim])).toEqual([[1, 1], [2, 8], [9, 15], [16, 22], [23, 28]])
  })
  it('mês, semana e dia: fim, início e rótulo', () => {
    expect(prazoMes(2026, 1)).toEqual({ tipo: 'mes', fim: '2026-02-28' })
    const s3 = prazoSemana(2026, 11, 3)
    expect(s3).toEqual({ tipo: 'semana', fim: '2026-12-20' })
    expect(rotuloPrazo(s3, '2026-11-26')).toBe('Sem 3 de dez · 14–20')
    expect(rotuloPrazo(prazoMes(2026, 11), '2026-11-26')).toBe('dez/2026')
    expect(rotuloPrazo({ tipo: 'dia', fim: '2026-12-12' }, '2026-11-26')).toBe('12/12')
    expect(rotuloPrazo({ tipo: 'dia', fim: '2027-01-05' }, '2026-11-26')).toBe('05/01/2027')
    expect(() => prazoSemana(2026, 11, 6)).toThrow()
  })
  it('situação e quanto falta: perto ≤7 d (mês), ≤3 (semana), ≤2 (dia); atrasado depois do fim', () => {
    const hoje = '2026-11-26'
    expect(situacaoPrazo(prazoMes(2026, 10), hoje)).toBe('perto')
    expect(situacaoPrazo(prazoMes(2026, 11), hoje)).toBe('ok')
    expect(situacaoPrazo({ tipo: 'semana', fim: '2026-11-29' }, hoje)).toBe('perto')
    expect(situacaoPrazo({ tipo: 'dia', fim: '2026-11-29' }, hoje)).toBe('ok')
    expect(situacaoPrazo({ tipo: 'dia', fim: '2026-11-25' }, hoje)).toBe('atrasado')
    expect(faltaPrazo({ tipo: 'dia', fim: '2026-11-26' }, hoje)).toBe('vence hoje')
    expect(faltaPrazo({ tipo: 'dia', fim: '2026-11-27' }, hoje)).toBe('falta 1 d')
    expect(faltaPrazo({ tipo: 'dia', fim: '2026-11-23' }, hoje)).toBe('atrasado 3 d')
  })
  it('lê e grava as colunas; data sem tipo vale como dia; ordem com sem prazo no fim', () => {
    expect(lerPrazo('2026-12-01', null)).toEqual({ tipo: 'dia', fim: '2026-12-01' })
    expect(lerPrazo('', 100000002)).toBeNull()
    expect(gravarPrazo(prazoMes(2026, 11))).toEqual({ cr40f_prazo: '2026-12-31', cr40f_prazotipo: 100000002 })
    expect(gravarPrazo(null)).toEqual({ cr40f_prazo: null, cr40f_prazotipo: null })
    const lista = [null, { tipo: 'dia' as const, fim: '2026-12-10' }, { tipo: 'mes' as const, fim: '2026-11-30' }]
    expect(lista.sort(compararPrazo).map((p) => p?.fim ?? null)).toEqual(['2026-11-30', '2026-12-10', null])
  })
})

