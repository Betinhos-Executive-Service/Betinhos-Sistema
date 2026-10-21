# Índice de verificação — Sistema Betinhos
- verificar-shell | apps/shell/**, packages/dataverse/**, packages/deploy/**, packages/agentes-ia/** | Typecheck, testes e telas do shell no DEV (listas, OPs, Geral, WebResources com host=shell)
- verificar-plugins | packages/plugins/** | Testes dos plugins C# (Financeiro, Documentos, Frota), paridade da frota com o shell, simulação do valor da OP, publicação no DEV
- verificar-ambiente-cloud | scripts/cloud-setup.sh, scripts/testa-cloud-setup.sh, .claude/hooks/session-start.sh, .claude/settings.json, .gitignore (.claude/), .npmrc | Hook SessionStart que prepara a VM cloud do Claude Code (Node 24, pnpm, deps, Chromium, typecheck)
- verificar-plantao | scripts/plantao/**, packages/deploy/criar-identidade-plantao.ps1 | Coletor e mascaramento do plantão de erros, identidade só-leitura
- verificar-deploy-dev | .github/workflows/deploy.yml, packages/deploy/bump-version.mjs, packages/deploy/push-dev.ps1 | Workflow Deploy: push em dev publica a tela no DEV (só DEV, barato)
- verificar-solucoes | packages/deploy/solucoes/** | Segmentação da AppBetinhos em 4 soluções: testes Node e PowerShell, conferência de dono/dependências e fotos do DEV sem perda (só DEV)
<!-- Sem roteiro ainda: apps/escala-fds/**, packages/despesas-ia/** -->
