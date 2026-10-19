# Índice de verificação — Sistema Betinhos
- verificar-shell | apps/shell/**, packages/dataverse/**, packages/deploy/** | Typecheck, testes e telas do shell no DEV (listas, OPs, Geral, WebResources com host=shell)
- verificar-plugins | packages/plugins/** | Testes dos plugins C#, simulação e carga do valor da OP, publicação no DEV
- verificar-ambiente-cloud | scripts/cloud-setup.sh, scripts/testa-cloud-setup.sh, .claude/hooks/session-start.sh, .claude/settings.json, .gitignore (.claude/), .npmrc | Hook SessionStart que prepara a VM cloud do Claude Code (Node 24, pnpm, deps, Chromium, typecheck)
<!-- Sem roteiro ainda: apps/escala-fds/**, packages/agentes-ia/**, packages/despesas-ia/** -->
