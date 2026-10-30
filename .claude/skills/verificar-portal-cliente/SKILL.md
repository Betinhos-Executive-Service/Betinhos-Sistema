---
name: verificar-portal-cliente
description: "Verifica o portal de validação de serviços pelo cliente (apps/portal-cliente, protótipo React com dados fictícios para a Tenaris): typecheck, testes e o fluxo no navegador (entrar com código, aprovar em lote, dúvida, Excel, mobile). Use após mudar apps/portal-cliente/** ou quando pedirem para testar o portal do cliente."
---
# Verificar portal do cliente

## Cobre
- `apps/portal-cliente/**`: app Vite + React + `@betinhos/ui`, com dois adaptadores: mock (`src/api/mockApi.ts`) só no dev server local (porta 52463, `localhost`/`127.0.0.1`) ou com `?mock`; em qualquer outro endereço, `createWorkerApi()` (ver `verificar-portal-worker`). No mock nada grava no Dataverse; a dica do código e o `?refazer-autenticador` só aparecem nele.
- Regras: aprovação tácita em 5 dias úteis depois da liberação ou da resposta da Betinhos (feriados nacionais, fuso de São Paulo); dúvida parada não conta prazo; só `liberado`, `em_duvida` e `respondido` podem ser aprovados; dúvida exige motivo e texto; cinco códigos errados (e-mail ou autenticador) bloqueiam por 15 minutos.
- Login em duas etapas: código do e-mail + TOTP do app autenticador (RFC 6238, SHA-1, 30 s, 6 dígitos, janela ±1 via `otpauth`). 1º acesso mostra QR (`uqr`, SVG local) e a chave em texto; depois só o campo. "Lembrar este computador por 30 dias" grava `pc-dispositivo` no `localStorage` e o próximo login pula o TOTP. Segredos do mock em `pc-mock-autenticadores`.
- Spec: `docs/superpowers/specs/2026-10-28-portal-validacao-cliente-design.md`. Plano: `docs/superpowers/plans/2026-10-28-portal-cliente-prototipo.md`.

## Roteiro
1. `pnpm --filter @betinhos/portal-cliente typecheck` e `pnpm --filter @betinhos/portal-cliente test` (domínio, mock, filtros, Excel e fluxo da tela com Testing Library).
2. Subir: `.claude/launch.json` → `portal-cliente` (porta 52463, `pnpm --dir apps/portal-cliente dev`). A primeira carga do Vite pode levar uns 20 s (página em branco até otimizar as dependências).
3. No navegador interno, desktop:
   - Abra `/?refazer-autenticador` para zerar autenticador e computador lembrado (o parâmetro some da URL).
   - Entrar com `fiscal@tenaris.com` e código `123456` (a dica aparece no protótipo). Código errado mostra "Código incorreto".
   - 1º acesso: QR + chave em grupos de 4. `000000` mostra "Código do autenticador incorreto". Código certo, sem celular: no console, `(await import('/src/api/mockApi.ts')).totpDo('fiscal@tenaris.com', <chave sem espaços>).generate()`. Foque o campo por `input[inputmode=numeric]` (a classe `.pc-entrar__codigo` fica no wrapper). Com celular: leia o QR no Microsoft/Google Authenticator e digite o código.
   - Marque "Lembrar este computador por 30 dias", entre, recarregue e entre de novo: vai direto para a lista, sem TOTP. Sem marcar, o 2º acesso pede só o código (sem QR).
   - Na aba "A validar", marcar 2 serviços: a barra "Aprovação em lote" mostra a soma; "Aprovar 2 serviços" mostra o toast e a contagem cai 2.
   - Abrir um serviço (botão RV-…): Drawer largo com composição do preço, observação e voucher. "Tenho uma dúvida" sem motivo mostra o erro; com motivo e texto, a mensagem entra na conversa e o serviço vai para "Em dúvida".
   - Digitar e clicar Cancelar → "Descartar alterações?" → Descartar limpa só o formulário (o painel continua aberto).
   - Excel: no console, `(await import('/src/excel/exportar.ts')).linhasExcel` gera as linhas; o clique em "Exportar Excel" baixa o .xlsx (o `exceljs` só carrega no clique).
4. Mobile (`resize_window` preset mobile, 375 px): a etapa do QR cabe sem rolagem horizontal; a lista vira card com trajeto dentro do título; "Selecionar todos" aparece na barra; o detalhe abre em Sheet com o rodapé colado embaixo. Confira `document.querySelector('dialog.bt-sheet[open]').scrollTop === 0` (corrigido no `@betinhos/ui` 1.15.4).
5. Console sem erros nem avisos; `document.documentElement.scrollWidth === innerWidth` (sem rolagem horizontal). Versão `v0.0.x · dd/mm/aaaa HH:mm` visível no canto em todas as telas.

## Evidência
- Saída do typecheck e dos testes; screenshots do desktop (lista e detalhe) e do mobile (card e Sheet); leitura do console.

## Fora do alcance
- Worker, tabelas, plugin de preço, flow de e-mails e a tela `#/validacao-cliente` do shell ainda não existem (próximo plano, depois da reunião com a Tenaris).
