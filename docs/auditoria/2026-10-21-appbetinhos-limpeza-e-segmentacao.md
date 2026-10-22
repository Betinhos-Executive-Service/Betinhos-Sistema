# AppBetinhos: legado, duplicados e proposta de segmentação

Levantamento de 21/10/2026, só leitura. Fontes: export não gerenciado da AppBetinhos 1.0.0.268 do DEV (`pac solution export`), metadata e contagem de registros do DEV e do PROD (Web API), histórico de execução dos fluxos (`flowrun`, cerca de 28 dias) e varredura de referências na solução e nos 40 repositórios de `Desktop/vscode`.

## 1. Tamanho atual

| Item | Quantidade | Peso no pacote (descompactado) |
|---|---|---|
| Tabelas (todas com "incluir subcomponentes") | 101 | 9,8 MB |
| Recursos da Web | 218 | 34 MB |
| Processos (fluxos, regras de negócio, BPF) | 124 | 2,5 MB |
| Aplicativos canvas e páginas personalizadas | 6 | 9,4 MB |
| Assemblies de plug-in / pacotes / steps | 10 / 2 / 60 | 0,8 MB |
| Custom APIs | 35 | 0,3 MB |
| Variáveis de ambiente | 41 | — |
| Funções de segurança | 10 | 0,5 MB |

ZIP exportado: 25 MB. O que mais pesa no tempo de import não é o tamanho do ZIP, e sim: metadados das 101 tabelas (cerca de 3.700 colunas, 300 formulários e 720 visões), ativação dos fluxos e publicação dos canvas.

Publisher da solução: `DefaultPublisherorg23b93544` (prefixo `new`). Os componentes `cr40f_` vêm do publisher padrão do CDS. Isso não é o padrão de mercado (o recomendado é um publisher próprio), mas não dá para trocar o publisher de componentes que já existem sem recriar as tabelas e migrar os dados. Qualquer solução nova deve usar o mesmo publisher, senão a migração no PROD vira recriação.

## 2. Legado, duplicado e sem uso

Critério de "sem uso": nenhuma referência em menu (sitemap), formulário, comando (ribbon e app actions, inclusive por GUID), fluxo, plugin, canvas, outro recurso da Web ou código-fonte dos repositórios; para tabelas, também a contagem de registros no PROD. Dumps de solução versionados (`Tela Página Inicial/output`, `Dashboard Betinhos/_pac-backup`) foram ignorados.

### 2.1 Alta confiança (pode sair)

**Pilha "Operations AI" antiga** (memória de 14/10/2026: `cr40f_AI*` é legado):
- 8 Custom APIs `cr40f_AIConsultarContexto`, `AIListarCandidatos`, `AIObterAgenda`, `AIObterServico`, `AIRegistrarDecisao`, `AIRegistrarResultado`, `AIRevogarContexto`, `AISalvarContexto` (nenhum chamador);
- pacote de plug-in `cr40f_Betinhos.OperationsAI`;
- tabelas `cr40f_decisaooperacionalia` (0 registros no PROD) e `cr40f_contextooperacionalia` (1);
- fluxo "Flow IA - Expirar Contextos Operacionais" (rascunho no PROD, 0 execuções);
- variáveis `cr40f_OperationsAIAllowedCallerIds` e `cr40f_OperationsAIPolicyVersion`;
- função de segurança "Assistente Operações IA".

**Plug-in morto:** `Cr40fGerarPagantesPlugin.dll` (v1). A Custom API `cr40f_GerarPagantes` usa a V2; a v1 não tem step nem API.

**Tabelas vazias sem referência:** `cr40f_filaagendamentoclaude`, `cr40f_registrodeviagem`, `cr40f_tiposervicoplanner` (0 registros no PROD).

**Canvas vazio:** "Página 1" (`cr40f_pgina1_8cac9`), sem nenhuma referência.

**Regras de negócio rascunho:** "Nova regra de negócios" (2) e "Cópia de Nova regra de negócios", desligadas no DEV e ausentes no PROD.

**Fluxo de teste ligado no PROD:** "Planner | Notificação por e-mail - Teste".

**Recursos da Web mortos ou órfãos** (39 itens, 1,6 MB):
- `new_teladespesasoperacionais` (486 KB): lê a tabela `cr40f_despesa`, que não existe no DEV nem no PROD. Ainda aparece no menu do shell (Back-End) e no sitemap do model-driven;
- `cr40f_highanglebirthdaycakecutlery` (imagem de 788 KB, sem uso);
- telas do assistente antigo: `new_assistente.html`, `new_assistente_preview.html`, `new_assistente_autosave.js`, `cr40f_new_assistente.html`, `cr40f_new_assistente.js`, `cr40f_assistente_completo.js`, `cr40f_assistant_onsave.js`, `new_dialog_agendamento.html`;
- versões antigas: `cr40f_ConfiguracaoRetorno` (há a `_v2`), `new_gerarvoucherdeconfirmacao` (substituído por `cr40f_VoucherConfirmacao`), `new_campoendereco` e `new_campoendereco2`;
- scripts soltos: `new_AbrirCustomPage`, `new_PlannerAuth.html`, `accessChecker_openDialog.js`, `new_cr40f_enviar_todos.js`, `cr40f_BotaoSalvar2`, `new_cr40f_SaveAndReturn`, `new_preencherEnderecoPassageiro`, `cr40f_formhooks.js`, `cr40f_CommandBarFunctions`, `new_open_dialog.js`;
- 12 ícones `cr40f_*svgrepocom` sem uso (car, car1, company, company1, payment, paymentcard, creditcardpay, invoice, bulletlist, tool01, paymentrequestapi, maintenanceelectriccar);
- cópias idênticas: `new_temabetinhos` (o app usa `new_temabetinhos2`), `cr40f_judgesvgrepocom` (o ícone usa `new_judgesvgrepocom`), `Tela_Script_GerarPagantes.js` (o comando usa `Script_AbrirTelaGerarPagantes.js`).

### 2.2 Média confiança (confirmar antes)

**Telas substituídas pelo Sistema Betinhos** (7 itens, 2,7 MB), que só continuam no sitemap do app model-driven:

| Legado | Substituto |
|---|---|
| `new_TelaFrota.html` + `new_TelaFrotaLoader.html` | `#/frota` |
| `new_TelaFuncionarios.html` + `new_TelaFuncionariosLoader.html` | `#/funcionarios` |
| `new_TelaOperacional` | `#/operacional` |
| `new_gestaocomunicadosmotoristas` | `#/comunicados` |
| `cr40f_GerenciarComunicados.html` | `#/comunicados` (está no shell como "Comunicados (antigo)") |

`new_dashboard` (2,1 MB) fica, porque o modo TV ainda depende dele.

**Canvas e páginas personalizadas:**
- "App Betinhos Motoristas" (`new_appbetinhosmotoristas`, canvas, 2,3 MB): sem referência; o app em uso é o `new_app-motoristas-v2`. Confirmar que nenhum motorista ainda abre o canvas;
- "Funções Operacionais" (página personalizada, 5,4 MB): o shell a marca como indisponível e o menu usa o WebResource `new_telafuncoesoperacionais`;
- "Reservar Veículos" (página personalizada, 0,8 MB): só é aberta por `new_AbrirCustomPage`, que é órfão.

**BPF "STATUS DA MANUTENÇÃO"** e a tabela dele (`cr40f_statusdamanutencao`, 0 registros): ligado no DEV, rascunho no PROD.

**Fluxos desligados nos dois ambientes, 0 execuções em 28 dias:** "Flow Atribuir Veículo Automático | Geral", "Flow Lembrete Cotação Pendente", "Infleet | Reconsultar veiculo do servico", "Planner | Notificação automática por e-mail" (substituído por "Planner | Notificação imediata").

**Fluxos desligados no PROD em 09/10 e 15/10** (decidir se voltam ou saem): "Flow Receber -> Planner" (19.196 execuções, 747 falhas antes de parar), "Flow Atualizar Cotação > Planner", "Radar Betinhos - Ingerir Noticias" (com `cr40f_noticiaexterna`, 3.000 registros, e `cr40f_fontenoticia`), "Flow Dar Baixa Status Pagantes -> OP".

**Pares v1/v2:** "Flow Salvar Fotos Manutenção | App Motoristas" e "... v2" (os dois ligados no PROD, 0 execuções; nenhum app lê `new_FlowURLFlowSalvarFotosManutenoAppMotoristasv2`); "Flow Gerar Voucher App Motoristas" (4 execuções) e "... v2" (194).

**Ligados no PROD, 0 execuções em 28 dias:** "Flow Salvar Anexo Currículo - Onedrive" (os currículos passaram para os fluxos do SharePoint), "Flow Salvar Anexo Despesa", "Flow Salvar Foto BD - Onedrive", "Flow Forms de Manutenção -> App Betinhos", "Flow Atualizar Planner > Cotação", "Flow Notificação Serviço Sem Voucher", "Pagamento de Fornecedores - Enviar documento do lote", "Flow Manual Listar Pastas Colaboradores".

**Tabelas vazias no PROD com referência só em telas antigas:** `cr40f_solicitacaoiaagendamento`, `cr40f_jornadacolaborador`, `new_centraldenotificacoes`, `cr40f_cielolinkcleanup`.

**Módulo Fluxo de Caixa:** 10 tabelas, 0 registros no PROD (só `cr40f_fluxocaixaevento` tem 97, gerados pelo fluxo diário). Ou entra em uso, ou vira uma solução à parte, ou sai.

**Variáveis sem uso:** `new_PlannerGraphClientId`, `new_PlannerGraphTenantId`, `new_OrgURL`.

**Funções de segurança:** "Inativo 4" e "DEV - Usuário" viajam para o PROD; "System Customizer" é uma função do sistema alterada dentro da solução.

### 2.3 Suspeitos que ficam

- `cr40f_conversaiaagendamento`: os fluxos novos "Betinhos | IA | Interpretar conversa" e "Gravar reservas confirmadas" usam essa tabela. A memória de 14/10 a chamava de legado; vale confirmar.
- Checklist (`new_checklist*`), plano preventivo (`cr40f_baselinepreventiva`, `cr40f_itemplanopreventivo`) e `cr40f_errodosistema`: novos, esperando o PROD.
- Fluxos de notificação desligados no DEV: estão ligados e rodando no PROD (desligar no DEV evita disparo real).
- Chunks duplicados do Sistema Betinhos: o `chunk-cleanup.ps1` mantém a geração anterior de propósito.
- `new_dashboard` (modo TV) e `new_formulario_geral.html` (Criar/Editar da Geral).

### 2.4 Achados fora da limpeza

- **`cr40f_recibos` não está na AppBetinhos** e não existe no PROD, mas o "Flow Agentes | Executar" usa essa tabela. Se ela não entrar na solução, a promoção planejada (issue #93) continua sem ela.
- Tabelas v1 que só existem no DEV, fora da solução: `cr40f_colisao`, `cr40f_anexocolisao`, `cr40f_anexorecebimento`, `cr40f_recibopersonalizado`. Não afetam o deploy; é limpeza do DEV.
- A solução `gerarpagantes` (gerenciada no PROD) é um subconjunto da AppBetinhos: os mesmos 16 componentes têm dois donos.
- Soluções não gerenciadas sem função no DEV: `Betinhos_Core_Clean` (vazia), `BetinhosFoundation`, `BetinhosAssistente`, `PersonalizacaoRibbonWorkbench`, `new_chamarServicojs`, `ScriptsFormularioGeral`, `BetinhosInfleetLink`. Excluir uma solução não gerenciada não exclui os componentes.
- Segredos ainda viajam no valor padrão das variáveis (Cielo, Graph, Jev), o que já estava registrado.

## 3. Risco que manda na ordem

O PROD é atualizado com `pac solution import --stage-and-upgrade` (`App Motoristas/scripts/deploy-prod.ps1`). Nesse modo, **o que sai da AppBetinhos no DEV é excluído no PROD no próximo import**, inclusive tabelas com os dados. Por isso a limpeza em lote no DEV só pode tirar o que a seção 2.1 lista. Tabela com registros no PROD (por exemplo `cr40f_noticiaexterna`) só sai com backup e ok explícito.

## 4. Ganho esperado (estimativa)

- Só a limpeza: cerca de 12 MB a menos no pacote (4,3 MB de recursos da Web, até 8,5 MB de canvas), cerca de 10 tabelas e 15 processos a menos. Estimo de 15% a 25% menos tempo de import. Ajuda, mas não muda a ordem de grandeza.
- O ganho grande vem da segmentação: uma mudança de tela passa a importar só a solução de interface (minutos), sem reimportar 101 tabelas e reativar 124 processos.

## 5. Segmentação proposta

Modelo em camadas, o padrão recomendado pela Microsoft para ALM no Power Platform: poucas soluções, um único publisher, dependência num sentido só.

| Solução | Conteúdo | Muda com que frequência |
|---|---|---|
| `BetinhosCore` | Tabelas, colunas, relacionamentos, choices, chaves, funções de segurança, perfil de segurança de campo, definições de variáveis de ambiente, conectores personalizados | Pouco |
| `BetinhosAutomacao` | Assemblies e pacotes de plug-in, steps, Custom APIs, regras de negócio, fluxos | Média |
| `BetinhosInterface` | App model-driven, sitemap, formulários, visões, painéis, Sistema Betinhos e telas em WebResource, páginas personalizadas | Alta |
| `BetinhosMotoristas` | `new_app-motoristas-v2`, app `new_AppMotoristasv2`, servidor MCP, Custom APIs e fluxos exclusivos do app | Própria (repo separado) |

Dependências: `Core` ← `Automacao` ← `Interface`; `Motoristas` depende de `Core` e `Automacao`. A `gerarpagantes` é absorvida pela `Automacao` e pela `Interface`. Fluxo de Caixa e Planner podem virar soluções próprias depois, se ganharem ritmo próprio.

Formulários e visões ficam na `Interface` como subcomponentes das tabelas (sem "incluir subcomponentes"), para que mudar uma visão não reimporte o schema.

### Como migrar sem perder dados no PROD

1. No DEV, criar as quatro soluções com o mesmo publisher e distribuir os componentes (AddSolutionComponent), deixando a AppBetinhos intacta até o fim.
2. Ensaiar no TEST (`appbetinhostest`) refeito como cópia do PROD: importar as quatro gerenciadas, depois uma AppBetinhos vazia como upgrade. Os componentes não são excluídos porque continuam nas outras soluções gerenciadas. Comparar contagem de registros, estado dos fluxos e camadas antes e depois.
3. Repetir no PROD com janela e backup.
4. Trocar `SolutionUniqueName` nos scripts de cerca de 15 repositórios, o `DV_SOLUTION` do Sistema Betinhos, o `sync-from-dev.yml` (exportar cada solução) e o `deploy-prod.ps1` (importar só as soluções alteradas, na ordem de dependência).

### O que eu faço sozinho e o que depende de você

- Sozinho: inventário final, criação e preenchimento das soluções no DEV, scripts de deploy por solução, mudanças nos repositórios via PR, ensaio no TEST e relatório de comparação.
- Com o seu ok: cada exclusão no DEV (irreversível), refazer o TEST como cópia do PROD (sobrescreve o TEST) e qualquer import no PROD.
- Esforço estimado: 1 a 2 dias de trabalho, mais a janela do PROD.

## 6. Execução da limpeza no DEV (21/10/2026)

Duas sessões executaram a seção 2.1 no DEV, com ok do Renan: esta e a de auditoria (relatório `docs/auditoria-solucao-appbetinhos-2026-10-21.md`, branch `claude/appbetinhos-cleanup-refactor-d5b3e5`). Backups locais em `Sistema Betinhos/.audit/backups/2026-10-21-limpeza-appbetinhos/`: export não gerenciado das 10:26, registros das tabelas excluídas, DLL do GerarPagantes v1, XAML das regras e logs de cada bloco.

Excluído por esta sessão:
- pilha Operations AI: 8 Custom APIs `cr40f_AI*`, pacote `cr40f_Betinhos.OperationsAI`, tabelas `cr40f_contextooperacionalia` (6 registros de teste) e `cr40f_decisaooperacionalia`, fluxo "Flow IA - Expirar Contextos Operacionais", variáveis `cr40f_OperationsAI*` e função "Assistente Operações IA";
- tabela `cr40f_tiposervicoplanner` (9 registros de catálogo no DEV, 0 no PROD) e, com ela, o lookup `cr40f_tiposervicoplanner` em Pedido de Cotação (0 pedidos preenchidos);
- 3 regras de negócio rascunho da Geral;
- `new_temabetinhos` (cópia do `new_temabetinhos2`).

Excluído pela sessão de auditoria: `cr40f_registrodeviagem`, `cr40f_filaagendamentoclaude`, o BPF "STATUS DA MANUTENÇÃO" com `cr40f_statusdamanutencao`, o assembly GerarPagantes v1, 36 recursos da Web da lista 2.1, os fluxos "Planner | Notificação por e-mail - Teste", "Flow Gerar Pagantes HTTP" e "Flow Salvar Fotos Manutenção | App Motoristas v2", duas variáveis e 7 soluções-contêiner.

Correções desta lista:
- o canvas "Página 1" (`cr40f_pgina1_8cac9`) fica: está no mapa do site do app "App Betinhos v2";
- `Tela_Script_GerarPagantes.js` fica até o repo Tela Gerar Pagantes parar de publicar os dois nomes;
- `new_teladespesasoperacionais` fica: a spec de 09/10 a manteve no menu (cartões/Pluggy), embora a tabela `cr40f_despesa` não exista;
- `accessChecker_openDialog.js` é da Microsoft e só saiu da AppBetinhos.

Antes e depois (export da AppBetinhos no DEV, já com o que outras frentes mudaram no dia): 101 → 95 tabelas, 218 → 178 recursos da Web, 124 → 117 processos, 35 → 27 Custom APIs, 41 → 37 variáveis, 10 → 9 funções; ZIP de 25,0 para 24,0 MB. O export das 11:27 saiu sem erro de dependência.

**Pré-requisito antes do próximo import no PROD:** as 8 Custom APIs `cr40f_AI*V2` não gerenciadas, criadas direto no PROD em 14/08, dependem do pacote `cr40f_Betinhos.OperationsAI`. Se não forem excluídas antes, o stage-and-upgrade falha ao remover o pacote.

## 7. Ordem recomendada

1. Limpeza de alta confiança no DEV (2.1), com a sua confirmação da lista.
2. Decisão sobre a lista de média confiança (2.2).
3. Promoção do PROD já planejada (checklist e fluxos de IA), incluindo `cr40f_recibos`. A limpeza vai junto.
4. Segmentação, ensaiada no TEST, com o PROD já estável.
