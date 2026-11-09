# Guarda da numeração automática

`ReservaAutoNumberGuardPlugin` remove do `Target` qualquer `cr40f_id` enviado no Create, para o Dataverse sempre gerar o número da sequência:

- `cr40f_reservadeveculos.cr40f_id` (`OS-{SEQNUM:1}`, nome primário e chave alternativa `cr40f_primarykey`).
- `cr40f_servicosporpassageiro.cr40f_id` (`{SEQNUM:1}`, nome primário).
- `cr40f_manutencoes.cr40f_id` (`OM-{SEQNUM}`, nome primário). Desde a v1.0.3, após o incidente de 14/10/2026 em PROD ("N", "OL", "PZ").
- Desde a v1.0.4, por prevenção (nenhum registro fora do padrão em 15/10/2026): `cr40f_composicaodeprecos.cr40f_id` (`CP-`), `cr40f_financeiro.cr40f_idfinanceiro` (`OP-`), `cr40f_pagantes.cr40f_id` (`PAG-`), `cr40f_trocasdecarro.cr40f_id` (`OT-`), `new_possedeveiculo.new_id` (`PV-`), `new_marketing.new_id` (`MKT-`) e `new_centraldenotificacoes.new_id` (`NOT-`).

Origem: o MCP/conector Dataverse do Claude injeta letras aleatórias no nome primário ("G", "MB", "PY"), e o flow de agendamento por IA envia `guid-ordinal`. Desde a v1.0.2 também é descartado número em formato válido deduzido pelo cliente (`OS-9699`), que colidiria com a chave alternativa no próximo create nativo.

## Registro

Create, PreValidation (10), síncrono, sandbox, um step por tabela, na solução `AppBetinhos`. A chave `AutoNumberGuard.snk` precisa ser a mesma já registrada (public key token `91384d0c50327e04`).

```powershell
dotnet test power-platform/plugins/AutoNumberGuard.Tests/AutoNumberGuard.Tests.csproj -c Release
dotnet build power-platform/plugins/AutoNumberGuard/AutoNumberGuard.csproj -c Release
.\scripts\register-autonumberguard.ps1 -OrgUrl https://org23b93544.crm2.dynamics.com
```

PROD recebe assembly e steps pelo import da solução gerenciada `AppBetinhos`. Antes do import, remova o assembly/tipo/step registrados manualmente em PROD (IDs diferentes do DEV).
