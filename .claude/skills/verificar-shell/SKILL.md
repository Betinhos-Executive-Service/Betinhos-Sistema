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
8. Console sem erros em cada tela.

## Casos de borda
- Mock (`pnpm dev`): telas de WebResource mostram "Esta tela abre dentro do Dataverse".
- Funcionários no celular usa cartões (rótulo de alerta completo); a coluna curta "Venceu dd/mm/aaaa" é só no desktop.

## Evidência obrigatória
- Saída de typecheck/vitest e prints das telas alteradas no DEV.

## Limites
- Publicação só da `main`, no checkout principal (`pnpm push`), nunca de worktree. PROD só com aprovação.
