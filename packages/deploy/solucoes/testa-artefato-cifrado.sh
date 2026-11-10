#!/usr/bin/env bash
# Testa artefato-cifrado.sh: ida e volta, senha errada, secret ausente e texto claro fora do .enc. Git Bash ou Linux.
set -uo pipefail
script="$(cd "$(dirname "$0")" && pwd)/artefato-cifrado.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
falhas=0
confere() { if [ "$1" = 0 ]; then echo "ok    $2"; else echo "FALHA $2"; falhas=$((falhas+1)); fi }

mkdir -p "$tmp/pacotes/sub"
printf 'conteudo-claro-marcador' > "$tmp/pacotes/BetinhosCore_managed.zip"
printf '[{"solucao":"BetinhosCore"}]' > "$tmp/pacotes/manifesto.json"
printf 'x' > "$tmp/pacotes/sub/a.txt"

PACOTES_SENHA='senha-de-teste-1' bash "$script" cifrar "$tmp/pacotes" "$tmp/out/pacotes.tar.enc" >/dev/null; confere $? 'cifrar sai com 0'
! grep -q 'conteudo-claro-marcador' "$tmp/out/pacotes.tar.enc"; confere $? 'arquivo cifrado nao tem o texto claro'
PACOTES_SENHA='senha-de-teste-1' bash "$script" decifrar "$tmp/out/pacotes.tar.enc" "$tmp/volta" >/dev/null; confere $? 'decifrar sai com 0'
diff -r "$tmp/pacotes" "$tmp/volta" >/dev/null; confere $? 'ida e volta identica (inclui subpasta)'
PACOTES_SENHA='senha-errada' bash "$script" decifrar "$tmp/out/pacotes.tar.enc" "$tmp/errada" >/dev/null 2>&1; [ $? -ne 0 ]; confere $? 'senha errada falha'
saida="$(env -u PACOTES_SENHA bash "$script" cifrar "$tmp/pacotes" "$tmp/out/x.enc" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [ ! -e "$tmp/out/x.enc" ] && grep -q 'PACOTES_SENHA ausente' <<<"$saida"; confere $? 'sem PACOTES_SENHA falha com mensagem clara e nao gera arquivo'

[ $falhas -eq 0 ] && echo "todos os testes do artefato cifrado passaram" || { echo "$falhas falha(s)"; exit 1; }
