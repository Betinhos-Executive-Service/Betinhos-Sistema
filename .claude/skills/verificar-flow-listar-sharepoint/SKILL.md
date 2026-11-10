---
name: verificar-flow-listar-sharepoint
description: "Verifica o patch do 'Flow - Listar arquivos SharePoint' (pasta inexistente encerra Succeeded) e a marca 'sem foto' da Frota no shell. Use após mudar packages/deploy/patch-flow-listar-arquivos-sharepoint.ps1, apps/shell/src/pages/frota/components/FotoVeiculo.tsx ou antes de levar o patch ao PROD."
---
# Verificar flow Listar arquivos SharePoint

## Cobre
- `packages/deploy/patch-flow-listar-arquivos-sharepoint.ps1` (só DEV; PROD id `408d3497-16be-f111-a05b-7ced8da8c473`, gerenciado, recebe pelas soluções).
- `apps/shell/src/pages/frota/components/FotoVeiculo.tsx`: "sem foto" fica 6 h no Cache Storage (`frota-fotos-v1`, header `X-Frota-Sem-Foto`).

## Problema (#270)
- A pasta `Veiculos/[DEV/]<id>/Foto` só nasce no primeiro envio de foto; a maioria dos veículos não tem.
- 404 em `ObterPasta` → `ResponderVazio` (200, lista vazia), mas `ListarPasta…Responder` ficam Skipped e a execução termina Failed. O plantão acusava dezenas por hora.
- A tela não guardava "sem foto" e perguntava de novo a cada visita (rajadas de ~30 chamadas).

## Roteiro
1. Shell: `cd apps/shell && npx vitest run src/pages/frota/components/FotoVeiculo.test.tsx` (marca guardada, expira em 6 h, envio limpa).
2. DEV, do checkout principal na `develop`: `powershell -File packages/deploy/patch-flow-listar-arquivos-sharepoint.ps1` → `DRY RUN`; depois `-Apply` (backup em `packages/deploy/flows/backup/Flow-Listar-Arquivos-SharePoint-DEV-*.json`).
3. Chamar o flow no DEV com `caminhoCompleto` de veículo sem foto (`Veiculos/DEV/<id>/Foto`): resposta 200 `arquivos: []` e execução **Succeeded** (tabela `flowrun`, ou histórico no portal).
4. Com pasta existente: 200 com arquivos, execução Succeeded. Caminho inválido (`../x`): 400.
5. Frota no DEV: abrir a lista duas vezes; na segunda, nenhuma chamada nova ao flow para veículos sem foto (aba Rede). Enviar uma foto: aparece na hora.
6. Reverter: `... -Apply -Restaurar <backup>`.

## Cuidados
- Erros reais (500 em `ResponderErroPasta`/`ResponderErroListar`) continuam Failed: é o que o plantão deve ver.
- Foto enviada fora da tela (outro navegador) aparece em até 6 h nos navegadores que já marcaram "sem foto".
