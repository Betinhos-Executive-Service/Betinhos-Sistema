import type { Host } from '../../../host'
import { phoneDigits } from '../../operacional/domain/phone'
import { createAcessoMock } from './acessoMock'

export type Etapa = { etapa: string; estado: 'feita' | 'pulada' | 'erro'; detalhe: string }
export type CadastroInput = { nomeCompleto: string; celular: string; emailPessoal?: string; prefixoEmail?: string; tipoVinculo: 0 | 1; funcionarioId?: string }
export type CadastroResultado = { emailMicrosoft: string; senhaTemporaria: string; funcionarioId: string; linkApp: string; etapas: Etapa[] }

export interface AcessoSource {
  cadastrar(input: CadastroInput): Promise<CadastroResultado>
  encerrar(funcionarioId: string, confirmacao: string): Promise<Etapa[]>
}

export const MENSAGENS: Record<string, string> = {
  NOME_INVALIDO: 'Informe nome e sobrenome.',
  CELULAR_INVALIDO: 'Informe um celular com DDD (11 dígitos).',
  EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO: 'Esse e-mail já pertence a outro funcionário. Ajuste o prefixo.',
  SEM_LICENCA_DISPONIVEL: 'Não há licença livre no plano configurado. Libere uma licença no Microsoft 365 e tente de novo.',
  GRAPH_INDISPONIVEL: 'O Microsoft 365 não respondeu. O que já foi feito está marcado; tente de novo em instantes.',
  CONFIG_AUSENTE: 'O plugin de acesso está sem configuração. Avise a TI.',
  SEM_PERMISSAO: 'Você não tem permissão para gerir acessos.',
  FUNCIONARIO_NAO_ENCONTRADO: 'Funcionário não encontrado.',
  FUNCIONARIO_SEM_EMAIL: 'Este funcionário não tem e-mail Microsoft; não há acesso a encerrar.',
  CONFIRMACAO_INVALIDA: 'O nome digitado não confere.',
  ACESSO_ENCERRADO: 'Acesso encerrado antes. Peça à TI para reativar a conta no Entra.',
}

export class AcessoError extends Error {
  constructor(public codigo: string, message: string, public etapas: Etapa[]) { super(message); this.name = 'AcessoError' }
}

/** Mensagens do plugin chegam como "CODIGO: texto | etapas=[...]" (às vezes embrulhadas pelo Dataverse). */
export function parseAcessoError(error: unknown): AcessoError {
  if (error instanceof AcessoError) return error
  const raw = error instanceof Error ? error.message : String(error)
  const m = /([A-Z_]{4,}): ([^|]*)/.exec(raw)
  if (!m) return new AcessoError('DESCONHECIDO', raw.replace(/\.+$/, ''), [])
  let etapas: Etapa[] = []
  const inicio = raw.indexOf('| etapas=', m.index)
  const json = inicio < 0 ? null : primeiroArray(raw, inicio + '| etapas='.length)
  try { etapas = json ? (JSON.parse(json) as Etapa[]) : [] } catch { etapas = [] }
  return new AcessoError(m[1], MENSAGENS[m[1]] ?? m[2].trim(), etapas)
}

/** Primeiro array JSON balanceado a partir de `de` (ignora colchetes dentro de strings); o Dataverse anexa texto depois. */
function primeiroArray(texto: string, de: number): string | null {
  if (texto[de] !== '[') return null
  let nivel = 0
  let emString = false
  for (let i = de; i < texto.length; i++) {
    const c = texto[i]
    if (emString) { if (c === '\\') i++; else if (c === '"') emString = false; continue }
    if (c === '"') emString = true
    else if (c === '[') nivel++
    else if (c === ']' && --nivel === 0) return texto.slice(de, i + 1)
  }
  return null
}

export function mensagemWhatsApp(r: { nome: string; emailMicrosoft: string; senhaTemporaria: string; linkApp: string }) {
  const primeiro = r.nome.trim().split(/\s+/)[0]
  return [
    '*Acesso ao App Motoristas*',
    '',
    `Olá, ${primeiro}. Seu acesso está pronto.`,
    '',
    `• Link: ${r.linkApp}`,
    `• E-mail: ${r.emailMicrosoft}`,
    `• Senha temporária: ${r.senhaTemporaria}`,
    '',
    'Abra o link no navegador do celular, entre com o e-mail e troque a senha no primeiro acesso.',
    'Se der erro de acesso, aguarde 5 minutos e tente de novo.',
  ].join('\n')
}

export function whatsappComMensagem(celular: string, texto: string) {
  const digits = phoneDigits(celular)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(texto)}` : null
}

type Resposta = { EmailMicrosoft: string; SenhaTemporaria: string; FuncionarioId: string; LinkApp: string; Etapas: string }

export function createAcessoSource(host: Host): AcessoSource {
  if (host.mode === 'mock') return createAcessoMock()
  const { client } = host
  const chamar = async <T,>(nome: string, body: Record<string, unknown>) => {
    try { return await client.request<T>(nome, { method: 'POST', body: JSON.stringify(body) }) } catch (error) { throw parseAcessoError(error) }
  }
  const etapas = (json: string): Etapa[] => { try { return JSON.parse(json) as Etapa[] } catch { return [] } }
  return {
    async cadastrar(input) {
      const body: Record<string, unknown> = { NomeCompleto: input.nomeCompleto, Celular: input.celular, TipoVinculo: input.tipoVinculo }
      if (input.emailPessoal) body.EmailPessoal = input.emailPessoal
      if (input.prefixoEmail) body.PrefixoEmail = input.prefixoEmail
      if (input.funcionarioId) body.FuncionarioId = input.funcionarioId
      const r = await chamar<Resposta>('cr40f_CadastrarAcessoMotorista', body)
      return { emailMicrosoft: r.EmailMicrosoft, senhaTemporaria: r.SenhaTemporaria, funcionarioId: r.FuncionarioId, linkApp: r.LinkApp, etapas: etapas(r.Etapas) }
    },
    async encerrar(funcionarioId, confirmacao) {
      const r = await chamar<{ Etapas: string }>('cr40f_EncerrarAcessoMotorista', { FuncionarioId: funcionarioId, Confirmacao: confirmacao })
      return etapas(r.Etapas)
    },
  }
}
