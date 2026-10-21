---
name: verificar-equipamentos
description: "Verifica o módulo de Equipamentos do shell (#/equipamentos, aba Equipamentos da ficha do funcionário) e os scripts de schema e privilégios no Dataverse DEV. Use após mudar apps/shell/src/pages/equipamentos/**, a aba Equipamentos em apps/shell/src/pages/funcionarios/**, packages/deploy/provision-equipamentos.ps1 ou packages/deploy/conceder-privilegios-equipamentos.ps1."
---
# Verificar Equipamentos

## Cobre
- Código: `apps/shell/src/pages/equipamentos/**`; aba Equipamentos em `apps/shell/src/pages/funcionarios/**` (`components/RelatedTabs.tsx` `EquipamentosTab`, `Ficha.tsx`, `data/{types,source,dataverse,mock}.ts`).
- Schema e privilégios no DEV: `packages/deploy/provision-equipamentos.ps1` (tabelas `cr40f_tipoequipamento` e `cr40f_equipamento`, UserOwned, semente de tipos) e `packages/deploy/conceder-privilegios-equipamentos.ps1` (copia para as duas tabelas os privilégios que os papéis têm em `cr40f_funcionarios`).
- Spec: `docs/superpowers/specs/2026-10-21-equipamentos-mvp-design.md`.

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/equipamentos src/pages/funcionarios` → todos passam (140 em 18 arquivos em 21/10/2026). `pnpm test -- <arquivo>` não filtra: roda a suíte toda.
2. `pnpm typecheck` → sem erros. Suíte completa (`pnpm test`, ~2,5 min) antes do PR: 1420 em 21/10/2026.

## Dados do mock (`pnpm dev`, porta 36472)
`data/mock.ts`; o mock recarrega a cada entrada na página (o que foi cadastrado some ao sair e voltar).
- Notebook do Financeiro: Em uso com Bruna Ficticia Lima, com data e valor de compra.
- Celular plantão: Em uso com Gustavo Amostra Pires, desligado no mock de Funcionários → selo "Inativo" na coluna Responsável.
- Impressora antiga: Baixado, fora da Visão padrão (aparece em "Baixados" e "Todos, inclusive baixados").
- Maquininha Carlos: Em uso com Carlos Alberto Teste (`m1`, id `eeeeeeee-0000-4000-8000-000000000005`); é o item da aba Equipamentos da ficha dele.
- Pager da portaria: tipo Pager inativo (marcado no drawer de Tipos; some do seletor para novos itens).
- Sem responsável (fora baixados): Notebook reserva, Maquininha reserva, Pager da portaria.

## Roteiro em mock (navegador)
Com `pnpm dev` rodando em `apps/shell` (na VM cloud, em grupo próprio: `setsid pnpm dev > log 2>&1 &`, e no fim `kill -TERM -<PGID>`; nunca `pkill -f vite`):
`node .claude/skills/verificar-equipamentos/fluxo-mock.cjs <pasta-dos-prints> [desktop|mobile|ambos]` (Playwright + Chromium headless de `/opt/node-tools` e `/opt/pw-browsers`; fora da VM, `PLAYWRIGHT_MODULE` e `CHROMIUM`). Desktop 1366×800 e celular 375×800; uma linha ✅/❌ por passo e prints `<viewport>-NN-<passo>.png`.
1. Lista carrega com "Dados de exemplo", versão do build no canto (`v0.0.NN · data`), sem rolagem horizontal da página em 1366 px; colunas Equipamento, Tipo, Marca/modelo, Responsável, Status, Nº de série, Compra, todas à vista.
2. Novo equipamento "Webcam sala de reunião", tipo Outro → nasce Disponível, toast "… cadastrado.", item na lista.
3. Atribuir responsável → status vira Em uso; trocar responsável → linha com o novo nome.
4. Status Baixado → Responsável limpo e desabilitado ("Item baixado não fica com responsável."); depois de salvar o item sai da Visão padrão e aparece na visão "Baixados" com "Sem responsável".
5. Visão pronta "Sem responsável": só os três itens sem responsável e não baixados.
6. Tipos: adicionar "Webcam", renomear para "Câmera", inativar → selo "Inativo"; repetido (sem diferenciar maiúsculas e acentos) é recusado.
7. Fechar o drawer com alteração → "Descartar alterações?" (Continuar editando / Descartar). Sem alteração, clique no fundo (desktop) ou Esc fecha sem perguntar; abaixo de 560 px o drawer ocupa a tela toda (sem fundo clicável).
8. `#/funcionarios` → ficha de Carlos Alberto Teste → aba Equipamentos (entre Veículos e Anotações) lista Maquininha Carlos; clicar abre `#/equipamentos?ver=eeeeeeee-0000-4000-8000-000000000005` com o drawer do item.
9. Console sem `console.error` nem `pageerror` em todo o fluxo.

## Verificação no DEV (Tarefa 10 do plano; só depois do merge)
Só na `main` do checkout principal (`Sistema Betinhos`), com `git pull`. Nunca em sessão cloud, worktree ou branch de feature; nunca PROD (os scripts recusam o host de PROD e `DV_BLOCKED_HOSTS`).
1. Antes de rodar, conferir os `.ps1` no Windows: `[System.Management.Automation.Language.Parser]::ParseFile(<caminho>, [ref]$null, [ref]$erros)` sem erros e os 3 primeiros bytes `ef bb bf` (BOM; o PowerShell 5.1 precisa dele para os acentos). Rodar com `powershell.exe` (5.1), não `pwsh`.
2. `powershell.exe -File packages/deploy/provision-equipamentos.ps1` (dry run) → "DRY RUN criaria a tabela cr40f_tipoequipamento" e "… cr40f_equipamento". Se disser que já existem, pare e compare a metadata.
3. Mesmo script com `-Apply` → `SCHEMA OK`; conferências pós-publicação: `cr40f_datacompra` DateOnly, padrão do status Disponível, relacionamentos com RemoveLink na exclusão, MaxLength das colunas, tudo na solução `DV_SOLUTION`. `cr40f_name` precisa sair 100 (tipo) e 200 (equipamento), `ApplicationRequired`: o Dataverse ignora isso no POST da tabela (no DEV nasceu 850/None em 21/10/2026), e o `Ensure-NameAttribute` acerta por PUT; o dry run mostra "DRY RUN mudaria … de MaxLength 850/None para …" enquanto não estiver certo. Lógica testável sem Dataverse: extrair a função pelo AST e rodar com `Invoke-Dataverse` simulado (dry run sem PUT; Apply com um PUT `StringAttributeMetadata`, sem anotações `@odata` extras e com `MSCRM.MergeLabels`; já correto não grava).
4. `powershell.exe -File packages/deploy/conceder-privilegios-equipamentos.ps1` (dry run): papéis padrão Acesso-Betinhos-Canvas, Acesso-Betinhos-MDA e DEV - Usuário. A profundidade é copiada de `cr40f_funcionarios`: conferir que `prvRead*` das duas tabelas saem **Global** (tabelas UserOwned: com profundidade Usuário cada um só veria os próprios registros, e os tipos semeados ficam com quem rodou o provision). Ler o AVISO dos papéis que acessam `cr40f_funcionarios` e ficaram fora da lista; incluir com `-Roles` se o Renan pedir. Depois `-Apply` → `PRIVILEGIOS OK`.
5. `pnpm push` (nunca em paralelo) e commit do bump `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main`.
6. Teste autenticado no DEV (`https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/equipamentos`, forçar o cache como em `verificar-shell`):
   - cadastrar um item real e atribuir responsável (PATCH com `cr40f_Responsavel@odata.bind`);
   - limpar o responsável: na aba Rede, `DELETE …/cr40f_equipamentos(<id>)/cr40f_Responsavel/$ref` antes do PATCH (nunca `@odata.bind: null`); recarregar e conferir o campo vazio;
   - aba Equipamentos na ficha do responsável lista o item e o link abre `#/equipamentos?ver=<guid>`;
   - inativar um tipo: some do seletor de novo item; no drawer de um item que já o usa aparece como "<tipo> (inativo)";
   - antes do provision (ou num ambiente sem as tabelas) a página mostra "Tabela cr40f_equipamento não encontrada na metadata." e a aba da ficha mostra o erro só dentro dela, sem cair em mock.
   Apague os itens de teste depois. Informar ao Renan a versão publicada.

## Casos de borda
- Funcionário inativo = desligado (`cr40f_status` 1) ou registro inativo (`statecode` 1); Afastado conta como ativo e pode receber equipamento (confirmado pelo Renan, 21/10/2026). Inativo continua no item com selo, fora do seletor.
- Item Baixado com responsável gravado fora do shell: o campo fica habilitado só para limpar.
- Número de série repetido avisa (com a descrição do outro item) e não bloqueia.
- `?ver=` inexistente: aviso "Equipamento não encontrado" e "Voltar à lista".
- Falha ao salvar: drawer aberto com o que foi digitado e toast com a mensagem do Dataverse.
- Conhecido (herdado de Infrações): trocar o `?ver=` por voltar/avançar com o formulário alterado descarta sem perguntar.

## Evidência obrigatória
- Saída de `vitest`/`typecheck`, linhas ✅/❌ do `fluxo-mock.cjs` e prints das duas larguras; no DEV, saída dos dry runs e do `-Apply`, print da aba Rede com o DELETE no `$ref`.

## Limites
- Sessão cloud: só mock. Schema, privilégios, `$ref` e dados reais ficam "não verificados na nuvem".
- Nenhum `.ps1`, `pnpm push` ou `pnpm wr` fora da `main` do checkout principal. PROD fora do escopo.
