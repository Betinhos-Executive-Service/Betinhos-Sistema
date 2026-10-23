# Ensaio da segmentação da AppBetinhos no TEST — 22/10/2026

Plano: `docs/superpowers/plans/2026-10-21-segmentacao-appbetinhos.md`, Fase 2. Artefatos (não versionados) em `backup/solucoes/ensaio/` do checkout principal.

## Tarefa 8 — cópia do PROD para o TEST e trava

| Passo | Resultado |
|---|---|
| Pré-condição (conferência do DEV em zero) | OK no `pnpm push` v0.0.64 das 08:2x: sem dono 0, em duas 0, fora do lugar 0, dependências 0 |
| Perfil do pac para o TEST | Já existia (`pac org who --environment` responde com a conta noreply) |
| `pac admin copy` (1ª tentativa) | Falhou em 8 s: "The environment display name property is null or empty". O comando exige `--name`. |
| `pac admin copy --name "App Betinhos Test" --type FullCopy --skip-audit-data` | Iniciado 08:30:28. O pac perdeu a conexão de acompanhamento aos 18 min ("An error occurred while sending the request"), mas a cópia continuou no servidor (`linkedEnvironmentMetadata.instanceState = PreparingInstance`). TEST voltou ~08:56. Duração total ≈ 25 min. |
| Confirmação da cópia | `cr40f_servicosporpassageiro` 25.939 e `cr40f_reservadeveculos` 7.837, iguais ao PROD no mesmo horário; AppBetinhos 1.0.0.268; 0 fluxos ligados (a cópia já desliga todos). |
| Trava | `set-runtime-state AdminMode --background-operations Disabled`: a 1ª tentativa falhou por "active lifecycle operation" (cópia ainda fechando); a 2ª devolveu erro de rede, mas o Admin Center confirma `runtime: AdminMode`, `backgroundOps: Disabled`. |
| Passo 4 (desligar fluxos) | Nada a desligar: 0 ligados. |
| Foto 0 | `foto0.json`: 95 tabelas, 115 fluxos, 48 steps, 41 variáveis, 1.168 componentes; as 4 soluções ainda não existem no TEST (esperado). 33 s. |

## Tarefa 9 — pré-requisitos

### Camadas acima da AppBetinhos (`camadas-antes.csv`)

`audit-prod-layers.ps1` tinha um bug (`$types[$type]` com chave inteira num `[ordered]` indexa pela posição); corrigido no repo App Motoristas antes de rodar.

**Desvio do plano:** esperados 3 WebResources com camada Active; encontrados **84 componentes**:

| Qtde | Tipo | Camadas |
|---|---|---|
| 32 | SdkMessageProcessingStep | AppBetinhos > Active |
| 25 | WebResource | AppBetinhos > Active |
| 12 | Workflow | AppBetinhos > Active |
| 7 | WebResource | AppBetinhos > gerarpagantes |
| 5 | WebResource | AppBetinhos > gerarpagantes > Active |
| 2 | PluginAssembly | AppBetinhos > Active |
| 1 | PluginAssembly | AppBetinhos > gerarpagantes |

WebResources com Active no topo: praticamente todas as telas (`cr40f_SistemaBetinhos.html`, `new_formulario_geral.html`, `new_TelaOperacional`, `new_app-motoristas-v2`, `new_cotacao_preview.*`, `new_dashboard`, `new_TelaComposicaoPreco.html`, `new_TelaPlanner*.html`, `cr40f_TelaFluxoDeCaixa.html`, `cr40f_TelaPedirCotacao.html`, `cr40f_VoucherConfirmacao.*`, `new_TelaCurriculo`, `new_TelaFuncionarios*.html`, `new_teladespesasoperacionais`, `new_gestaocomunicadosmotoristas`, `new_gestao_erros_operacionais.html`, `cr40f_EscalaFDS.html`, `cr40f_HomeBetinhos.html`, `cr40f_TelaPagamentoFornecedores.html`) e as da `gerarpagantes`.

Consequência: enquanto essas camadas existirem, **nenhum import (AppBetinhos ou as 4 novas) altera o que o PROD serve** para esses componentes. Steps e workflows com Active costumam ser só mudança de estado (ligado/desligado) feita no PROD; os 2 assemblies e as telas são hotfixes publicados direto no PROD (ex.: `cr40f_SistemaBetinhos.html` v0.0.44 em 21/10). Decisão pendente do Renan: ver "Decisões" abaixo.

`remove-prod-active-layer.ps1` hoje só trata WebResource e recusa quando há outra solução gerenciada (gerarpagantes) entre a Active e a AppBetinhos.

### Custom APIs `cr40f_AI*V2`

8 não gerenciadas excluídas do TEST (`cr40f_AIObterAgendaV2`, `AIObterServicoV2`, `AIListarCandidatosV2`, `AIConsultarContextoV2`, `AISalvarContextoV2`, `AIRevogarContextoV2`, `AIRegistrarDecisaoV2`, `AIRegistrarResultadoV2`). Consulta posterior: 0 restantes.

### Remoção das camadas Active (decisão do Renan: todas)

Script novo `packages/deploy/solucoes/remover-camadas-active.ps1` (recusa o PROD; simulação por padrão; backup do JSON de cada camada em `camadas-active/`). A ação Web API é `RemoveActiveCustomization` com `LogicalName` (nome lógico da entidade) e `Id`; `SolutionComponentName`/`ComponentId` é rejeitado.

- Simulação: 76 com Active no topo (30 WebResource, 12 Workflow, 2 PluginAssembly, 32 SdkMessageProcessingStep). Os outros 8 dos 84 têm só a `gerarpagantes` por cima: nada a remover.
- Aplicado: 76 removidas, 0 falhas; nova simulação: 0.
- **Foto 1** e comparação 0→1 (`dif-0-1.json`): código 0, nenhuma perda, nenhum estado mudou. Versões servidas voltaram à gerenciada: `cr40f_SistemaBetinhos.html` de v0.0.44 (hotfix) para a da AppBetinhos 1.0.0.268 (sem versão), App Motoristas de 18.3.1 para 2.1.724. **Para o PROD:** remover as camadas e importar na mesma janela; entre uma coisa e outra o usuário veria a versão antiga.

### Passo 4 — referência de tempo (import da AppBetinhos inteira)

- Conferência do DEV antes: zero. Export gerenciado: AppBetinhos (24 MB) e as 4 (versão 1.0.0.0). O export do `BetinhosCore` falhou uma vez por erro de rede do pac (saiu com 0 sem gerar o ZIP; `Export-SolucaoGerenciada` pegou); repetido com sucesso. Conferência depois: zero.
- `pac solution import --stage-and-upgrade --publish-changes --activate-plugins` da AppBetinhos no TEST: **27:04** (25:33 de import + 1:05 de publish). Aviso do pac: conector importado, connection references precisam de conexão.
- **Foto 2** e comparação 1→2 (`dif-1-2.json`, código 1 por perda esperada):
  - `tabelasSumiram` 6: `cr40f_contextooperacionalia`, `cr40f_decisaooperacionalia`, `cr40f_filaagendamentoclaude`, `cr40f_registrodeviagem`, `cr40f_statusdamanutencao`, `cr40f_tiposervicoplanner`;
  - `fluxosSumiram` 5: "Planner | Notificação por e-mail - Teste", "Flow Gerar Pagantes HTTP", "Flow Salvar Fotos Manutenção | App Motoristas v2", "STATUS DA MANUTENÇÃO", "Flow IA - Expirar Contextos Operacionais";
  - `variaveisSumiram` 4: `new_FlowURLFlowSalvarFotosManutenoAppMotoristasv2`, `cr40f_OperationsAIAllowedCallerIds`, `cr40f_OperationsAIPolicyVersion`, `new_FlowURLGerarPagantesHttp`;
  - `componentesSumiram` 428 (1.168 → 855);
  - `registrosCairam` 0; nenhum fluxo que estava ligado desligou.
  - Todas as perdas estão na seção 2.1/6 do relatório de auditoria de 21/10. **Nenhuma perda inesperada.**
  - Versões: Sistema Betinhos passou a v0.0.65 (o DEV já tinha um push a mais que o v0.0.64 desta manhã); App Motoristas 2.1.724 → 2.1.756.
  - `--travado` acusou o que o import ligou: 2 fluxos ("Flow Checklists | Rotina diaria", "Flow Webhook Stripe | Cobrança QR") e 10 steps (6 `Cr40f.ValorOp*`, 3 `Checklists - *`, "Cobranca por QR code (Stripe Checkout)"). Passo 4b aplicado (desligados), foto 2 refeita, comparação de novo: as duas listas vazias. **Para o PROD:** o import vai ligar esses 12; conferir com o Renan se é o desejado (no PROD de hoje eles estão ligados?).

## Tarefa 10 — migração e retirada da AppBetinhos

| Passo | Tempo | Resultado |
|---|---|---|
| Import `BetinhosCore` (1ª instalação) | 51:52 | ok |
| Import `BetinhosAutomacao` | 4:41 | ok |
| Import `BetinhosInterface` | 3:56 | ok |
| Import `BetinhosMotoristas` | 2:39 | ok |
| Foto 3, comparação 2→3 | — | sem perda; 855 componentes ganharam dono nas 4. Os imports religaram 14 steps (6 `Cr40f.ValorOp*`, 3 `Checklists - *`, Stripe QR, 4 `new_Betinhos.PriceComposition.*`): passo 4b, foto 3 refeita, listas vazias |
| `conferir-retirada` foto 3 | — | código 0, `soNaCaixa` e `emDuasNovas` vazias |
| Desinstalar AppBetinhos | ≈ 25 min | concluída (histórico de soluções: resultado True). O pac perdeu a conexão aos ~22 min e a 2ª tentativa bateu em "Uninstall já em andamento"; a foto 4 foi refeita depois do fim |
| Foto 4, comparação 3→4 | — | código 0, **nenhum componente sumiu**; cada componente com uma só das 4 |
| Desinstalar `gerarpagantes` | 1:43 | ok; foto 5, comparação 4→5 código 0, 16 componentes ficaram só com a solução nova |

**A prova central do plano passou:** a desinstalação da AppBetinhos gerenciada não apagou nada que as 4 soluções cobrem. O caminho de desinstalação vale para a Fase 4.

## Tarefa 11 — uso e ganho

- **Uso (Web API do TEST, admin):** `POST cr40f_FrotaPendencias` 200 (`PendenciasJson`); WebResources servidos: Sistema Betinhos v0.0.65, App Motoristas 2.1.756, Formulário Geral 1.11.0; apps `new_AppMotoristasv2` e `cr40f_ModelDrivenBetinhos` presentes; gerenciadas do Betinhos no TEST: só as 4. **Não verificado no navegador** (TEST em modo admin pede login da conta administradora).
- **Ganho:** descrição de `new_TelaFuncionariosLoader.html` alterada no DEV, Interface 1.0.0.1 exportada (4:30) e importada com `--stage-and-upgrade` no TEST: **5:26**, contra **27:04** da AppBetinhos inteira (≈ 5× mais rápido). Descrição restaurada no DEV.
- Foto 6, comparação 5→6: Core e Automação sem mudança; Sistema Betinhos v0.0.65 → v0.0.67 (o DEV recebeu mais 2 pushes durante o ensaio). `componentesSumiram` 63, todos WebResources (tipo 61): chunks `assets/*.js` de builds antigos que a limpeza de chunks do `push-dev.ps1` já tinha apagado no DEV (0 dos 63 existem no DEV ou no PROD). Perda esperada; o comparador ainda não sabe distinguir chunk obsoleto.

## O que o ensaio ensinou para a Fase 4

1. **pac perde a conexão em operações longas** (cópia, export, delete): a operação continua no servidor. Os scripts da Fase 4 precisam confirmar pelo histórico de soluções (`msdyn_solutionhistories`) antes de tentar de novo.
2. **Camadas Active no PROD:** 76 componentes (30 telas, 2 assemblies, 44 steps e fluxos). Remover e importar na mesma janela; entre uma coisa e outra o usuário veria a versão antiga das telas.
3. **Estado ligado/desligado:** os imports ligam 2 fluxos e 14 steps. Conferir no PROD se é o estado desejado antes do domingo.
4. **Primeira instalação do Core é lenta** (52 min): a janela do domingo deve prever ~1h30 para os 4 imports + ~25 min de desinstalação.
5. **Comparador:** tratar chunks `cr40f_SistemaBetinhos/assets/*` obsoletos como informativo, não perda.

## Decisões

- [x] Camadas Active no TEST: remover todas (Renan, 22/10). Para o PROD, a lista das 76 fica em `camadas-antes.csv`.
