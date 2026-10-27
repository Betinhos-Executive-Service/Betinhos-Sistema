// No Tela Planner a versão era própria ("v0.1.622 26/10/2026"). No shell, o Planner usa a versão de build
// do Sistema Betinhos, no mesmo formato "vX.Y.Z dd/mm/aaaa" (America/Sao_Paulo).
function buildDay(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export const APP_VERSION = `v${__APP_VERSION__} ${buildDay(__BUILD_DATE__)}`.trim()
