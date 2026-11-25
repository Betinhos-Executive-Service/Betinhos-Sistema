---
name: verificar-acessos
description: "Verifica os acessos por perfil do Sistema Betinhos: mapas de tabelas e colunas por perfil, gerador e motor dos papéis `Perfil - *`, migrations de acessos, Custom API `cr40f_AcessoDefinirPerfis` (handler, travas e histórico) a prova no DEV por impersonação e, no shell, o menu por perfil, a guarda de rota e a tela `#/acessos`, e os níveis dentro das telas (Excluir só Gestor, campos sensíveis de Funcionários, visões da Página Inicial). Use ao mudar `apps/shell/src/nav/acessos*`, `apps/shell/src/app/acessos*`, `apps/shell/src/app/{nivel,useNivel}*`, `apps/shell/src/pages/acessos/**`, `packages/deploy/acessos/**` ou os arquivos `DefinirPerfis*`/`AcessoCatalogo*`/`PapeisDoUsuario*` do `Cr40f.Acesso.Plugin`."
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
1. Mapas e gerador: `pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/nav/acessosMapa` → todos passam; `node --test packages/deploy/acessos/gerar.test.mjs` → `fail 0` (o teste reprova o gerado desatualizado, personalização, `cr40f_segredo` e Delete no Operador).
2. Mudou `acessosMapa.json` ou `acessosColunas.json`: `node packages/deploy/acessos/gerar.mjs` e criar migration nova `AAAAMMDD-HHMM-acessos-perfis-<motivo>.ps1` com o hash novo (a `20261123-1410` é imutável depois de publicada).
3. Motor em dry-run no DEV (não grava): `aplicar-perfis.ps1` é biblioteca (dot-source), não roda sozinho; rode a migration SEM `-Apply`: `export DOTNET_ROOT=~/.dotnet PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"; pwsh -NoProfile -File packages/deploy/migrations/20261123-1410-acessos-perfis.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com 2>&1 | tail -n 25` → sem pendência depois do Deploy; nunca `-Apply` à mão: quem aplica é o Deploy do DEV.
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
   → 9 linhas `cenario ...: OK` (1, 2, 3a, 3b, 4, 5, 6, 7, 8) e `prova dos acessos: OK`. O 6 é `Perfis` ausente (qualquer recusa serve, mesmo da plataforma, desde que os perfis do alvo não mudem) e o 7 é `"[]"` explícito (200 e só o Base). Códigos de saída: 2 = pré-condição (token, dono do token sem Administrador do Sistema, usuários com papel antigo), 3 = inconclusivo, 1 = falha ou limpeza final falhou (`LIMPEZA FALHOU`: voltar os dois usuários ao Base à mão no DEV). A saída não leva ids; pode ir como evidência. `INCONCLUSIVO` = o DEV não tem linha com as colunas preenchidas (Funcionário com CPF, RG e CNH; OP com valor): não é aprovação.
7. Informativo para o plano do corte: `node packages/deploy/acessos/quem-le.mjs` no DEV e no PROD (mesmas variáveis, sem os ids) lista quem hoje lê `cr40f_bancodedados` sem perfil de coluna de administrador ou `Motoristas`. `DEPENDENTES > 0` é esperado e não reprova este plano. A saída do PROD nunca vai para o repositório, commit, PR ou issue.

## Shell (menu por perfil, perfis na ficha do funcionário e `#/acessos` sem ficha)
- Código: `apps/shell/src/app/{acessos.ts,AcessosProvider.tsx}`, `apps/shell/src/nav/acessosMenu.ts`, guarda no `layouts/RouteLayout.tsx`, `pages/inicio/InicioSemAcesso.tsx`, `apps/shell/src/pages/acessos/**` (editor em `components/PerfisEditor.tsx`), bloco da ficha em `pages/funcionarios/components/AcessoSistema.tsx`.
- Onde fica (decisão do Renan, 24/11/2026): os perfis são editados na ficha do funcionário, aba Acesso, bloco "Acesso ao sistema" (pessoa achada pelo e-mail Microsoft). `#/acessos` não aparece no menu (`foraDoMenu`); abre pelo botão "Acessos sem ficha" de Funcionários e lista só quem tem conta e não tem ficha, mais o histórico geral. Funcionários abre para `rh` e `acessos`. `#/app-motoristas` pede Operacional no nível Gestor (`"nivel": "gestor"` no mapa, igual à página e ao servidor): `?acessos=operacional:gestor` vê o item, `?acessos=operacional:operador` e `?acessos=acessos` não, e a URL direta mostra "Sem acesso a este módulo" com "Operacional, nível Gestor".
- Testes: `pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/acessos src/pages/funcionarios src/pages/inicio src/nav src/app` → todos passam; `pnpm --filter @betinhos/shell exec tsc --noEmit` limpo.
- Mock (`pnpm dev`, porta 36472; fora do Dataverse a pessoa tem todos os perfis). Parâmetros antes do `#`: `?acessos=financeiro:operador,rh:gestor,acessos` escolhe os perfis, `?acessos=nenhum` deixa só o Base, `?acessos=erro` simula falha na leitura, `?falha=salvar` faz a gravação responder `PERFIL_INDISPONIVEL`.
  0. `?acessos=acessos#/funcionarios`: botão "Acessos sem ficha" na barra (só ícone em 375 px); sem o perfil `acessos` o botão não aparece. Abrir "Carlos Alberto Teste" → aba Acesso → bloco "Acesso ao sistema" com Operacional em Operador, "Salvar perfis", "Descartar" e "Histórico de acessos". Marcar outro nível e clicar em outra aba → aviso "Salve ou descarte os perfis antes de trocar de aba." e a aba não troca; fechar a ficha → "Descartar alterações?". Funcionário sem e-mail ou sem conta → "Esta pessoa ainda não tem conta no sistema. Libere o acesso primeiro." e o botão "Conferir de novo". Falha ao reler depois de salvar → aviso "A última atualização falhou" com os perfis gravados já na tela. Sem o perfil `acessos` o bloco não aparece.
  1. `#/acessos`: visão "Acessos sem ficha" com 3 pessoas de exemplo (Bruno, Carla, Diego; quem tem ficha não aparece), botão "Funcionários" de volta, chips de perfil, "Só o Base" em quem não tem perfil, busca "Buscar por nome, e-mail ou perfil", botões Atualizar e Histórico.
  2. Clicar em "Bruno Modelo" → gaveta com abas Perfis e Histórico; marcar Financeiro em Gestor → bloco "O que muda ao salvar" com `Financeiro: Operador → Gestor`. Esc (ou clique fora) abre "Descartar alterações?"; "Continuar editando" mantém a gaveta. Salvar fecha a gaveta e a linha já mostra `Financeiro · Gestor`.
  3. `?falha=salvar#/acessos` + Salvar → alerta "Não foi possível salvar" acima das abas e "Ainda não publicado neste ambiente" na área recusada; a gaveta fica aberta com o rascunho.
  4. `?acessos=financeiro:operador#/inicio` → menu sem Frota e RH; Operacional só com o Planner; Cadastros com Pessoas, Clientes e Cartões. `?acessos=financeiro:operador#/acessos` → "Sem acesso a este módulo" com "Ir para a Página Inicial".
  5. `?acessos=nenhum#/inicio` → "Você ainda não tem acesso aos módulos"; menu só com Página Inicial e Planner.
  6. `?acessos=erro` → aviso "Não foi possível carregar seus acessos" no shell.
  7. Repetir 0, 1, 2 e 5 em 375 px (lista vira cartões; gaveta ocupa a tela). Console sem erro nem aviso.
- A própria linha e quem é Administrador do Sistema abrem a gaveta só para leitura (rodapé "Fechar"); o Switch "Administrador de acessos" só edita para o Administrador do Sistema.
- Não verificável em mock: leitura real de papéis e equipes (`systemuserroles_association`, `teamroles_association`), a Custom API e o histórico real. No DEV: abrir `#/acessos` como Administrador do Sistema, trocar o perfil de um usuário de teste, conferir a linha em `cr40f_acessohistorico` e voltar ao Base. A leitura de Funcionários pelo perfil Administrador de acessos também não: no DEV, impersonando um usuário só com Base + Administrador de acessos, `GET cr40f_funcionarioses?$select=cr40f_emailmicrosoft&$top=1` responde 200 com o e-mail preenchido (perfil de coluna do mesmo nome, que a Custom API atribui junto com o papel; sem ele o e-mail volta vazio) e `PATCH` na mesma linha responde 403 (só leitura; lê também Documentos, Multas, Veículos e Posse).
- O shell não é a fronteira de segurança: o menu só esconde; quem barra é o Dataverse (papéis e colunas).

## Níveis dentro das telas (plano 3)
- Código: `apps/shell/src/app/{nivel.ts,useNivel.ts,ComAcessos.tsx}`; consumidores em `pages/composicao` (linha de comando), `pages/comunicados` (lista e editor), `pages/treinamentos` (editor e anexos), `pages/documentos` (Checklist e ConfigDrawer), `pages/funcionarios` (Ficha, DocumentosArquivos, lista), `pages/qualidade/App.jsx` e `pages/inicio` (`domain/visoes.ts`).
- Regra: Excluir de tabela dona só para o Gestor da área (ou Administrador do Sistema); filha e Base para todos da área, como o gerador. Para o Operador o botão não aparece. Campo de Funcionários sem leitura do grupo some; sem edição fica desabilitado. Configurações da Qualidade (opções de choice = metadata) só para Administrador do Sistema.
- Testes: `pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/nivel.test.ts src/app/useNivel.test.tsx src/pages/composicao/ComposicaoPage.acessos.test.tsx src/pages/comunicados/ComunicadosPage.acessos.test.tsx src/pages/treinamentos/TreinamentosPage.acessos.test.tsx src/pages/documentos/components src/pages/funcionarios/components/Ficha.test.tsx src/pages/funcionarios/components/DocumentosArquivos.test.tsx src/pages/funcionarios/data/lista.test.ts src/pages/qualidade src/pages/inicio` → todos passam.
- Mock (`pnpm dev`, porta 36472):
  1. `?acessos=financeiro:operador#/composicao`: marcar uma linha → barra da seleção com "Gerar OP" e sem "Excluir".
  2. `?acessos=financeiro:gestor#/composicao`: marcar uma linha → "Excluir" aparece e pede confirmação ("Excluir 1").
  3. `?acessos=rh:operador#/funcionarios`: abrir um funcionário → aba Dados sem CPF, RG, filiação, endereço e telefones pessoais; vínculo e admissão editáveis; chips só CNH e ASO; aba Documentos sem lixeira nos arquivos. `?acessos=rh:gestor` → dados pessoais editáveis e lixeira de volta.
  4. `?acessos=rh:operador#/inicio`: saudação, comunicado, Planner e Radar; sem seletor de visão, sem indicadores, sem "Novo serviço" nem "Gerenciar" (rotas do Operacional) e sem "Erro parcial" nem "indisponível". `?acessos=financeiro:operador#/inicio` → seletor Operação, Financeiro e Gestão (sem TI).
  5. `?acessos=operacional:operador#/comunicados` e `#/qualidade`: rascunho sem lixeira, editor sem "Excluir rascunho", Qualidade sem "Configurações". `?acessos=rh:operador#/treinamentos`: rascunho sem "Excluir rascunho", anexos sem lixeira.
  6. `?acessos=frota:gestor#/frota`: ficha do veículo → Documentos com lixeira (decide por `cr40f_veiculos`, não pelo RH). `?acessos=operacional:operador#/funcionarios` em 375 px: folha de Filtros sem "Vínculo", e um vínculo salvo no celular não esvazia a lista; na ficha, veículo atual e aditivo só leitura para quem não edita o grupo.
  7. Repetir 1, 3 e 4 em 375 px. Console sem erro nem aviso.
- Prova no DEV (o shell não é a fronteira, então a prova é que o Dataverse e a tela concordam): com o usuário de teste do Renan (`DV_TESTE_ID`, nunca id real em arquivo) em `Perfil - Financeiro - Operador`, `RetrieveUserPrivileges` não lista `prvDeletecr40f_composicaodeprecos`; em `Perfil - Financeiro - Gestor`, lista. Abrir o shell no DEV como esse usuário (sessão do Renan) e repetir os passos 1 e 2. Voltar o usuário ao Base no fim.
- Não verificável em mock: a recusa real do Dataverse para quem força a URL ou a API; o erro de permissão que a tela já mostra cobre esse caso.

## Casos de borda
- Papel novo demora alguns segundos para valer: a prova repete cada cenário até 5 vezes; falha só depois disso.
- Usuário de teste com papel herdado de equipe: a prova para com saída 2 e lista os papéis (sem pessoas).
- Tabela nova usada por uma tela: entra em `acessosMapa.json` (o teste do mapa reprova a rota que não alcança a tabela).
- Coluna nova sensível: ligar `IsSecured` por migration e incluir no grupo em `acessosColunas.json`; coluna com segurança fora do mapa fica vazia para todo mundo que não é administrador.

## Fora do alcance
- A prova não cobre telefone, e-mail, nascimento nem endereço de saída do passageiro (`cr40f_bancodedados`): essas colunas ficaram sem segurança de coluna até o plano do corte; só `cr40f_cr` está protegida.
- Limite da prova: `RetrieveUserPrivileges` confere o privilégio, não a profundidade (Basic conta como "pode").
- A prova não grava em dado de negócio: edição e exclusão são conferidas pelos privilégios efetivos, não por tentativa.
- PROD: nenhuma atribuição de papel a pessoa ou equipe sem pedido explícito do Renan.
