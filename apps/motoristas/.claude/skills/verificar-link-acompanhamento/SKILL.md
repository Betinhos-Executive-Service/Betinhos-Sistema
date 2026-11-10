---
name: verificar-link-acompanhamento
description: Verifica os plugins do link de acompanhamento do cliente (GenerateTrackingLinkPlugin, RevokeTrackingLinkPlugin, UpdateTrackingLinkPlugin, TrackingLink*) e os steps em scripts/provision-current-vehicle.ps1. Use ao mudar esses arquivos ou quando o link não acompanhar a reserva editada.
---

# Verificar link de acompanhamento

## 1. Testes unitários (sempre)
```powershell
cd plugins/DriverRecordSharing.Tests; dotnet test --nologo -v q --filter "FullyQualifiedName~TrackingLink"
```
Em worktree, copie antes `plugins/DriverRecordSharing/DriverRecordSharing.snk` do checkout principal (é ignorado; não gere chave nova). No Linux sem `mono` só dá para compilar (`dotnet build -p:SignAssembly=false`); os testes rodam no Windows.
Cobrem em `TrackingLinkRevocationTests`: concluir/revogar por status, `ShouldRefresh` (só status ativo e link no formato), `BuildLinkUrl` só https.

## 2. Plano dos steps (somente leitura, DEV)
`scripts/provision-current-vehicle.ps1` sem `-Apply` deve listar, além de Gerar e Revogar, 3 steps assíncronos do `UpdateTrackingLinkPlugin`: Update da reserva (saída, destino, trajeto, horário, motorista, lista de passageiros), Update e Create em `cr40f_servicosporpassageiro`. Aplicar só da main no checkout principal.

## 3. Prova no DEV (após publicar da main)
1. Gere um link numa reserva Programado do DEV e abra `/r/<id>`.
2. Edite o endereço de saída (ou inclua um passageiro). Em até ~1 min (job assíncrono + até 45 s de geocodificação) a página mostra o novo pino sem recarregar.
3. Troque o motorista para um terceiro sem rastreador: o link deve ser revogado (página "link encerrado") e `new_linkacompanhamento` fica vazio.
4. Confira o trace em `plugintracelogs` (`UpdateTrackingLink:`) quando algo não mudar; nunca registre ou leia o segredo.

## Não verificável sem Dataverse
Disparo dos steps, PUT/DELETE reais e limpeza dos campos dependem do DEV; numa VM cloud declare "não verificado na nuvem".
