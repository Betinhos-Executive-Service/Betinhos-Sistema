#!/usr/bin/env bash
# Decide o que o CI precisa rodar a partir dos arquivos do PR. Grava em $GITHUB_OUTPUT:
#   shell=true|false       testes e typecheck do shell
#   plugins=<lista>|todos  plugins tocados, em minúsculas (frota,acesso,driverrecordsharing,autonumberguard); vazio = nenhum
#   acompanhar=true|false  Worker acompanhar-motorista
# Fora de PR (manual ou workflow_call, sem $PR) roda tudo. Usado pelo job "mudancas" e por cada job "shell" do ci.yml
# (o shell decide sozinho para não esperar outro job antes de começar).
# Teste local: ARQUIVOS=$'apps/shell/x.ts\nREADME.md' GITHUB_OUTPUT=/dev/stdout bash .github/scripts/ci-mudancas.sh
set -euo pipefail

saida="${GITHUB_OUTPUT:-/dev/stdout}"
resumo="${GITHUB_STEP_SUMMARY:-/dev/null}"

if [ -z "${ARQUIVOS+x}" ]; then
  if [ -z "${PR:-}" ]; then
    { echo "shell=true"; echo "plugins=todos"; echo "acompanhar=true"; } >> "$saida"
    exit 0
  fi
  ARQUIVOS=$(gh api --paginate "repos/$REPO/pulls/$PR/files" --jq '.[] | .filename, (.previous_filename // empty)')
fi

# Mexeu no próprio CI (workflow, este script ou o preparo do pnpm): roda tudo.
ci='^\.github/(workflows/ci\.yml|scripts/ci-mudancas\.sh|actions/preparar-pnpm/)'
# Dependências e configuração da raiz: valem para todo pacote Node.
raiz='^(pnpm-lock\.yaml|pnpm-workspace\.yaml|package\.json|tsconfig\.base\.json|\.npmrc)$'

# Plugins tocados (código, testes, registrador ou script de publicação). O AutoNumberGuard mora em
# apps/formulario-geral/power-platform/plugins; PlannerNotifications e QuoteAutoNumberGuard, em packages/planner/power-platform/plugins.
plugins=$(echo "$ARQUIVOS" | sed -nE 's#^packages/plugins/(Cr40f\.([A-Za-z]+)\.Plugin(\.Tests)?|tools/Cr40f\.([A-Za-z]+)\.Registrar|Betinhos\.(DriverRecordSharing|ExpenseUpload)(\.Tests)?)/.*#\2\4\5#p; s#^packages/plugins/scripts/push-([a-z]+)-plugin\.ps1$#\1#p; s#^apps/formulario-geral/power-platform/plugins/(AutoNumberGuard)(\.Tests)?/.*#\1#p; s#^packages/planner/power-platform/plugins/(PlannerNotifications|QuoteAutoNumberGuard)(\.Tests)?/.*#\1#p' | tr 'A-Z' 'a-z' | sort -u | paste -sd, -)
if echo "$ARQUIVOS" | grep -qE "$ci"; then plugins=todos; fi
echo "plugins=$plugins" >> "$saida"

# Worker acompanhar-motorista: o próprio app e o bump-version compartilhado.
if echo "$ARQUIVOS" | grep -qE -e '^(apps/acompanhar-motorista/|packages/deploy/bump-version\.mjs$)' -e "$ci" -e "$raiz"; then
  echo "acompanhar=true" >> "$saida"
else
  echo "acompanhar=false" >> "$saida"
fi

# Shell: o app, os pacotes do workspace que ele importa ou compila (dataverse, app-config e o src dos demais, que entram
# no tsconfig dele) e o que os testes dele leem de fora (fixtures de paridade dos plugins e o catálogo de acessos).
if echo "$ARQUIVOS" | grep -qE -e '^(apps/shell/|packages/(dataverse|app-config)/|packages/[^/]+/src/|packages/plugins/[^/]+/Fixtures/|packages/deploy/acessos/)' -e "$ci" -e "$raiz"; then
  echo "shell=true" >> "$saida"
else
  echo "shell=false" >> "$saida"
  echo "PR sem mudança que afete o shell: testes e typecheck do shell pulados." >> "$resumo"
fi
