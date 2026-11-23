---
name: verificar-acessos
description: "Verifica os acessos por perfil do Sistema Betinhos: mapas de tabelas e colunas por perfil, gerador e motor dos papéis `Perfil - *`, migrations de acessos, Custom API `cr40f_AcessoDefinirPerfis` (handler, travas e histórico) e a prova no DEV por impersonação. Use ao mudar `apps/shell/src/nav/acessos*`, `packages/deploy/acessos/**` ou os arquivos `DefinirPerfis*`/`AcessoCatalogo*`/`PapeisDoUsuario*` do `Cr40f.Acesso.Plugin`."
---
# Verificar acessos por perfil

## Cobre
- Código: `apps/shell/src/nav/acessosMapa.json`, `apps/shell/src/nav/acessosColunas.json`, `packages/deploy/acessos/**`, migrations `*-acessos-*.ps1`, `packages/plugins/Cr40f.Acesso.Plugin/{DefinirPerfis*,AcessoCatalogo*,PapeisDoUsuario*,PerfisDoUsuario*}.cs`.
- Comportamento: papéis `Perfil - <Área> - <Operador|Gestor>`, `Perfil - Base` e `Perfil - Administrador de acessos` com os perfis de coluna de mesmo nome; quem só tem o Base abre a tela e não lê Financeiro, Funcionários nem Veículos; Operador lê, cria e edita, Gestor também exclui e vê as colunas sensíveis; a Custom API troca os perfis de uma pessoa, recusa `SEM_PERMISSAO`, `PROPRIO_ACESSO`, `USUARIO_INVALIDO`, `PERFIL_INVALIDO` (inclui `Perfis` ausente, vazio ou só espaços; `"[]"` explícito = só o Base) e `PERFIL_INDISPONIVEL` e grava `cr40f_acessohistorico`.

## Preparar ambiente
- `node` 22, `~/.dotnet/dotnet` (8.0) e `~/.dotnet/tools/pwsh` (fora do PATH). `az login` feito pelo Renan.
- DEV: `https://org23b93544.crm2.dynamics.com`. O dono do token precisa ser Administrador do Sistema (a prova usa `MSCRMCallerID`).
- Dois usuários de teste no DEV, licenciados, sem papel antigo e sem perfil de coluna antigo, fora do grupo da equipe `Team-Betinhos-MDA`. Os ids vêm do Renan e só entram por variável de ambiente (`DV_TESTE_ID`, `DV_ALVO_ID`): o repositório é público, nunca escreva id, nome ou e-mail em arquivo, commit, PR ou issue.
- A prova só roda no DEV. No PROD só `quem-le.mjs` (GET).

## Roteiro
1. Mapas e gerador: `cd apps/shell && npx vitest run src/nav/acessosMapa && cd ../..` → todos passam; `node --test packages/deploy/acessos/gerar.test.mjs` → `fail 0` (o teste reprova o gerado desatualizado, personalização, `cr40f_segredo` e Delete no Operador).
2. Mudou `acessosMapa.json` ou `acessosColunas.json`: `node packages/deploy/acessos/gerar.mjs` e criar migration nova `AAAAMMDD-HHMM-acessos-perfis-<motivo>.ps1` com o hash novo (a `20261123-1410` é imutável depois de publicada).
3. Motor em dry-run no DEV (não grava): `~/.dotnet/tools/pwsh -NoProfile -File packages/deploy/acessos/aplicar-perfis.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com 2>&1 | tail -n 25` → sem pendência depois do Deploy; nunca passar `-Apply` à mão.
4. Plugin: `~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false 2>&1 | tail -n 6` → 0 falhas (18 de `AcessoCatalogoTests` e 13 de `DefinirPerfisHandlerTests` em 23/11/2026).
5. Custom API no DEV (só leitura): `customapis?$select=uniquename&$filter=uniquename eq 'cr40f_AcessoDefinirPerfis'` devolve 1 linha; `roles?$select=name&$filter=startswith(name,'Perfil - ')` devolve os 10 papéis.
6. Prova no DEV:
   ```bash
   ORG=org23b93544
   DV_URL=https://$ORG.crm2.dynamics.com \
   DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)" \
   DV_TESTE_ID="$DV_TESTE_ID" DV_ALVO_ID="$DV_ALVO_ID" \
   node packages/deploy/acessos/prova.mjs
   ```
   → 7 linhas `cenario ...: OK` (1, 2, 3a, 3b, 4, 5, 6) e `prova dos acessos: OK`. `INCONCLUSIVO` = o DEV não tem linha com as colunas preenchidas (Funcionário com CPF, RG e CNH; OP com valor): não é aprovação.
7. Proteção das colunas de passageiro: `node packages/deploy/acessos/quem-le.mjs` no DEV e no PROD (mesmas variáveis, sem os ids) → `DEPENDENTES: 0` e nenhuma `EQUIPE SEM COBERTURA`. A saída do PROD não entra em commit, PR nem issue.

## Casos de borda
- Papel novo demora alguns segundos para valer: a prova repete cada cenário até 5 vezes; falha só depois disso.
- Usuário de teste com papel herdado de equipe: a prova para com saída 2 e lista os papéis (sem pessoas).
- Tabela nova usada por uma tela: entra em `acessosMapa.json` (o teste do mapa reprova a rota que não alcança a tabela).
- Coluna nova sensível: ligar `IsSecured` por migration e incluir no grupo em `acessosColunas.json`; coluna com segurança fora do mapa fica vazia para todo mundo que não é administrador.

## Fora do alcance
- A prova não cobre telefone, e-mail, nascimento nem endereço de saída do passageiro (`cr40f_bancodedados`): essas colunas ficaram sem segurança de coluna até o plano do corte; só `cr40f_cr` está protegida.
- A prova não grava em dado de negócio: edição e exclusão são conferidas pelos privilégios efetivos, não por tentativa.
- PROD: nenhuma atribuição de papel a pessoa ou equipe sem pedido explícito do Renan.
