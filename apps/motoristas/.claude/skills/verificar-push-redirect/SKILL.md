---
name: verificar-push-redirect
description: "Verifica o redirect do toque das notificações do App Motoristas v2: OnLoad dos forms leva ao web resource do App no registro certo (comunicado, checklist, termo, treinamento, despesa, serviço). Use após mudar webresources/new_appmotoristas_push_redirect.js, webresources/new_exchange_lifecycle_*, scripts/push-webresources-dev.ps1 ou a migration packages/deploy/migrations/20261110-1700-push-redirect-forms.ps1."
---
# Verificar push redirect

## Cobre
- Código: `webresources/new_appmotoristas_push_redirect.js` (mapa `ROUTES`), `tests/pushRedirect.test.ts`.
- Publicação do conteúdo (Deploy, peça `motoristasWr`): `scripts/push-webresources-dev.ps1` (também os dois `new_exchange_lifecycle_*` da barra de comandos da troca). Decisão em `packages/deploy/mudancas-dev.mjs` e `pendentes-dev.ps1` (descrição termina com `<sha>`).
- Forms e app (uma vez, pelo Deploy): migration `packages/deploy/migrations/20261110-1700-push-redirect-forms.ps1`. Ids fixos, iguais em DEV, TEST e PROD; não cria nada.
- Tabelas: `new_comunicadodestinatario` → `comunicadoId=`, `new_checklistveiculo` → `checklistId=`, `new_termomulta` → `termoMultaId=`, `cr40f_treinamentoparticipacao` → `treinamentoParticipacaoId=`, `cr40f_despesaoperacional` → `despesaId=`, `cr40f_reservadeveculos` (form `App Motoristas (push)`, todos, ordem 99) → `servicoId=...&tipo=SERVICO`.
- O repositório antigo `app-motoristas-v2` (`provision-push-redirect.ps1`) está arquivado: não usar.

## Preparar ambiente
- Node 22+ (sem dependências): `node --test --experimental-strip-types tests/pushRedirect.test.ts`.
- DEV: `https://org23b93544.crm2.dynamics.com`, `az login` com o usuário (somente leitura nos dry-runs).

## Roteiro
1. `node --test --experimental-strip-types tests/pushRedirect.test.ts` → `fail 0`; um teste por tabela do `ROUTES`.
2. Conteúdo, dry-run (raiz do app): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push-webresources-dev.ps1 -DryRun` → uma linha por web resource ("conteudo muda" ou "conteudo sem mudanca"; "descricao recebe o commit" enquanto o DEV não registrou o commit) e `DRY RUN: nada gravado. Publicaria (PublishXml): ...`.
3. Forms, dry-run (raiz do repo): `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/migrations/20261110-1700-push-redirect-forms.ps1` → `sem mudanca` em cada form já configurado; depois do Deploy, `nada a fazer: forms e app ja configurados.`
4. Nunca rode `-Apply` nem o push sem `-DryRun` à mão: o Deploy aplica no DEV. PROD recebe pelas soluções (tabelas na BetinhosCore com subcomponentes, app na BetinhosMotoristas, web resources na BetinhosCore/BetinhosInterface).
5. Conferência no DEV (somente leitura): o conteúdo de `new_appmotoristas_push_redirect.js` contém cada rota; o `formxml` de cada form tem `Betinhos.PushRedirect.onLoad`; `RetrieveAppComponents` do `new_AppMotoristasv2` lista cada tabela e form.

## Casos de borda (testes)
- Fora do App Motoristas v2 (app Interno) não redireciona.
- Guarda de 15 s evita loop ao voltar; tabela desconhecida e form sem ID são ignorados; funciona sem `sessionStorage`.
- O form da despesa (`Informações`, usado também pela operação) mantém o Proprietário: a migration só acrescenta biblioteca e handler. Os outros forms já vinham sem o Proprietário do script antigo.

## Evidência obrigatória
- Saída do teste e dos dois dry-runs.

## Limites
- O toque real no celular exige a notificação do Flow e o App instalado.
- O GET de `webresourceset` devolve a camada publicada (conteúdo e descrição). Descrição gravada sem `PublishXml` fica só na não publicada: leia com `webresourceset(<id>)/Microsoft.Dynamics.CRM.RetrieveUnpublished()`. Foi a causa da falha do Deploy de 11/11/2026 (run 42930775442).
- TEST e PROD: somente leitura.
