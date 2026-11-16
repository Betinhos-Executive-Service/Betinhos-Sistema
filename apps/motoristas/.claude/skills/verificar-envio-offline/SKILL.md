---
name: verificar-envio-offline
description: Verifica a fila de envio offline do App Motoristas (voucher assinado e finalização simples de SERVICO sem sinal): fila no IndexedDB, classificação de erro, processador, indicador "Sem conexão" e selo "Envio pendente" na agenda. Use após mudar qualquer arquivo de src/features/envio-pendente, useFinalizeFlow, finalizar/remoto.ts ou voucher/remoto.ts.
---

# Verificar o envio offline (App Motoristas)

## 1. Testes e tipos (sempre)

Em `apps/motoristas`: `pnpm typecheck` e `pnpm test` (`tests/envioPendente.test.ts` cobre classificador, fila com backend em memória, reabertura de estados, processador e enviador: offline e depois online, queda no meio do envio com backoff, FIFO estrito, 504 sem duplicar, 401 vira `precisa-acao`, erro de negócio vira `falhou`, trava de concorrência, `finalizadoEm`).

## 2. Mock com Playwright (localhost)

1. `PORT=<porta> pnpm dev` em `apps/motoristas` (o dev usa `--no-version`; nunca rode `pnpm build` só para testar). Abra em 390x844 com `?mockInfleet=automatico#/servicos`.
2. Feche o tour com Escape (`.tour-root` intercepta cliques).
3. Abra o primeiro `.agenda-card.servico .agenda-hit` > Receber > Adicionar comprovante > "Tirar foto" com `fileChooser` (arquivo com mtime novo: copie o PNG a cada execução) > Confirmar > FINALIZAR.
4. `context.setOffline(true)` e clique em "Não tenho observação".
5. Esperado: toast "Salvo no aparelho. Será enviado quando a conexão voltar.", volta à agenda, selo "Envio pendente" no serviço, indicador fixo "Sem conexão · 1 envio pendente". Abrir esse serviço de novo mostra o aviso e não deixa finalizar.
6. `context.setOffline(false)`: o indicador mostra "Enviando…", o toast confirma o envio (mock: "Serviço da <OS> finalizado"), o selo some e o indicador desaparece.
7. Recarregar a página offline com item pendente: o item continua na fila (IndexedDB `app-motoristas-envio-pendente`).
8. O aviso bloqueante "conexão perdida" não aparece mais no evento `offline`; o indicador o substitui.

Também confira: o toast de salvo usa o rótulo "Aviso" (variante info), o indicador reserva uma faixa no rodapé (`body.com-envio-pendente .screen`) e nada fica coberto no fim da agenda. Assinatura e fotos do item ficam na própria fila (sem expiração); o rascunho de mídia de 7 dias não afeta o envio.

## 3. Só se prova no DEV, com celular em modo avião

- Modo avião real e queda no meio do envio (o `TypeError` real do `fetch`/CORS versus o mock).
- Sessão expirada: 401 real ou redirecionamento do login Microsoft vira "Entre de novo para enviar".
- Flow de assinatura com 504 e repetição: confirmar que o `cr40f_status` concluído evita gravação dupla.
- Cenário "perguntar" da Infleet: item `precisa-acao/carro` e escolha do carro pelo indicador.
- Formato real de `cr40f_id` no título do toast (no mock cai no id).
- `navigator.storage.persist()` real (Chrome Android concede ou nega conforme engajamento; o app não avisa nada).
- Reabrir o app depois de horas offline e envio automático; `finalizadoEm` gravado com a hora do aparelho.
