---
name: verificar-shell
description: "Verifica o shell React do Sistema Betinhos (apps/shell) e o pacote @betinhos/dataverse: typecheck, testes e telas no DEV (listas com visões, OPs, Geral, WebResources embutidos com host=shell). Use após mudar apps/shell/** ou packages/dataverse/**."
---
# Verificar shell do Sistema Betinhos

## Cobre
- Código: `apps/shell/**`, `packages/dataverse/**`, `packages/deploy/**` (publicação).
- Telas: `#/geral`, `#/ops`, `#/pagantes`, `#/pendencias`, `#/despesas-operacionais`, `#/pessoas`, `#/funcionarios`, `#/infracoes`, `#/agentes`, WebResources em iframe (`?host=shell`).

## Preparar ambiente
- `pnpm install`; local: `pnpm dev` (porta 36472, modo mock sem dados).
- DEV: Claude in Chrome em `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html`. Depois de publicar, force o cache: `await fetch(location.pathname,{cache:'reload'}); location.reload()` — navegação por `#` não troca a versão.
- Janela do Chrome visível (minimizada dá largura 0: layout de celular e prints falham).

## Roteiro
1. `cd apps/shell && pnpm typecheck` → sem erros; `npx vitest run` → todos passam (1251 em 18/10/2026; arquivo do Geral é lento, rodar em segundo plano).
2. DEV: rodapé mostra a versão publicada (`v0.0.NN · data`).
3. Listas: o título (`.bt-viewbar__name`) é o nome da tela ("Todas as OPs", "Todos os pagantes", "Todas as pendências", "Todas as despesas", "Todas as pessoas", "Funcionários", "Infrações ativas").
4. OPs: coluna Valor com R$ (não "—"); abrir uma OP → valor no cabeçalho do drawer.
5. Geral: `#/geral?novo=1` abre "Criar serviço" (iframe do Formulário Geral) e o parâmetro some da URL; selo "Alterada" tem `title` com a dica.
6. WebResource embutido: `document.querySelector('iframe').src` termina em `?host=shell`.
7. Menu de visões em tela baixa: viewport 900x300 (ou celular deitado), abrir `.bt-viewbar__trigger` → `.bt-menu__panel` tem `max-height` inline, `overflow-y: auto` e o último item ("Salvar como…") fica alcançável rolando o painel, sem passar da tela (@betinhos/ui ≥ 1.10.1).
8. Frota → "Checklists de Veículos" (`#/new_gestaochecklistsveiculos`): o iframe carrega a Gestão de Checklists com a lista de veículos. Por URL direta o Xrm é o mínimo do shell; ação de Custom API (ex.: "Solicitar") precisa de `parent.Xrm.WebApi.online.execute` (`typeof parent.Xrm.WebApi.online.execute === 'function'` dentro do iframe) e mostra o erro do servidor quando falha.
8b. Frota → Painel da Frota → aba Pendências (`#/frota`): em mock aparecem os grupos "Prioridade alta parada" (Freio com ruído, "Aguardando aprovação há 3 dias") e "Manutenção reincidente" ("3ª vez: Pastilhas de freio", custo R$ 1.370,00, "Dá para resolver a causa raiz?"); "Ver as 3 ocorrências" expande 3 linhas e cada uma abre o registro da manutenção; o item da reincidência abre a ficha do veículo. Uma manutenção Alta/Urgente parada não aparece também em "Aprovar"/"Programar". Regras e limiares em `apps/shell/src/pages/frota/domain/alertas.ts` (`LIMIARES`). Primeira carga do `pnpm dev` pode levar ~15 s com tela vazia.
9. Console sem erros em cada tela.
10. Captura de erros (`apps/shell/src/app/erros.ts`, tabela `cr40f_errodosistema` de `packages/deploy/provision-erros-schema.ps1`): no DEV, no console da página do shell rode `setTimeout(() => { throw new Error('teste plantao ' + Date.now()) })` → em até 5 s existe registro novo em `cr40f_errodosistemas` com `cr40f_situacao = 100000000`, `cr40f_origem = 100000000`, a mesma mensagem com prefixo `[window.onerror]`, `cr40f_versao` igual ao rodapé e `cr40f_assinatura` de 16 hex. Repetir o mesmo erro na mesma carga não cria segundo registro. Apague os registros de teste depois. Em `pnpm dev` (mock) nada é gravado.

## Flows do Power Automate (`packages/deploy/provision-flow-*.ps1`)
Não passam pelo `pnpm push`; cada script grava o clientdata direto no DEV (com backup em `flows/backup/`).
1. `powershell -File packages/deploy/<script>.ps1 -SomenteValidar` → `checkFlowErrors: []` e conferências ok, sem gravar.
2. Rodar sem parâmetro → backup gerado, flow reativado (`statecode=1`) e leitura de volta conferida.
3. Execução real no DEV: preparar dado de teste que caia na regra (pagante com `overriddencreatedon` no passado, e-mail do próprio usuário), disparar `POST .../flows/<id>/triggers/<gatilho>/run?api-version=2016-11-01` (token `https://service.flow.microsoft.com/`) e listar `runs/<run>/actions` → ações esperadas `Succeeded`.
4. Conferir o efeito no Dataverse (ex.: `cr40f_datadoultimolembrete` preenchido). As entradas do envio de e-mail não aparecem na API; o destinatário se confere na caixa de entrada.
- Antes de criar dado de teste, ver os gatilhos de flows ativos na tabela (ex.: Recibo Automático em `cr40f_statusdorecibo`, RD Station em `cr40f_bancodedados`) para não disparar envios por engano.
- `overriddencreatedon` sem hora vira 00:00 UTC (dia anterior em Brasília); use `AAAA-MM-DDT15:00:00Z`.
- Scripts `.ps1` com acentos precisam de BOM UTF-8 (PowerShell 5.1).
- Frota | Resumo semanal (`provision-flow-frota-resumo.ps1 -Remetente <noreply>`, só da main, depois de `pnpm push:plugin:frota:dev`): cria a coluna `new_notificacoesfrota` e o flow (quarta 08:00). Rodar o shell no DEV só depois da coluna existir (o cadastro de funcionário seleciona a coluna). Teste: marcar "Notificações de frota" no próprio cadastro (Funcionários › ficha › Detalhes), disparar o gatilho `Toda_quarta_8h` → e-mail "Frota | N pendências | dd/mm/aaaa" com os mesmos itens da aba Pendências (tipos proativos). Sem pendências, não envia.

## Casos de borda
- Mock (`pnpm dev`): telas de WebResource mostram "Esta tela abre dentro do Dataverse".
- Funcionários no celular usa cartões (rótulo de alerta completo); a coluna curta "Venceu dd/mm/aaaa" é só no desktop.

## Evidência obrigatória
- Saída de typecheck/vitest e prints das telas alteradas no DEV.

## Limites
- Publicação só da `main`, no checkout principal (`pnpm push`), nunca de worktree. PROD só com aprovação.
- Flows sem `-SomenteValidar` (ex.: `provision-flow-aniversariantes.ps1`): provisionar com destinatário só do usuário, disparar o gatilho e conferir as ações; depois reprovisionar com os destinatários reais.
- Limpeza de chunks (`packages/deploy/chunk-cleanup.ps1`, chamada pelo `push-dev.ps1`): simular antes com `. .\chunk-cleanup.ps1`, `Get-PublishedChunkNames` (deve bater com `apps/shell/dist/webresource-assets.json`) e `Remove-ObsoleteChunks ... -DryRun`. Depois do `pnpm push` real, conferir no log `[chunks] ... mantidos, ... obsoletos` e que o shell abre todas as páginas no DEV (nenhum 404 em `/WebResources/cr40f_SistemaBetinhos/assets/`).
