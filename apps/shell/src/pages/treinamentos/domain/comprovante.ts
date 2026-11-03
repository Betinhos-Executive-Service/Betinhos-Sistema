import { parseSignature, type SignatureStrokes } from '../../comunicados/domain/comunicados'
import { formatDate, plural, type Participacao, type Treinamento } from './treinamentos'

export type DadosComprovante = {
  arquivo: string // "comprovante-<slug-do-titulo>-<slug-do-nome>.pdf"
  titulo: string
  funcionario: string
  publicadoEm: string
  concluidoEm: string
  abertoEm: string
  confirmadoEm: string
  assinadoEm: string
  nota: string // "85% · aprovado · 2 tentativas" ou ""
  versao: 'lida' | 'atual' // 'atual' quando não há snapshot (concluiu antes desta mudança)
  aviso: string // texto para 'atual'; vazio para 'lida'
  descricao: string
  conteudo: string
  videoUrl: string
  anexos: string[]
  hash: string
  assinatura: SignatureStrokes // [] sem assinatura
  nomeAssinante: string
}

type Snapshot = { titulo?: string; descricao?: string; conteudo?: string; videoUrl?: string; anexos?: { nome?: string }[] }

const slug = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

function lerSnapshot(json: string): Snapshot | null {
  try {
    const v = JSON.parse(json) as Snapshot
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

/** Dados do comprovante individual: a versão que o funcionário leu (snapshot gravado ao concluir) ou, sem snapshot, o conteúdo atual com aviso. */
export function dadosComprovante(item: Treinamento, p: Participacao, nomeFuncionario: string): DadosComprovante {
  if (!p.concluidoEm) throw new Error('Só participação concluída tem comprovante.')
  const snap = p.conteudoSnapshot ? lerSnapshot(p.conteudoSnapshot) : null
  const fonte = snap ?? { titulo: item.titulo, descricao: item.descricao, conteudo: item.conteudo, videoUrl: item.videoUrl, anexos: item.anexos }
  const titulo = String(fonte.titulo ?? item.titulo)
  return {
    arquivo: `comprovante-${slug(titulo)}-${slug(nomeFuncionario)}.pdf`,
    titulo,
    funcionario: nomeFuncionario,
    publicadoEm: formatDate(item.publicadoEm),
    concluidoEm: formatDate(p.concluidoEm),
    abertoEm: formatDate(p.abertoEm),
    confirmadoEm: formatDate(p.confirmadoEm),
    assinadoEm: formatDate(p.assinadoEm),
    nota: p.nota == null ? '' : `${p.nota}% · ${p.aprovado ? 'aprovado' : 'reprovado'} · ${p.tentativas} ${plural(p.tentativas, 'tentativa', 'tentativas')}`,
    versao: snap ? 'lida' : 'atual',
    aviso: snap ? '' : 'Concluído antes do registro da versão lida: este comprovante mostra o conteúdo atual do treinamento.',
    descricao: String(fonte.descricao ?? ''),
    conteudo: String(fonte.conteudo ?? ''),
    videoUrl: String(fonte.videoUrl ?? ''),
    anexos: (fonte.anexos ?? []).map((a) => String(a?.nome ?? '')).filter(Boolean),
    hash: snap ? p.conteudoHash : '',
    assinatura: p.assinaturaJson ? parseSignature(p.assinaturaJson) : [],
    nomeAssinante: p.nomeAssinante,
  }
}
