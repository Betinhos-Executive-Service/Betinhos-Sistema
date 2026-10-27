# Notificação nativa do Model-driven

`PlannerTaskEventNotificationPlugin` envia `SendAppNotification` diretamente pelo servidor Dataverse. Não usa Power Automate e não depende de o web resource estar aberto.

## Registro

Registrar a classe `Betinhos.Planner.Notifications.PlannerTaskEventNotificationPlugin` com:

- Mensagem: `Create`
- Tabela: `cr40f_plannertarefaevento`
- Estágio: `PostOperation`
- Modo: `Asynchronous`
- Filtro de atributos: `cr40f_campo`, `cr40f_valornovo`, `cr40f_descricao`, `cr40f_tarefa`

O registro assíncrono deve ser feito na solução não gerenciada `AppBetinhos`, em sandbox, com `AsyncAutoDelete = false`. O usuário/conta do passo precisa ler `cr40f_funcionarios`, `cr40f_plannertarefa`, `cr40f_plannertarefaevento` e possuir o privilégio **Send In-App Notification**. O vínculo `cr40f_funcionarios.cr40f_usuariodataverse` precisa apontar para um `systemuser` ativo. Use uma conta técnica dedicada no campo **Run in User's Context** (`-TechnicalUserEmail` no script).

O web resource continua apenas gravando o evento no Dataverse. O plugin seleciona destinatários pelo JSON de `cr40f_valornovo`, remove o ator quando há ator e executa `SendAppNotification` para cada usuário resolvido. Eventos agendados de cobrança diária e `notification:test` podem ser gerados sem ator.

## Segurança e tolerância a falhas

- O registro é relido com o usuário iniciador; o `Target` não é tratado como fonte confiável.
- Só são aceitos os oito campos `notification:*` usados pelo Planner.
- `actorEmployeeId` deve corresponder ao usuário que criou o evento quando presente; cobrança diária e teste controlado são exceções sem ator.
- Tarefa, funcionário e usuário precisam ser registros ativos; há limite de 50 destinatários e 4.000 caracteres no corpo.
- Cada envio é isolado em `try/catch`; falha de uma notificação não desfaz o evento nem quebra a operação da tarefa. O job assíncrono fica disponível para diagnóstico/reprocessamento.

## Solução e pipeline

O repositório irmão `App Motoristas` usa o mesmo padrão: assembly assinado, upsert idempotente e inclusão explícita dos componentes da solução. Aqui, o repositório contém o pacote gerenciado exportado, não um projeto de solução descompactado; portanto não alterei o ZIP nem inventei XML de solução.

1. No DEV, crie/tenha `AppBetinhos` como solução não gerenciada.
2. Compile o DLL e faça um dry-run:

```powershell
dotnet build power-platform/plugins/PlannerNotifications/PlannerNotifications.csproj --configuration Release
.\scripts\register-planner-notification-plugin.ps1 -EnvironmentUrl $env:DV_URL -DllPath .\power-platform\plugins\PlannerNotifications\bin\Release\net462\Betinhos.Planner.Notifications.dll -TechnicalUserEmail $env:DV_PLUGIN_USER -AddExistingToSolution -DeviceCode
```

3. Com a validação aprovada, repita com `-Apply -AddExistingToSolution` (ou use `PLANNER_NOTIFICATION_ACCESS_TOKEN` no pipeline).
4. Exporte a `AppBetinhos` e promova o ZIP pelo pipeline. Como assembly (componente 91) e step (componente 92) estão na solução, o import cria ou atualiza os dois no ambiente destino.

O script nunca remove componentes, recusa solução gerenciada, detecta duplicidade e valida tabela, assembly, tipo, step e configuração assíncrona antes de terminar.

## Limite operacional

É notificação in-app do Model-driven (toast/central de notificações), não push de tela bloqueada do sistema operacional. O app Model-driven precisa estar habilitado para **In-app notifications**. A execução do plugin, porém, independe de qualquer aba ou web resource aberto.

## Build local

```powershell
dotnet build power-platform/plugins/PlannerNotifications/PlannerNotifications.csproj --configuration Release
```

Para registrar/atualizar de forma idempotente, use `scripts/register-planner-notification-plugin.ps1`. Sem `-Apply`, o script apenas valida; nenhuma chamada mutável é feita.

O login usa `Enable-MsalTokenCacheOnDisk`: na primeira execução com `-DeviceCode`, conclua o código uma vez. As execuções seguintes tentam o token silencioso/refresh token persistido antes de abrir outro Device Code. Execute com o mesmo usuário Windows e o mesmo `ClientId` para reutilizar o cache.
