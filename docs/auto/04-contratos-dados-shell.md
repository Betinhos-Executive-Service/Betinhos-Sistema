# 04 - Contratos de dados do shell (`apps/shell/src/pages`)

Fonte: leitura do código em `apps/shell/src/pages/*` (arquivos `data/`, `domain/`, `lib/`) e `packages/dataverse/src`. Nomes lógicos `cr40f_*` e `new_*` exatamente como aparecem no código. Regras deste documento:

- Os rótulos de choices só aparecem quando estão no código; o código declara em vários pontos que os rótulos reais vêm da metadata (`metadata.choices`) e os valores fixos são "fallback". Valores sem rótulo no código ficam sem rótulo.
- "Não confirmado" = o código usa o campo, mas não mostra tipo, rótulo ou semântica completa.
- Lookups: leitura por `_<campo>_value`; escrita por `<NavigationProperty>@odata.bind` com `/<entitySet>(<guid>)`. As navigation properties usam o SchemaName (maiúsculas), por exemplo `cr40f_Motorista`.
- Convenções do cliente (`packages/dataverse/src/client.ts`): `getAll` segue `@odata.nextLink`; `update` é PATCH com `If-Match: *`; `create` devolve o GUID; Custom API unbound é `POST <NomeDaApi>` com JSON; bound é `POST <entitySet>(<id>)/Microsoft.Dynamics.CRM.<NomeDaApi>`.
- Entity sets observados no código: `cr40f_reservadeveculoses`, `cr40f_funcionarioses`, `cr40f_veiculoses`, `cr40f_servicosporpassageiros`, `cr40f_trocasdecarros`, `cr40f_clientes1s`, `cr40f_bancodedadoses`, `new_possedeveiculos`, `new_localdebases`, `cr40f_itemplanopreventivos` (`funcoes-operacionais/domain/config.ts`, `frota/data/schema.ts`, `funcionarios/data/schema.ts`). Na maioria das telas o entity set é resolvido em tempo de execução por `host.metadata.entity(<tabela>).entitySetName`.

## Choices compartilhadas entre telas

| Choice | Valores no código | Onde |
|---|---|---|
| `cr40f_reservadeveculos.cr40f_status` (status operacional do serviço) | 202410000 Pré-reserva; 202410001 Confirmado; 202410002 Cancelado; 202410004 Solicitado; 202410005 Programado; 202410006 Em Execução; 202410008 Concluído; 202410010 Cancelado com Ressalvas; 100000001 Requer Análise | `funcoes-operacionais/domain/config.ts` (l. 138-146), `geral/domain/cells.ts` |
| `cr40f_reservadeveculos.cr40f_statusdefaturamento` | 202410000 Cancelado Sem Taxa; 202410002 Cancelado Com Taxa; 202410003 Cortesia; 202410004 Permuta; 202410005 Pendente; 202410006 Pagante em Viagem; 202410007 Pagamento Pendente; 202410008 Faturamento Mensal; 202410010 Pago; 202410011 Não Faturável; 202410012 Pagamento Em Atraso; 100000001 Composição Realizada | `funcoes-operacionais/domain/config.ts` (l. 149-160) |
| `cr40f_reservadeveculos.cr40f_tipodeveiculo` | 202410000 Básico; 202410001 Executivo; 202410002 Blindado; 202410003 Van; 202410004 Van Blindado; 202410005 Spin; 202410006 Somente Motorista | `funcoes-operacionais/domain/config.ts` (l. 182-188) |
| `cr40f_reservadeveculos.cr40f_formadepagamento` | 202410000 Cartão de crédito; 202410001 Pedido de compra; 202410002 Pix | `config.ts` (l. 191-193) |
| `cr40f_reservadeveculos.new_categoriadoitem` | 100000000 Serviço; 100000001 Manutenção; 100000002 Troca de Veículos | `config.ts` (l. 196-198); `dashboard/domain/codes.ts` (`CAT_ITEM_SERVICO = 100000000`) |
| Local de saída (choice de cidade/base, nome do campo não confirmado) | 202410000 Guarulhos; 202410001 São Paulo; 202410002 Outras Cidades; 202410003 Vale do Paraíba; 202410004 Rio de Janeiro; 202410005 Pindamonhangaba; 202410006 São José dos Campos; 202410007 Congonhas; 202410008 Campinas | `funcoes-operacionais/domain/config.ts` (l. 163-171) |
| `cr40f_funcionarios.cr40f_status` | 0 Ativo; 2 Afastado; 1 Desligado | `funcionarios/data/schema.ts` |
| `cr40f_funcionarios.cr40f_funcao` | 202410000 Motorista; 202410001 Administrativo | `funcionarios/data/schema.ts` |
| `cr40f_funcionarios.cr40f_tipodevinculo` | 0 Colaborador; 1 Terceiro | `funcionarios/data/schema.ts` |
| Empresa do funcionário (campo não confirmado) | 202410000 BETINHOS L AUTO LTDA EPP; 202410001 DEPAULA L AUTO LTDA EPP | `funcionarios/data/schema.ts` (l. 17-19) |
| `cr40f_veiculos.new_categoriadoveiculo` | 100000000 Próprio; 100000001 Terceiro; 100000002 Aluguel | `frota/data/schema.ts` (`CATEGORIA`) |
| `cr40f_veiculos.cr40f_statusdoveiculo` | 202410000 Vendido; 202410001 Ativo | `frota/data/schema.ts` (`VEICULO`) |
| `cr40f_multas.cr40f_status` | 202410000 Notificar o Condutor; 202410001 Indicada; 202410002 Recurso; 202410003 Descontado; 202410004 Condutor Notificado; 202410005 Finalizado; 202410006 Pago | `frota/data/schema.ts` (`MULTA`), `funcionarios/data/schema.ts` |
| `cr40f_composicaodeprecos.new_status` | 100000000 Pendente; 100000001 Concluída | `geral/domain/portal.ts`, `pendencias/domain/codes.ts` |
| `cr40f_financeiro.cr40f_status` (OP) | 202410000 Aberta; 100000001 Pagamento Pendente; 202410006 Pagamento Parcial; 202410003 Paga; 202410004 Cancelada | `ops/domain/status.ts`, `pendencias/domain/codes.ts` |
| Idioma (OP e pessoa) | 202410000 Português; 202410001 Inglês; 202410002 Espanhol | `ops/domain/status.ts`, `pessoas/domain/choices.ts` |
| Push (comunicado, checklist, treinamento) | 100000000 Pendente; 100000001 Enviado; 100000002 Falhou | `comunicados/domain/comunicados.ts`, `frota/checklists/domain/gestaoChecklists.ts`, `treinamentos/domain/treinamentos.ts` |

## 1. Início (`pages/inicio`)

- Tabelas e campos (`inicio/data/dataverse.ts`, `inicio/domain/inicio.ts`):
  - `cr40f_comunicadohome`: `cr40f_comunicadohomeid`, `cr40f_name`, `cr40f_titulo`, `cr40f_conteudo`, `cr40f_prioridade` (100000000 info, 100000001 atenção, 100000002 crítico, segundo `inicio.ts` l. 27), `cr40f_publico` (100000000 = todos, constante `PUBLICO_TODOS`), `cr40f_ativo`, `cr40f_expira_em`, `cr40f_publicado_em`.
  - `cr40f_plannertarefa`: lê `cr40f_titulo`, `cr40f_prazo`, `cr40f_status`, `cr40f_prioridade`, lookup `_cr40f_cr40f_funcionarioresponsavel_value`; filtro `statecode eq 0 and cr40f_status ne 100000003 and cr40f_status ne 100000004`.
  - `cr40f_reservadeveculos`: `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_dataehorriodesada`, `new_categoriadoitem`, `_new_composicaodepreco_value`, `cr40f_trajeto`, `cr40f_destino`.
  - `cr40f_composicaodeprecos`: `new_valortotal`, `new_status` (100000001 concluída).
  - `cr40f_noticiaexterna`: `cr40f_resumo`, `cr40f_tema`, `cr40f_relevancia`, `cr40f_fonte`, `cr40f_url`, `cr40f_oculta` (tema e relevância são índices a partir de 100000000, `inicio.ts` l. 90-91; rótulos não confirmados).
  - `cr40f_fluxocaixalancamento`: campos `cr40f_natureza`, `cr40f_valor`, `cr40f_inicio`, `cr40f_fim` aparecem na pasta (uso exato não confirmado).
  - `cr40f_funcionarios`: `cr40f_funcao` (202410001 = escritório, `FUNCAO_ESCRITORIO`), `cr40f_emailmicrosoft`, `cr40f_tipodevinculo`.
- Sem Custom API. Usa `WhoAmI` (`client.request('WhoAmI')`) e `systemusers(<id>)?$select=internalemailaddress`.

## 2. Geral (`pages/geral`)

- `cr40f_reservadeveculos` (`ENTITY` em `geral/domain/types.ts`). Campos citados em `geral/domain/*.ts`: `cr40f_id`, `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_dataehorriodesada`, `cr40f_trajeto`, `cr40f_destino`, `cr40f_endereodesada`, `cr40f_horrioprevistoderetorno`, `cr40f_passageirosetelefonedecontato`, `cr40f_perfildopassageiro`, `cr40f_cotao`, `cr40f_receber`, `cr40f_obsdeoperao`, `cr40f_observaointerna`, `cr40f_tipodeveiculo`, `cr40f_op`, `cr40f_idnovo`, `cr40f_idjuntado`, `cr40f_criadopor`, `cr40f_modificadopor`, `new_valortotal`, `new_status`, `new_linkdovoucher`, `new_snapshotsharepoint`, `new_camposprotegidos`, `new_foiprogramado`. Lookups: `cr40f_motorista`, `cr40f_veiculo`, `cr40f_cliente`, `cr40f_financeiro`, `cr40f_composicaodeprecos` (navs `cr40f_Motorista`, `cr40f_Cliente` etc.).
- "Programar" um serviço: `PATCH` com `{ cr40f_status: 202410005, new_foiprogramado: true }` (`geral/domain/commands.ts`, `programarPatch`).
- Visões salvas: tabela `userqueries` (`name`, `returnedtypecode: 'cr40f_reservadeveculos'`, `querytype: 0`, `fetchxml`, `layoutxml`, `description`) em `geral/data/source.ts` l. 385.
- Portal do cliente - `cr40f_validacaoservico` (`geral/data/portal.ts`): ao liberar, cria ou atualiza (por `cr40f_reservaunica`; retirada volta a Liberado no mesmo registro). Payload:

```json
{
  "cr40f_name": "<codigo do servico>",
  "cr40f_status": 100000000,
  "cr40f_liberadoem": "<ISO agora>",
  "cr40f_prazotacita": "<prazoTacita(agora)>",
  "cr40f_observacao": "<texto ou null>",
  "cr40f_valorliberado": 1234.56,
  "cr40f_aprovadoem": null,
  "cr40f_Reserva@odata.bind": "/<reservaSet>(<guid>)",
  "cr40f_Cliente@odata.bind": "/<clienteSet>(<guid>)",
  "cr40f_LiberadoPor@odata.bind": "/systemusers(<guid>)"
}
```
  (a lista de campos de `liberacaoPatch` continua além de `cr40f_aprovadoem` em `portal.ts` l. 30-40; leitura parcial.) `cr40f_clientes1.cr40f_portalhabilitado` define se o cliente está no portal; `RESERVA_CANCELADA = 202410002`.
- Custom APIs (unbound, `geral/data/source.ts`):
  - `new_GerarLinkAcompanhamento`: entrada `{ "new_ReservaId": "<guid>" }`; saída `new_LinkJson` (texto JSON, parse em `geral/domain/link.ts`).
  - `new_GerarLinkCadastro`: entrada `{ "new_ReservaId": "<guid>", "new_PassageiroId": "<guid, opcional>" }`; saída `new_LinkJson` (`geral/domain/linkCadastro.ts`).
- Flows/variáveis de ambiente: `new_FlowUrlCriarOP` (`GeralPage.tsx`), `new_ScriptCopiarServicos` (`geral/domain/copy.ts`; natureza exata não confirmada). Auditoria de edição lê `new_snapshotsharepoint`.
- WebResources abertos: `new_formulario_geral.html`, `cr40f_VoucherConfirmacao.html?ids=[...]`, `cr40f_EscalaFDS.html`, `new_gestao_erros_operacionais.html`.

## 3. Operacional (`pages/operacional`)

- Entidades (`operacional/data/queries.ts`): `cr40f_reservadeveculos`, `cr40f_funcionarios`, `cr40f_servicosporpassageiro`, `cr40f_veiculos`.
- Reserva: `cr40f_dataehorriodesada`, `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_tipodoservico`, `cr40f_tipodeveiculo`, `cr40f_trajeto`, `cr40f_destino`, `cr40f_endereodesada`, `cr40f_horrioprevistoderetorno`, `cr40f_obsdeoperao`, `cr40f_observaointerna`, `cr40f_passageirosetelefonedecontato`, `new_linkacompanhamento`, `new_linkacompanhamentoexpiraem`; lookups `_cr40f_solicitante_value`, `_cr40f_motorista_value`, `_cr40f_veiculo_value`, `_cr40f_cliente_value`, `_cr40f_passageiro1_value` a `_cr40f_passageiro4_value`. Concluído = 202410008 (`operacional/domain/carro.ts`).
- Passageiros: `cr40f_servicosporpassageiro` filtrado por `_cr40f_geral_value`; campos `cr40f_ordemdeselecao`, `new_enderecodesaidacolunaservicosporpassageiro`; lookup para `cr40f_bancodedados`.
- Funcionários: `cr40f_funcionariosid`, `cr40f_nomecompleto`, `new_apelido`, `cr40f_funcao`, `cr40f_status`, `cr40f_celular`, `_cr40f_veiculoatual_value`, `cr40f_tipodevinculo` (1 = terceiro, `queries.ts` l. 60). Veículos: `cr40f_veiculosid`, `cr40f_placa`, `cr40f_modelo`, `cr40f_cor`.
- Escrita de motorista: `cr40f_Motorista@odata.bind` (`operacional/data/mutations.ts`).
- Custom API `new_GerarLinkAcompanhamento` (mesma assinatura da Geral).

## 4. Dashboard (`pages/dashboard`)

Somente leitura. Entidades (`dashboard/data/queries.ts`): `cr40f_reservadeveculos`, `cr40f_composicaodeprecos`, `cr40f_manutencoes`, `cr40f_multas`, `cr40f_errooperacional`, `cr40f_funcionarios`, `cr40f_veiculos`, `new_telemetriadiariainfleet`, `new_eventoinfleet`, `new_viageminfleet`, `cr40f_pagantes`, `cr40f_despesaoperacional`, `cr40f_categoriadespesaoperacional`, `cr40f_formapagamentodespesa`, `cr40f_anexodespesaoperacional`, `cr40f_itemplanopreventivo`, `cr40f_baselinepreventiva`.

- Reserva (`RESERVA_SELECT`): `cr40f_reservadeveculosid`, `cr40f_dataehorriodesada`, `createdon`, `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_tipodoservico`, `cr40f_tipodeveiculo`, `_cr40f_veiculo_value`, `new_categoriadoitem`, `_new_composicaodepreco_value`, `_cr40f_financeiro_value`, `new_datadefinalizacao`; `$expand` de `cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido)` e `cr40f_Cliente($select=cr40f_nomedocliente)`; a composição vem por navegação descoberta em `RelationshipDefinitions` (`cpNav`).
- Códigos fixos (`dashboard/domain/codes.ts`): `CAT_ITEM_SERVICO = 100000000`; `CP_PENDENTE = 100000000`, `CP_CONCLUIDA = 100000001`; `FAT_PAGO = 202410010`, `FAT_PAGANTE_EM_VIAGEM = 202410006`, `FAT_MENSAL = 202410008`; `MULTA_NOTIFICAR = 202410000`; status "sem motorista" = {202410001, 202410005, 202410008}; veículo próprio `'100000000'`, terceiro `'100000001'`, aluguel `'100000002'`. Pagante pago = 202410002 (`dashboard/domain/abas/financeiro.ts`).
- Despesa operacional: aguardando pagamento 100000001, anexo completo 100000002 (`abas/despesas.ts`).
- Manutenção: filtro por `cr40f_status eq 202410002 ...` (`queries.ts` l. 73; lista completa não vista).
- Telemetria Infleet (`new_telemetriadiariainfleet`): `new_data`, `new_distanciakm`, `new_distanciapercorridakm`, `new_velocidademedia`, `new_velocidademaxima`, `new_tempomotorociosomin`, `new_tempoacimavelocidademin`, `new_excessosdevelocidade`, `new_limitedevelocidade`, `new_combustivelconsumidolitros`, `new_custocombustivelconsumido`, `new_autonomiakml`; evento: `new_velocidaderegistrada`, `new_reportadoem`.
- `dashboard/data/historico2026.ts`: série histórica embutida (linhas `[data ISO, tipo, motorista, veículo, doc, cliente, ..., valor]`); uso e origem não confirmados.

## 5. Assistentes / Agentes (`pages/agentes`)

- `cr40f_agenteexecucao` (`agentes/data/queries.ts`): `cr40f_agenteexecucaoid`, `cr40f_agenteexecucaonome`, `cr40f_agente`, `cr40f_origem`, `cr40f_pergunta`, `cr40f_status`, `cr40f_erro`, `cr40f_resumo`, `cr40f_modelo`, `cr40f_tokensentrada`, `cr40f_tokenssaida`, `createdon`.
  - `cr40f_agente`: 100000000 financeiro; 100000001 logística; 100000002 pessoas; 100000003 frota.
  - `cr40f_status`: 100000000 pendente; 100000001 processando; 100000002 concluída; 100000003 erro.
  - `cr40f_origem`: 100000000 = Agendado (o código diz que o choice só tem Agendado/Manual; "ao abrir" é marcado por sufixo no nome).
- `cr40f_agenteproposta`: `cr40f_agentepropostaid`, `_cr40f_execucao_value`, `cr40f_tipo`, `cr40f_titulo`, `cr40f_justificativa`, `cr40f_prioridade` (100000000 alta, 100000001 média, 100000002 baixa), `cr40f_entidadealvo`, `cr40f_idalvo`, `cr40f_acao` (JSON), `cr40f_decisao` (100000000 pendente, 100000001 aprovada, 100000002 descartada), `cr40f_motivodescarte`, `cr40f_decididoem`, lookup `cr40f_DecididoPor` (systemusers).
- `cr40f_acao` (formato do JSON, `queries.ts` `parseAcao`): `{ "tipo": "CriarPendencia|AtribuirMotorista|AtribuirVeiculo|CriarComunicadoRascunho", "campos": { ... } }`.
- Efeitos de Aprovar (`agentes/domain/acoes.ts`):
  - `AtribuirMotorista`: `PATCH cr40f_reservadeveculos(<idAlvo>)` `{ "cr40f_Motorista@odata.bind": "/cr40f_funcionarioses(<motoristaId>)" }`.
  - `AtribuirVeiculo`: `{ "cr40f_Veiculo@odata.bind": "/cr40f_veiculoses(<veiculoId>)" }`.
  - `CriarPendencia`: cria `cr40f_plannertarefa` com `cr40f_name` (até 100), `cr40f_titulo` (até 200), `cr40f_descricao`, `cr40f_status: 100000000`, `cr40f_origem: 100000000`, `cr40f_prioridade` (alta mapeia a 100000002; média e baixa não vistas por inteiro).
  - `CriarComunicadoRascunho`: cria `cr40f_comunicadohome` `{ cr40f_name, cr40f_titulo (até 300), cr40f_conteudo, cr40f_ativo: false, cr40f_prioridade: 100000000, cr40f_publico: 100000000 }`.
- Registro da decisão: `PATCH cr40f_agenteproposta` `{ cr40f_decisao, cr40f_motivodescarte (até 500), cr40f_decididoem, "cr40f_DecididoPor@odata.bind": "/systemusers(<id>)" }` (`agentes/data/source.ts` l. 66).
- Alvos permitidos (`AgentesPage.tsx` l. 22): `cr40f_reservadeveculos`, `cr40f_financeiro`, `cr40f_pagamentoaterceiro`, `cr40f_funcionarios`, `cr40f_documento`, `cr40f_multas`.
- Sem Custom API chamada pelo shell; a execução do assistente é feita por flow que lê `cr40f_agenteexecucao` (não está no shell; não confirmado).

## 6. Funções Operacionais (`pages/funcoes-operacionais`)

- Entidades (`domain/config.ts`): `cr40f_reservadeveculos`, `cr40f_funcionarios`, `cr40f_veiculos`, `cr40f_servicosporpassageiro`, `cr40f_trocasdecarro`, `new_possedeveiculo`, `new_localdebase`.
- Navegações: `cr40f_Cliente`, `cr40f_Solicitante` (para `cr40f_bancodedados`), `cr40f_Motorista`, `cr40f_Veiculo`/`cr40f_veiculo`, `cr40f_Geral` (serviço do passageiro), `cr40f_BancodeDados` (passageiro), `cr40f_Motorista1/2`, `cr40f_Veiculo1AntesdaTroca`, `cr40f_Veiculo2AntesdaTroca`, `new_Motorista`, `new_Veiculo`.
- `cr40f_trocasdecarro`: campos `cr40f_statusdatroca`, `cr40f_iniciodajaneladetroca`, `cr40f_fimdajaneladetroca`, `new_tipodetroca`, `new_mododajanela`, `new_localdatroca`, `new_alertajanela` (os demais estão em `domain/config.ts`/`queries.ts`).
  - `new_tipodetroca`: 100000000 Troca; 100000001 Devolução à base; 100000002 Retirada da base; 100000003 Repasse.
  - Status da troca: 202410000 Programada; 100000001 Confirmada; 202410001 Concluída; 202410002 Cancelada.
  - Modo da janela: 100000000 fixa; 100000001 entre serviços.
  - Posse (`new_possedeveiculo`): `new_propriedade` (100000000 Próprio, 100000001 Alugado), `new_iniciodaposse`, `new_fimdaposse`, `new_fornecedorlocacao`, `new_fimlocacao`.
- Gravações diretas:
  - Trocar motorista: `PATCH` na reserva `{ "cr40f_Motorista@odata.bind": "/cr40f_funcionarioses(<id>)" }` ou `{ "cr40f_Motorista": null }` (`payloads.ts` `changeDriverPayload`).
  - Duplicar pedido: `POST cr40f_reservadeveculoses` com `cr40f_dataehorriodesada`, `cr40f_obsdeoperao`, `cr40f_observaointerna`, `cr40f_status: 202410001` (Confirmado), tipo de serviço/veículo, destino, endereço, `paxView`, trajeto, perfil, e-mail, forma de pagamento, `cr40f_cotao`, `cr40f_cr`, `cr40f_receber` e binds de cliente, solicitante, motorista; depois `POST cr40f_servicosporpassageiros` com `{ <ordem>: n, "cr40f_Geral@odata.bind", "cr40f_BancodeDados@odata.bind" }` por passageiro. Veículo, faturamento, categoria, retorno, OT e finalização não são copiados (comentário em `payloads.ts`).
  - Local da base: `POST new_localdebases` com nome, endereço e link do mapa (nomes de campo em `CONFIG.fields.localBase`: `new_name`, `new_endereco`, `new_linkmapa`).
- Custom APIs (`domain/payloads.ts`; lookups viram objeto `{ "@odata.type": "Microsoft.Dynamics.CRM.<entidade>", "<idField>": "<guid>" }`):
  - `new_RegistrarTrocaDeCarro` (unbound). Parâmetros: `new_Motivo`, `new_Inicio`, `new_Fim`, `new_Tipo`, `new_Motorista1`, `new_Motorista2`, `new_Veiculo1`, `new_Veiculo2`, `new_LocalDeBase`, `new_Local`, `new_Observacao`, `new_ConcluirImediatamente` (bool), `new_DataEfetiva`, `new_ProgramarAutomaticamente` (bool), `new_IdempotencyKey` (`exchange-<fnv1a>-<início em base 36>`), `new_ModoJanela`, `new_M1DepoisDe`, `new_M1AntesDe`, `new_M2DepoisDe`, `new_M2AntesDe`. Retorno: não confirmado.
  - `new_AtualizarTrocaDeCarro`: `new_Motivo`, `new_VersaoEsperada` (rowversion), `new_Inicio`, `new_Fim`, `new_Observacao`, janela e `new_Local` (vazio limpa o campo). Bound à troca.
  - `new_CancelarTrocaDeCarro` e `new_ReverterTrocaDeCarro`: `new_Motivo`, `new_VersaoEsperada`, `new_DataEfetiva` (só na reversão). Bound à troca (`cr40f_trocasdecarros(<id>)/Microsoft.Dynamics.CRM.<api>`).

```json
{
  "new_Motivo": "Registro operacional da troca.",
  "new_Inicio": "2026-11-03T12:00:00.000Z",
  "new_Fim": "2026-11-03T13:00:00.000Z",
  "new_Tipo": 100000000,
  "new_Motorista1": { "@odata.type": "Microsoft.Dynamics.CRM.cr40f_funcionarios", "cr40f_funcionariosid": "<guid>" },
  "new_ConcluirImediatamente": false,
  "new_ProgramarAutomaticamente": true,
  "new_IdempotencyKey": "exchange-<hash>-<ms36>",
  "new_ModoJanela": 100000000
}
```

## 7. Comunicados (`pages/comunicados`)

- `new_comunicadomotorista` (`comunicados/data/source.ts`, `domain/comunicados.ts`): `new_comunicadomotoristaid`, `new_name`, `new_titulo`, `new_corpo`, `new_tipo` (100000000 informativo, 100000001 ciência), `new_escopo` (100000000 todos, 100000001 selecionados), `new_alvosjson` (JSON de GUIDs; `[]` para todos), `new_estado` (100000000 rascunho, 100000001 disparado), `new_disparadoem`.
- `new_comunicadodestinatario`: `new_comunicadodestinatarioid`, `new_abertoem`, `new_lidoem`, `new_cienteem`, `new_enviadoem`, `new_pushstatus` (100000000/1/2), `new_pusherro`, `new_observacao`, `new_nomeassinante`, `new_assinaturajson`; lookup para motorista (`cr40f_funcionarios`: `cr40f_funcionariosid`, `cr40f_nomecompleto`, `cr40f_emailmicrosoft`, `cr40f_tipodevinculo`, `cr40f_status`).
- Payload do rascunho: `{ new_name, new_titulo, new_corpo, new_tipo, new_escopo, new_alvosjson, new_estado: 100000000 }`.
- Custom APIs (strings): `new_DispararComunicadoMotorista` `{ "new_ComunicadoId": "<guid>" }` (cria destinatários e enfileira push); `new_ReenviarPushComunicado` `{ "new_DestinatarioId": "<guid>" }`. Retorno: não usado pelo shell.
- Também lê `systemuser` (entidade `usuario` em `ENTITIES`).

## 8. Qualidade (`pages/qualidade`, JS)

- Tabelas (`qualidade/dataverse.js`): `cr40f_errooperacional`, `cr40f_acaooperacional`, `cr40f_reservadeveculos`, `cr40f_funcionarios`, `cr40f_veiculos`, `annotation`, `cr40f_errooperacionalarquivo`.
- Campos do erro: `cr40f_errooperacionalid`, `cr40f_titulo`, `cr40f_descricao`, `cr40f_status`, `cr40f_gravidade`, `cr40f_categoria`, `cr40f_origem`, `cr40f_dataocorrencia`, `cr40f_dataresolucao`, `cr40f_impacto`, `cr40f_impactofinanceiro`, `cr40f_causa`, `cr40f_solucao`, `cr40f_resultado`, `cr40f_responsavelid`/`cr40f_responsavelnome` e equivalentes de reserva, veículo e motorista. Campos da ação: `cr40f_acaooperacionalid`, `cr40f_tipoacao`, `cr40f_prioridade`, `cr40f_prazo`, `cr40f_agendadoem`, `cr40f_dataconclusao`. Arquivo: `cr40f_nomearquivo`, `cr40f_mimetype`, `cr40f_pasta`, `cr40f_caminho`. Que campo é lookup e qual é texto não foi confirmado.
- Choices em `qualidade/domain.js`: status do erro 100000000 Novo; 100000002 Em tratamento; 100000003 Aguardando terceiro; 100000004 Resolvido; 100000005 Encerrado; 100000006 Cancelado. Gravidade 100000000 Baixa; 100000001 Média; 100000002 Alta; 100000003 Crítica. Categoria: 100000000 Planejamento; 100000001 Escala de motorista; 100000002 Veículo; 100000003 Comunicação; 100000004 Atendimento ao passageiro; 100000005 Fornecedor; 100000006 Financeiro/Cobrança; 100000007 Tecnologia/Sistema; 100000008 Documentação; 100000009 Outro. Origem (cinco primeiros valores): 100000000 Monitoramento; 100000001 Motorista; 100000002 Passageiro/Cliente; 100000003 Operação; 100000004 Fornecedor. Os mapas completos (inclusive de ação) estão em `domain.js`; só as linhas 1-33 foram lidas.
- Arquivos: Flow HTTP pela variável `new_FlowURLFlowSalvarArquivosOnedrive` (corpo não visto).

## 9. Planner e Cotações (`pages/planner`)

Leitura parcial: o módulo tem 93 arquivos. Evidências em `planner/data/dataverse.ts`.

- Tabelas e entity sets: `cr40f_plannertarefa`→`cr40f_plannertarefas`; `cr40f_plannertarefaevento`→`cr40f_plannertarefaeventos`; `cr40f_plannertarearelacao`→`cr40f_plannertarearelacaos`; `cr40f_plannertarearesponsavel`→`cr40f_plannertarearesponsavels`; `cr40f_plannertarefaequipe`→`cr40f_plannertarefaequipes`; `cr40f_plannerequipe`→`cr40f_plannerequipes`; `cr40f_plannerequipemembro`→`cr40f_plannerequipemembros`; `cr40f_plannernotificacao`→`cr40f_plannernotificacaos`; `cr40f_plannerdisparo`→`cr40f_plannerdisparos`; `cr40f_plannertagpessoal`→`cr40f_plannertagpessoals`; `cr40f_plannertagpessoaltarefa`→`cr40f_plannertagpessoaltarefas`; `cr40f_boasideias`→`cr40f_boasideiases`; `cr40f_pedidodecotacao`→`cr40f_pedidodecotacaos`; `cr40f_cotacaoopcao`→`cr40f_cotacaoopcaos`; `cr40f_cotacaoopcaoitem`→`cr40f_cotacaoopcaoitems`; `cr40f_cotacaopropostaversao`→`cr40f_cotacaopropostaversaos`; também `cr40f_errooperacional`→`cr40f_errooperacionals`, `cr40f_acaooperacional`→`cr40f_acaooperacionals`, `cr40f_funcionarios`, `environmentvariabledefinitions`, `environmentvariablevalues`, `systemusers`, `teams`.
- Tarefa (`cr40f_plannertarefa`), valores do código: `cr40f_origem` manual 100000000, cotação 100000001, qualidade 100000002; `cr40f_status` todo 100000000, doing 100000001, waiting 100000002, done 100000003, cancelled 100000004; `cr40f_prioridade` low 100000000, medium 100000001, high 100000002, urgent 100000003. Campos vistos: `cr40f_titulo`, `cr40f_descricao`, `cr40f_prazo`, `cr40f_codigoorigem`, `cr40f_chavededupe`, `cr40f_arquivada`, `cr40f_checklistjson`, `cr40f_linktarefaplanner`, `cr40f_linkmensagemteams`, `cr40f_prazoresolucao`, `cr40f_prazoresponder`.
- Cotação (`cr40f_pedidodecotacao`): `cr40f_statuscotacao` com Nova 100004000; Em análise pelo financeiro 100004001; Aguardando informação 100004002; Cotada 100004003; Respondida ao cliente 100004004; Cancelada 100004005; Perdida 100004006; Aceita pelo cliente 100004007. Prioridade 100003000 a 100003003 (low a urgent). Canal: WhatsApp 100001000; Telefone 100001001; E-mail 100001002. Campos de pedido: `cr40f_perfilpassageiro`, `cr40f_observacoesinternas`. Colunas opcionais sondadas na carga (criadas por `scripts/ensure-quote-*.ps1`): `cr40f_aguardandooque`, `cr40f_aguardandodequem`, `cr40f_aguardandoretorno`, motivo de perda (`cr40f_motivoperda`), rota, rotas longas. Outras: `cr40f_numerodacotacao`, `cr40f_valorcotado`, `cr40f_revisao`, `cr40f_quantidadepassageiros`, `cr40f_origemcompleta`, `cr40f_destinocompleto`, `cr40f_datahoraservico`, `cr40f_datahoraretorno`, `cr40f_clienteempresa`, `cr40f_contatocliente`, `cr40f_emailcliente`, `cr40f_telefonewhatsapp`, `cr40f_condicaocomercial`, `cr40f_opcaoaceitaid`, `cr40f_VersaoPropostaAceita` (lookup/nav, nome exato não confirmado).
- Auth Graph: MSAL (`planner/data/msal.ts`).
- Arquivos: variáveis `new_URLFlowsalvararquivosSharePoint`, `new_URLFlowConsultarArquivosSharePoint`, `new_URLFlowExcluirArquivoSharePoint`; redirect MSAL no WebResource `new_TelaPlanner_redirect.html`.

## 10. Ordens de Pagamento (`pages/ops`)

- `cr40f_financeiro` (OP): `cr40f_status` (ver choices compartilhadas), `cr40f_idioma`, `cr40f_idfinanceiro`, `cr40f_valor`, `cr40f_trajetos`, `cr40f_datado1servico`, `cr40f_datadoultimoservico`, `new_valortotal`, `new_passageirosdaop`, `new_clientedaop` (uso exato desses três não confirmado).
- Serviços da OP: leitura em `cr40f_reservadeveculos` por `_cr40f_financeiro_value`; valores de `cr40f_composicaodeprecos.new_valortotal` pelo `_cr40f_servicorelacionadogeral_value` (blocos de 15 OPs, 4 por vez).
- Escrita: cancelar `PATCH cr40f_financeiro(<id>)` `{ "cr40f_status": 202410004 }`. Regra: pagante ativo bloqueia o cancelamento (`ops/domain/status.ts`). A criação da OP pela Geral usa o Flow `new_FlowUrlCriarOP`.

## 11. Pagantes (`pages/pagantes`)

- `cr40f_pagantes` (`pagantes/data/queries.ts`): `cr40f_pagantesid`, `cr40f_status` / `cr40f_statuspagante`, `cr40f_valor`, `cr40f_formadepagamento`, `cr40f_datadoprimeiropagamento`, `cr40f_datadoultimolembrete`, `cr40f_nomedopassageiro`, `cr40f_telefone`, `cr40f_email`, `cr40f_linkdepagamento`, `cr40f_linkdorecibo`, `cr40f_statusgeracaolink`, `cr40f_errogeracaolink`, `cr40f_statusenvioemail`, `cr40f_erroenvioemail`, `cr40f_dataenvioemail`, `cr40f_statusdorecibo`, `new_statusgeracaorecibo`, `new_errogeracaorecibo`; lookups para `cr40f_bancodedados`, `cr40f_reservadeveculos`, `cr40f_composicaodeprecos`.
- Choices (`pagantes/domain/status.ts`):
  - `cr40f_statuspagante`: 202410001 pendente; 202410002 pago; 202410003 negado; 202410004 expirado; 202410005 cancelado; 202410006 não finalizado; 202410007 autorizado; 202410010 aguardando facial.
  - `cr40f_statusdorecibo`: 202410000 pendente (dispara recibo automático); 202410001 enviado; 202410002 gerado.
  - `cr40f_statusgeracaolink` e `cr40f_statusenvioemail`: 202410000 não aplicável; 202410001 pendente; 202410002 concluído; 202410003 erro.
  - `new_statusgeracaorecibo`: 100000000 não aplicável; 100000001 processando; 100000002 concluído; 100000003 erro.
- Recibo: carrega o script `/WebResources/cr40f_GerarRecibo`, que usa a função global `GerarRecibo(control)` com grade simulada; entrega pelo Flow da variável `new_FlowUrlGerarRecibo`.
- Regras: pago e autorizado ficam travados; atualização por `PATCH cr40f_pagantes` (payload montado nos componentes, não detalhado aqui).

## 12. Pendências financeiras (`pages/pendencias`)

- Entidades: `cr40f_reservadeveculos`, `cr40f_pagantes`, `cr40f_composicaodeprecos`, `cr40f_financeiro` (`pendencias/data/queries.ts`, `source.ts`). Códigos em `pendencias/domain/codes.ts`: OP e pagante conforme acima; `FAT` pago 202410010, pagante 202410006, mensal 202410008, pendente 202410005, pagamentoPendente 202410007; `CP` pendente 100000000, concluída 100000001; reserva concluída 202410008.
- Custom APIs (`pendencias/data/source.ts`; corpo e resposta em JSON dentro de texto):
  - `cr40f_SincronizarFinanceiro`, bound à OP: `POST cr40f_financeiro(<opId>)/Microsoft.Dynamics.CRM.cr40f_SincronizarFinanceiro` com `{ "cr40f_RequestJson": "{\"modo\":\"<modo>\",\"origem\":\"manual\"}" }`; retorno `cr40f_ResponseJson` (JSON, tipo `Sincronizacao`).
  - `cr40f_FecharMesCliente` (unbound): `{ "cr40f_RequestJson": "{\"clienteId\":\"<guid>\",\"mes\":\"<mes>\"}" }`; retorno `cr40f_ResponseJson` (tipo `FechamentoMes`). Formato de `mes` não confirmado (conferir `FecharMesDialog.tsx`).

## 13. Validação do cliente (`pages/validacao-cliente`)

- Tabelas (`validacao-cliente/data/queries.ts`): `cr40f_validacaoservico`, `cr40f_mensagemvalidacao`, `cr40f_validadorcliente`, `cr40f_reservadeveculos`, `cr40f_clientes1`, `cr40f_composicaodeprecos`.
- `cr40f_validacaoservico`: `cr40f_validacaoservicoid`, `cr40f_status`, `cr40f_liberadoem`, `cr40f_observacao`, `cr40f_valorliberado`, `cr40f_valoranterior`, `cr40f_prazotacita`, `cr40f_aprovadoem`, `cr40f_aprovadopor`, `cr40f_incluirfechamento`, `cr40f_reservaunica`, `cr40f_name`; lookups `cr40f_Reserva`, `cr40f_Cliente`, `cr40f_LiberadoPor`.
  - `cr40f_status` (`validacao-cliente/domain/regras.ts`): 100000000 liberado; 100000001 em dúvida; 100000002 respondido; 100000003 aprovado; 100000004 aprovado tácito; 100000005 retirado.
  - `cr40f_incluirfechamento`: 100000000 pendente; 100000001 sim; 100000002 não.
- `cr40f_mensagemvalidacao`: `cr40f_texto`, `cr40f_lado` (100000000 cliente, 100000001 Betinhos), `cr40f_motivo` (100000000 espera; 100000001 km/rota; 100000002 valor; 100000003 passageiro; 100000004 outro), `cr40f_autor`, lookup `cr40f_Validacao`.
- `cr40f_validadorcliente`: `cr40f_email`, `cr40f_ativo`, `cr40f_segredototp`, `cr40f_ultimoacesso`, `cr40f_totpcadastradoem` (lookup de cliente `cr40f_Cliente`).
- `cr40f_clientes1.cr40f_portalhabilitado`; `cr40f_reservadeveculos`: `cr40f_idtenaris`, `cr40f_cr`, `cr40f_trajeto`, `cr40f_dataehorriodesada`, `_cr40f_cliente_value`, `_new_composicaodepreco_value`; composição: `new_status` 100000001 concluída, `new_valortotal` e campos de valor (`new_valorpedagios`, `new_valorpassagens`, `new_valorlocacao`, `new_valorestacionamento`, `new_ajuste`, `cr40f_valortempodeespera`, `cr40f_valorrodoanel`, `cr40f_valorpassageirosadicionais`, `cr40f_valorhoramotorista`, `cr40f_valordesviosentrecidades`, `cr40f_valordadiaria`, `cr40f_valorcombustivel`, `cr40f_valorayrtonsenna`, `cr40f_valorarcometropolitano`, `cr40f_valoradequacaoderota`).
- E-mail de resposta ao cliente (Flow HTTP na variável `cr40f_URLFlowPortalClienteEmails`): `POST <url>` `{ "tipo": "resposta_betinhos", "para": ["<emails dos validadores ativos>"], "dados": { "servico", "data", "trajeto", "texto" } }`.
- Permissões: usa `WhoAmI` e `systemusers(<id>)/systemuserroles_association?$select=name` para checar papéis.

## 14. Pagamento de Fornecedores (`pages/pagamento-fornecedores`, JS)

Tabelas (`lib/dataverse.js` `TABLES`): `cr40f_funcionarios`, `cr40f_composicaodeprecos`, `cr40f_reservadeveculos`, `cr40f_servicosporpassageiro`, `cr40f_terceirofavorecido`, `cr40f_vinculomotoristafavorecido`, `cr40f_pagamentoaterceiro`, `cr40f_itempagamentoaterceiro`, `cr40f_eventopagamentoaterceiro`.

- Choices (`CHOICES`): composição concluída 100000001; categoria serviço 100000000; favorecido ativo 100000000, inativo 100000001; vínculo ativo 100000000, inativo 100000001; lote aberto 100000000, cancelado 100000001; pagamento aberto 100000000, pago 100000001; documento: não gerado 100000000, enviando 100000001, enviado 100000002, falhou 100000003, reenvio necessário 100000004; evento: criado 100000000, e-mail enviado 100000001, e-mail reenviado 100000002, pagamento registrado 100000003, comprovante anexado 100000004, falha de notificação 100000005, rascunho atualizado 100000006, cancelado 100000007, pagamento revertido 100000008, falha de documento 100000009.
- Favorecido: `cr40f_nomerazaosocial`, `cr40f_cpfcnpj`, `cr40f_tipopessoa` (100000000 PF, 100000001 PJ), `cr40f_tipochavepix` (100000000 a 100000003; só 100000001 e seguintes mapeados no trecho lido, rótulos das chaves não confirmados), `cr40f_chavepix`, `cr40f_email`, `cr40f_telefone`.
- Pagamento (`cr40f_pagamentoaterceiro`): `cr40f_statuslote`, `cr40f_statuspagamento`, `cr40f_statusdocumento`, `cr40f_identificadorlote`, `cr40f_versaoenvio`, `cr40f_totalcobradocliente`, `cr40f_totalrepasse`, `cr40f_margemtotal`, `cr40f_quantidadeservicos`, `cr40f_pagoem`, `cr40f_pagamentorevertidoem`, `cr40f_canceladoem`, `cr40f_motivocancelamento`, `cr40f_motivoreversaopagamento`, `cr40f_comprovanteurl`, `cr40f_documentourl`, `cr40f_documentonome`, `cr40f_documentoversao`, `cr40f_documentoemailid`, `cr40f_emailfavorecidoenvio`, `cr40f_snapshotfavorecido`, `cr40f_snapshotfinanceiro`, `cr40f_terceirofavorecido` (lookup), `cr40f_anoreferencia`.
- Item: `cr40f_valorcobrado`, `cr40f_valorrepasse`, `cr40f_margem`, `cr40f_dataservico`, `cr40f_trajeto`, `cr40f_reserva`, `cr40f_composicao`, `cr40f_motoristareferencia`, `cr40f_consolidado`. Evento: `cr40f_operacao`, `cr40f_estadoanterior`, `cr40f_estadonovo`, `cr40f_resultado`, `cr40f_mensagem`, `cr40f_detalhetecnico`, `cr40f_dataevento`, `cr40f_versao`.
- Criação do lote: `cr40f_statuslote: 100000000`, `cr40f_statuspagamento: 100000000`, `cr40f_statusdocumento: 100000000`; cancelamento `cr40f_statuslote: 100000001`; pagamento registrado `cr40f_statuspagamento: 100000001` (`lib/dataverse.js` l. 1823-2086).
- Flows HTTP: `new_FlowURLEnviarDocumentoLoteFornecedor` (envio do documento do lote), `new_FlowURLFlowSalvarArquivosOnedrive` (comprovantes). Corpos não lidos.

## 15. Despesas (App Motoristas) (`pages/despesas`)

- `cr40f_despesaoperacional` (`despesas/data/queries.ts`): `cr40f_nome`, `cr40f_datagasto`, `cr40f_valor`, `cr40f_tipo`, `cr40f_origem`, `cr40f_estabelecimento`, `cr40f_litros`, `cr40f_kminformado`, `cr40f_latitude`, `cr40f_longitude`, `cr40f_protocolo`, `cr40f_possivelduplicidade`, `cr40f_observacao`, `cr40f_observacaointerna`, `cr40f_statusoperacional`, `cr40f_statusfinanceiro`, `cr40f_statusanexo`; campos de IA: `cr40f_ia`, `cr40f_iastatusanalise`, `cr40f_iadecisao`, `cr40f_iaconfianca`, `cr40f_iamotivos`, `cr40f_iamodelo`, `cr40f_iavalorlido`, `cr40f_iaestabelecimentolido`, `cr40f_iacnpjlido`, `cr40f_iadatalida`, `cr40f_iadataanalise`; lookups para funcionário, veículo, reserva, manutenção.
  - `cr40f_statusoperacional` (`despesas/domain/status.ts`): 100000000 enviado; 100000001 corrigir; 100000002 validado; 100000003 recusado; 100000004 cancelado.
  - `cr40f_statusfinanceiro`: 100000000 não reembolsável; 100000001 aguardando; 100000002 pago; 100000003 cancelado.
  - `cr40f_statusanexo`: 100000000 sem; 100000001 enviando; 100000002 completo; 100000003 falhou; 100000004 parcial.
  - `cr40f_origem`: 100000000 App Motoristas; 100000001 Model-driven; 100000002 Flow; 100000003 Importação.
  - IA (`despesas/domain/ia.ts`): status 100000000 pendente, 100000001 processando, 100000002 concluída, 100000003 erro; decisão 100000000 validar, 100000001 corrigir.
- `cr40f_anexodespesaoperacional`: `cr40f_anexodespesaoperacionalid`, `cr40f_tipo` (100000000 Comprovante; 100000001 Foto complementar; 100000002 Outros), `cr40f_status` (100000000 Pendente; 100000001 Enviado; 100000002 Falhou; 100000003 Inválido; 100000004 Processando), `cr40f_nomearquivo`, `cr40f_driveitemid`, `cr40f_urlsharepoint`, `cr40f_sharelink`, `cr40f_dataenvio`, `cr40f_ordem`.
- Arquivo: `POST` ao Flow da variável `new_URLFlowConsultarArquivoOneDrive` (`despesas/data/arquivo.ts`; corpo `body` montado no arquivo, não detalhado).

## 16. Frota (`pages/frota`)

- Tabelas (`frota/data/schema.ts` `TABLE`): `cr40f_veiculos`, `cr40f_manutencoes`, `cr40f_multas`, `cr40f_infracaodetransito`, `cr40f_colisao_v2`, `new_possedeveiculo`, `cr40f_itemplanopreventivo`, `cr40f_baselinepreventiva`, `cr40f_despesaoperacional`, `new_telemetriadiariainfleet`; mais `cr40f_categoriadespesaoperacional`, `new_termomulta`, e (checklists) `new_checklistmodelo`, `new_checklistmodeloitem`, `new_checklistveiculo`.
- Chaves e campo de status por tipo (`KIND_TABLE`, `KIND_ID`, `STATUS_FIELD`): manutenção `cr40f_manutencoesid` / `cr40f_status`; multa `cr40f_multasid` / `cr40f_status`; colisão `cr40f_colisao_v2id` / `cr40f_statusoperacional`.
- Status:
  - Manutenção: 0 Solicitado; 202410001 Aprovado; 202410005 Programado; 202410002 Realizado; 100000002 Reprovado; 100000001 Cancelado.
  - Multa: ver choices compartilhadas.
  - Colisão: 100000000 Enviado; 100000001 Em análise; 100000002 Resolvido; 100000003 Cancelado. `TIPO_COLISAO`: 100000000 "Eu bati"; 100000001 "Bateram em mim".
  - Grau da manutenção (`GRAU`): 1 Baixa; 2 Média; 3 Alta; 4 Urgente. Tipo de reparo (`TIPO_REPARO`): 1 Preventiva sistemática; 2 Corretiva não crítica; 100000001 Corretiva crítica; 100000002 Conservação, conforto e imagem; 100000003 Avaria (lista completa entre as linhas 78-86 de `schema.ts`, parcialmente lida).
  - Origem da classificação (`new_classificacaoorigem`, `manutencaoCatalogo.ts`): 100000000 IA (histórico: a classificação pela Jev foi retirada em 10/11/2026; a tela só mostra o que já foi gravado); 100000001 manual (única forma de classificar hoje); 100000002 revisar. Escolha múltipla vem como `"100000000,100000001"`.
- Plano preventivo: `cr40f_itemplanopreventivo` com `cr40f_name`, `cr40f_servico`, `cr40f_intervalokm`, `cr40f_intervalomeses`, `cr40f_avisokm` (padrão 1000), `cr40f_avisodias` (padrão 30); `cr40f_baselinepreventiva` com `cr40f_name`, `cr40f_Veiculo@odata.bind`, `cr40f_Item@odata.bind`, `cr40f_km`, `cr40f_data`.
- Veículo: `cr40f_placa`, `cr40f_modelo`, `cr40f_marca`, `cr40f_cor`, `cr40f_anodefabricacao`, `cr40f_anodemodelo`, `cr40f_blindado`, `cr40f_hodometro`, `cr40f_hodometroem`, `cr40f_statusdoveiculo`, `new_categoriadoveiculo`, `new_apelido`, `new_estado`.
- Multa: `cr40f_novacoluna` (título), `cr40f_valordamulta`, `cr40f_dataehorario`, `cr40f_localdainfracao`, `cr40f_datadeindicacao`, `cr40f_datadeavisoaocondutor`, `cr40f_pontosnacnh`, lookups placa, motorista (`_cr40f_motorista_value`), `cr40f_codigodainfracao` (para `cr40f_infracaodetransito`); campos novos `new_valorguia`, `new_recursopendente`.
- Posse (`new_possedeveiculo`): `new_iniciodaposse`, `new_fimdaposse`, `new_propriedade`; lookups `new_Motorista`, `new_Veiculo`.
- Termo de multa (`new_termomulta`): `new_status` com 100000000 pendente; 100000001 assinado; 100000002 contestado; 100000003 expirado; 100000004 cancelado. Outros campos vistos na pasta: `new_formapagamento` (100000000 guia, 100000001 folha), `new_parcelas`, `new_valortotal`, `new_primeiracompetencia`, `new_competencia`, `new_assinadoem`, `new_canceladoem`, `new_hashpdf`, `new_motivocontestacao`, `new_motivocancelamento`, `new_ultimolembreteem`, `new_erroatribuicao`, `new_atribuidoem`, tabela de parcelas `new_parcelamultafolha`.
- Custom APIs do termo (`frota/data/dataverse.ts`, função `customApi`, POST unbound):
  - `new_EnviarTermoMulta`: `{ new_MultaId, new_FormaPagamento (100000000 guia | 100000001 folha), new_Parcelas, new_ValorTotal, new_PrimeiraCompetencia: "YYYY-MM-DDT00:00:00Z" }`; retorno `new_TermoId`.
  - `new_CancelarTermoMulta` `{ new_TermoId }`; `new_LembrarTermoMulta` `{ new_TermoId }` (1 por 24 h, conforme comentário em `source.ts`); `new_BaixarPdfTermoMulta` `{ new_TermoId }` com retorno `new_PdfBase64` e `new_NomeArquivo`.
- Flows HTTP (variáveis de ambiente): `new_FlowUrlManutencao` (corpo `{ "guids": "<id>" }`), `new_FlowUrlNotificarMotoristaMultas` (`{ "guids": "<id>" }`), `new_FlowUrlGerarContratoMultas` (`{ "GUID_MULTA": "<id>" }`), `new_FlowUrlClassificarManutencao`. Arquivos: `new_URLFlowsalvararquivosSharePoint`, `new_URLFlowListarArquivosSharePoint`, `new_URLFlowConsultarArquivosSharePoint`.
- Checklists (`frota/checklists/domain/*.ts`):
  - `new_checklistveiculo`: `new_checklistveiculoid`, `new_numero`, `new_data`, `new_origem` (100000000 quinzenal; 100000001 manual; 100000002 troca), estado (100000000 aguardando motorista; 100000001 pendente; 100000002 concluído; 100000003 cancelado; nome do campo de estado não confirmado), `new_respostasjson`, `new_qtdproblemas`, `new_temproblema`, `new_pushstatus`, `new_pusherro`, `new_enviadoem`, `new_canceladoem`, `new_motivocancelamento`, `new_checklistmodeloid`.
  - `new_checklistmodelo`: `new_ativo`, `new_padraoquinzenal`, `new_filtrojson` (ex.: `{"condicoes":[{"campo":"new_categoriadoveiculo","operador":"em","valor":[100000001,100000002]}]}`), `new_descricao`, `new_periodicidadedias`. `new_checklistmodeloitem`: `new_tipo` (100000000 foto; 100000001 número; 100000002 texto; 100000003 ok/nok), `new_obrigatorio`, `new_ordem`, `new_instrucao`, `new_opcoesproblema`, `new_unidade`, `new_itensjson`.
  - Custom APIs (todas com parâmetros `Edm.String`, executadas por `Xrm.WebApi.online.execute`, `executeChecklistAction`): `new_ConcluirChecklistVeiculo` `{ new_ChecklistId, new_RespostasJson }`; `new_SolicitarChecklistVeiculo` `{ new_VeiculoId, new_ModeloId (opcional) }`; `new_ReatribuirChecklistVeiculo` `{ new_ChecklistId }`; `new_CancelarChecklistVeiculo` `{ new_ChecklistId, new_Motivo (mín. 5 caracteres, MOTIVO_MIN) }`; `new_ReenviarPushChecklist` `{ new_ChecklistId }`. Retorno não usado. Fotos: variável `new_URLFlowConsultarArquivoOneDrive`.
  - Veículos elegíveis: `cr40f_statusdoveiculo` 202410001 ativo, categoria própria 100000000 (`filtroVeiculo.ts`).
- Infleet: `new_telemetriadiariainfleet` (quilometragem), `new_odometroinfleet`, `new_trocadetectadaem` nos dados de frota (uso exato não confirmado).

## 17. Infrações (`pages/infracoes`)

- `cr40f_infracaodetransito` (`infracoes/data/queries.ts`, `domain/choices.ts`): `cr40f_codigodainfracao`, `cr40f_descricaodainfracao`, `cr40f_valordamulta`, `cr40f_pontosnacnh`, `cr40f_enquadramentonoctb`, `cr40f_gravidadedainfracao` (0 Leve; 1 Média; 2 Grave; 3 Gravíssima), `cr40f_competencia` (multi-choice: 202410000 Municipal; 202410001 Rodoviário; 202410002 Estadual; chega como `"202410000,202410002"`), `cr40f_responsabilidade` (0 Condutor; 1 Proprietário), `cr40f_status`.
- Multas ligadas: `cr40f_multas` (`cr40f_multasid`, `cr40f_novacoluna`, `cr40f_status`, `cr40f_dataehorario`, `_cr40f_placa_value`, `_cr40f_motorista_value`, `_cr40f_codigodainfracao_value`).
- Pontos por gravidade (CTB, art. 259): 0→3, 1→4, 2→5, 3→7.

## 18. Pessoas (`pages/pessoas`)

- `cr40f_bancodedados` (passageiros): `cr40f_nomedopassageiro`, `cr40f_email`, `cr40f_telefone`, `cr40f_cargo`, `cr40f_classificacao`, `cr40f_idioma`, `cr40f_sexo`, `cr40f_status`, `cr40f_departamento`, `cr40f_enderecodesaida`, `cr40f_preferenciasdopassageiro`, `cr40f_datadenascimento`, `cr40f_datadecadastro`, `cr40f_datadoultimoservico`, `new_linkdafoto`, `new_tipodoveiculo`; lookup de cliente `cr40f_Cliente` (nav descoberta por `RelationshipDefinitions`, `pessoas/data/source.ts` l. 63).
- Choices (`pessoas/domain/choices.ts`): status 202410000 Ativo, 202410001 Inativo; classificação 202410000 Passageiro Frequente, 202410001 Visitante, 202410002 Solicitante, 202410003 Grupo, 202410004 Lead; idioma 202410000 Português, 202410001 Inglês, 202410002 Espanhol; sexo 202410000 Masculino, 202410001 Feminino; tipo de veículo igual ao de `cr40f_tipodeveiculo` (202410000 a 202410006); cargo 202410000 C-Level, 202410001 Presidente, 202410002 Vice Presidente, 202410003 Diretor, 202410004 Assistente Executiva, 202410005 Gerente, 202410006 Super... (lista truncada na leitura).
- Histórico: `cr40f_reservadeveculos` (por lookup direto de passageiro) e `cr40f_servicosporpassageiro` (`_cr40f_bancodedados_value`, `_cr40f_geral_value`); `cr40f_pagantes`.
- Busca de clientes: `cr40f_clientes1` (`cr40f_clientes1id`, `cr40f_nomedocliente`), `$top=25`.

## 19. Clientes (`pages/clientes`)

- `cr40f_clientes1` (`clientes/data/source.ts`): `cr40f_clientes1id`, `cr40f_nomedocliente`, `cr40f_registro`, `cr40f_endereco`, `createdon`; filtro `statecode eq 0`, ordem por nome. Criação e edição por `create`/`update` com o payload de `buildPayload`.
- Portal do cliente usa `cr40f_portalhabilitado` (ver Geral e Validação do cliente); não é editado na tela Clientes (não confirmado).

## 20. Funcionários (`pages/funcionarios`)

- `cr40f_funcionarios` (`funcionarios/data/schema.ts`; entity set `cr40f_funcionarioses`): `cr40f_nomecompleto`, `new_apelido`, `cr40f_status`, `cr40f_funcao`, `cr40f_tipodevinculo`, `cr40f_datadeadmissao`, `cr40f_datadedemissao`, `cr40f_datadeaniversario`, `cr40f_datadoaso` (somente leitura, vem de Documentos), `cr40f_validadedacnh`, `cr40f_cnhtexto`, `cr40f_numerodocpf`, `cr40f_numerodorg`, `cr40f_filiacao`, `cr40f_enderecocompleto`, `cr40f_telefonecorporativo`, `cr40f_telefonepessoal`, `cr40f_telefonedeemergencia`, `cr40f_emailmicrosoft`, `cr40f_emailbetinhos`, `cr40f_relacaotrabalhista`, `cr40f_nomedaempresa`, `cr40f_identificadordocolaborador`, `cr40f_gerarrecibopersonalizado`, `cr40f_linkparadocumentos`, `cr40f_loginsesenhas` (campo sensível, não reproduzido), `cr40f_foto`/`cr40f_fotoid`, `cr40f_assinatura`/`cr40f_assinaturaid`, `cr40f_folderid`, `cr40f_equipamentoid`, `new_aditivoassinatura`, `new_aditivoassinaturaem`, `new_infleetdriverid`, `new_app`, `new_notificacoesoperacionais`, `new_notificacoesmotoristas`, `new_notificacoesfinanceiras`, `new_notificacoesfrota`; lookup `cr40f_veiculoatual`.
- Padrão para novo funcionário (`funcionarios/data/patch.ts`): `cr40f_status: 0`, `cr40f_funcao: 202410000`, `cr40f_tipodevinculo: 0` mais booleanos obrigatórios.
- Posse: `new_possedeveiculo` (`new_iniciodaposse`, `new_fimdaposse`). Multas do funcionário: `cr40f_multas` com `cr40f_novacoluna`, `cr40f_localdainfracao`.
- Custom APIs de acesso ao App Motoristas (`funcionarios/data/acesso.ts`; unbound, POST, parâmetros em PascalCase sem prefixo):
  - `cr40f_CadastrarAcessoMotorista`: entrada `{ NomeCompleto, Celular, TipoVinculo, EmailPessoal?, PrefixoEmail?, FuncionarioId?, Cpf?, CriarNovo? }`; saída `{ EmailMicrosoft, SenhaTemporaria, FuncionarioId, LinkApp, Etapas }`.
  - `cr40f_EncerrarAcessoMotorista`: `{ FuncionarioId, Confirmacao }` (nome digitado); saída `{ Etapas }`.
  - `cr40f_ReativarAcessoMotorista`: `{ FuncionarioId }`; saída `{ EmailMicrosoft, SenhaTemporaria, LinkApp, Etapas }`.
  - `Etapas` é texto JSON com as etapas executadas; códigos de erro com mensagem em `MENSAGENS` (ex.: `SEM_LICENCA_DISPONIVEL`, `EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO`, `CONFIRMACAO_INVALIDA`).
  - Verificação de acesso ativo: `systemusers?$select=internalemailaddress&$filter=isdisabled eq false and (...)`.
- Arquivos do funcionário: Flows `new_URLFlowsalvararquivosSharePoint`, `new_URLFlowListarArquivosSharePoint`, `new_URLFlowExcluirArquivoSharePoint`, `new_URLFlowConsultarArquivosSharePoint`.

## 21. Documentos (`pages/documentos`)

- Tabelas (`documentos/data/queries.ts`): `cr40f_tipodocumento`, `cr40f_documento`, `cr40f_avisodestinatario`, `cr40f_funcionarios`, `cr40f_veiculos`. Navegações: `cr40f_Tipo`, `cr40f_Funcionario`, `cr40f_Veiculo`.
- `cr40f_tipodocumento`: `cr40f_tipodocumentoid`, `cr40f_codigo`, `cr40f_name`, `cr40f_categoria`, `cr40f_temvalidade`, `cr40f_validadepadraomeses`, `cr40f_obrigatoriopara`, `cr40f_ordem`, `statecode`.
- `cr40f_documento`: `cr40f_documentoid`, `cr40f_name`, `cr40f_numero`, `cr40f_emissao`, `cr40f_validade`, `cr40f_situacao`, `cr40f_pasta`, `cr40f_observacao`, `cr40f_ultimomarcoavisado`.
- Choices (`documentos/domain/codes.ts`): categoria 100000000 pessoas, 100000001 frota; situação 100000000 vigente, 100000001 substituído; marco de aviso 100000000 = 60 dias, 100000001 = 30, 100000002 = 7, 100000003 = vencido; obrigatório para 100000000 Motorista, 100000001 Administrativo, 100000002 Próprio, 100000003 Terceiro, 100000004 Aluguel (derivado de função 202410000/202410001 e categoria do veículo 100000000/1/2); veículo vendido 202410000.
- Payload de criação (`docPayload`): `{ cr40f_name, cr40f_numero, cr40f_emissao, cr40f_validade, cr40f_situacao: 100000000, cr40f_pasta, cr40f_observacao, "cr40f_Tipo@odata.bind": "/<tipoSet>(<id>)", "cr40f_Funcionario@odata.bind" | "cr40f_Veiculo@odata.bind": "/<set>(<id>)" }`.
- Substituir documento: `PATCH { cr40f_situacao: 100000001 }`. Ativar/desativar tipo: `{ statecode: 0, statuscode: 1 }` ou `{ statecode: 1, statuscode: 2 }`. Destinatário de aviso inativado: `{ statecode: 1, statuscode: 2 }`.
- Atualiza datas no funcionário (CNH `cr40f_validadedacnh`, ASO `cr40f_datadoaso`) em `documentos/data/source.ts` l. 187.

## 22. Currículos (`pages/curriculos`)

- `new_curriculo` (`curriculos/data/queries.ts`): `new_nomecompleto`, `new_cpf`, `new_email`, `new_telefone`, `new_whatsapp`, `new_cidade`, `new_estado`, `new_cargointeresse`, `new_experiencia`, `new_ultimocargo`, `new_ultimaempresa`, `new_pretensaosalarial`, `new_nota`, `new_indicadopor`, `new_observacoes`, `new_linkcurriculo`; choices (rótulos vêm do ChoiceSet, valores não estão no código): `new_disponibilidade`, `new_categoriacnh`, `new_origemcurriculo`, `new_statuscurriculo`.
- Mudar de coluna no quadro: `PATCH { new_statuscurriculo: <valor> }` (`CurriculosPage.tsx` l. 51). O link do arquivo (SharePoint) é gravado depois por `linkPatch(webUrl)` em `new_linkcurriculo` (`curriculos/data/submit.ts`).

## 23. Equipamentos (`pages/equipamentos`)

- `cr40f_equipamento`: `cr40f_equipamentoid`, `cr40f_name`, `cr40f_marcamodelo`, `cr40f_numeroserie`, `cr40f_status` (100000000 em uso; 100000001 disponível; 100000002 manutenção; 100000003 baixado), `cr40f_datacompra`, `cr40f_valorcompra`, `cr40f_observacoes`; lookups `_cr40f_tipo_value` (nav `cr40f_Tipo`), `_cr40f_responsavel_value` (nav `cr40f_Responsavel`). Limpar o responsável é `DELETE` no `$ref`, nunca bind null.
- `cr40f_tipoequipamento`: `cr40f_name`, `statecode`. `cr40f_fotoequipamento`: `cr40f_name`, `cr40f_capa`, `cr40f_caminho`, lookup `cr40f_Equipamento`.
- Foto registrada: `{ cr40f_name, cr40f_capa, cr40f_caminho, "cr40f_Equipamento@odata.bind": "/<equipamentoSet>(<id>)" }`.

## 24. Treinamentos (`pages/treinamentos`)

- `cr40f_treinamento` (`treinamentos/data/source.ts`, `domain/treinamentos.ts`): `cr40f_name`, `cr40f_descricao`, `cr40f_conteudo`, `cr40f_videourl`, `cr40f_anexosjson`, `cr40f_quizjson`, `cr40f_notaminima`, `cr40f_exigequiz`, `cr40f_exigeassinatura`, `cr40f_validade`, `cr40f_estado` (100000000 rascunho; 100000001 publicado), `cr40f_publicotipo` (100000000 motoristas; 100000001 função; 100000002 selecionados), `cr40f_publicojson`, `cr40f_funcao` (202410000 = motorista), `cr40f_publicadoem`, `cr40f_editadoem`, `cr40f_pushstatus`/`cr40f_pusherro` (100000000 pendente; 100000001 enviado; 100000002 falhou).
- `cr40f_treinamentoparticipacao`: `cr40f_name` (`<título> · <funcionário>`, até 200), `cr40f_status`, `cr40f_aprovado`, `cr40f_nota`, `cr40f_tentativas`, `cr40f_abertoem`, `cr40f_concluidoem`, `cr40f_confirmadoem`, `cr40f_assinadoem`, `cr40f_assinaturajson`, `cr40f_nomeassinante`, `cr40f_conteudohash`, `cr40f_conteudosnapshot`, `cr40f_lembradoem`.
- Payload de participação: `{ "cr40f_name": "...", "cr40f_Treinamento@odata.bind": "/cr40f_treinamento<set>(<id>)", "cr40f_Funcionario@odata.bind": "/cr40f_funcionarios<set>(<id>)" }` (sets resolvidos pela metadata).
- Custom API `cr40f_LembrarTreinamento` (unbound): entrada `{ "cr40f_TreinamentoId": "<guid>", "cr40f_ParticipacaoId": "<guid, opcional>" }`; saída `{ cr40f_Enfileirados, cr40f_Ignorados }` (máximo 1 lembrete a cada 24 h).
- Anexos: SharePoint, raiz `Treinamentos` (`ANEXO_ROOT`).

## 25. Logs (`pages/logs`)

- `new_appmotoristaslog` (`logs/data.ts`): `new_appmotoristaslogid`, `new_message`, `new_severity`, `new_source`, `new_action`, `new_phase`, `new_screen`, `new_component`, `new_errorname`, `new_errorcode`, `new_stack`, `new_payloadjson`, `new_url`, `new_appname`, `new_appversion`, `new_platform`, `new_sessionid`, `new_isoffline`, `new_username`, `new_useremail`; consulta `createdon ge <desde>`, `$orderby createdon desc`, `$top=MAX_LOGS`. Leitura apenas.
- O shell grava seus próprios erros em `cr40f_errodosistema` (`app/erros.ts`, `app/errorLog.ts`); os campos dessa tabela não foram lidos (não confirmado).

## 26. Itens sem módulo próprio

- WebResources abertos em iframe e tabelas nativas do grupo Back-End não têm contrato no shell além do nome (ver doc 03, seção 3).
- Tabelas citadas no menu e sem uso no código das telas: `new_marketing`, `cr40f_recibos_v2`, `new_fotomanutencao`, `cr40f_anexocolisao_v2`, `cr40f_anexorecebimento_v2`, `cr40f_formapagamentodespesa` (esta última lida pelo Dashboard).
