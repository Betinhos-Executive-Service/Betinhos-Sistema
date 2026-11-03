---
name: verificar-push-redirect
description: "Verifica o redirect do toque das notificações do App Motoristas v2: OnLoad dos forms leva ao web resource do App no registro certo (comunicado, checklist, serviço). Use após mudar webresources/new_appmotoristas_push_redirect.js ou scripts/provision-push-redirect.ps1."
---
# Verificar push redirect

## Cobre
- Código: `webresources/new_appmotoristas_push_redirect.js` (mapa `ROUTES`), `scripts/provision-push-redirect.ps1`, `tests/pushRedirect.test.ts`.
- Tabelas: `new_comunicadodestinatario` → `comunicadoId=`, `new_checklistveiculo` → `checklistId=`, `new_termomulta` → `termoMultaId=`, `cr40f_treinamentoparticipacao` → `treinamentoParticipacaoId=` (abre a tela Treinamentos no detalhe da participação; id fora da lista fica na lista), `cr40f_reservadeveculos` → `servicoId=...&tipo=SERVICO`.

## Preparar ambiente
- Node 22+ (sem dependências): `node --test --experimental-strip-types tests/pushRedirect.test.ts`.
- DEV: `https://org23b93544.crm2.dynamics.com`, token MSAL.PS em cache.

## Roteiro
1. `node --test --experimental-strip-types tests/pushRedirect.test.ts` → `pass` igual ao total, `fail 0`; existe um teste por tabela do `ROUTES`.
2. Dry-run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision-push-redirect.ps1` → linha `DRY RUN` citando o form de comunicado, o de checklist, o do termo de multa, o de treinamento (exige a tabela `cr40f_treinamentoparticipacao` do Sistema Betinhos já no DEV) e o form de serviço `App Motoristas (push)`.
3. Com autorização para alterar o DEV: `-Apply` → cada form "atualizado" ou "ja configurado" e a linha final `redirect do push publicado: comunicado -> comunicadoId; checklist -> checklistId; termo de multa -> termoMultaId; treinamento -> treinamentoParticipacaoId; servico -> ...`.
4. Conferência no DEV (somente leitura): o conteúdo base64 de `webresourceset` `new_appmotoristas_push_redirect.js` contém cada rota; o `formxml` do form principal ativo de cada tabela tem `Betinhos.PushRedirect.onLoad` e não tem `datafieldname="ownerid"`.

## Casos de borda (testes)
- Fora do App Motoristas v2 (app Interno) não redireciona.
- Guarda de 15 s evita loop ao voltar; tabela desconhecida e form sem ID são ignorados; funciona sem `sessionStorage`.

## Evidência obrigatória
- Saída do teste e do `-Apply` (ou do dry-run) e a conferência do web resource/form no DEV.

## Limites
- O toque real no celular exige a notificação do Flow e o App instalado; validar no dispositivo depois que a tela de destino existir no App.
- PROD: somente leitura; PROD recebe pela solução gerenciada.
