---
name: verificar-solucoes
description: "Verifica as ferramentas de segmentação da AppBetinhos em 4 soluções (BetinhosCore, Automacao, Interface, Motoristas): classificador, conferência, fotos, comparador (com --travado), conferência da retirada, helpers do pac e distribuidor. Use após mudar packages/deploy/solucoes/** ou antes de exportar as 4 soluções do DEV."
---
# Verificar segmentação da AppBetinhos (soluções)

## Cobre
- Código: `packages/deploy/solucoes/**` (`classificar.mjs`, `conferir.mjs`, `comparar-fotos.mjs`, `conferir-retirada.mjs`, `arquivo.mjs`, `regras.json`, `dataverse.ps1`, `solucoes.ps1` com `Invoke-Pac`/`Assert-PacAmbiente`/`Export-SolucaoGerenciada`, `distribuir-solucoes.ps1`, `foto-ambiente.ps1`, `testa-solucoes.ps1`, `distribuir-apos-push.ps1` com `testa-distribuir-apos-push.ps1`, chamado no fim do `push-dev.ps1`) e o script `test` de `packages/deploy/package.json`.
- Ambiente: só o DEV (`org23b93544.crm2.dynamics.com`). Todos os passos do roteiro são somente leitura. O `-Aplicar` do distribuidor escreve no DEV e só entra como correção, com ok do usuário (ver "Casos de borda").

## Preparar ambiente
- Raiz do repo (ou da worktree). Node e `pnpm` instalados; Windows PowerShell 5.1 (`powershell`).
- Passos 3 e 4 falam com o DEV: usam `DV_CLIENT_ID`/`DV_TENANT_ID`/`DV_CLIENT_SECRET` se existirem; sem eles, abrem o login do módulo MSAL.PS (conta do Renan). Na VM cloud não há credencial do Dataverse: lá só os passos 1 e 2 valem.
- Fotos e ZIPs ficam em `backup/solucoes/` (a pasta `/backup/` está no `.gitignore`). Nunca faça `git add` deles.

## Roteiro
1. Testes Node: `pnpm --filter @betinhos/deploy test` → código 0 e `fail 0` (a suíte inclui `classificar`, `conferir`, `comparar-fotos`, `conferir-retirada` e `cli`, além dos testes de `flows/`).
2. Testes PowerShell com respostas simuladas e `pac` simulado (não toca no Dataverse nem no pac real): `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1` → código 0 e nenhuma linha começando por `FALHA`. Cobre as escritas recusadas fora do DEV, a tabela pai das dependências, `Assert-PacAmbiente`/`Invoke-Pac`, `Export-SolucaoGerenciada` (ZIP antigo, ZIP ausente, versão, UniqueName, Managed), a cobertura da foto e o arquivo de saída.
   - Distribuição automática do push: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-distribuir-apos-push.ps1` → 4 linhas `ok`, código 0 (o push nunca falha; "ATENCAO" só quando a distribuição não zera; mutex liberado).
   - Para provar o helper do pac contra o pac real (somente leitura), no PowerShell 5.1: `. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1; Assert-PacAmbiente https://org23b93544.crm2.dynamics.com` → sem erro.
3. Conferência no DEV: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/distribuir-solucoes.ps1 -SomenteConferir` → código 0 e as DUAS linhas abaixo (confira as duas: o código de saída vira 1 por causa de qualquer uma delas):
   - `[solucoes] conferencia: sem dono 0; em duas 0; fora do lugar 0; dependencias para cima 0; dependencias fora das 4 0`
   - `[solucoes] valores de variavel dentro das 4 solucoes: 0; excedentes fora da caixa: 0; assemblies empacotados: N`
   - Contagens que precisam ser 0: `sem dono`, `em duas`, `fora do lugar`, `dependencias para cima`, `dependencias fora das 4`, `valores de variavel dentro das 4 solucoes` e `excedentes fora da caixa`. A única informativa é `assemblies empacotados` (assemblies carregados por pacote de plug-in: não zera nem reprova).
   - Cada dependência acusada sai também numa linha `AVISO: DEPENDENCIA <motivo>: <solucao> precisa do tipo T <id> (pai P; dono D), exigido pelo tipo T2 <id2>`.
   - A linha `detalhes:` aponta o `relatorio.json` (e, na mesma pasta, o `excedentes.json`) com os ids de cada achado.
   - Se o código for 1 ou alguma das contagens que precisam ser 0 não for 0, não siga: trate pela lista de causas em "Casos de borda" e repita este passo até sair com código 0.
4. Fotos do DEV sem perda: duas fotos seguidas, depois o comparador.
   - `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup/solucoes/foto-a.json`
   - mesmo comando com `-Saida backup/solucoes/foto-b.json`
   - Cada foto termina com `foto gravada em ...: N tabelas (...), N fluxos, N steps, N variaveis, N componentes; steps sensiveis sem configuracao segura: 0`. A foto falha (código 1, sem arquivo) se nenhuma solução pedida existir ou se algum fluxo ou step das soluções ficar sem estado; o arquivo de `-Saida` é apagado no início.
   - `node packages/deploy/solucoes/comparar-fotos.mjs backup/solucoes/foto-a.json backup/solucoes/foto-b.json` → código 0 e todas as listas de perda vazias (`registrosCairam`, `tabelasSumiram`, `fluxosSumiram`, `fluxosDesligados`, `stepsSumiram`, `stepsDesativados`, `stepsPerderamSeguro`, `variaveisSumiram`, `variaveisMudaram`, `componentesSumiram`, `fluxosLigadosNoTravado`, `stepsHabilitadosNoTravado`; as duas últimas só se preenchem com `--travado`).
   - `--travado` (antes dos arquivos) é para o TEST travado: fluxo novo ou alterado que fica ligado (exceto regra de negócio e BPF, categorias 2 e 4) e step novo ou alterado que fica habilitado viram perda. No DEV não se usa.
   - Sinal de segurança: `grep -c '"value"' backup/solucoes/foto-a.json` → `0` (a foto guarda só o hash SHA-256 das variáveis, nunca o valor).
   - Comparar uma foto nova com uma antiga (ex.: a de antes de uma importação) é o uso real: o DEV é um ambiente vivo, então `registrosMudaram` com contagem diferente e componentes ou fluxos novos são esperados. O que reprova é qualquer lista de perda não vazia (código 1).
5. Conferência da retirada (barreira antes de desinstalar AppBetinhos/gerarpagantes no TEST ou PROD): `node packages/deploy/solucoes/conferir-retirada.mjs backup/solucoes/foto-a.json` → no TEST/PROD, código 0 com `soNaCaixa` e `emDuasNovas` vazios. No DEV a AppBetinhos é a caixa de entrada, então `soNaCaixa` lista o que ainda não foi distribuído (o mesmo conjunto do `sem dono` do passo 3) e o código é 1 enquanto houver; `peloPacote` (assembly carregado por pacote na Automação) é informativo.

## Casos de borda
Causas do código de saída 1 do passo 3 (qualquer uma basta):
- `sem dono N` (linha `conferencia`): componente na AppBetinhos que não está em nenhuma das 4 soluções. Em geral são componentes criados ou incluídos na AppBetinhos do DEV depois da última distribuição (por outras sessões ou pessoas). Inspecione cada id em `relatorio.json` (`cobertura.semDono`) com o comando somente leitura abaixo, rode o distribuidor sem flags (dry run: só mostra quantos componentes iriam para cada solução) e, com o ok do usuário, corrija com `-Aplicar`.
- `em duas N`: componente presente em mais de uma das 4. Costuma ser arrasto do `AddSolutionComponent`; o `-Aplicar` remove da solução que não é a dona.
- `fora do lugar N`: componente numa das 4 que não é a indicada por `regras.json`. O `-Aplicar` inclui na dona e remove da errada. Se a regra é que está errada, ajuste `regras.json` (e os testes).
- `dependencias para cima N`: uma solução depende de componente de camada acima (permitido: Automação -> Core; Interface e Motoristas -> Core e Automação; Core -> nenhuma). `relatorio.json` (`violacoes` com `motivo` "para cima") mostra a solução, o componente requerido, a tabela pai (subcomponente) e a dona dele. Corrija a regra (`regras.json`) ou o componente; `-Aplicar` não resolve.
- `dependencias fora das 4 N`: uma das 4 depende de componente próprio do ambiente (base na solução Active) que não está em nenhuma das 4, nem pela tabela pai. Exportada assim, a solução não importa em outro ambiente sem a AppBetinhos. Se o componente está na AppBetinhos, ele também aparece em `sem dono`, e o `-Aplicar` (com ok) resolve os dois; se está só na Default, alguém precisa incluí-lo na AppBetinhos (decisão do usuário: pode ser de outra frente). Atributo, visão e formulário sem pai informado pelo Dataverse são resolvidos pela metadata; relacionamento sem pai fica sem pai e é acusado (não adivinhar). Caso real de 21/10/2026: `cr40f_cobrancastripe`, exigida por `cr40f_funcionarios` e `cr40f_reservadeveculos` (Core), estava só na Default; depois outra frente a incluiu na AppBetinhos e ela passou a aparecer também em `sem dono`.
- `excedentes fora da caixa N` (segunda linha): componente dentro de uma das 4 que não deveria estar lá (pertence a outra solução, ou está fora da caixa e já aparece numa solução anterior). Lista em `excedentes.json`; o `-Aplicar` remove.
- `valores de variavel dentro das 4 solucoes N` (segunda linha): valor de variável de ambiente (tipo 381) dentro de uma das 4. Nunca viaja em solução; o `-Aplicar` remove das 4.
- Aviso `SEM REGRA tipo T entidade E nome N (id)`: tipo de componente sem regra em `regras.json`. O distribuidor se recusa a distribuir e mantém o código 1; inclua a regra (e o teste) antes.
- Aviso `PROIBIDO tipo T 'nome' (id): motivo`: valor de variável de ambiente (tipo 381) na própria AppBetinhos. Não vai para nenhuma das 4 e mantém o código 1 enquanto estiver lá; a decisão é do usuário.
- Só numa execução com `-Aplicar`: avisos `FALHA ...` (o Dataverse rejeitou uma inclusão ou remoção, ou o componente sumiu no meio da execução). Leia o erro exato, rode de novo e confira.

Inspecionar um componente "sem dono" (somente leitura; PowerShell 5.1 na raiz do repo, troque `<id>` pelo id do `relatorio.json`):
```powershell
$ErrorActionPreference = 'Stop'
. packages/deploy/solucoes/dataverse.ps1
$dv = Connect-Dataverse 'https://org23b93544.crm2.dynamics.com' @('org23b93544.crm2.dynamics.com')
Read-DvAll $dv 'solutioncomponents?$select=objectid,componenttype,_solutionid_value&$filter=objectid eq <id>' | Select-Object objectid, componenttype, _solutionid_value | Format-Table -AutoSize
Read-DvAll $dv 'solutions?$select=solutionid,uniquename' | Where-Object { $_.uniquename -match '^(AppBetinhos|Betinhos(Core|Automacao|Interface|Motoristas))$' } | Select-Object solutionid, uniquename | Format-Table -AutoSize
```
`componenttype` 29 é fluxo (nome em `workflows?$select=name&$filter=workflowid eq <id>`); a segunda consulta traduz `_solutionid_value` para o nome da solução. Nome de tabela (tipo 1) de uma dependência acusada: ``Invoke-RestMethod -Uri "$($dv.Api)/EntityDefinitions(<id>)?`$select=LogicalName" -Headers $dv.Headers``.

O que o `-Aplicar` faz: é uma escrita no DEV. Cria as soluções que faltam (no publisher da AppBetinhos), inclui na solução dona os componentes da caixa de entrada que faltam e remove das 4 soluções o que não é da dona (excedentes arrastados e valores de variável). Nunca altera a AppBetinhos. Só rode com o ok do usuário, só no DEV, e repita a conferência até sair com código 0 e as duas linhas em zero.

Outros:
- Caixa de entrada vazia: `distribuir-solucoes.ps1` aborta com "voltou com 0 componentes" (nunca aprova por vazio); confira a conexão e a solução `AppBetinhos`.
- Assembly dentro de pacote de plug-in aparece como "assembly empacotado" e fica fora da conferência: é esperado (quem carrega é o pacote).

## Evidência obrigatória
- A saída completa do passo 3 (as duas linhas de contagem, a linha `detalhes:`) e o código de saída.
- A saída completa do comparador do passo 4 (JSON) e o código de saída.
- A saída do passo 5 e o código de saída, quando a tarefa for de retirada (TEST/PROD).
- Resumo dos passos 1 e 2 (`pass N / fail 0`; código 0 e nenhuma linha `FALHA`).

## Limites
- Só prova o DEV. Nada aqui diz algo sobre TEST (`appbetinhostest.crm2.dynamics.com`) ou PROD (`orgf261ae8e.crm2.dynamics.com`): isso é a Fase 2, com ok de cópia do Renan.
- Comando do pac que lê ou escreve num ambiente só por `Invoke-Pac <url>` (ou `Export-SolucaoGerenciada`): o perfil ativo do pac é global à máquina e nunca decide o alvo. Nunca `pac auth select` antes de import, delete, online-version ou export.
- A AppBetinhos do DEV continua sendo a caixa de entrada: componentes novos podem ser criados ou incluídos nela a qualquer momento. Rode a conferência de novo antes de cada exportação das 4 soluções; um resultado antigo não vale.
- A conferência cobre dono e dependências dos componentes; não prova que as soluções gerenciadas importam em outro ambiente.

## Workflow "Publicar TEST" (`.github/workflows/publicar-test.yml`)

Disparo manual (Actions → Publicar TEST → Run workflow; campo `solucoes` vazio = as 4). Pré-requisitos: usuário de aplicação no TEST e environment `test` no GitHub com revisor obrigatório, `vars.DV_ENVIRONMENT_URL` (`https://appbetinhostest.crm2.dynamics.com`), `vars.DV_TENANT_ID`, `vars.DV_CLIENT_ID` e `secrets.DV_CLIENT_SECRET`.
1. Job `exportar` (environment `dev`): `exportar-para-test.ps1` roda a conferência (`distribuir-solucoes.ps1 -SomenteConferir`, processo filho) e para se não zerar; sobe a revisão de cada solução no DEV (`pac solution online-version`, `Get-VersaoSeguinte`) e exporta com `Export-SolucaoGerenciada`. Artefato `pacotes`: ZIPs + `manifesto.json` (versão e hash).
2. Job `importar` (environment `test`, espera a aprovação): foto antes, `importar-no-test.ps1` (`Assert-HostTest` recusa DEV e PROD; ordem Core → Automação → Interface → Motoristas; `--stage-and-upgrade --publish-changes --activate-plugins`; se o pac perder a conexão, `Wait-VersaoInstalada` espera até 60 min a versão chegar), foto depois e `comparar-fotos.mjs --travado`. Artefato `fotos`: antes, depois, comparação e `importados.json` (versão antes/depois e minutos por solução).
3. Esperado: job verde, `importados.json` com a versão nova das escolhidas e comparação sem perda. Vermelho no comparar com fluxo/step em `ligados` é o `--activate-plugins` religando o que estava desligado no TEST (ensaio de 22/10: 2 fluxos e 14 steps): desligar à mão (passo 4b do ensaio) e decidir se o workflow passa a fazer isso.
4. Testes locais (Windows): `powershell -File packages/deploy/solucoes/testa-solucoes.ps1` cobre `Get-VersaoSeguinte`, `Get-SolucoesEscolhidas`, `Assert-HostTest` e `Wait-VersaoInstalada`.

## Camadas Active (TEST)

`packages/deploy/solucoes/remover-camadas-active.ps1 -EnvironmentUrl <url>` lista os componentes da AppBetinhos com camada Active no topo (WebResource, Workflow, PluginAssembly, SdkMessageProcessingStep, SystemForm, AppModule, SiteMap); com `-Aplicar` guarda o JSON de cada camada e chama `RemoveActiveCustomization` (`LogicalName` + `Id`). Recusa o PROD. Prova: rodar de novo sem `-Aplicar` e ver `0 componentes`. Ensaio de 22/10/2026: 76 removidas no TEST, 0 falhas (`docs/auditoria/ensaio-segmentacao-2026-10-22.md`).
