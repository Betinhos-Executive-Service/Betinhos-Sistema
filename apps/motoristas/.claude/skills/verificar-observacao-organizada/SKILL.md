---
name: verificar-observacao-organizada
description: "Verifica o organizador de observação do motorista: plugin OrganizeObservationPlugin, resolução da chave da API (configuração segura do step com variável de ambiente como reserva) e o script de provisão. Use após mudar plugins/DriverRecordSharing/OrganizeObservationPlugin.cs, ObservationApiKey.cs, ObservationOrganizer.cs, seus testes ou scripts/provision-observacao-organizada.ps1."
---
# Verificar observação organizada

## Cobre
- `plugins/DriverRecordSharing/OrganizeObservationPlugin.cs`, `ObservationApiKey.cs`, `ObservationOrganizer.cs`, `plugins/DriverRecordSharing.Tests/ObservationApiKeyTests.cs`, `ObservationOrganizerTests.cs`, `scripts/provision-observacao-organizada.ps1`.

## Roteiro
1. Windows: `dotnet test plugins/DriverRecordSharing.Tests` → tudo verde.
2. Linux (sem Windows): instale o SDK em `~/.dotnet`; o projeto do plugin compila com `dotnet build plugins/DriverRecordSharing/DriverRecordSharing.csproj -c Release` depois de gerar uma `DriverRecordSharing.snk` **descartável** (ignorada pelo git, nunca usada para publicar). O projeto de testes inteiro não compila fora do Windows; rode o teste novo isolado: projeto net8 em `/tmp` com `Compile Include` apontando para `ObservationApiKey.cs` e `ObservationApiKeyTests.cs` → `Passed! 5`.
3. Publicação no Linux: `node scripts/publicar-plugin-dev.mjs --build` confere identidade (token de nome forte igual ao do DEV) e tipos sem gravar; com `--apply` guarda uma cópia do assembly atual em `/tmp` antes do PATCH. Exige `DriverRecordSharing.snk` real e login por código de dispositivo.
4. DEV (só com a trava `~/.claude/locks/dataverse-dev.lock`): `scripts/provision-observacao-organizada.ps1 -Apply -ConfigurarChaveSegura` com uma chave **nova**, depois chamar `new_OrganizarObservacao` e conferir tópicos no `new_ResultadoJson`. Sem a chave, a API devolve `sem_chave`.
5. Depois de validar: esvaziar o valor padrão de `new_AnthropicKeyObservacaoMotorista` e repetir a chamada; tem de continuar organizando.

## Casos de borda
- Sem configuração segura (step antigo), a chave vem da variável de ambiente, como antes.
- Configuração segura só com espaços vale como ausente.
- `-ConfigurarChaveSegura` sem `-Apply` lança erro.

## Limites
- Passos 3 a 5 só com login no DEV (o 4 exige PowerShell) com login no DEV. O PROD só por `scripts/deploy-prod.ps1`, e o step ainda não está em `$secureSteps` de lá.
