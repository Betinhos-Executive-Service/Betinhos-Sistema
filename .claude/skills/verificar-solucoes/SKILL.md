---
name: verificar-solucoes
description: "Verifica as ferramentas de segmentação da AppBetinhos em 4 soluções (BetinhosCore, Automacao, Interface, Motoristas): classificador, conferência, fotos e distribuidor. Use após mudar packages/deploy/solucoes/** ou antes de exportar as 4 soluções do DEV."
---
# Verificar segmentação da AppBetinhos (soluções)

## Cobre
- Código: `packages/deploy/solucoes/**` (`classificar.mjs`, `conferir.mjs`, `comparar-fotos.mjs`, `arquivo.mjs`, `regras.json`, `dataverse.ps1`, `solucoes.ps1`, `distribuir-solucoes.ps1`, `foto-ambiente.ps1`) e o script `test` de `packages/deploy/package.json`.
- Ambiente: só o DEV (`org23b93544.crm2.dynamics.com`). Todos os passos do roteiro são somente leitura. O `-Aplicar` do distribuidor escreve no DEV e só entra como correção, com ok do usuário (ver "Casos de borda").

## Preparar ambiente
- Raiz do repo (ou da worktree). Node e `pnpm` instalados; Windows PowerShell 5.1 (`powershell`).
- Passos 3 e 4 falam com o DEV: usam `DV_CLIENT_ID`/`DV_TENANT_ID`/`DV_CLIENT_SECRET` se existirem; sem eles, abrem o login do módulo MSAL.PS (conta do Renan). Na VM cloud não há credencial do Dataverse: lá só os passos 1 e 2 valem.
- Fotos e ZIPs ficam em `backup/solucoes/` (a pasta `/backup/` está no `.gitignore`). Nunca faça `git add` deles.

## Roteiro
1. Testes Node: `pnpm --filter @betinhos/deploy test` → código 0 e `fail 0` (a suíte inclui `classificar`, `conferir`, `comparar-fotos` e `cli`, além dos testes de `flows/`).
2. Testes PowerShell com respostas simuladas (não toca no Dataverse): `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1` → código 0 e nenhuma linha começando por `FALHA`.
3. Conferência no DEV: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/distribuir-solucoes.ps1 -SomenteConferir` → código 0 e as DUAS linhas abaixo, ambas com zeros (confira as duas: o código de saída vira 1 por causa de qualquer uma delas):
   - `[solucoes] conferencia: sem dono 0; em duas 0; fora do lugar 0; dependencias para cima 0`
   - `[solucoes] valores de variavel dentro das 4 solucoes: 0; excedentes fora da caixa: 0; assemblies empacotados: N` (N é só informativo: assemblies carregados por pacote de plug-in, não zera nem reprova).
   - A linha `detalhes:` aponta o `relatorio.json` (e, na mesma pasta, o `excedentes.json`) com os ids de cada achado.
   - Se o código for 1 ou algum número não for zero, não siga: trate pela lista de causas em "Casos de borda" e repita este passo até sair com código 0 e as duas linhas em zero.
4. Fotos do DEV sem perda: duas fotos seguidas, depois o comparador.
   - `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup/solucoes/foto-a.json`
   - mesmo comando com `-Saida backup/solucoes/foto-b.json`
   - `node packages/deploy/solucoes/comparar-fotos.mjs backup/solucoes/foto-a.json backup/solucoes/foto-b.json` → código 0 e todas as listas de perda vazias (`registrosCairam`, `tabelasSumiram`, `fluxosSumiram`, `fluxosDesligados`, `stepsSumiram`, `stepsDesativados`, `stepsPerderamSeguro`, `variaveisSumiram`, `variaveisMudaram`, `componentesSumiram`).
   - Sinal de segurança: `grep -c '"value"' backup/solucoes/foto-a.json` → `0` (a foto guarda só o hash SHA-256 das variáveis, nunca o valor).
   - Comparar uma foto nova com uma antiga (ex.: a de antes de uma importação) é o uso real: o DEV é um ambiente vivo, então `registrosMudaram` com contagem diferente e componentes ou fluxos novos são esperados. O que reprova é qualquer lista de perda não vazia (código 1).

## Casos de borda
Causas do código de saída 1 do passo 3 (qualquer uma basta):
- `sem dono N` (linha `conferencia`): componente na AppBetinhos que não está em nenhuma das 4 soluções. Em geral são componentes criados ou incluídos na AppBetinhos do DEV depois da última distribuição (por outras sessões ou pessoas). Inspecione cada id em `relatorio.json` (`cobertura.semDono`) com o comando somente leitura abaixo, rode o distribuidor sem flags (dry run: só mostra quantos componentes iriam para cada solução) e, com o ok do usuário, corrija com `-Aplicar`.
- `em duas N`: componente presente em mais de uma das 4. Costuma ser arrasto do `AddSolutionComponent`; o `-Aplicar` remove da solução que não é a dona.
- `fora do lugar N`: componente numa das 4 que não é a indicada por `regras.json`. O `-Aplicar` inclui na dona e remove da errada. Se a regra é que está errada, ajuste `regras.json` (e os testes).
- `dependencias para cima N`: uma solução depende de componente de camada acima (permitido: Automação -> Core; Interface e Motoristas -> Core e Automação; Core -> nenhuma). `relatorio.json` (`violacoes`) mostra a solução, o componente requerido e a dona dele. Corrija a regra (`regras.json`) ou o componente; `-Aplicar` não resolve.
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
`componenttype` 29 é fluxo (nome em `workflows?$select=name&$filter=workflowid eq <id>`); a segunda consulta traduz `_solutionid_value` para o nome da solução.

O que o `-Aplicar` faz: é uma escrita no DEV. Cria as soluções que faltam (no publisher da AppBetinhos), inclui na solução dona os componentes da caixa de entrada que faltam e remove das 4 soluções o que não é da dona (excedentes arrastados e valores de variável). Nunca altera a AppBetinhos. Só rode com o ok do usuário, só no DEV, e repita a conferência até sair com código 0 e as duas linhas em zero.

Outros:
- Caixa de entrada vazia: `distribuir-solucoes.ps1` aborta com "voltou com 0 componentes" (nunca aprova por vazio); confira a conexão e a solução `AppBetinhos`.
- Assembly dentro de pacote de plug-in aparece como "assembly empacotado" e fica fora da conferência: é esperado (quem carrega é o pacote).

## Evidência obrigatória
- A saída completa do passo 3 (as duas linhas de contagem, a linha `detalhes:`) e o código de saída.
- A saída completa do comparador do passo 4 (JSON) e o código de saída.
- Resumo dos passos 1 e 2 (`pass N / fail 0`; código 0 e nenhuma linha `FALHA`).

## Limites
- Só prova o DEV. Nada aqui diz algo sobre TEST (`appbetinhostest.crm2.dynamics.com`) ou PROD (`orgf261ae8e.crm2.dynamics.com`): isso é a Fase 2, com ok de cópia do Renan.
- A AppBetinhos do DEV continua sendo a caixa de entrada: componentes novos podem ser criados ou incluídos nela a qualquer momento. Rode a conferência de novo antes de cada exportação das 4 soluções; um resultado antigo não vale.
- A conferência cobre dono e dependências dos componentes; não prova que as soluções gerenciadas importam em outro ambiente.
