---
name: verificar-config-app-motoristas
description: "Verifica a tela #/app-motoristas (configuração do App Motoristas: matriz de perfis, rascunho/publicar, motoristas com exceções e piloto, histórico, preview em iframe) no mock e no DEV. Use após mudar apps/shell/src/pages/app-motoristas/**, app/papeisUsuario.ts, app/useAcessoConfigApp.ts ou o item App Motoristas do menu."
---
# Verificar Configuração do App Motoristas (tela)

Complementa `verificar-shell` (typecheck, ambiente) e a skill do pacote `@betinhos/app-config` / plugin Acesso (regras e Custom APIs); aqui só a tela.

## Cobre
- `apps/shell/src/pages/app-motoristas/**` (`domain/` regras puras, `data/` mock e Dataverse, `components/`, `useAppMotoristas.ts`), `app/papeisUsuario.ts`, `app/useAcessoConfigApp.ts`, item no grupo Cadastros (`nav/menu.ts`), rota (`app/routes.tsx`), ícone `Smartphone` (`app/AppShell.tsx`).
- Spec: `docs/superpowers/specs/2026-11-23-config-app-motoristas-design.md` e o mockup `…-mockup.png`.

## Roteiro local (mock, sem Dataverse)
1. `cd apps/shell && pnpm exec tsc --noEmit -p . && pnpm exec vitest run --maxWorkers=2 src/pages/app-motoristas src/nav src/app/AppShell.icons.test.tsx` → verde.
   - `domain.test.ts`: acesso por papéis, mudanças e afetados, origem por chave, config do preview, ocultos, linha do tempo, validação da exceção, mapeamento de códigos de erro.
   - `AppMotoristasPage.test.tsx`: matriz com rascunho, diálogo Publicar, descartar com confirmação, lista de motoristas, histórico, estado vazio do preview, e o contrato de mensagens (só aceita "pronto" da origem do iframe e responde com `targetOrigin`).
2. `pnpm dev` (porta 36472): `#/app-motoristas`.
   - **Perfis** (`aba` ausente): matriz Módulo × Próprio/Terceiro/Admin; Serviços e Comunicados "sempre ligado" (travados); Admin sempre travado; nenhum selo ao lado do nome do módulo; células diferentes da publicada destacadas ("era ligado"/"era desligado"); barra "Rascunho · N mudanças", "Salvo", Descartar rascunho (pede confirmação) e Publicar….
   - **Publicar…**: lista o que muda com nº de motoristas afetados e nota opcional; X, clique fora e Esc fecham; nota digitada pede "Descartar alterações?"; durante a publicação não fecha.
   - **Motoristas** (`?aba=motoristas`): lista no padrão `useListView` (visões Com exceção, Sem vínculo, Sem push; filtros de perfil, exceção, vínculo, push; busca por palavras). Clicar abre o drawer (`motorista=<id>`): valor e origem por chave, nova exceção (motivo obrigatório, validade opcional, data passada recusada), encerrar exceção, piloto (só Administrador do Sistema). Mock tem um motorista sem vínculo (alerta).
   - **Histórico** (`?aba=historico`): versões (número, quem, quando, nota, o que mudou) e eventos por pessoa; "Voltar a esta versão" carrega como rascunho e pergunta antes se já há rascunho com mudanças.
   - **Preview**: ≥ 1101 px painel fixo à direita; abaixo, botão "Ver no App" abre drawer. Sem `VITE_APP_MOTORISTAS_PREVIEW_URL` mostra "Sem App para mostrar" (como subir o App local). Com a variável apontando para o App local com `?preview=1` (ou uma página que poste `{tipo:'app-motoristas-preview:pronto'}`), o iframe recebe `{tipo:'app-motoristas-preview:config', config, motorista:{nome}}` a cada mudança de matriz, "Ver como" (`ver=perfil:<id>`/`motorista:<id>`) e Rascunho/Publicado (`modo`). "Oculto para <perfil>" lista as chaves desligadas.
   - Esc/X/clique fora fecham drawers e diálogos; nenhum `border-left` colorido; console sem erro.
3. Print em 1440 px (Perfis com preview, Motoristas com drawer, Histórico, Publicar) e 1000 px (preview em drawer): skill `print-ui` ou Playwright no dev server; salvar em `~/.t3/userdata/attachments/config-app-<tela>.png`.

## DEV (só leitura até o Renan pedir)
- Só se prova no DEV (não no mock): papéis reais (`System Administrator` ou `Perfil - Operacional - Gestor`; sem nenhum, item some do menu e a rota mostra "Sem acesso"); gravação do rascunho pela Custom API `cr40f_AppConfigSalvarRascunho` com `Base` (conflito `RASCUNHO_ALTERADO` com duas contas: a segunda vê "Fulano alterou o rascunho às HH:mm", matriz recarregada); `Publicar` e versão nova no histórico; exceção e piloto pela `cr40f_AppConfigDefinirPessoa` (piloto só como Administrador do Sistema; `SEM_PERMISSAO` vira "Você não tem permissão…"); funcionários ativos com acesso ao App e inscrição de push reais; iframe real em `${clientUrl}/WebResources/new_app-motoristas-v2?preview=1` recebendo a config (precisa do lado do App tratar as mensagens).

## Limites conhecidos
- Gestor e Administrador usam `lerPapeisDiretos` (papéis diretos do usuário; papel herdado de equipe não conta). Trocar por `temPerfil('operacional','gestor')` quando o módulo Acessos existir (ponto único: `domain/acesso.ts`).
- Pendências sem aviso (motoristas sem push que a mudança alcança) ficaram fora: o shell ainda não tem a tabela de inscrições simples para isso.
