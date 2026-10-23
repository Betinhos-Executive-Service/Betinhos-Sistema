# Plano — Link de cadastro do passageiro

Spec: `docs/superpowers/specs/2026-10-22-link-cadastro-passageiro-design.md`
Domínio: `cadastro.betinhos.com.br` (DNS já no Cloudflare). Validade: 36 h.

## Arquitetura

```
Formulário Geral (shell) ──POST new_GerarLinkCadastro──▶ Plugin Cr40f.Cadastro (Dataverse)
                                                          └─ cria cr40f_linkcadastro (hash do token, expira +36h)
Solicitante ─▶ cadastro.betinhos.com.br/#t=<token>
   Pages (apps/cadastro-passageiro) ─▶ Worker /api/* ─(secret: URL SAS)─▶ Flow HTTP
                                                                           ├─ valida token/escopo
                                                                           ├─ foto → SharePoint
                                                                           └─ PATCH passageiro (new_linkdafoto, telefone, e-mail)
App Motoristas ─▶ exibe new_linkdafoto (card + detalhe)
```

## Fase 1 — Schema e Custom API (DEV)

1. `packages/deploy/provision-link-cadastro.ps1` (modelo: `provision-equipamentos.ps1`): cria a tabela `cr40f_linkcadastro` com os campos:
   - `cr40f_reserva` (lookup `cr40f_reservadeveculos`)
   - `cr40f_passageiro` (lookup passageiro, opcional)
   - `cr40f_tokenhash` (texto 64, indexado)
   - `cr40f_expiraem`
   - `cr40f_status` (choice: Ativo, Usado parcialmente, Expirado, Revogado)
   - `cr40f_envios` (int)
   - `cr40f_ultimouso`

   Inclui a tabela na AppBetinhos e adiciona a regra em `packages/deploy/solucoes/regras.json` (BetinhosCore). O script é idempotente e falha com mensagem explícita.
2. Confirmar na metadata os nomes lógicos reais da tabela de passageiro e dos campos de telefone e e-mail (`cr40f_` × `new_`). Isso **bloqueia** as fases 2 a 4.
3. Plugin `packages/plugins/Cr40f.Cadastro.Plugin` (modelo: `Cr40f.Acesso.Plugin`), com a Custom API `new_GerarLinkCadastro`:
   - Entrada: `new_ReservaId` e `new_PassageiroId` (opcional).
   - Saída: `new_LinkJson` `{ ok, link, expiraEm, passageiros:[{id,nome,foto,telefone,email}] }`. A lista de passageiros alimenta o aviso de sobrescrita.
   - Gera o token com `RandomNumberGenerator` (32 bytes, base64url), grava só o SHA-256 e revoga links ativos anteriores do mesmo escopo.
   - Testes em `Cr40f.Cadastro.Plugin.Tests`: escopo por passageiro e por serviço, passageiro fora do serviço, serviço sem passageiros e revogação.
   - Publicação: `packages/plugins/scripts/push-cadastro-plugin.ps1` (modelo: `push-acesso-plugin.ps1`).

## Fase 2 — Flow HTTP (DEV)

4. `packages/deploy/flows/cadastro-passageiro-link.json` + `.test.mjs` (modelo: `documentos-resumo-semanal`), com provisionamento por script. O gatilho HTTP aceita duas operações:
   - `GET ?op=ler&hash=` → passageiros do escopo (id, primeiro nome, `temFoto`) e data do serviço. Retorna 410 se o link estiver expirado ou revogado.
   - `POST op=salvar` `{hash, passageiroId, fotoBase64?, telefone?, email?}` → revalida o escopo, cria o arquivo `<passageiroid>.jpg` no SharePoint (sobrescrevendo o anterior), faz PATCH no passageiro, incrementa `cr40f_envios` e muda o status para "Usado parcialmente".
   - Respostas genéricas: 400, 404, 410, 429 (> 30 envios) e 500.
   - Vai na solução BetinhosAutomacao.
5. O Worker calcula o hash do token e manda só o hash ao flow; o token puro não passa por logs do Power Automate.

## Fase 3 — Worker + página (Cloudflare)

6. `apps/cadastro-passageiro` (Vite + React, pnpm workspace, DS Betinhos via `@betinhos/tokens`/`@betinhos/ui`, versão de build no canto). A porta do `dev` é reservada em `dev-ports.json` e o modo mock roda em localhost.
   - Telas: carregando, lista de passageiros (cards com foto, telefone e e-mail, botão "Salvar" por passageiro), sucesso por card, link inválido ou expirado, e erro com nova tentativa.
   - `domain/foto.ts`: compressão via canvas (≤ 1600 px, JPEG 0,8, ≤ 3 MB), com testes.
   - `domain/validacao.ts`: telefone BR/+DDI e e-mail, com testes.
7. `apps/cadastro-passageiro/worker/` (Pages Functions `functions/api/[op].ts`):
   - Secret `FLOW_URL`.
   - Rate limit por IP (binding de Rate Limiting) e limite de 4 MB no corpo.
   - SHA-256 do token, CORS só da própria origem e cabeçalhos de segurança (CSP, `Referrer-Policy: no-referrer`).
8. `wrangler.toml` + scripts `pnpm cf:dev` e `pnpm cf:deploy`, com domínio customizado `cadastro.betinhos.com.br` no projeto Pages. O deploy usa `CLOUDFLARE_API_TOKEN` (permissões: Pages Edit, DNS Edit da zona) no `.env` do checkout principal e no environment do GitHub. Nunca versionar o token.

## Fase 4 — Formulário Geral (shell)

9. `apps/shell/src/pages/geral/domain/linkCadastro.ts`: `gerarLinkCadastroBlock` (serviço cancelado ou sem passageiros) e `parseLinkCadastroJson`, reaproveitando `parseLinkJson`. Inclui testes.
10. `data/source.ts`: `gerarLinkCadastro(reservaId, passageiroId?)` via `new_GerarLinkCadastro`, com mock local.
11. UI: ação "Link de cadastro" no serviço e no item de passageiro. Um painel (sheet) mostra os dados atuais por passageiro, o aviso "já tem foto/telefone/e-mail; a solicitante poderá sobrescrever", a validade e os botões Copiar e Compartilhar (WhatsApp). O overlay segue a regra de fechar e de confirmar o descarte.

## Fase 5 — App Motoristas (repo `App Motoristas`)

12. Exibir `new_linkdafoto` no card (avatar) e no detalhe (toque amplia), com a inicial como fallback.
13. Acesso à foto: o flow devolve um link de compartilhamento "somente visualização" do SharePoint e grava esse link em `new_linkdafoto`. Se a política do tenant bloquear, a alternativa é o Worker expor `/foto/<id>` com assinatura HMAC curta. Decidir no teste da fase 2.

## Verificação por camada

- **Local**: `pnpm typecheck` e `pnpm test` (shell, cadastro-passageiro), testes .NET do plugin, `wrangler pages dev` com o flow mockado e a skill `ux-audit` Rápido na página (celular 375 px) e no painel do Geral.
- **DEV**: provision, plugin, flow e deploy do Pages. Ciclo completo: gerar link, abrir no celular, enviar foto HEIC/JPEG, conferir o passageiro no Dataverse e o arquivo no SharePoint, link expirado (forçar `cr40f_expiraem`) e token adulterado.
- **Dispositivo**: foto visível no App Motoristas no 4G.
- Skills de verificação: criar `verificar-link-cadastro` (via `verificacao-criar`) e atualizar `verificar-shell`.

## Ordem e PRs

PR 1 = Fase 1 + 2 · PR 2 = Fase 3 · PR 3 = Fase 4 · PR 4 = Fase 5 (outro repo). Os PRs 2 e 3 podem correr em paralelo depois do PR 1. Publicação no DEV só pela `main` no checkout principal.

## Pendências antes de começar

- Token de API do Cloudflare com as permissões acima (o Renan cria).
- Biblioteca do SharePoint de destino das fotos (existe uma "Passageiros"? Se não, criar).
