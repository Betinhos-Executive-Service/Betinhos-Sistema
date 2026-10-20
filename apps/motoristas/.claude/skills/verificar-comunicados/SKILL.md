---
name: verificar-comunicados
description: "Verifica o módulo Comunicados do App Motoristas: lista de pendentes e já cientes, comunicado informativo e ciência obrigatória com assinatura. Use após mudar src/screens/ComunicadosScreen.tsx, src/components/comunicados/** ou src/comunicados.css, ou quando pedirem para testar comunicados."
---
# Verificar comunicados

## Cobre
- Código: `src/screens/ComunicadosScreen.tsx`, `src/components/comunicados/**`, `src/comunicados.css`, `src/lib/comunicados.ts` (regras, também em `verificar-dominio`).
- Rota: `#comunicados`; também aparecem no topo de `#servicos` como "Comunicados pendentes".

## Preparar ambiente
- Dev server em `http://localhost:31877` (ver `verificar-servicos`). Em modo mock há dois comunicados: "[Mock] Ciência obrigatória" e "[Mock] Aviso operacional"; o cabeçalho mostra "Operação · Mock local".
- `localStorage.clear()` antes para voltar os dois a pendentes.

## Roteiro automatizado (preferido)
`node scripts/qa/verify-ux-flows.cjs .verificacao/<data>-<branch> comunicados` — todas as linhas `OK`.

## Roteiro manual
1. `#comunicados` → seção "Aguardando sua ciência" com 2 itens.
2. Abrir "[Mock] Ciência obrigatória" → "Assinar ciência" sem desenhar → "Desenhe sua assinatura antes de confirmar." aparece logo abaixo do quadro de assinatura (não no topo).
3. Desenhar no quadro (`.comunicado-signature-pad`) → a mensagem some → "Assinar ciência" → "Ciência registrada" com "Assinado por" e data.
4. "Voltar" → a lista mostra "Já cientes" com o item "Ciência assinada".

## Casos de borda
- "Limpar assinatura" zera o desenho.
- Falha ao recarregar após assinar mostra "Ciência registrada, mas não foi possível atualizar a lista." no topo.

## Evidência obrigatória
- Print `comunicados-ciencia.png` com "Ciência registrada"; console sem erros.

## Limites
- No modo remoto a ciência grava no Dataverse; teste só em DEV com usuário de teste.
