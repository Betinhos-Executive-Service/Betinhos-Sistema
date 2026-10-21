# Segmentação da AppBetinhos em 4 soluções (brief)

## Objetivo
Trocar a solução única AppBetinhos por 4 soluções gerenciadas (Core, Automação, Interface, Motoristas). Assim, uma mudança de tela ou de fluxo chega ao PROD importando só a parte que mudou, em minutos, sem reimportar as 95 tabelas e reativar os 117 processos, e sem perder nenhum registro, fluxo ou configuração no PROD.

## Contexto
- **Estado atual (21/10/2026, depois da limpeza):**
  - DEV: AppBetinhos não gerenciada 1.0.0.268, com 95 tabelas, 178 recursos da Web, 91 fluxos, 26 regras de negócio, 61 steps, 10 assemblies, 27 Custom APIs, 37 variáveis, 52 referências de conexão, 26 choices, 9 funções e 6 canvas. ZIP de 24 MB.
  - PROD (`orgf261ae8e`): AppBetinhos gerenciada 1.0.0.268 e `gerarpagantes` gerenciada 1.0.2.101, um subconjunto da AppBetinhos.
  - TEST (`appbetinhostest`, Sandbox): AppBetinhos gerenciada 1.0.0.267, `BetinhosFoundation` 1.0.0.1, só 4 reservas. Não serve de ensaio sem refazer.
- **Publisher:** `DefaultPublisherorg23b93544` (prefixo `new`). As 4 soluções usam o mesmo, porque trocar exigiria recriar as tabelas.
- **Distribuição:**

  | Solução | Conteúdo |
  |---|---|
  | `BetinhosCore` | 95 tabelas com subcomponentes (colunas, relacionamentos, chaves, formulários, visões), choices, funções, perfil de segurança de campo, definições de variáveis, conectores personalizados, configuração de busca |
  | `BetinhosAutomacao` | assemblies, pacote `Betinhos.PriceComposition.Formulas`, steps, Custom APIs, fluxos, regras de negócio, referências de conexão |
  | `BetinhosInterface` | app `cr40f_ModelDrivenBetinhos`, sitemap, comandos (`appactions`), recursos da Web (Sistema Betinhos e telas), páginas personalizadas, biblioteca de comandos, painéis |
  | `BetinhosMotoristas` | app `new_AppMotoristasv2` e sitemap, `new_app-motoristas-v2` e os redirecionamentos de push, servidor MCP, canvas "App Betinhos Motoristas" v1 |

  Dependências: Core ← Automação ← Interface; Motoristas depende de Core e Automação. Custom APIs, plug-ins e fluxos usados pelo app de motoristas e também por outras telas (checklist, troca de carro, comunicados) ficam na Automação.
- **Reaproveitar:**
  - `App Motoristas/scripts/deploy-prod.ps1`, que já faz pré-checagens, versão, export, conferência do ZIP, stage-and-upgrade, checagem dos 4 steps com configuração segura e auditoria de camadas. Ele vira o deploy por solução;
  - `audit-prod-layers.ps1` e `remove-prod-active-layer.ps1`;
  - `packages/deploy/scan-secrets.mjs`;
  - `.github/workflows/sync-from-dev.yml`, que passa a exportar as 4;
  - os scripts de inventário e dependências desta auditoria (export, `RetrieveDependenciesForDelete`, contagem de registros).
- **Decisões e limites:**
  - PROD congelado até o checklist e os fluxos de IA (decisão de 19/10/2026); o Renan pediu para não publicar no PROD por enquanto;
  - `pnpm push` e publicação só pela `main` no checkout principal;
  - PROD só leitura sem pedido explícito;
  - excluir ou sobrescrever ambiente só com ok;
  - `--stage-and-upgrade` exclui no destino o que sai da solução.
- **Pré-requisitos que já existem no PROD (e vão estar no TEST depois da cópia):**
  - remover a camada Active de `cr40f_SistemaBetinhos*`, criada pelo hotfix v0.0.43 de 21/10;
  - remover as camadas Active de Composição de Preço e Planner;
  - excluir as 8 Custom APIs `cr40f_AI*V2` não gerenciadas, que dependem do pacote OperationsAI, já excluído no DEV.
- **Premissas:**
  - Assumi: formulários e visões ficam no Core, junto das tabelas. Hoje quase toda tela nova é WebResource, e separar subcomponentes dobra o trabalho; dá para separar depois, se a Interface precisar.
  - Assumi: no DEV, a AppBetinhos continua como "caixa de entrada". Os 128 scripts de 20 repositórios que gravam nela não mudam agora. Um script `distribuir-solucoes.ps1` coloca cada componente novo na solução certa por regra (tipo e nome) e falha se algum não tiver regra. Ela deixa de ser exportada para TEST e PROD.
  - Assumi: o deploy do PROD sai do repo App Motoristas e vai para `packages/deploy/prod/` do Sistema Betinhos, importando só as soluções que mudaram, na ordem de dependência.
  - Assumi: `gerarpagantes` é absorvida (WebResources na Interface; assembly V2 e Custom API na Automação) e desinstalada do PROD depois da migração.

## Verificação (pronto quando todos passarem)
1. **DEV:** as 4 soluções existem, com o mesmo publisher. Um script compara a AppBetinhos com a união das 4 e mostra 0 componentes faltando e 0 componentes em duas soluções ao mesmo tempo (salvo exceções listadas).
2. **DEV:** cada solução exporta gerenciada sem erro. As dependências ausentes no `Solution.xml` de cada uma só apontam para camadas abaixo (Interface → Core/Automação), nunca para cima.
3. **TEST refeito como cópia completa do PROD**, depois de:
   - verificar que todos os fluxos foram desligados e que o ambiente está em modo de administração;
   - aplicar os 3 pré-requisitos do PROD;
   - tirar a linha de base: contagem de registros das 95 tabelas, estado de cada fluxo e step, configuração segura dos 4 steps, valores das variáveis, camadas e versão servida do Sistema Betinhos e do App Motoristas.
4. **TEST, ensaio da promoção atual:** importar a AppBetinhos 1.0.0.269 do jeito de hoje, com o tempo medido. Esse tempo é a referência de comparação.
5. **TEST, migração:** importar Core → Automação → Interface → Motoristas, com o tempo de cada uma registrado. Depois, a AppBetinhos "vazia" como upgrade:
   - 0 componentes excluídos;
   - contagem de registros idêntica à linha de base;
   - fluxos, steps, configuração segura e variáveis iguais.
6. **TEST, limpeza final:** desinstalar a AppBetinhos vazia (e a `gerarpagantes`, se a cópia trouxer) com 0 componentes excluídos. Cada componente passa a ter camada gerenciada só das 4 soluções novas.
7. **TEST, uso:** abrir o Sistema Betinhos (Geral lista reservas reais, rodapé com a versão esperada) e o App Motoristas. Chamar uma Custom API só de leitura (`cr40f_FrotaPendencias`) e receber a resposta.
8. **TEST, ganho:** mudar um WebResource, subir a versão só da Interface e importar só ela. O tempo fica bem abaixo da referência do passo 4; Core e Automação não ganham camada nova.
9. **Pipeline:** `sync-from-dev.yml` gera `solution/<nome>/` para as 4, e o `scan-secrets` passa. O deploy por solução, em modo simulação, lista só as soluções alteradas, na ordem certa.

- **Casos de borda:**
  - componente esquecido: seria excluído pela AppBetinhos vazia, e os passos 1 e 5 pegam isso;
  - componente novo criado no DEV durante a migração: o distribuidor falha até ter regra;
  - camada Active sombreando o import: a tela não muda, e o passo 7 confere a versão servida;
  - steps recriados sem a configuração segura;
  - fluxo que perde a conexão: as referências de conexão mudam de dono, mas a conexão do ambiente fica;
  - variável que perde o valor;
  - BPF e a tabela dele precisam ficar na mesma camada;
  - import parcial falhando no meio: o TEST é refeito; no PROD, o rollback é o backup manual tirado antes da janela.
- **Como provar:** os logs e as contagens de cada passo num relatório de ensaio. Os scripts novos ganham testes, e a skill nova `verificar-solucoes` é criada via `verificacao-criar`. A `verificar-deploy-dev` é atualizada com o deploy por solução.
- **Fora do alcance:**
  - execução real dos fluxos no TEST, que ficam desligados para não mandar e-mail, WhatsApp nem link Cielo para clientes reais;
  - a migração no PROD, feita só depois do ensaio aprovado, com janela e ok explícitos;
  - a troca dos 128 scripts dos repositórios, coberta pelo distribuidor nesta fase.
- **Esforço estimado:** de 2 a 3 dias, contando o ensaio no TEST, mais a janela do PROD.

## O que só você sabe (responda antes de eu começar)
- Posso sobrescrever o TEST com uma cópia completa do PROD? Isso leva dados reais de clientes e motoristas para o sandbox. Quem tem acesso ao TEST hoje?
- No PROD, a migração vem depois da promoção pendente (checklist, fluxos de IA e cerca de 190 componentes de outras frentes)? Ou você prefere que essa promoção já saia pelas 4 soluções novas?
- Qual janela serve no PROD (dia e horário de menor uso) e quanto tempo de lentidão a operação aceita?
- Fluxo de Caixa (sem uso no PROD) e Planner entram nas 4, ou viram soluções próprias desde já?
