#!/usr/bin/env bash
# Confere, depois do `wrangler deploy`, que o Worker no ar mostra a versão publicada e serve os assets.
# Uso: conferir-no-ar.sh <url base do Worker> <versão sem o "v">
# Só lê (curl GET): nunca chama wrangler kv, secret ou delete.
set -u
base="${1:?url base}"
versao="${2:?versão}"
# Um id inexistente devolve a tela "Link expirado" com a versão nova no bootstrap da página.
for _ in 1 2 3 4 5 6; do
  html=$(curl -s "$base/r/CheckDeploy0" || true)
  if printf '%s' "$html" | grep -qF "v$versao "; then break; fi
  sleep 10
done
printf '%s' "$html" | grep -qF "v$versao " || { echo "::error::A página não mostra v$versao depois do deploy."; exit 1; }
test "$(curl -s -o /dev/null -w '%{http_code}' "$base/logo-betinhos.png")" = 200 || { echo "::error::/logo-betinhos.png não respondeu 200."; exit 1; }
echo "acompanhar-motorista v$versao no ar em $base"
