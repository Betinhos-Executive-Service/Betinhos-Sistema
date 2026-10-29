import type { LogApp } from './data'
import { formatPayload, quemFoi, severidadeLabel } from './lista'

/** Onde está o código de cada app que grava em new_appmotoristaslog. App desconhecido cai na dica genérica. */
const REPOS: Record<string, string> = {
  'App Motoristas': 'repositório App Motoristas (React + Vite, publicado como WebResource `new_app-motoristas-v2`; plugins C# em `plugins/DriverRecordSharing`)',
  'Sistema Betinhos': 'repositório Betinhos-Sistema, pasta `apps/shell` (shell React publicado como WebResource `cr40f_SistemaBetinhos.html`)',
  'Escala FDS': 'repositório Betinhos-Sistema, pasta `apps/escala-fds`',
  'Tela Formulario Geral': 'repositório Tela Formulário Geral (WebResource `new_formulario_geral.html`)',
}
const LIMITE = 8000

const dataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmt = (d: Date | null) => (d ? `${dataHora.format(d).replace(',', '')} (America/Sao_Paulo)` : 'sem data')
const corta = (s: string) => (s.length > LIMITE ? `${s.slice(0, LIMITE)}\n… [cortado: ${s.length - LIMITE} caracteres a mais]` : s)

/** Mesmo erro = mesmo app, mesmo nome de erro e mesma mensagem. */
export const mesmoErro = (a: LogApp, b: LogApp) => a.app === b.app && a.erro === b.erro && a.mensagem === b.mensagem

export type Recorrencia = { total: number; usuarios: number; versoes: string[]; telas: string[]; primeira: Date | null; ultima: Date | null }

/** Quantas vezes o mesmo erro aparece entre os logs carregados (o período da tela). */
export function recorrencia(log: LogApp, list: LogApp[]): Recorrencia {
  const iguais = list.filter((l) => mesmoErro(l, log))
  if (!iguais.some((l) => l.id === log.id)) iguais.push(log)
  const tempos = iguais.map((l) => l.data?.getTime()).filter((t): t is number => t != null)
  const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
  return {
    total: iguais.length,
    usuarios: unicos(iguais.map(quemFoi)).length,
    versoes: unicos(iguais.map((l) => l.versao)),
    telas: unicos(iguais.map((l) => l.tela)),
    primeira: tempos.length ? new Date(Math.min(...tempos)) : null,
    ultima: tempos.length ? new Date(Math.max(...tempos)) : null,
  }
}

const linha = (rotulo: string, valor: string | null | undefined) => (valor ? `- **${rotulo}:** ${valor}` : null)
const bloco = (titulo: string, lang: string, texto: string) => (texto ? `### ${titulo}\n\`\`\`${lang}\n${corta(texto)}\n\`\`\`` : null)

/** Prompt pronto para colar no Claude Code: contexto, dados do erro, recorrência e o que fazer. */
export function promptCorrecao(log: LogApp, rec: Recorrencia, periodo: string): string {
  const onde = REPOS[log.app] ?? `identifique o repositório pelo nome do app (“${log.app || 'sem nome'}”) e pela URL abaixo`
  const titulo = log.erro && log.mensagem ? `${log.erro}: ${log.mensagem}` : log.mensagem || log.erro || 'erro sem mensagem'
  const partes = [
    `# Corrigir erro no ${log.app || 'app'}: ${titulo.slice(0, 160)}`,
    `Este erro foi registrado pelo logger compartilhado do Design System (\`@betinhos/ui/error-logger\`) na tabela \`new_appmotoristaslog\` do Dataverse da Betinhos. Investigue a causa raiz e corrija.`,
    `## Onde está o código\n${onde}. Trabalhe a partir da \`main\` atualizada, em branch própria. Confira se a versão \`${log.versao || 'desconhecida'}\` ainda é a publicada; se já houver correção na \`main\`, diga qual commit resolve e pare.`,
    ['## Dados do erro',
      linha('Severidade', severidadeLabel(log.severidade)),
      linha('Quando', fmt(log.data)),
      linha('App e versão', [log.app, log.versao].filter(Boolean).join(' ')),
      linha('Tela / rota', log.tela),
      linha('Tipo do erro', log.erro),
      linha('Mensagem', log.mensagem),
      linha('Código', log.codigo),
      linha('Origem', log.origem),
      linha('Componente', log.componente),
      linha('Ação / fase', [log.acao, log.fase].filter(Boolean).join(' / ')),
      linha('Usuário', [log.usuario, log.email].filter(Boolean).join(' · ')),
      linha('Plataforma', log.plataforma),
      linha('Conexão', log.offline == null ? '' : log.offline ? 'sem internet no momento do erro' : 'online'),
      linha('URL', log.url),
      linha('Sessão', log.sessao),
      linha('ID do log', log.id),
    ].filter(Boolean).join('\n'),
    [`## Recorrência (${periodo.toLowerCase()})`,
      `- ${rec.total} ${rec.total === 1 ? 'ocorrência' : 'ocorrências'} do mesmo erro, ${rec.usuarios} ${rec.usuarios === 1 ? 'usuário' : 'usuários'}`,
      linha('Versões', rec.versoes.join(', ')),
      linha('Telas', rec.telas.join(', ')),
      `- **Primeira / última:** ${fmt(rec.primeira)} / ${fmt(rec.ultima)}`,
    ].filter(Boolean).join('\n'),
    bloco('Stack', '', log.stack),
    bloco('Payload', 'json', formatPayload(log.payload)),
    `## O que fazer
1. Localize no código o ponto que gera este erro (stack, componente, ação e tela acima) e explique a causa raiz antes de mudar algo.
2. Reproduza: escreva um teste que falhe com estes dados (ou descreva o passo a passo, se depender do Dataverse) antes de corrigir.
3. Corrija a causa. Não esconda o erro só para sumir do log (catch vazio, filtro no logger) — se o erro for esperado (ex.: sem internet, imagem que não existe), trate a situação na tela e registre com a severidade certa.
4. Rode typecheck e testes, verifique a tela afetada (local em modo mock e, se depender de dados, no DEV) e junte as evidências.
5. Abra um PR com a causa, a correção e as provas. Não publique em PROD.`,
    `## Observações
- Valores marcados como \`[redacted…]\` foram ocultados pelo logger (e-mail, telefone, links assinados); não tente recuperá-los.
- Dataverse DEV pode ser consultado só para leitura; PROD é somente leitura.`,
  ]
  return partes.filter(Boolean).join('\n\n')
}
