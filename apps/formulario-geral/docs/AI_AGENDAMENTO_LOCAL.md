# Agendamento IA local — DEV

## Metadados confirmados

O Web Resource `new_formulario_geral.html` está na `Solução Padrão` e na solução `AppBetinhos`. A tabela criada no DEV tem o nome lógico `cr40f_solicitacaoiaagendamento` e foi conferida via `describe`, incluindo os lookups reais para `cr40f_clientes1`, `cr40f_bancodedados` e `cr40f_reservadeveculos`. O componente foi adicionado à solução `AppBetinhos` pelo PAC; o prefixo lógico da tabela permanece `cr40f`, definido pelo publisher padrão do ambiente. Nenhuma alteração foi feita em PROD.

A coleção Web API é `cr40f_solicitacaoiaagendamentos`. A fila da UI lê somente o ambiente atual e usa `parent.Xrm`/`window.Xrm`; a automação local replica rascunhos para DEV e PROD de forma independente.

## Fluxo

## Teste local com mock

Abra `http://127.0.0.1:4000/?mock=1` (ou o endereço exibido pelo servidor local). Fora do Dataverse, a aba entra automaticamente em `Ambiente: local mock` e carrega exemplos no `localStorage`, sem chamadas ao Outlook ou ao Dataverse.

O conjunto inicial cobre: identidade pendente, ida e retorno na mesma conversa, nomes ambíguos, data/horário vagos, falha isolada no PROD, Graph indisponível, token expirado, JSON inválido, criação parcial com retomada, anexos não analisados, data relativa resolvida, vários serviços na mesma mensagem, item já agendado e trecho descartado. Use o filtro `Todas` para exibir o histórico; `Restaurar exemplos` recompõe a fila após testar aprovar, descartar ou retomar.

Os estados e reservas criados no mock ficam apenas no navegador. Eles não são evidência de gravação no DEV/PROD.

O Codex Desktop executa a cada 15 minutos um prompt que chama `node scripts/ai_schedule_worker.mjs pull`. A pasta do Outlook deve ser preenchida manualmente. O resultado contém apenas assunto, remetente, recebimento, corpo normalizado e o sinalizador de anexos; anexos não são lidos.

O Codex interpreta cada corpo e grava um JSON de extração. Para persistir os trechos, execute `node scripts/ai_schedule_worker.mjs process <mensagem.json> <extracao.json>`. O upsert consulta primeiro a chave `(identificador estável da mensagem, ordinal)` e depois cria ou atualiza o rascunho, portanto repetir a execução é idempotente.

Antes do upsert, o worker pesquisa candidatos de cliente, solicitante e passageiro por nome, telefone e e-mail normalizados. A extração original permanece preservada; confirmações/correções do operador são gravadas separadamente em `cr40f_revisaojson` quando esse campo estiver publicado no ambiente.

## Variáveis locais (nunca versionar valores)

```powershell
$env:OUTLOOK_TENANT_ID = "<tenant>"
$env:OUTLOOK_CLIENT_ID = "<app-registration-com-device-code>"
$env:OUTLOOK_FOLDER_ID = "<folder-id>"
$env:AI_DRAFT_TABLE = "cr40f_solicitacaoiaagendamento"
$env:AI_DRAFT_FIELDS_JSON = '{"id":"cr40f_solicitacaoiaagendamentoid","stableMessageId":"cr40f_identificadormensagem","conversationId":"cr40f_conversationid","subject":"cr40f_assunto","sender":"cr40f_remetente","receivedAt":"cr40f_recebimento","body":"cr40f_corponormalizado","extractionJson":"cr40f_extracaojson","ordinal":"cr40f_ordemtrecho","legType":"cr40f_tipotrecho","legJson":"cr40f_trechojson","status":"cr40f_status","warnings":"cr40f_alertas","confidence":"cr40f_confianca","extractorVersion":"cr40f_versaoextrator","hasAttachments":"cr40f_possuianexos","processedAt":"cr40f_processadoem"}'
$env:AI_DRAFT_STATUS_VALUES_JSON = '{"Pendente":100000000,"Pronto":100000001,"Bloqueado":100000002,"Agendado":100000003,"Descartado":100000004,"Erro":100000005}'
$env:AI_DRAFT_TARGETS_JSON = '[{"name":"DEV","url":"https://org23b93544.crm2.dynamics.com","table":"cr40f_solicitacaoiaagendamento","entitySet":"cr40f_solicitacaoiaagendamentos"},{"name":"PROD","url":"https://orgf261ae8e.crm2.dynamics.com","table":"cr40f_solicitacaoiaagendamento","entitySet":"cr40f_solicitacaoiaagendamentos"}]'
$env:AI_ALERT_EMAIL_TO = "noreply@betinhos.onmicrosoft.com"
```

O primeiro uso abre o device-code do Entra ID. O refresh token é salvo em `%LOCALAPPDATA%\Betinhos\formulario-geral\*-token.xml` com DPAPI do Windows. Escopos: Outlook `Mail.Read` para leitura e `Mail.Send` para alertas; Dataverse `user_impersonation`. Nenhum token é escrito em Git, prompt, log ou URL. Cada destino é tentado separadamente; falha no PROD gera e-mail com o ambiente e não interrompe o DEV.

## Contrato da extração

```json
{
  "isServiceRequest": true,
  "client": "nome exibido",
  "clientId": "guid confirmado no Dataverse",
  "requester": "nome exibido",
  "requesterId": "guid confirmado no Dataverse",
  "passengers": [{"id":"guid confirmado", "name":"Nome"}],
  "legs": [{"ordinal":1,"type":"ida","date":"2026-09-12","time":"10:00","origin":"...","destination":"...","notes":"..."}],
  "vehicleType": "Executivo",
  "observations": "...",
  "warnings": [],
  "missingFields": [],
  "matchCandidates": {},
  "confidence": 0.92,
  "extractorVersion": "1.0.0"
}
```

Datas relativas devem ser resolvidas pelo recebimento em `America/Sao_Paulo` somente quando exatas. Horário ou data vagos permanecem bloqueados. A IA não cria cliente, solicitante ou passageiro e não calcula preço.

## Configuração da aba

Antes de carregar o Web Resource, a solução deve fornecer a configuração abaixo (por exemplo, no wrapper que hospeda o recurso). Os nomes são os nomes lógicos reais da tabela criada na solução; não invente prefixo.

```html
<script>
window.__FORMULARIO_IA_DRAFT_CONFIG = {
  entity: "<nome-logico-da-tabela>",
  entitySet: "<colecao-web-api>",
  fields: { id: "<pk>", stableMessageId: "<campo>", conversationId: "<campo>", subject: "<campo>", sender: "<campo>", receivedAt: "<campo>", body: "<campo>", extractionJson: "<campo>", ordinal: "<campo>", legType: "<campo>", legJson: "<campo>", status: "<campo>", warnings: "<campo>", missingFields: "<campo-opcional>", matchCandidates: "<campo-opcional>", reviewJson: "<campo-opcional>", reviewedAt: "<campo-opcional>", reviewedBy: "<campo-opcional>", partialIds: "<campo-opcional>", confidence: "<campo>", extractorVersion: "<campo>", hasAttachments: "<campo>", processedAt: "<campo>" },
  statusValues: { scheduled: 100000003, discarded: 100000004 },
  statusLabels: { "100000000": "Pendente", "100000001": "Pronto", "100000002": "Bloqueado", "100000003": "Agendado", "100000004": "Descartado", "100000005": "Erro" }
};
</script>
```

A aba consulta somente rascunhos. `Aprovar e agendar` exige cliente, solicitante e todos os passageiros com GUID confirmado, preenche o formulário e chama o fluxo existente (`validateContext`, `buildReservaPayload`, `saveReserva` e relações `cr40f_servicosporpassageiro`). O registro oficial é criado com status `Solicitado` (`202410004`). Correções posteriores só atualizam rascunhos não agendados; rascunhos agendados ficam para correção manual.

## Retenção e implantação

Criar na mesma solução/publisher do Web Resource: chave alternativa composta por identificador estável + ordinal, campos de auditoria, lookups confirmados e vínculo com a reserva. Um job diário deve limpar somente o corpo original após 90 dias. Validar primeiro em DEV com e-mails controlados; PROD exige autorização separada e UAT autenticado.
