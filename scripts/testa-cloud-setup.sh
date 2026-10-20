#!/usr/bin/env bash
# Teste do cloud-setup.sh num Linux limpo (WSL): instalação limpa, 2ª execução (idempotência),
# caso sem token e vazamento de token nos logs. Uso (dentro do WSL, como root): testa-cloud-setup.sh <repo.tar>
set -u
SRC_TAR="$1"
rm -rf /root/sb /root/sbhome && mkdir -p /root/sb /root/sbhome
tar -xf "$SRC_TAR" -C /root/sb
cd /root/sb
export HOME=/root/sbhome

bash scripts/cloud-setup.sh > /root/run1.log 2>&1
echo "run1 exit=$? | $(tail -1 /root/run1.log)"

bash scripts/cloud-setup.sh > /root/run2.log 2>&1
echo "run2 exit=$? | $(tail -1 /root/run2.log)"

echo "linhas de token no ~/.npmrc: $(grep -c _authToken "$HOME/.npmrc")"

env -u NODE_AUTH_TOKEN bash scripts/cloud-setup.sh > /root/run3.log 2>&1
echo "sem-token exit=$? | $(grep -o 'ERRO: defina NODE_AUTH_TOKEN' /root/run3.log)"

echo "token vazado nos logs: $(cat /root/run*.log | grep -c 'gh[pos]_')"
