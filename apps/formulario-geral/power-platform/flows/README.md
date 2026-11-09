# Flows da agenda IA

O `scripts/provision-ai-schedule-flows.ps1` segue o mesmo mecanismo do Tela Planner: lê a definição Logic Apps JSON, monta `clientdata` com as Connection References e cria/atualiza o workflow pela Web API Dataverse.

Os dois arquivos solution-aware já estão nesta pasta:

- `ai_schedule_interpret.json` — trigger da tabela `cr40f_conversaiaagendamento`, chamada Structured Output do DeepSeek e atualização da proposta/status;
- `ai_schedule_schedule.json` — trigger de confirmação, criação idempotente das reservas e atualização dos IDs/status.

Os arquivos podem conter estes tokens, substituídos pelo provisionador:

- `__DV_CONNECTION_REF__`
- `__DEEPSEEK_CONNECTION_REF__`
- `__DEEPSEEK_API_NAME__`
- `__DEEPSEEK_OPERATION_ID__`

O provisionador recusa qualquer token restante ou placeholder. Os scripts `scripts/provision-ai-schedule-schema.ps1`, `provision-deepseek-connector.ps1` e `provision-ai-schedule-flows.ps1` (à mão) cuidam de schema, connector e dos dois Flows; o WebResource vai pelo Deploy da `develop`; a conexão com a API key continua sendo um segredo gerenciado pelo Power Platform e deve ser validada no primeiro uso.
