import { addMonths, todaySP } from './dates'
import { buildPatch, type PatchContext } from './patch'
import type { DataSource } from './source'
import { buildNoteHtml, textToNoteHtml, type SpAnexo } from './notes'
import { nomeComData, pastaFuncionario } from './sharepoint'
import { ANEXOS_SUBPASTA, LIMITES_PADRAO, type DocumentStore } from './source'
import type { Anotacao, Documento, Funcionario, Lookup } from './types'

// Dados fictícios só para `pnpm dev` em localhost. Nunca usados dentro do Dataverse.
const context: PatchContext = { veiculoNav: 'cr40f_VeiculoAtual', veiculoSet: 'cr40f_veiculoses', dateBehaviors: {} }
const veiculos: Lookup[] = [
  { id: 'v1', label: 'ABC1D23 · Versa' },
  { id: 'v2', label: 'EFG4H56 · Virtus' },
  { id: 'v3', label: 'IJK7L89 · Corolla' },
]

function offset(days: number) {
  const today = todaySP()
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function birthdayIn(days: number) {
  return `1988${offset(days).slice(4)}`
}

function person(id: string, nome: string, apelido: string, extra: Partial<Funcionario['values']>, veiculo: Lookup | null = null): Funcionario {
  return {
    id,
    values: {
      cr40f_nomecompleto: nome, new_apelido: apelido, cr40f_status: 0, cr40f_funcao: 202410000, cr40f_nomedaempresa: 202410000, cr40f_tipodevinculo: 0,
      cr40f_telefonecorporativo: '+55 12 99000-0000', cr40f_datadeadmissao: '2022-03-01', cr40f_validadedacnh: offset(400), cr40f_datadoaso: addMonths(offset(200), -12),
      new_notificacoesmotoristas: true, new_notificacoesoperacionais: false, new_notificacoesfinanceiras: false, new_notificacoesfrota: false, cr40f_gerarrecibopersonalizado: false,
      ...extra,
    },
    veiculo,
    fotoThumb: null, fotoUrl: null, assinaturaUrl: null,
    loginsesenhas: id === 'm1' ? '<p>Portal InFleet: <b>usuario.teste</b></p><p>Senha: exemplo-fictício</p>' : null,
    modifiedon: new Date().toISOString(),
  }
}

const ROWS0: Funcionario[] = [
  person('m1', 'Carlos Alberto Teste', 'Carlão', { cr40f_validadedacnh: offset(-5), cr40f_numerodocpf: '529.982.247-25' }, veiculos[0]),
  person('m2', 'Bruna Ficticia Lima', 'Bruna', { cr40f_validadedacnh: offset(12) }, veiculos[1]),
  person('m3', 'Diego Exemplo Rocha', 'Diego', { cr40f_validadedacnh: offset(45), cr40f_datadeaniversario: birthdayIn(0) }),
  person('m4', 'Elaine Mock Duarte', 'Elaine', { cr40f_funcao: 202410001, cr40f_datadoaso: addMonths(offset(-10), -12), cr40f_validadedacnh: null }),
  person('m5', 'Fabio Demo Nunes', 'Fabinho', { cr40f_status: 2, cr40f_datadeaniversario: birthdayIn(5) }),
  person('m6', 'Gustavo Amostra Pires', 'Gus', { cr40f_status: 1, cr40f_datadedemissao: offset(-90), cr40f_validadedacnh: offset(-30) }),
  person('m7', 'Helena Simulada Costa', 'Helena', { cr40f_funcao: 202410001, cr40f_nomedaempresa: 202410001, cr40f_tipodevinculo: 1 }),
  person('m8', 'Igor Fake Moreira', 'Igor', { cr40f_datadoaso: addMonths(offset(20), -12) }, veiculos[2]),
]
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
const NOTES0: Record<string, Anotacao[]> = {
  m1: [
    { id: 'n1', titulo: 'Documentos da CNH', texto: textToNoteHtml('Entregou documentos da CNH renovada.'), criadoEm: hoursAgo(3), modificadoEm: null, autor: 'Renan Mendonça', arquivo: { nome: 'cnh-renovada.png', tamanho: 70, tipo: 'image/png' } },
    { id: 'n2', titulo: 'Advertência verbal', texto: textToNoteHtml('Conversa sobre atraso no serviço do dia 12.\n\nCombinado chegar com 15 minutos de antecedência nos embarques de aeroporto. Motorista entendeu e concordou.\n\nAcompanhar nas próximas duas semanas.'), criadoEm: hoursAgo(50), modificadoEm: hoursAgo(26), autor: 'Operação', arquivo: null },
    { id: 'n4', titulo: 'Convocação para retorno ao trabalho', texto: `<div class="ck-content" data-wrapper="true"><p style="margin: 0;">Print da conversa com o <b>motorista</b>:</p><p style="margin: 0;"><img src="${PIXEL}" width="320"></p></div>`, criadoEm: hoursAgo(70), modificadoEm: null, autor: 'RH', arquivo: null },
    { id: 'n3', titulo: 'Exame toxicológico', texto: '', criadoEm: hoursAgo(24 * 40), modificadoEm: null, autor: 'RH', arquivo: { nome: 'toxicologico-2026.txt', tamanho: 38, tipo: 'text/plain' } },
  ],
}

const DOCS0: Record<string, Documento[]> = {
  m1: [
    { id: 'd1', nome: 'CNH frente e verso.pdf', caminho: '/Documentos Compartilhados/Funcionarios/DEV/m1/CNH frente e verso.pdf', tamanho: 482_113, modificadoEm: hoursAgo(5), mimeType: 'application/pdf' },
    { id: 'd2', nome: 'Comprovante de residência.jpg', caminho: '/Documentos Compartilhados/Funcionarios/DEV/m1/Comprovante de residência.jpg', tamanho: 1_204_551, modificadoEm: hoursAgo(24 * 12), mimeType: 'image/jpeg' },
  ],
}
let rows: Funcionario[] = []
let notes: Record<string, Anotacao[]> = {}
let docs: Record<string, Documento[]> = {}
const blobs = new Map<string, Blob>()
const noteBlobs = new Map<string, Blob>()

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), 150))

const documentos: DocumentStore = {
  pasta: (id) => pastaFuncionario(id, 'DEV'),
  listar: (id) => delay(docs[id] ?? []),
  async enviar(id, file, nome, subpasta) {
    if (nome.toLowerCase().includes('erro')) { await delay(null); throw new Error('Falha simulada ao enviar (mock).') }
    const doc: Documento = { id: `doc-${Date.now()}`, nome, caminho: `/Documentos Compartilhados/${pastaFuncionario(id, 'DEV')}${subpasta ? `/${subpasta}` : ''}/${nome}`, tamanho: file.size, modificadoEm: new Date().toISOString(), mimeType: file.type || null }
    blobs.set(doc.id, file)
    if (!subpasta) docs[id] = [doc, ...(docs[id] ?? [])]
    await new Promise((resolve) => setTimeout(resolve, 600))
    return doc
  },
  async abrir(doc) {
    await delay(null)
    return { nome: doc.nome, blob: blobs.get(doc.id) ?? new Blob([`Arquivo fictício: ${doc.nome}`], { type: 'text/plain' }) }
  },
  async excluir(id, doc) {
    docs[id] = (docs[id] ?? []).filter((item) => item.id !== doc.id)
    await delay(null)
  },
}

export function createMockSource(): DataSource {
  // Cada fonte começa do zero (testes e recarga da página não herdam alterações).
  rows = structuredClone(ROWS0)
  notes = structuredClone(NOTES0)
  docs = structuredClone(DOCS0)
  blobs.clear()
  noteBlobs.clear()
  return {
    mode: 'mock',
    envLabel: 'MOCK',
    list: () => delay(rows),
    get: (id) => {
      const row = rows.find((item) => item.id === id)
      return row ? delay(row) : Promise.reject(new Error('Colaborador não encontrado nos dados de exemplo.'))
    },
    async save(original, draft) {
      const payload = buildPatch(original, draft, context)
      if (!Object.keys(payload).length && original) return original.id
      if ((draft.values.cr40f_nomecompleto as string)?.toLowerCase().includes('erro')) throw new Error('Erro simulado do Dataverse (mock).')
      const id = original?.id ?? `m${Date.now()}`
      const next: Funcionario = { ...(original ?? person(id, '', '', {})), values: { ...draft.values }, veiculo: draft.veiculo }
      rows = original ? rows.map((row) => (row.id === id ? next : row)) : [...rows, next]
      return delay(id)
    },
    async uploadImage(id, field, file) {
      const url = URL.createObjectURL(file)
      rows = rows.map((row) => (row.id === id ? { ...row, ...(field === 'cr40f_foto' ? { fotoThumb: url, fotoUrl: url } : { assinaturaUrl: url }) } : row))
      await delay(null)
    },
    async saveLogins(id, html) {
      rows = rows.map((row) => (row.id === id ? { ...row, loginsesenhas: html } : row))
      await delay(null)
    },
    multas: (id) => delay(id === 'm1' ? [{ id: 'x1', titulo: 'Excesso de velocidade', status: 'Indicada', dataHora: new Date().toISOString(), placa: 'ABC1D23', local: 'Rod. Dutra km 150' }] : []),
    posses: (id) => delay(id === 'm1' ? [{ id: 'p1', veiculo: 'ABC1D23', inicio: '2026-01-10T09:00:00Z', fim: null }, { id: 'p2', veiculo: 'EFG4H56', inicio: '2025-05-01T09:00:00Z', fim: '2026-01-10T08:00:00Z' }] : []),
    anotacoes: (id) => delay(notes[id] ?? []),
    async addAnotacao(id, nota) {
      const anexos: SpAnexo[] = []
      if (nota.arquivo) {
        const doc = await documentos.enviar(id, nota.arquivo, nomeComData(nota.arquivo.name), ANEXOS_SUBPASTA)
        anexos.push({ nome: doc.nome, caminho: doc.caminho, id: doc.id, mime: doc.mimeType, tamanho: doc.tamanho })
      }
      notes[id] = [{ id: String(Date.now()), titulo: nota.titulo, texto: buildNoteHtml(nota.texto, anexos), criadoEm: new Date().toISOString(), modificadoEm: null, autor: 'Você', arquivo: null }, ...(notes[id] ?? [])]
      await delay(null)
    },
    async updateAnotacao(noteId, nota) {
      for (const key of Object.keys(notes)) notes[key] = notes[key].map((item) => (item.id === noteId ? { ...item, titulo: nota.titulo, texto: nota.notetext, modificadoEm: new Date().toISOString() } : item))
      await delay(null)
    },
    async deleteAnotacao(noteId) {
      for (const key of Object.keys(notes)) notes[key] = notes[key].filter((item) => item.id !== noteId)
      await delay(null)
    },
    limitesAnexo: async () => LIMITES_PADRAO,
    anexo: async (noteId) => {
      if (noteId === 'n1') return { nome: 'cnh-renovada.png', blob: await (await fetch(PIXEL)).blob() }
      const blob = noteBlobs.get(noteId)
      return blob ? { nome: (blob as File).name ?? 'anexo', blob } : { nome: 'toxicologico-2026.txt', blob: new Blob(['Arquivo fictício do modo mock.'], { type: 'text/plain' }) }
    },
    documentos,
    searchVeiculos: (query) => delay(veiculos.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))),
    openForm: (entityName, id) => console.info('[mock] openForm', entityName, id),
  }
}
