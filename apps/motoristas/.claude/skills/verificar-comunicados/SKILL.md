---
name: verificar-comunicados
description: "Verifica o módulo Comunicados do App Motoristas: lista de pendentes e já cientes, comunicado informativo e ciência obrigatória com assinatura. Use após mudar src/features/comunicados/ComunicadosScreen.tsx, src/features/comunicados/**, src/shared/ui/SignaturePad.tsx ou src/features/comunicados/comunicados.css, ou quando pedirem para testar comunicados."
---
# Verificar comunicados

## Cobre
- Código: `src/features/comunicados/ComunicadosScreen.tsx`, `src/features/comunicados/**, src/shared/ui/SignaturePad.tsx`, `src/features/comunicados/comunicados.css`, `src/features/comunicados/comunicados.ts` (regras, também em `verificar-dominio`).
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
5. Na lista `#comunicados` os itens usam o card grande (`.comunicado-service-item`, 142 px a 375 px). Em `#servicos` os mesmos pendentes aparecem como aviso compacto (`ComunicadoAgendaCard variant="compact"` → `button.notice-compact`, componente `src/components/common/CompactNoticeCard.tsx`): 56 px, ícone de balão no tom do status (`data-tone`: assinatura = atencao âmbar, informativo = info azul, concluído = sucesso verde), selo "NOVO · ASSINATURA OBRIGATÓRIA"/"NOVO · INFORMATIVO", título numa linha, data dd/mm e chevron. Toque ou Tab + Enter abre o detalhe; "Voltar" retorna a Serviços com os avisos. Títulos das seções em 11 px, cor #536174 (contraste ≥ 4,5:1 sobre o fundo #f0f0f0 do painel; #64748b falhava no axe com 4,17:1).
6. Entrada dos avisos: `comunicado-form-enter` 220 ms com atraso 0/40/80 ms, só em `prefers-reduced-motion: no-preference`; fill-mode `backwards` para o `:active` (`scale(.99)`) continuar valendo depois da entrada.

## Casos de borda
- "Limpar assinatura" zera o desenho.
- Falha ao recarregar após assinar mostra "Ciência registrada, mas não foi possível atualizar a lista." no topo.

## Evidência obrigatória
- Print `comunicados-ciencia.png` com "Ciência registrada"; console sem erros.

## Limites
- No modo remoto a ciência grava no Dataverse; teste só em DEV com usuário de teste.
