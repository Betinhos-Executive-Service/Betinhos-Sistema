---
name: verificar-despesas-ia
description: "Verifica o flow 'Flow Despesas | Análise IA' e o pacote packages/despesas-ia: motivo da devolução, justificativa do motorista no prompt e segunda dúvida indo ao gestor (new_aguardandogestor). Use após mudar provision-flow-despesas-ia.ps1 ou packages/despesas-ia/src."
---
# Verificar a análise de despesas por IA (devolução)

## Cobre
- `packages/despesas-ia/src/**`: prompt (`justificativaMotorista`, `mensagem_motorista`), schema da resposta e contexto.
- `packages/deploy/provision-flow-despesas-ia.ps1` + `flow-despesas-ia.test.mjs`: gatilho, contexto enviado à IA e gravação da decisão.
- Design: `docs/superpowers/specs/2026-11-10-despesa-devolucao-design.md`.

## Sem gravar (vale em worktree e na nuvem)
```
cd packages/despesas-ia && npx vitest run && npx tsc -p tsconfig.json
cd ../deploy && node --test flow-despesas-ia.test.mjs flows-dev.test.mjs
```
Esperado: tudo verde. O teste do flow avalia as expressões reais de `new_motivodevolucao`, `new_aguardandogestor` e `justificativaMotorista` do script, e confere o BOM do `.ps1`.
Regras provadas: primeira dúvida grava `mensagem_motorista` em `new_motivodevolucao` e volta ao motorista; segunda dúvida (já havia justificativa ou motivo) fica com o gestor (`new_aguardandogestor` = Sim) e preserva o motivo; validar zera `new_aguardandogestor`; mensagem vazia cai numa frase genérica, nunca nos motivos antifraude.

## Publicar no DEV
Só pelo Deploy (push na `develop`): `flows-dev.mjs` mapeia o flow aos arquivos acima. Nunca rode o provision à mão. Constantes novas do prompt/schema vão junto (`pnpm --filter @betinhos/despesas-ia constantes` no CI).

## Prova no DEV (depois do Deploy, local)
1. Despesa de teste do App com comprovante divergente: a IA devolve; `new_motivodevolucao` traz frase direta, sem "erro" nem "inválido", e `new_aguardandogestor` = Não.
2. PATCH do motorista (`cr40f_statusoperacional` = Enviado, `cr40f_statusanexo` = Completo, `new_justificativamotorista`) mesmo com o anexo já Completo: o flow precisa disparar de novo (a documentação do Dataverse diz que o filtro vale pela presença da coluna no PATCH; confirme na execução).
3. IA ainda em dúvida: status Precisa corrigir e `new_aguardandogestor` = Sim. IA valida: Validado e `new_aguardandogestor` = Não.
4. Apague só a despesa de teste.
