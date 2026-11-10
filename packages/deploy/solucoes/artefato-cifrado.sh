#!/usr/bin/env bash
# Cifra e decifra pastas que levam pacote de solucao ou backup do Dataverse antes de virar artefato ou cache do GitHub
# (repositorio publico: qualquer conta baixa artefatos, e PR de fork le caches da branch padrao).
# AES-256-CBC com chave derivada por PBKDF2 (200000 iteracoes) da senha em PACOTES_SENHA (secret do repositorio).
#   artefato-cifrado.sh cifrar   <pasta> <saida.enc>
#   artefato-cifrado.sh decifrar <entrada.enc> <pasta>
set -euo pipefail
acao="${1:-}"; origem="${2:-}"; destino="${3:-}"
if [ -z "${PACOTES_SENHA:-}" ]; then
  echo "::error::Secret PACOTES_SENHA ausente. Crie em Settings > Secrets and variables > Actions > Repository secrets (senha longa e aleatoria). Nada foi enviado nem decifrado."
  exit 1
fi
cifra=(openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:PACOTES_SENHA)
case "$acao" in
  cifrar)
    [ -d "$origem" ] || { echo "::error::pasta $origem nao existe"; exit 1; }
    mkdir -p "$(dirname "$destino")"
    tar -cf - -C "$origem" . | "${cifra[@]}" -salt -out "$destino"
    ;;
  decifrar)
    [ -f "$origem" ] || { echo "::error::arquivo $origem nao existe"; exit 1; }
    mkdir -p "$destino"
    "${cifra[@]}" -d -in "$origem" | tar -xf - -C "$destino"
    ;;
  *) echo "uso: $0 cifrar <pasta> <saida.enc> | decifrar <entrada.enc> <pasta>"; exit 2 ;;
esac
