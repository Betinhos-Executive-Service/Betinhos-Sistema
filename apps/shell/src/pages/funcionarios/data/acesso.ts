import type { Host } from '../../../host'
import { whatsappHref } from '../../operacional/domain/phone'
import { createAcessoMock } from './acessoMock'
import { errorMessage } from './xrm'

export type Etapa = { etapa: string; estado: 'feita' | 'pulada' | 'pendente' | 'erro'; detalhe: string }
export type Fluxo = 'cadastro' | 'reativar' | 'encerrar'
export type CadastroInput = { nomeCompleto: string; celular: string; emailPessoal?: string; prefixoEmail?: string; tipoVinculo: 0 | 1; funcionarioId?: string }
export type AcessoInicial = { funcionarioId: string; nomeCompleto: string; celular: string }
export type CadastroResultado = { emailMicrosoft: string; senhaTemporaria: string; funcionarioId: string; linkApp: string; etapas: Etapa[] }
/** Reativação: a senha é sempre nova (a anterior foi descartada ao encerrar). */
export type ReativacaoResultado = { emailMicrosoft: string; senhaTemporaria: string; linkApp: string; etapas: Etapa[] }

export interface AcessoSource {
  cadastrar(input: CadastroInput): Promise<CadastroResultado>
  encerrar(funcionarioId: string, confirmacao: string): Promise<Etapa[]>
  reativar(funcionarioId: string): Promise<ReativacaoResultado>
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
  FUNCIONARIO_SEM_EMAIL: 'Este funcionário não tem e-mail Microsoft; use "Cadastrar acesso".',
  CONFIRMACAO_INVALIDA: 'O nome digitado não confere.',
  ACESSO_ENCERRADO: 'Acesso encerrado antes. Use "Reativar acesso" na ficha do funcionário.',
  CONTA_NAO_EXISTE: 'A conta Microsoft não existe mais; cadastre o acesso de novo.',
  SEM_PERMISSAO_SENHA: 'Falta a permissão User-PasswordProfile.ReadWrite.All no app do Graph.',
  USUARIO_DATAVERSE_PENDENTE: 'A conta foi criada, mas o Dataverse ainda não a reconhece. Tente de novo em alguns minutos.',
}

/** Rótulos humanos por fluxo; etapas fora do mapa (validação, confirmação) não aparecem para o usuário. */
export const ETAPAS: Record<Fluxo, Record<string, string>> = {
  cadastro: { usuario: 'Criando a conta', licenca: 'Liberando a licença', grupo: 'Incluindo no grupo de motoristas', systemuser: 'Liberando no Dataverse', funcionario: 'Vinculando à ficha' },
  reativar: { usuario: 'Encontrando a conta', conta: 'Desbloqueando a conta', licenca: 'Liberando a licença', grupo: 'Incluindo no grupo de motoristas', systemuser: 'Liberando no Dataverse', senha: 'Gerando a senha nova' },
  encerrar: { licenca: 'Removendo a licença', conta: 'Bloqueando a conta Microsoft', grupo: 'Tirando do grupo de motoristas' },
}

/** Resumo depois de concluído: particípio ("Licença removida"); o gerúndio fica só no progresso. */
export const ETAPAS_FEITAS: Record<Fluxo, Record<string, string>> = {
  cadastro: { usuario: 'Conta criada', licenca: 'Licença liberada', grupo: 'Incluído no grupo de motoristas', systemuser: 'Liberado no Dataverse', funcionario: 'Vinculado à ficha' },
  reativar: { usuario: 'Conta encontrada', conta: 'Conta desbloqueada', licenca: 'Licença liberada', grupo: 'Incluído no grupo de motoristas', systemuser: 'Liberado no Dataverse', senha: 'Senha nova gerada' },
  encerrar: { licenca: 'Licença removida', conta: 'Conta bloqueada', grupo: 'Retirado do grupo de motoristas' },
}

export const ESTADO_ETAPA: Record<Etapa['estado'], string> = { feita: '', pulada: 'já estava pronto', pendente: 'em andamento', erro: 'não concluído' }

/** O systemuser não ficou pronto a tempo: o acesso existe e o Dataverse libera em instantes. */
export const liberacaoPendente = (etapas: Etapa[]) => etapas.some((e) => e.etapa === 'systemuser' && e.estado === 'pendente')

export const MSG_PENDENTE = "Conta criada. O Dataverse ainda está liberando o acesso; isto conclui sozinho em alguns minutos. Se fechar antes, use 'Concluir liberação' na ficha ou cadastre de novo com os mesmos dados."
/** As tentativas automáticas acabaram (~3 min) sem o Dataverse liberar. */
export const MSG_PENDENTE_DEMORADA = "Conta criada. O Dataverse está demorando para liberar o acesso. Abra a ficha e use 'Concluir liberação' em alguns minutos."

export class AcessoError extends Error {
  constructor(public codigo: string, message: string, public etapas: Etapa[]) { super(message); this.name = 'AcessoError' }
}

/** Mensagens do plugin chegam como "CODIGO: texto | etapas=[...]" (às vezes embrulhadas pelo Dataverse). */
export function parseAcessoError(error: unknown): AcessoError {
  if (error instanceof AcessoError) return error
  const raw = errorMessage(error)
  const m = /([A-Z_]{4,}): ([^|]*)/.exec(raw)
  if (!m) return new AcessoError('DESCONHECIDO', raw, [])
  const inicio = raw.indexOf('| etapas=', m.index)
  const json = inicio < 0 ? null : primeiroArray(raw, inicio + '| etapas='.length)
  return new AcessoError(m[1], MENSAGENS[m[1]] ?? m[2].trim(), json ? parseEtapas(json) : [])
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
    ...(r.senhaTemporaria ? [`• Senha: ${r.senhaTemporaria}`] : []),
    '',
    'Abra o link no navegador do celular e entre com o e-mail e a senha acima.',
    'Se der erro de acesso, aguarde 5 minutos e tente de novo.',
  ].join('\n')
}

export function whatsappComMensagem(celular: string, texto: string) {
  const href = whatsappHref(celular)
  return href ? `${href}?text=${encodeURIComponent(texto)}` : null
}

function parseEtapas(json: string): Etapa[] {
  try { return JSON.parse(json) as Etapa[] } catch { return [] }
}

type Resposta = { EmailMicrosoft: string; SenhaTemporaria: string; FuncionarioId: string; LinkApp: string; Etapas: string }

export function createAcessoSource(host: Host): AcessoSource {
  if (host.mode === 'mock') return createAcessoMock()
  const { client } = host
  const chamar = async <T,>(nome: string, body: Record<string, unknown>) => {
    try { return await client.request<T>(nome, { method: 'POST', body: JSON.stringify(body) }) } catch (error) { throw parseAcessoError(error) }
  }
  return {
    async cadastrar(input) {
      const body: Record<string, unknown> = { NomeCompleto: input.nomeCompleto, Celular: input.celular, TipoVinculo: input.tipoVinculo }
      if (input.emailPessoal) body.EmailPessoal = input.emailPessoal
      if (input.prefixoEmail) body.PrefixoEmail = input.prefixoEmail
      if (input.funcionarioId) body.FuncionarioId = input.funcionarioId
      const r = await chamar<Resposta>('cr40f_CadastrarAcessoMotorista', body)
      return { emailMicrosoft: r.EmailMicrosoft, senhaTemporaria: r.SenhaTemporaria, funcionarioId: r.FuncionarioId, linkApp: r.LinkApp, etapas: parseEtapas(r.Etapas) }
    },
    async encerrar(funcionarioId, confirmacao) {
      const r = await chamar<{ Etapas: string }>('cr40f_EncerrarAcessoMotorista', { FuncionarioId: funcionarioId, Confirmacao: confirmacao })
      return parseEtapas(r.Etapas)
    },
    async reativar(funcionarioId) {
      const r = await chamar<Resposta>('cr40f_ReativarAcessoMotorista', { FuncionarioId: funcionarioId })
      return { emailMicrosoft: r.EmailMicrosoft, senhaTemporaria: r.SenhaTemporaria, linkApp: r.LinkApp, etapas: parseEtapas(r.Etapas) }
    },
  }
}
