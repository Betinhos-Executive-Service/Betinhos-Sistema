// Faixa fixa no topo que avisa em que ambiente a tela está (DEV, TEST, LOCAL). No PROD, e em host desconhecido, não aparece:
// só hosts conhecidos ligam a faixa. Fica fora do React para continuar visível mesmo se a árvore quebrar.
import './faixaAmbiente.css'

export type Ambiente = 'DEV' | 'TEST' | 'LOCAL'

const HOSTS: Record<string, Ambiente> = {
  'org23b93544.crm2.dynamics.com': 'DEV',
  'cpq--samcrmlivesg624.crm2.dynamics.com': 'DEV',
  'appbetinhostest.crm2.dynamics.com': 'TEST',
  localhost: 'LOCAL',
  '127.0.0.1': 'LOCAL',
}

const TEXTO: Record<Ambiente, string> = {
  DEV: 'DEV · ambiente de desenvolvimento',
  TEST: 'TEST · ambiente de testes',
  LOCAL: 'LOCAL · dados de teste (mock)',
}

export function ambienteDoHost(hostname: string): Ambiente | null {
  return HOSTS[hostname.toLowerCase()] ?? null
}

export function instalarFaixaAmbiente(doc: Document = document, hostname = location.hostname): Ambiente | null {
  const ambiente = ambienteDoHost(hostname)
  if (!ambiente || doc.getElementById('faixa-ambiente')) return ambiente
  const faixa = doc.createElement('div')
  faixa.id = 'faixa-ambiente'
  faixa.className = `faixa-ambiente faixa-ambiente--${ambiente.toLowerCase()}`
  faixa.setAttribute('role', 'status')
  faixa.textContent = TEXTO[ambiente]
  doc.documentElement.append(faixa)
  doc.documentElement.dataset.ambiente = ambiente
  return ambiente
}
