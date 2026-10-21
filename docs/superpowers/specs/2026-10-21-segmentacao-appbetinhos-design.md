# Segmentação da AppBetinhos em 4 soluções — design

Aprovado em seções pelo Renan em 21/10/2026. Substitui o brief `2026-10-21-segmentacao-appbetinhos-brief.md`. O levantamento que embasa este design está em `docs/auditoria/2026-10-21-appbetinhos-limpeza-e-segmentacao.md`.

## Objetivo

Trocar a solução única AppBetinhos por 4 soluções gerenciadas: `BetinhosCore`, `BetinhosAutomacao`, `BetinhosInterface` e `BetinhosMotoristas`. Uma mudança de tela ou de fluxo passa a chegar ao TEST e ao PROD importando só a solução que mudou, sem perder registro, fluxo, configuração ou valor de variável.

## Decisões do Renan (21/10/2026)

| Tema | Decisão |
|---|---|
| Ensaio | TEST sobrescrito com cópia completa do PROD (dados reais), mantido em modo de administração até a migração no PROD terminar |
| Ordem no PROD | Primeiro a promoção pendente (checklist, fluxos de IA e o que estiver no DEV) pela AppBetinhos, como hoje; a migração vem depois, em outra janela |
| Janela no PROD | Domingo de manhã |
| Planner e Fluxo de Caixa | Entram nas 4 soluções; separar depois só se ganharem ritmo próprio |
| Distribuição no DEV | Distribuidor agora (AppBetinhos como caixa de entrada); cada repositório passa a gravar direto na solução certa quando for mexido; no fim, a caixa de entrada é excluída |

## Estado de partida (21/10/2026)

- DEV (`org23b93544`): AppBetinhos não gerenciada 1.0.0.268, já limpa. Tem 95 tabelas, 178 recursos da Web, 91 fluxos, 26 regras de negócio, 61 steps, 10 assemblies, 1 pacote de plug-in, 27 Custom APIs, 37 variáveis, 52 referências de conexão, 26 choices, 9 funções, 6 canvas, 2 apps model-driven, 2 conectores personalizados e 1 servidor MCP.
- PROD (`orgf261ae8e`): AppBetinhos gerenciada 1.0.0.268 e `gerarpagantes` gerenciada 1.0.2.101 (subconjunto da AppBetinhos).
- TEST (`appbetinhostest`, Sandbox): AppBetinhos 1.0.0.267, `BetinhosFoundation` 1.0.0.1, 4 reservas.
- Publisher: `DefaultPublisherorg23b93544` (prefixo `new`). As 4 soluções usam o mesmo, porque trocar exigiria recriar tabelas.
- Scripts que gravam na AppBetinhos: 119 arquivos em 20 repositórios (Sistema Betinhos 26, App Motoristas 23, Tela Gerar Pagantes 8, Tela Composição de Preço 8, Dashboard Betinhos 8, Tela Planner 7, Tela Formulário Geral 7, Tela Pagamento de Fornecedores 5, Tela Fluxo de Caixa 5, Tela Funcionários 4, Tela Funções Operacionais 3, e 1 ou 2 em Voucher de Confirmação, Preview Cotações, Pedir Cotação, Página Inicial, Gestão de Comunicados, Gestão de Checklists, Despesas, Currículos e Módulo Qualidade).

## 1. Soluções e regras

| Solução | Conteúdo |
|---|---|
| `BetinhosCore` | Tabelas com todos os subcomponentes (colunas, relacionamentos, chaves, formulários, visões, gráficos, ribbon da tabela), regras de negócio (viajam com a tabela), choices, funções de segurança, perfil de segurança de campo, definições de variáveis de ambiente (nunca valores), conectores personalizados, configuração de busca do Dataverse sem app, e os recursos da Web que formulário ou ribbon de tabela usa (biblioteca de comandos, `new_appmotoristas_push_redirect.js`, ícones de tabela, logo usado pelos dois apps) |
| `BetinhosAutomacao` | Assemblies e pacotes de plug-in, steps, Custom APIs com parâmetros, fluxos, BPFs com a tabela do BPF, referências de conexão |
| `BetinhosInterface` | App `cr40f_ModelDrivenBetinhos` com sitemap, comandos (`appactions`), configurações, elementos e busca do Dataverse do app, recursos da Web que não são do app de motoristas nem do Core, páginas personalizadas, painéis |
| `BetinhosMotoristas` | App `new_AppMotoristasv2` com sitemap, configurações, elementos e busca do Dataverse do app, `new_app-motoristas-v2`, `new_comunicadodestinatario_redirect.js`, servidor MCP `new_AppMotoristasv2_MCPServer`, canvas "App Betinhos Motoristas" v1 |

- Desvios aceitos na Fase 1 (21/10/2026), forçados pela regra de dependência: regras de negócio (workflow categoria 2) no Core, porque viajam com a tabela como subcomponente e 3 só existem lá (R15); busca do Dataverse (`dvtablesearch` e entidades) segue o app, porque só existe numa solução junto com ele; `new_appmotoristas_push_redirect.js`, a biblioteca de comandos do ribbon e 7 recursos da Web no Core por exceção de nome (R17). A tabela acima já reflete os desvios; as exceções estão em `regras.json`.
- Custom APIs, plug-ins e fluxos usados pelo app de motoristas e também por outras telas (checklist, troca de carro, comunicados) ficam na Automação.
- Dependências permitidas: Interface → Automação e Core; Motoristas → Automação e Core; Automação → Core; Core → nada das outras três.
- Versão própria por solução, começando em 1.0.0.0. A AppBetinhos termina numa versão 1.0.1.0 vazia.
- Regras em `packages/deploy/solucoes/regras.json`: um bloco por tipo de componente e uma lista de exceções por nome (por exemplo, os WebResources do app de motoristas). Componente sem regra não é adivinhado: o distribuidor para e mostra qual é.

## 2. Ferramentas no DEV

Ficam em `packages/deploy/solucoes/`, no padrão do `bump-version.mjs`: lógica pura em Node com `node --test`, acesso ao Dataverse em PowerShell, a mesma autenticação e a mesma trava de host do `push-dev.ps1` (nunca PROD).

| Unidade | Faz | Depende de |
|---|---|---|
| `regras.json` | Mapa tipo/nome → solução | — |
| `classificar.mjs` (+ testes) | Recebe componentes `{tipo, nome, id}` e devolve a solução de cada um, ou "sem regra"; sem rede | `regras.json` |
| `distribuir-solucoes.ps1` | Lê os componentes da AppBetinhos no DEV, classifica e chama `AddSolutionComponent` (sem `AddRequiredComponents`) para o que ainda não está na solução certa; cria as 4 soluções se faltarem | `classificar.mjs`, Web API do DEV |
| `distribuir-solucoes.ps1 -SomenteConferir` | Não altera nada. Sai com código 1 e lista: componente sem dono, componente em duas das 4, componente fora do lugar, dependência apontando para cima e dependência de componente próprio do ambiente (base Active) que não está em nenhuma das 4 (subcomponente resolvido pela tabela pai) | Idem, mais `RetrieveMissingDependencies` e a metadata das tabelas |
| `foto-ambiente.ps1` | Gera um JSON com: contagem exata de registros por tabela (FetchXML; acima do limite de 50.000, paginação dos ids, também exata; qualquer outro erro interrompe a foto, R18), estado e categoria de cada fluxo, estado e configuração segura de cada step, situação dos 4 steps sensíveis pelo nome, hash dos valores das variáveis, soluções e tipo de cada componente, pacote de cada assembly, versão servida do Sistema Betinhos e do App Motoristas. Falha se nenhuma solução pedida existir ou se faltar estado de algum fluxo ou step das soluções; apaga o arquivo de saída no início | Web API do ambiente (leitura) |
| `comparar-fotos.mjs` (+ testes) | Compara duas fotos e lista as diferenças por categoria. Perda: registro que cai, tabela, fluxo, step, variável ou componente que some, fluxo que desliga, step que desativa ou perde a configuração segura, valor de variável que muda; fluxo que liga e step que habilita são informativos (R12). Com `--travado` (TEST copiado do PROD, fluxos desligados), fluxo novo ou alterado que fica ligado (exceto regra de negócio e BPF) e step novo ou alterado que fica habilitado também são perda | — |
| `conferir-retirada.mjs` (+ testes) | Barreira antes de desinstalar: numa foto depois dos 4 imports, sai com código 1 se algum componente só tem a AppBetinhos ou a `gerarpagantes` como dona (a desinstalação o apagaria; única liberação: assembly cujo pacote está na Automação) ou se algum componente está em duas das 4 | — |
| `solucoes.ps1` (`Invoke-Pac`, `Export-SolucaoGerenciada`) | Todo comando do pac passa `--environment <url>`, conferido antes com `pac org who --environment` (o perfil ativo do pac é global à máquina e nunca decide o alvo); o export apaga o ZIP antigo, exige o arquivo novo e confere UniqueName, versão e Managed no `solution.xml` | pac CLI |

Migração gradual dos scripts: ao mexer num dos 20 repositórios, cada script dele troca o `SolutionUniqueName` da AppBetinhos pela solução certa. Quando o último repositório for migrado e o `-SomenteConferir` mostrar a caixa de entrada vazia de componentes próprios, a AppBetinhos é excluída do DEV.

Checklist dos repositórios (marcar ao migrar): Sistema Betinhos, App Motoristas, Tela Gerar Pagantes, Tela Composição de Preço, Dashboard Betinhos, Tela Planner, Tela Formulário Geral, Tela Pagamento de Fornecedores, Tela Fluxo de Caixa, Tela Funcionários, Tela Funções Operacionais, Tela Voucher de Confirmação, Tela Preview Cotações, Tela Pedir Cotação, Tela Página Inicial, Tela Gestão de Comunicados, Tela Gestão de Checklists, Tela Despesas, Tela Currículos, Módulo Qualidade.

## 3. Ensaio no TEST

1. **Cópia completa do PROD para o TEST.**
   - Conferir: modo de administração ligado, operações em segundo plano desligadas, todos os fluxos desligados. Se algum fluxo estiver ligado, ele é desligado antes de qualquer outro passo.
   - Foto 0.
2. **Pré-requisitos.**
   - Remover as camadas Active de `cr40f_SistemaBetinhos*`, da Composição de Preço e do Planner, adaptando `remove-prod-active-layer.ps1`.
   - Excluir as 8 Custom APIs `cr40f_AI*V2` não gerenciadas.
   - Foto 1.
3. **Ensaio da promoção pendente.**
   - Importar a AppBetinhos atual do DEV, gerenciada e com stage-and-upgrade, medindo o tempo (tempo de referência).
   - Foto 2: as diferenças só podem ser as exclusões da limpeza de 21/10 e as features novas.
4. **Migração.**
   - Importar Core → Automação → Interface → Motoristas, medindo cada uma.
   - Foto 3: nenhuma diferença de dados, fluxos, steps ou variáveis.
5. **Retirada da AppBetinhos.**
   - Desinstalar a AppBetinhos gerenciada e depois a `gerarpagantes` (desvio decidido no plano: o DEV não exporta uma AppBetinhos vazia enquanto ela é a caixa de entrada; o upgrade vazio montado à mão fica como alternativa se a desinstalação apagar algo). Antes de cada desinstalação, `conferir-retirada.mjs` sai com código 0 na foto mais recente.
   - Fotos 4 e 5: 0 componentes excluídos, contagens iguais, cada componente só nas 4.
   - No TEST, toda comparação de fotos roda com `--travado`; se acusar fluxo ligado ou step habilitado, desligar o acusado e comparar de novo antes de seguir.
6. **Uso.**
   - Sistema Betinhos abre, a Geral lista reservas reais e o rodapé mostra a versão esperada.
   - App Motoristas abre.
   - A Custom API `cr40f_FrotaPendencias` responde.
   - O menu do app model-driven abre.
7. **Ganho.** Mudar um WebResource, subir só a Interface e importar só ela, com o tempo comparado ao do passo 3.

Se um passo falhar, o TEST é copiado de novo, o problema é corrigido e o ensaio recomeça do passo 1. O resultado (tempos, diferenças e decisões) vai para `docs/auditoria/ensaio-segmentacao-<data>.md`.

## 4. Migração no PROD

- **Pré-condições:**
  - promoção pendente já em produção e estável;
  - relatório do ensaio aprovado pelo Renan;
  - ok explícito do Renan no dia, num domingo de manhã.
- **Antes:**
  - backup manual do PROD no Power Platform admin center, com rótulo;
  - pré-requisitos do passo 2 do ensaio;
  - o Renan avisa a equipe.
- **Passos:** os passos 4 e 5 do ensaio, com foto e comparação depois de cada import. Parar na primeira diferença.
- **Ponto sem volta:** a desinstalação da AppBetinhos gerenciada (desvio decidido no plano; ela só exclui o componente que nenhuma outra solução gerenciada tem). Antes dela, cada componente tem dois donos (a AppBetinhos e a solução nova). Parar ali não exclui nada, e o PROD segue funcionando. A desinstalação só roda se a foto tirada depois dos 4 imports bater com a foto tirada depois dos pré-requisitos e se `conferir-retirada.mjs` sair com código 0 nessa foto (nenhum componente só na AppBetinhos ou na `gerarpagantes`, nenhum em duas das 4).
- **Alternativa:** se o ensaio no TEST mostrar que a desinstalação apaga algo, volta-se ao upgrade da AppBetinhos vazia montado à mão. O ensaio no TEST define qual dos dois caminhos vale.
- **pac:** todo comando com `--environment <url>`, conferido com `pac org who --environment` (`Invoke-Pac`); nenhum `pac auth select` antes de import, delete ou export.
- **Depois de cada import:**
  - fluxos ligados continuam ligados (fluxo que desliga é perda; fluxo que liga é informativo no PROD, R12); religar o que precisar;
  - os 4 steps sensíveis mantêm a configuração segura; se não, rodar os `provision-*` que o `deploy-prod.ps1` lista;
  - as variáveis mantêm os valores.
- **Rollback:**
  - antes do ponto sem volta, parar e manter a AppBetinhos;
  - depois, se algo sumir, restaurar o backup da manhã. Perde-se o que foi digitado na janela.

## 5. Deploy depois da migração

`packages/deploy/prod/deploy-solucoes.ps1` (Sistema Betinhos) generaliza `App Motoristas/scripts/deploy-prod.ps1`.

- **Parâmetros:**
  - `-Ambiente TEST|PROD`;
  - `-Solucoes` opcional;
  - `-Aplicar`. Sem ele, só mostra o plano.
- **Quais soluções:** só as que têm componente modificado no DEV depois da última importação no destino. O `-Solucoes` força a lista. A ordem é sempre Core → Automação → Interface → Motoristas.
- **Pré-checagens:**
  - `main` limpa e igual à `origin/main`;
  - `distribuir-solucoes.ps1 -SomenteConferir` sem erro;
  - auditoria de camadas Active no destino;
  - configuração segura dos 4 steps;
  - nenhum `environmentvariablevalues.json` no ZIP;
  - `scan-secrets.mjs` no ZIP.
- **Execução:** subir a versão só das soluções alteradas no DEV; exportar a gerenciada pelo `Export-SolucaoGerenciada` (ZIP novo e conferido) entre duas conferências do DEV; importar com `--stage-and-upgrade --publish-changes --activate-plugins` pelo `Invoke-Pac`; foto antes e depois, com comparação (`--travado` no TEST); conferir a versão servida.
- **App Motoristas:** o `deploy-prod.ps1` do repositório passa a chamar este script com `-Solucoes BetinhosMotoristas` e mantém as checagens próprias do app.
- **Documentação:** a seção de publicação do `CLAUDE.md` e as memórias passam a citar as 4 soluções.

## Verificação (pronto quando todos passarem)

1. `pnpm --filter @betinhos/deploy test` passa: classificador (cada chave de `porTipo`, cada exceção e cada proibido de `regras.json`, e a matriz de dependências permitidas), conferência (inclusive dependência própria fora das 4 e dependência do sistema ignorada), comparador de fotos (um teste por lista de perda, partição perda/informativo, `--travado`), conferência da retirada e regra de "solução alterada". `testa-solucoes.ps1` passa (escritas só no DEV, tabela pai das dependências, pac com `--environment`, export conferido, cobertura da foto).
2. DEV: as 4 soluções existem com o publisher atual, e `distribuir-solucoes.ps1 -SomenteConferir` sai com código 0, com `sem dono`, `em duas`, `fora do lugar`, `dependencias para cima`, `dependencias fora das 4`, valores de variável nas 4 e excedentes em 0.
3. DEV: cada solução exporta gerenciada pelo `Export-SolucaoGerenciada` sem erro (ZIP novo, UniqueName, versão e Managed conferidos), e as dependências ausentes no `Solution.xml` só apontam para camadas abaixo.
4. Ensaio no TEST completo (passos 1 a 7 da seção 3), com relatório publicado.
5. `deploy-solucoes.ps1 -Ambiente TEST`, sem `-Aplicar`, lista só a Interface depois de uma mudança de WebResource. Com `-Aplicar`, importa só ela.
6. Skill nova `verificar-solucoes` criada via `verificacao-criar`, e `verificar-deploy-dev` atualizada.
7. Migração no PROD feita conforme a seção 4, com fotos sem diferença e o relatório atualizado.

Casos de borda cobertos:
- componente esquecido (pego pelo item 2 e pela foto 4);
- componente novo durante a migração (o distribuidor falha);
- camada Active sombreando o import (versão servida no passo 6);
- configuração segura perdida;
- fluxo desligado pelo import;
- variável sem valor;
- BPF separado da sua tabela;
- import interrompido no meio;
- dependência de componente próprio que não está em nenhuma das 4 (item 2);
- componente que só a AppBetinhos ou a `gerarpagantes` tem antes da desinstalação (`conferir-retirada.mjs`);
- fluxo ligado ou step habilitado pelo import no TEST travado (`--travado`);
- ZIP velho ou ausente depois do export (`Export-SolucaoGerenciada`);
- perfil ativo do pac apontando para outro ambiente (`Invoke-Pac`).

## Fora do escopo

- Separar Planner ou Fluxo de Caixa em soluções próprias.
- Versionar as soluções desempacotadas no git: `sync-from-dev.yml` continua travado pelo `scan-secrets` enquanto os segredos (Cielo, Graph e Jev) estiverem no valor padrão das variáveis.
- Trocar os 119 scripts de uma vez.
- A promoção pendente do PROD, que tem plano próprio.
- Executar fluxos de verdade no TEST, que ficam desligados para não mandar e-mail, WhatsApp nem link de pagamento a clientes reais.
