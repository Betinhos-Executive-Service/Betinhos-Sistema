#!/usr/bin/env bash
# Confere, depois do deploy, que o portal no ar mostra a versão publicada e que /api/* chega ao Worker.
# Uso: conferir-no-ar.sh <url base do portal> <versão sem o "v">
# Só lê (curl GET): nunca chama wrangler kv, secret ou delete.
set -u
base="${1:?url base}"
versao="${2:?versão}"
for _ in 1 2 3 4 5 6 7 8; do
  html=$(curl -s "$base/" || true)
  if printf '%s' "$html" | grep -qF "name=\"portal-versao\" content=\"$versao\""; then break; fi
  sleep 10
done
printf '%s' "$html" | grep -qF "name=\"portal-versao\" content=\"$versao\"" || { echo "::error::A página não mostra v$versao depois do deploy."; exit 1; }
# Sem sessão, o Worker responde 401 (o Pages sozinho devolveria a página do app ou 404).
codigo=$(curl -s -o /dev/null -w '%{http_code}' "$base/api/pedidos")
test "$codigo" = 401 || { echo "::error::/api/pedidos devolveu $codigo (esperado 401 do Worker)."; exit 1; }
echo "portal v$versao no ar em $base"
