import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Flows do Power Automate que o workflow Deploy publica no DEV quando os arquivos deles mudam.
// Uma entrada por provision-flow-*.ps1: o que o afeta (arquivos), quais flows toca no DEV, os argumentos
// obrigatórios (variáveis FLOW_* do environment `dev` do GitHub) e o preparo anterior (constantes geradas).
// Só atualiza flow que já existe no DEV: flow novo nasce com dono na conta de serviço e não liga
// (ConnectionAuthorizationFailed), então a primeira publicação continua à mão (provision-flow-* do checkout principal).

const script = (nome) => new RegExp(`^packages/deploy/provision-flow-${nome}\\.ps1$`)
const flowsDir = (...nomes) => new RegExp(`^packages/deploy/flows/(${nomes.join('|')})$`)
const NAO_TESTE = '(?!.*\\.test\\.)'

// Fontes que entram nas constantes geradas (dist/ é ignorado pelo git): código de src sem testes e o gerador.
const AGENTES_IA = new RegExp(`^packages/agentes-ia/(src/${NAO_TESTE}[^/]+\\.ts|scripts/gerar-constantes\\.ts)$`)
const despesasIa = (...subpastas) =>
  new RegExp(`^packages/despesas-ia/(src/${NAO_TESTE}([^/]+\\.ts${subpastas.map((s) => `|${s}/[^/]+\\.ts`).join('')})|scripts/gerar-constantes\\.ts)$`)

export const ENTRADAS = [
  { nome: 'agentes-agendado', script: 'provision-flow-agentes-agendado.ps1', flows: ['Flow Agentes | Agendado'], arquivos: [script('agentes-agendado')] },
  { nome: 'agentes-executar', script: 'provision-flow-agentes-executar.ps1', flows: ['Flow Agentes | Executar'], preparo: 'agentes-ia', arquivos: [script('agentes-executar'), AGENTES_IA] },
  {
    nome: 'aniversariantes', script: 'provision-flow-aniversariantes.ps1', flows: ['Pessoas | Aniversariantes do dia'],
    args: [['Remetente', 'FLOW_ANIVERSARIANTES_REMETENTE'], ['Destinatarios', 'FLOW_ANIVERSARIANTES_DESTINATARIOS'], ['EmailAdmin', 'FLOW_EMAIL_ADMIN_AVISOS']],
    arquivos: [script('aniversariantes'), flowsDir('aniversariantes-diario\\.json')],
  },
  { nome: 'avaliacao', script: 'provision-flow-avaliacao.ps1', flows: ['Link | Registrar avaliação'], args: [['EmailOperacao', 'FLOW_AVALIACAO_EMAIL_OPERACAO']], arquivos: [script('avaliacao')] },
  {
    nome: 'aviso-motorista', script: 'provision-flow-aviso-motorista.ps1', flows: ['Flow Aviso Motorista | Enviar', 'Flow Aviso Motorista | Vigia'], apply: true,
    arquivos: [script('aviso-motorista')],
  },
  {
    nome: 'cadastro-passageiro', script: 'provision-flow-cadastro-passageiro.ps1', flows: ['Cadastro do passageiro | Link'], apply: true,
    args: [['SiteUrl', 'FLOW_SHAREPOINT_SITE_URL'], ['BibliotecaId', 'FLOW_CADASTRO_BIBLIOTECA_ID'], ['Pasta', 'FLOW_CADASTRO_PASTA']],
    arquivos: [script('cadastro-passageiro'), flowsDir('cadastro-passageiro-link\\.json')],
  },
  {
    nome: 'conciliacao-cartao', script: 'provision-flow-conciliacao-cartao.ps1', apply: true,
    flows: ['Conciliação do cartão | Diário', 'Conciliação do cartão | Reprocessada', 'Conciliação do cartão | Despesa atualizada'],
    arquivos: [script('conciliacao-cartao'), flowsDir('conciliacao-cartao-diario\\.json', 'conciliacao-cartao-tempo-real\\.mjs')],
  },
  { nome: 'salvar-foto', script: 'provision-flow-salvar-foto.ps1', flows: ['Flow Salvar Foto BD - Onedrive'], apply: true, arquivos: [script('salvar-foto')] },
  { nome: 'consultar-onedrive', script: 'provision-flow-consultar-onedrive.ps1', flows: ['Flow - Consultar Arquivo OneDrive'], arquivos: [script('consultar-onedrive')] },
  {
    nome: 'despesas-conferencia-envio', script: 'provision-flow-despesas-conferencia-envio.ps1', flows: ['Flow Despesas | Conferência no envio'], preparo: 'despesas-ia',
    arquivos: [script('despesas-conferencia-envio'), despesasIa('conferencia-envio')],
  },
  {
    nome: 'despesas-escalada', script: 'provision-flow-despesas-escalada.ps1', flows: ['Flow Despesas | Escalada ao gestor'],
    arquivos: [script('despesas-escalada'), flowsDir('despesas-escalada\\.json')],
  },
  { nome: 'despesas-ia', script: 'provision-flow-despesas-ia.ps1', flows: ['Flow Despesas | Análise IA'], preparo: 'despesas-ia', arquivos: [script('despesas-ia'), despesasIa()] },
  {
    nome: 'despesas-leitura-rapida', script: 'provision-flow-despesas-leitura-rapida.ps1', flows: ['Flow Despesas | Leitura rápida'], preparo: 'despesas-ia',
    arquivos: [script('despesas-leitura-rapida'), despesasIa('leitura-rapida')],
  },
  {
    nome: 'documentos-resumo', script: 'provision-flow-documentos-resumo.ps1', flows: ['Documentos | Resumo semanal'],
    args: [['Remetente', 'FLOW_DOCUMENTOS_REMETENTE'], ['UrlSistema', 'FLOW_DOCUMENTOS_URL_SISTEMA'], ['EmailAdmin', 'FLOW_EMAIL_ADMIN_AVISOS']],
    arquivos: [script('documentos-resumo'), flowsDir('documentos-resumo-semanal\\.json')],
  },
  {
    nome: 'frota-resumo', script: 'provision-flow-frota-resumo.ps1', flows: ['Frota | Resumo semanal'], args: [['Remetente', 'FLOW_FROTA_REMETENTE']],
    arquivos: [script('frota-resumo'), flowsDir('frota-pendencias-semanal\\.json')],
  },
  { nome: 'hodometro', script: 'provision-flow-hodometro.ps1', flows: ['Infleet - Sincronizar hodômetro'], arquivos: [script('hodometro')] },
  {
    nome: 'lembrete-pagamento', script: 'provision-flow-lembrete-pagamento.ps1', flows: ['Flow Enviar Lembrete de Pagamento', 'Flow Gerar Link de Pagamento'],
    arquivos: [script('lembrete-pagamento'), flowsDir('lembrete-pagamento\\.ps1')],
  },
  {
    nome: 'recibo-destinatario', script: 'provision-flow-recibo-destinatario.ps1', flows: ['Flow Enviar Recibo Automático', 'Flow Gerar Recibo Manual'],
    arquivos: [script('recibo-destinatario'), flowsDir('recibo-destinatario\\.mjs')],
  },
  {
    nome: 'portal-cliente-emails', script: 'provision-flow-portal-cliente-emails.ps1', flows: ['Portal cliente – e-mails'], apply: true,
    args: [['CaixaCompartilhada', 'FLOW_PORTAL_CAIXA_COMPARTILHADA']],
    arquivos: [script('portal-cliente-emails'), flowsDir('portal-cliente-emails\\.json', 'portal-cliente-emails/[^/]+\\.html')],
  },
  {
    nome: 'prontuario-anexo', script: 'provision-flow-prontuario-anexo.ps1', flows: ['Prontuário | Anexar pelo Claude'], apply: true,
    args: [['SiteUrl', 'FLOW_SHAREPOINT_SITE_URL']], arquivos: [script('prontuario-anexo'), flowsDir('prontuario-anexar-claude\\.json')],
  },
  { nome: 'resumo-diario', script: 'provision-flow-resumo-diario.ps1', flows: ['Flow Alertas | Resumo diário'], arquivos: [script('resumo-diario')] },
  {
    nome: 'termo-multa', script: 'provision-flow-termo-multa.ps1', apply: true,
    flows: ['Termo de multa | Cópia ao motorista', 'Termo de multa | Expirar pendentes', 'Termo de multa | Lembrete diário', 'Termo de multa | Aviso ao gestor'],
    arquivos: [script('termo-multa')],
  },
]

// arquivos: lista do git diff --name-only desde a tag flows-dev-publicado. null = sem base: nada pendente.
export function entradasPendentes(arquivos) {
  if (arquivos == null) return []
  const lista = arquivos.map((a) => a.trim()).filter(Boolean)
  return ENTRADAS.filter((e) => lista.some((a) => e.arquivos.some((r) => r.test(a))))
}

// forcar: "todos" ou nomes separados por vírgula (input forcar_flows do workflow_dispatch).
export function entradasForcadas(forcar) {
  const pedidos = String(forcar ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (pedidos.includes('todos')) return [...ENTRADAS]
  const desconhecidos = pedidos.filter((p) => !ENTRADAS.some((e) => e.nome === p))
  if (desconhecidos.length) throw new Error(`Flow desconhecido em forcar_flows: ${desconhecidos.join(', ')}`)
  return ENTRADAS.filter((e) => pedidos.includes(e.nome))
}

export function descrever(nomes) {
  return nomes.map((n) => {
    const e = ENTRADAS.find((x) => x.nome === n)
    if (!e) throw new Error(`Flow desconhecido: ${n}`)
    return { nome: e.nome, script: e.script, flows: e.flows, apply: !!e.apply, args: (e.args ?? []).map(([flag, variavel]) => ({ flag, variavel })) }
  })
}

export const preparosDe = (entradas) => [...new Set(entradas.map((e) => e.preparo).filter(Boolean))].sort()

// Uso: git diff --name-only A B | node flows-dev.mjs [--github]   → pendentes pelos arquivos
//      node flows-dev.mjs --sem-base [--github]                    → nada pendente
//      node flows-dev.mjs --forcar nome1,nome2|todos [--github]    → os pedidos à mão
//      node flows-dev.mjs --descrever nome1,nome2                  → JSON com script, flows e args de cada um
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const valor = (flag) => args[args.indexOf(flag) + 1]
  if (args.includes('--descrever')) {
    console.log(JSON.stringify(descrever(valor('--descrever').split(',').filter(Boolean))))
  } else {
    const pendentes = args.includes('--forcar')
      ? entradasForcadas(valor('--forcar'))
      : entradasPendentes(args.includes('--sem-base') ? null : readFileSync(0, 'utf8').split('\n'))
    const r = { flows: pendentes.map((e) => e.nome), preparos: preparosDe(pendentes) }
    console.log(args.includes('--github') ? `flows=${r.flows.join(',')}\npreparos=${r.preparos.join(',')}` : JSON.stringify(r))
  }
}
