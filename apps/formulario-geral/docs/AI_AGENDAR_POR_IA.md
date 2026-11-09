# Agendar por IA

## Entrega local

A aba **Agendar por IA** é separada de **Solicitações IA**. Ela mantém uma conversa por sessão:

1. operador cola a mensagem do cliente;
2. a sessão recebe uma nova versão de entrada;
3. o worker interpreta com DeepSeek e grava proposta estruturada;
4. a tela exibe dados, pendências e alertas;
5. somente `Confirmar e agendar` (ou uma confirmação textual explícita no contexto certo) libera a mutação;
6. o worker grava os IDs criados, parcialidade ou erro idempotente.

O bundle nunca recebe chave DeepSeek. No localhost sem `?mock=1`, a aba chama o proxy `POST /api/ai-schedule`, que lê `DEEPSEEK_API_KEY` somente no processo Node e devolve a proposta estruturada. No modo `?mock=1`, a interpretação permanece local e determinística para teste visual, sem chamar a API nem criar registro Dataverse. O passo a passo está em `docs/AI_AGENDAR_POR_IA_LOCAL.md`.

## Tabela de sessão DEV

Criar uma tabela Dataverse, por exemplo `cr40f_conversaiaagendamento`, com os campos lógicos definidos em `window.__FORMULARIO_IA_CONVERSATION_CONFIG` no `index.html`:

- texto original, mensagens JSON e proposta JSON;
- status, versão de entrada, versão processada e tentativas;
- campos faltantes, alertas, modelo, erro e IDs das reservas criadas;
- expiração para retenção de 90 dias.

Os valores de Choice e o campo primário `cr40f_name` no `index.html` são placeholders de DEV até a solução publicar os valores reais. Ajustar antes do primeiro teste Dataverse.

## Power Automate assíncrono

O contrato Structured Output está em `docs/power-platform/ai_schedule_proposal.schema.json` e o manifesto parametrizado da solução DEV está em `docs/power-platform/ai_schedule_solution_manifest.json`. O roteiro operacional dos dois fluxos está em `docs/power-platform/AI_AGENDAR_POR_IA_DEV_FLOW_CONTRACT.md`.

Antes de importar ou ativar qualquer fluxo, valide o manifesto contra a exportação de metadata do ambiente:

```powershell
node scripts/validate_ai_schedule_manifest.mjs --manifest docs/power-platform/ai_schedule_solution_manifest.json --metadata C:\caminho\metadata-AppBetinhos.json
```

`C:\caminho\metadata-AppBetinhos.json` é apenas um exemplo: substitua pelo caminho real do arquivo baixado (normalmente em Downloads). O comando deve retornar `ok: true`. Enquanto houver publisher, Connection Reference, Choice, lookup ou chave alternativa pendentes, ele falha deliberadamente para impedir uma publicação incompleta.

Criar dois fluxos na solução DEV:

### Interpretar sessão

- gatilho: quando a sessão for criada ou atualizada;
- condição: `inputVersion > processedVersion` e status `WAITING_AI`;
- adquirir lock lógico por `sessionId + inputVersion`;
- chamar Custom Connector DeepSeek, com a conexão guardada na Connection Reference;
- modelo primário: `deepseek-v4-flash`; fallback controlado: `deepseek-v4-pro`;
- exigir saída JSON conforme o contrato da função `validateProposal`;
- validar datas, horários, identidade, serviço e veículo sem inferência silenciosa;
- gravar proposta, `missingFields`, alertas, tokens, modelo e `processedVersion`;
- status final: `WAITING_USER`, `READY` ou `ERROR`.

### Agendar confirmação

- condição: status `SCHEDULING` e `confirmationVersion = inputVersion`;
- validar novamente a proposta e a confirmação;
- para cada serviço, resolver ou propor cadastro de identidades; criação de pessoa exige confirmação humana separada;
- criar reservas e relações em sequência, guardando cada ID imediatamente;
- em falha, manter itens criados, gravar `PARTIAL` e permitir retomada idempotente;
- em sucesso, gravar `SCHEDULED` e IDs das reservas para a tela abrir o voucher existente.

## Segurança e operação

- não colocar segredo em HTML, JavaScript, Dataverse, logs do navegador ou Git;
- limitar texto e tamanho do payload, registrar apenas o necessário e aplicar retenção de 90 dias;
- não chamar DeepSeek diretamente do browser;
- DEV primeiro. Nenhum deploy em PROD ou UAT autenticado foi declarado nesta entrega.

## Publicação no DEV

Desde a migração para o monorepo `Betinhos-Sistema`, o Formulário Geral é `apps/formulario-geral` e **não tem mais `npm run push`**:

- **WebResource** (`new_formulario_geral.html`): publicado pelo workflow "Deploy" (push na `develop`) com `packages/deploy/push-formulario-dev.ps1`. O `webresource.html` é gerado no build (`pnpm --filter @betinhos/formulario-geral build`), não é versionado.
- **Schema, connector e flows da agenda IA**: continuam à mão, do checkout principal na `develop` atualizada, nunca de feature, worktree ou sessão cloud:
  1. `scripts\provision-ai-schedule-schema.ps1` (tabela de sessão e campos da reserva);
  2. `scripts\provision-deepseek-connector.ps1` (bootstrap uma vez do connector `Betinhos DeepSeek`; depois crie a conexão com a API key e uma Connection Reference dentro da solução);
  3. `scripts\provision-ai-schedule-flows.ps1` (criação/atualização e ativação dos dois Flows; consulta `connectionreferences` no DEV e bloqueia antes dos flows se alguma não existir).
- Connection References reais ficam em `.env.local` (copie `.env.example`), com `AI_SCHEDULE_DATAVERSE_CONNECTION_REFERENCE`, `AI_SCHEDULE_DEEPSEEK_CONNECTION_REFERENCE` e, opcional, `AI_SCHEDULE_DEEPSEEK_CONNECTOR_ID` para forçar `update` do connector existente. A chave do DeepSeek não é lida do `.env.local` nem vai para o Git.
- **URLs dos flows nunca ficam no código** (trazem assinatura `sig=`). A tela as lê de variáveis de ambiente do Dataverse: `new_URLFlowConsultarArquivosSharePoint` e `new_URLFlowSalvarFotoPassageiro`. Crie e preencha as duas no DEV e no PROD (valor atual do gatilho do flow); sem a variável, a foto do passageiro avisa "URL do Flow de foto não configurada".

## Pendências externas

O primeiro provisionamento completo cria a tabela de sessão, os campos adicionais da reserva, o connector e os dois Flows. Se o connector já existir, informe `AI_SCHEDULE_DEEPSEEK_CONNECTOR_ID` para o script fazer `update` idempotente. Depois, valide a conexão do connector, execute um caso anonimizado e confira o voucher em DEV antes de autorizar produção.
