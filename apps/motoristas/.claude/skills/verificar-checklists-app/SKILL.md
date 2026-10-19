---
name: verificar-checklists-app
description: "Verifica a tela do checklist de vistoria no App Motoristas: tile do Início, destaque em Serviços, formulário com fotos/KM/texto, rascunho no aparelho, envio e checklist enviado. Use após mudar src/lib/checklists.ts, src/screens/ChecklistsScreen.tsx, src/components/checklists/**, src/checklists.css ou a ligação em App.tsx/InitialScreen/ServicesScreen."
---
# Verificar checklist no App Motoristas

## Cobre
- Código: `src/lib/checklists.ts`, `src/screens/ChecklistsScreen.tsx`, `src/components/checklists/ChecklistAgendaCard.tsx`, `src/checklists.css`, `uploadChecklistPhotoRemote` em `src/lib/dataverse.ts`, ligação em `src/App.tsx`, `src/screens/InitialScreen.tsx`, `src/screens/ServicesScreen.tsx`, `src/app/navigation.ts`, `src/app/bootstrap.ts` (`getInitialChecklistId`).
- Testes: `tests/checklists.test.ts`.
- Rotas: `#inicio` (tile Checklist), `#servicos` (seção "Checklist do veículo"), `#checklists`.

## Preparar ambiente
- Worktree sem `node_modules`: crie uma junção para o `node_modules` do checkout principal (mesmas dependências) — `New-Item -ItemType Junction -Path node_modules -Target "<checkout principal>\node_modules"`.
- Gates: `npm test` e `node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- Servidor: `.claude/launch.json` (local, ignorado) com `node scripts/dev-server.cjs` e `PORT=44961` (reservada em `C:\Users\mendo\.codex\dev-ports.json`). `preview_start` → `http://localhost:44961`. Em localhost o checklist roda em mock: 1 pendente (ABC1D23, KM 45210) e 1 enviado. O mock é em memória: recarregar volta ao pendente; o rascunho fica no IndexedDB (`app-motoristas-media-drafts`, chave `checklist:<id>`).
- O dev server reescreve `dist/`; ao terminar, `git checkout -- dist/index.html dist/webresource-app-motoristas.html` (não commitar build local).
- Viewport: preset `mobile` (375×812); volte a `desktop` no fim.

## Roteiro
1. Início → tile "Checklist" mostra "Vistoria do veículo • 1 pendente".
2. Serviços → seção "Checklist do veículo" com card "VISTORIA QUINZENAL · Veículo ABC1D23"; tocar abre o formulário; a seta Voltar retorna a Serviços.
3. Formulário: resumo "1 de 8 itens preenchidos · progresso salvo neste aparelho"; Quilometragem já vem 45210.
4. Fotos: a câmera ao vivo é bloqueada no painel. Use o input nativo do `MediaCaptureScreen`: após tocar em `button[aria-label="Tirar foto: <item>"]`, preencha `input[type=file]` via `DataTransfer` com um JPEG gerado em canvas e dispare `change`. Prévia "A foto está legível?" → Confirmar. A miniatura deve ter no máximo 1600 px no maior lado.
5. "Enviar checklist" incompleto → "Revise N itens destacados.", rola até o primeiro e mostra "Tire a foto para continuar.".
6. Recarregue a página, volte pelo tile e reabra: fotos e valores continuam.
7. Digite "45.218" no KM, "meio tanque" em Combustível e uma observação com acentos; enviar → só Combustível fica inválido com "Informe só números. Ex.: 75.".
8. Corrija para 75 e envie → o botão mostra "Enviando foto N de 5" sem mudar de largura; Voltar fica travado; depois aparece "Checklist enviado. Obrigado pela vistoria." e "Para fazer 0".
9. Abra o enviado → 45.218 km, 75 %, observação e "Ver foto 1" em cada item de foto. O IndexedDB não tem mais `checklist:<id>`. No Início o selo "pendente" sumiu.
10. axe-core (cdnjs 4.10.2) no formulário e na lista → 0 Critical/Serious (o `page-has-heading-one` moderado é padrão do app inteiro).

## Casos de borda
- JSON de itens/respostas inválido vira lista vazia (teste).
- Motorista sem id não consulta o Dataverse (teste).
- Erro da Custom API mostra a mensagem do plugin e mantém o rascunho; fotos já enviadas não são reenviadas (links guardados em `enviadas`).

## Evidência obrigatória
- Saída de `npm test` e do `tsc`, screenshots do formulário, do envio e do enviado, leitura do console (só o 404 do `favicon.ico` do servidor local é esperado).

## Limites
- Câmera ao vivo, upload ao OneDrive e Custom API real só no DEV autenticado (celular); o roteiro local cobre o mock.
