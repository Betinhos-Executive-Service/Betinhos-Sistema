import { describe, expect, it } from 'vitest'
import { TELA, builtinViews, matchesKeyword, readTreinamento, sortTreinamentos, type Linha } from './lista'
import {
  ESTADO, FUNCAO_MOTORISTA, PUBLICO, anexoDaPasta, blocosDoConteudo, copiaParaReciclagem, edicaoPublicadoPayload, draftPayload, emptyDraft, isOrfa, isVencido, mapParticipacao, mapTreinamento, matchParticipacao, podeLembrar, pushLabel, PUSH, novaPergunta, publicoLabel, resolverPublico, statusParticipacao, trechos,
  validarAnexo, validarComConteudo, validarPublicacao, validarQuiz, validarRascunho, type Funcionario, type Participacao, type Pergunta, type Treinamento,
} from './treinamentos'

const G = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`
const FUNC: Funcionario[] = [
  { id: G(1), nome: 'Carlos', apelido: 'Carlos', funcao: 202410000, ativo: true },
  { id: G(2), nome: 'Bruna', apelido: 'Bruna', funcao: 202410001, ativo: true },
  { id: G(3), nome: 'Gustavo', apelido: 'Gustavo', funcao: 202410000, ativo: false },
]
const pergunta = (corretaId: string): Pergunta => ({ id: 'q1', texto: 'Qual a porta?', alternativas: [{ id: 'a', texto: 'Porta 2' }, { id: 'b', texto: 'Porta 4' }], corretaId })
const draft = (patch: Partial<Treinamento> = {}): Treinamento => ({ ...emptyDraft(), titulo: 'Embarque no GRU', conteudo: 'Texto', ...patch })
const part = (patch: Partial<Participacao> = {}): Participacao => ({ id: 'p', treinamentoId: 't', funcionarioId: G(1), abertoEm: null, confirmadoEm: null, assinadoEm: null, nomeAssinante: '', assinaturaJson: '', nota: null, aprovado: null, tentativas: 0, concluidoEm: null, pushStatus: PUSH.enviado, pushErro: '', lembradoEm: null, ...patch })

describe('validação do rascunho', () => {
  it('exige título e aceita texto, vídeo https e quiz completo', () => {
    expect(validarRascunho(draft({ titulo: '' }))).toMatch(/título/)
    expect(validarRascunho(draft({ videoUrl: 'https://youtu.be/x', exigeQuiz: true, perguntas: [pergunta('b')] }))).toBe('')
  })
  it('vídeo sem URL válida é recusado', () => {
    expect(validarRascunho(draft({ videoUrl: 'youtube.com/x' }))).toBe('O vídeo precisa de um link https:// válido.')
    expect(validarRascunho(draft({ videoUrl: 'http://x.com/v' }))).toBe('O vídeo precisa de um link https:// válido.')
  })
  it('quiz sem alternativa correta impede salvar', () => {
    expect(validarQuiz([pergunta('')])).toBe('Marque a alternativa correta da pergunta 1.')
    expect(validarQuiz([{ ...pergunta('b'), alternativas: [{ id: 'a', texto: 'Só uma' }, { id: 'b', texto: '' }] }])).toMatch(/duas alternativas/)
    expect(validarQuiz([])).toMatch(/pelo menos uma pergunta/)
    expect(validarRascunho(draft({ exigeQuiz: true, perguntas: [pergunta('')] }))).toBe('Marque a alternativa correta da pergunta 1.')
    expect(validarRascunho(draft({ exigeQuiz: false, perguntas: [pergunta('')] }))).toBe('')
  })
  it('nota mínima fora de 0–100 é recusada só quando há quiz', () => {
    expect(validarRascunho(draft({ exigeQuiz: true, notaMinima: 120, perguntas: [pergunta('b')] }))).toBe('A nota mínima vai de 0 a 100.')
    expect(validarRascunho(draft({ exigeQuiz: false, notaMinima: 120 }))).toBe('')
  })
})

describe('público-alvo', () => {
  it('motoristas: só ativos com função Motorista; desligado nunca entra', () => {
    expect(resolverPublico({ publicoTipo: PUBLICO.motoristas, publico: [] }, FUNC).map((f) => f.nome)).toEqual(['Carlos'])
    expect(resolverPublico({ publicoTipo: PUBLICO.funcao, publico: ['202410001'] }, FUNC).map((f) => f.nome)).toEqual(['Bruna'])
    expect(resolverPublico({ publicoTipo: PUBLICO.selecionados, publico: [G(3).toUpperCase(), G(2)] }, FUNC).map((f) => f.nome)).toEqual(['Bruna'])
  })
  it('público vazio avisa e não publica', () => {
    expect(validarPublicacao(draft({ publicoTipo: PUBLICO.selecionados, publico: [] }), FUNC)).toBe('Selecione pelo menos um funcionário.')
    expect(validarPublicacao(draft({ publicoTipo: PUBLICO.funcao, publico: [] }), FUNC)).toBe('Escolha pelo menos uma função.')
    expect(validarPublicacao(draft({ publicoTipo: PUBLICO.selecionados, publico: [G(3)] }), FUNC)).toMatch(/Nenhum funcionário ativo no público-alvo/)
    expect(validarPublicacao(draft(), FUNC)).toBe('')
  })
  it('publicar exige algum conteúdo', () => {
    expect(validarPublicacao(draft({ conteudo: '' }), FUNC)).toMatch(/texto, um vídeo ou um anexo/)
    expect(validarPublicacao(draft({ conteudo: '', anexos: [{ nome: 'a.pdf', caminho: 'x', tamanho: 1, mime: 'application/pdf' }] }), FUNC)).toBe('')
  })
})

describe('anexos', () => {
  const file = (size: number, type = 'application/pdf') => ({ size, type, name: 'a' } as File)
  it('recusa acima de 25 MB, vazio e tipo fora da lista', () => {
    expect(validarAnexo(file(25 * 1024 * 1024 + 1))).toBe('O arquivo deve ter até 25 MB.')
    expect(validarAnexo(file(0))).toBe('O arquivo está vazio.')
    expect(validarAnexo(file(10, 'application/zip'))).toMatch(/Use PDF/)
    expect(validarAnexo(file(10, 'image/jpeg'))).toBeNull()
  })
  it('aceita vídeo até 50 MB e recusa acima', () => {
    expect(validarAnexo(file(40 * 1024 * 1024, 'video/mp4'))).toBeNull()
    expect(validarAnexo(file(10, 'video/quicktime'))).toBeNull()
    expect(validarAnexo(file(50 * 1024 * 1024 + 1, 'video/webm'))).toBe('O vídeo deve ter até 50 MB.')
  })
})

describe('payload e mapeamento', () => {
  it('rascunho vai com JSON do público, do quiz e dos anexos; alternativas vazias saem', () => {
    const p = draftPayload(draft({ publicoTipo: PUBLICO.selecionados, publico: [G(1)], exigeQuiz: true, perguntas: [{ ...pergunta('b'), alternativas: [...pergunta('b').alternativas, { id: 'c', texto: ' ' }] }], validade: '2026-12-01' }))
    expect(p.cr40f_name).toBe('Embarque no GRU')
    expect(JSON.parse(String(p.cr40f_publicojson))).toEqual([G(1)])
    expect(JSON.parse(String(p.cr40f_quizjson)).perguntas[0].alternativas).toHaveLength(2)
    expect(p.cr40f_validade).toBe('2026-12-01')
    expect(p.cr40f_estado).toBe(ESTADO.rascunho)
    expect(draftPayload(draft({ publicoTipo: PUBLICO.motoristas, publico: ['lixo'] })).cr40f_publicojson).toBe('[]')
    expect(draftPayload(draft({ exigeQuiz: false, perguntas: [pergunta('b')] })).cr40f_quizjson).toBe('{"perguntas":[]}')
  })
  it('mapeia a linha do Dataverse e tolera JSON quebrado', () => {
    const t = mapTreinamento({ cr40f_treinamentoid: `{${G(10).toUpperCase()}}`, cr40f_name: 'T', cr40f_publicotipo: PUBLICO.funcao, cr40f_publicojson: '["202410000"]', cr40f_quizjson: '{"perguntas":[{"id":"q","texto":"P","alternativas":[{"id":"a","texto":"A"}],"corretaId":"a"}]}', cr40f_anexosjson: 'nope', cr40f_validade: '2026-12-01T00:00:00Z', cr40f_estado: ESTADO.publicado, cr40f_exigequiz: true, cr40f_notaminima: 80 })
    expect(t.id).toBe(G(10))
    expect(t.publico).toEqual(['202410000'])
    expect(t.perguntas[0].alternativas[0].texto).toBe('A')
    expect(t.anexos).toEqual([])
    expect(t.validade).toBe('2026-12-01')
    expect(t.notaMinima).toBe(80)
    expect(mapTreinamento({}).notaMinima).toBe(70)
    const p = mapParticipacao({ cr40f_treinamentoparticipacaoid: G(1), _cr40f_treinamento_value: G(10), _cr40f_funcionario_value: G(2), cr40f_nota: 50, cr40f_aprovado: false, cr40f_tentativas: 2 })
    expect(p).toMatchObject({ treinamentoId: G(10), funcionarioId: G(2), nota: 50, aprovado: false, tentativas: 2, concluidoEm: null })
  })
})

describe('status da participação', () => {
  it('não aberto / aberto / confirmado / assinado / nota / concluído', () => {
    expect(statusParticipacao(part()).label).toBe('Não aberto')
    expect(statusParticipacao(part({ abertoEm: 'x' })).label).toBe('Aberto')
    expect(statusParticipacao(part({ abertoEm: 'x', confirmadoEm: 'x' })).label).toBe('Confirmado')
    expect(statusParticipacao(part({ assinadoEm: 'x' })).label).toBe('Assinado')
    expect(statusParticipacao(part({ nota: 33, aprovado: false })).label).toBe('Reprovado · 33%')
    expect(statusParticipacao(part({ nota: 100, aprovado: true })).label).toBe('Aprovado · 100%')
    expect(statusParticipacao(part({ concluidoEm: 'x' })).label).toBe('Concluído')
  })
  it('filtros do painel', () => {
    const reprovado = part({ nota: 33, aprovado: false })
    expect(matchParticipacao('reprovados', reprovado)).toBe(true)
    expect(matchParticipacao('pendentes', reprovado)).toBe(true)
    expect(matchParticipacao('concluidos', part({ concluidoEm: 'x' }))).toBe(true)
    expect(matchParticipacao('reprovados', part({ nota: 33, aprovado: false, concluidoEm: 'x' }))).toBe(false)
  })
  it('vencido: publicado com validade passada', () => {
    expect(isVencido(draft({ estado: ESTADO.publicado, validade: '2026-10-01' }), '2026-10-02')).toBe(true)
    expect(isVencido(draft({ estado: ESTADO.publicado, validade: '2026-10-02' }), '2026-10-02')).toBe(false)
    expect(isVencido(draft({ estado: ESTADO.rascunho, validade: '2026-10-01' }), '2026-10-02')).toBe(false)
  })
})

describe('publicação interrompida', () => {
  it('órfã: fora do público e sem nenhuma atividade; quem já abriu ou está no público fica', () => {
    const alvos = new Set([G(1)])
    expect(isOrfa(part({ funcionarioId: G(2) }), alvos)).toBe(true)
    expect(isOrfa(part({ funcionarioId: G(1) }), alvos)).toBe(false)
    expect(isOrfa(part({ funcionarioId: G(2), abertoEm: 'x' }), alvos)).toBe(false)
    expect(isOrfa(part({ funcionarioId: G(2), nota: 0, aprovado: false }), alvos)).toBe(false)
  })
})

describe('conteúdo com marcação simples', () => {
  it('títulos, listas e parágrafos', () => {
    expect(blocosDoConteudo('# Ponto\nLinha **forte** aqui.\n\n- a\n- b\nfim')).toEqual([
      { tipo: 'h', texto: 'Ponto' }, { tipo: 'p', texto: 'Linha **forte** aqui.' }, { tipo: 'ul', itens: ['a', 'b'] }, { tipo: 'p', texto: 'fim' },
    ])
    expect(trechos('Linha **forte** aqui')).toEqual([{ negrito: false, texto: 'Linha ' }, { negrito: true, texto: 'forte' }, { negrito: false, texto: ' aqui' }])
    expect(blocosDoConteudo('')).toEqual([])
  })
  it('nova pergunta nasce com duas alternativas e sem correta', () => {
    const p = novaPergunta()
    expect(p.alternativas).toHaveLength(2)
    expect(p.corretaId).toBe('')
  })
})

describe('lista', () => {
  const linha = (patch: Partial<Linha>): Linha => ({ ...draft(), criadoEm: '2026-10-01T00:00:00Z', ...patch })
  it('busca sem acento, leitura das colunas e ordenação por criação', () => {
    expect(matchesKeyword(linha({ titulo: 'Direção defensiva' }), 'direcao')).toBe(true)
    expect(readTreinamento(linha({ estado: ESTADO.publicado, publicadoEm: '2026-10-05T12:00:00Z' }), 'publicadoEm')).toBe('2026-10-05')
    expect(readTreinamento(linha({ validade: '' }), 'validade')).toBeNull()
    const [a, b] = sortTreinamentos([linha({ titulo: 'A', criadoEm: '2026-10-01' }), linha({ titulo: 'B', criadoEm: '2026-10-02' })], { key: 'criado', dir: 'desc' })
    expect([a.titulo, b.titulo]).toEqual(['B', 'A'])
  })
  it('visões prontas: rascunhos e publicados', () => {
    expect(TELA).toBe('treinamentos')
    expect(builtinViews().map((v) => v.id)).toEqual(['rascunhos', 'publicados'])
  })
})

describe('edição do publicado', () => {
  const publicado = draft({ id: 'abc', titulo: ' Embarque ', descricao: 'd', conteudo: 'c', validade: '2026-12-01', estado: ESTADO.publicado, publicadoEm: '2026-11-01T10:00:00Z', exigeQuiz: true, notaMinima: 80 })

  it('grava só conteúdo, anexos, validade e editadoem', () => {
    const payload = edicaoPublicadoPayload(publicado, '2026-11-03T12:00:00.000Z')
    expect(Object.keys(payload).sort()).toEqual(['cr40f_anexosjson', 'cr40f_conteudo', 'cr40f_descricao', 'cr40f_editadoem', 'cr40f_name', 'cr40f_validade', 'cr40f_videourl'])
    expect(payload.cr40f_name).toBe('Embarque')
    expect(payload.cr40f_editadoem).toBe('2026-11-03T12:00:00.000Z')
  })

  it('editar o publicado não deixa esvaziar texto, vídeo e anexos', () => {
    expect(validarComConteudo({ ...publicado, exigeQuiz: false, conteudo: ' ', videoUrl: '', anexos: [] })).toMatch(/Inclua um texto/)
    expect(validarComConteudo({ ...publicado, exigeQuiz: false })).toBe('')
  })

  it('validade vazia vira null', () => {
    expect(edicaoPublicadoPayload({ ...publicado, validade: '' }).cr40f_validade).toBeNull()
  })

  it('mapeia cr40f_editadoem', () => {
    expect(mapTreinamento({ cr40f_editadoem: '2026-11-03T12:00:00Z' }).editadoEm).toBe('2026-11-03T12:00:00Z')
    expect(mapTreinamento({}).editadoEm).toBeNull()
  })
})

describe('reciclagem', () => {
  const base = draft({ id: 'abc', titulo: 'Direção defensiva', validade: '2026-01-10', estado: ESTADO.publicado, publicadoEm: '2026-01-01T10:00:00Z', editadoEm: '2026-01-02T10:00:00Z', exigeQuiz: true })

  it('vira rascunho novo, sem id, validade nem datas, com o sufixo de reciclagem', () => {
    expect(copiaParaReciclagem(base, '2026-11-03')).toMatchObject({ id: '', estado: ESTADO.rascunho, publicadoEm: null, editadoEm: null, validade: '', exigeQuiz: true, titulo: 'Direção defensiva (reciclagem 03/11/2026)' })
  })

  it('não empilha sufixos de reciclagem', () => {
    expect(copiaParaReciclagem({ ...base, titulo: 'Direção defensiva (reciclagem 03/11/2025)' }, '2026-11-03').titulo).toBe('Direção defensiva (reciclagem 03/11/2026)')
  })

  it('respeita o limite de 200 caracteres', () => {
    expect(copiaParaReciclagem({ ...base, titulo: 'x'.repeat(200) }, '2026-11-03').titulo.length).toBe(200)
  })
})

describe('anexoDaPasta', () => {
  const id = 'AAAA-1'
  it('só reconhece arquivo na pasta do próprio treinamento', () => {
    expect(anexoDaPasta({ nome: 'a.pdf', caminho: '/Documentos Compartilhados/Treinamentos/DEV/aaaa-1/a.pdf', tamanho: 1, mime: 'application/pdf' }, id)).toBe(true)
    expect(anexoDaPasta({ nome: 'a.pdf', caminho: '/Documentos Compartilhados/Treinamentos/bbbb-2/a.pdf', tamanho: 1, mime: 'application/pdf' }, id)).toBe(false)
  })
})

describe('publicoLabel', () => {
  it('nomeia as funções', () => {
    expect(publicoLabel({ publicoTipo: PUBLICO.funcao, publico: [String(FUNCAO_MOTORISTA)] })).toBe('Motorista')
  })
  it('nomeia até 2 selecionados e resume o resto', () => {
    const fs: Funcionario[] = [
      { id: 'a', nome: 'Ana Souza', apelido: '', funcao: null, ativo: true },
      { id: 'b', nome: 'Bruno Lima', apelido: '', funcao: null, ativo: true },
      { id: 'c', nome: 'Caio Reis', apelido: '', funcao: null, ativo: true },
    ]
    expect(publicoLabel({ publicoTipo: PUBLICO.selecionados, publico: ['a', 'b'] }, fs)).toBe('Ana Souza e Bruno Lima')
    expect(publicoLabel({ publicoTipo: PUBLICO.selecionados, publico: ['a', 'b', 'c'] }, fs)).toBe('Ana Souza, Bruno Lima e mais 1')
    expect(publicoLabel({ publicoTipo: PUBLICO.selecionados, publico: ['a', 'b'] })).toBe('2 selecionados')
  })
})

describe('push da participação', () => {
  const base = part()
  it('mapeia status, erro e lembrete', () => {
    const p = mapParticipacao({ cr40f_pushstatus: PUSH.falhou, cr40f_pusherro: 'Dispositivo não registrado', cr40f_lembradoem: '2026-11-03T10:00:00Z' })
    expect(p).toMatchObject({ pushStatus: PUSH.falhou, pushErro: 'Dispositivo não registrado', lembradoEm: '2026-11-03T10:00:00Z' })
    expect(mapParticipacao({}).pushStatus).toBeNull()
  })
  it('rotula o push', () => {
    expect(pushLabel({ ...base, pushStatus: null })).toBe('Sem push')
    expect(pushLabel({ ...base, pushStatus: PUSH.pendente })).toBe('Push na fila')
    expect(pushLabel({ ...base, pushStatus: PUSH.enviado })).toBe('Push enviado')
    expect(pushLabel({ ...base, pushStatus: PUSH.falhou, pushErro: 'x' })).toBe('Push falhou · x')
  })
  it('lembra pendente sem lembrete nas últimas 24 h; nunca concluído ou com push na fila', () => {
    const agora = Date.parse('2026-11-03T12:00:00Z')
    expect(podeLembrar({ ...base, pushStatus: PUSH.enviado }, agora)).toBe(true)
    expect(podeLembrar({ ...base, pushStatus: PUSH.enviado, lembradoEm: '2026-11-03T00:00:00Z' }, agora)).toBe(false)
    expect(podeLembrar({ ...base, pushStatus: PUSH.enviado, lembradoEm: '2026-11-02T11:59:00Z' }, agora)).toBe(true)
    expect(podeLembrar({ ...base, pushStatus: PUSH.pendente }, agora)).toBe(false)
    expect(podeLembrar({ ...base, pushStatus: PUSH.falhou, concluidoEm: '2026-11-03T09:00:00Z' }, agora)).toBe(false)
  })
})
