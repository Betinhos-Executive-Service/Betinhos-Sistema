# Guarda da numeração automática — Pedido de cotação

`QuoteAutoNumberGuardPlugin` protege `cr40f_pedidodecotacao` em creates feitos fora do Planner (MCP/conector Dataverse do Claude, flows, scripts). Mesmo princípio do `Betinhos.AutoNumberGuard` da Geral.

- `cr40f_numerodacotacao` (`COT-{SEQNUM:4}`): qualquer valor enviado é descartado e o Dataverse gera o próximo número. Motivo: em 05/10/2026 o MCP enviou `COT-1025` deduzido da última cotação e o create seguinte do Planner recebeu o mesmo número.
- `cr40f_titulo` (nome primário, também autonumber): vazio ou 1–2 letras maiúsculas injetadas pelo MCP (`G`, `MB`, `PY`) viram `Pedido de cotação`. Títulos reais ficam intactos.

## Registro

- Mensagem `Create`, tabela `cr40f_pedidodecotacao`, estágio PreValidation (10), síncrono, sandbox.
- Assembly e step entram na solução `AppBetinhos` (componentes 91 e 92) e seguem para PROD no import da solução.

```powershell
dotnet test power-platform/plugins/QuoteAutoNumberGuard.Tests/QuoteAutoNumberGuard.Tests.csproj -c Release
dotnet build power-platform/plugins/QuoteAutoNumberGuard/QuoteAutoNumberGuard.csproj -c Release
.\scripts\register-quote-autonumber-guard.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com            # dry-run
.\scripts\register-quote-autonumber-guard.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Apply -AddExistingToSolution
```

O script aborta se alguma das duas colunas perder o `AutoNumberFormat`.
