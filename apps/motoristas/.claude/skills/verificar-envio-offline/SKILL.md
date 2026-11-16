---
name: verificar-envio-offline
description: Verifica a fila de envio offline do App Motoristas (voucher, serviço, manutenção, troca e checklist sem sinal) e a agenda guardada no aparelho: fila no IndexedDB, classificação de erro, processador, reenvio sem duplicar, indicador "Sem conexão" e selo "Envio pendente". Use após mudar src/features/envio-pendente, servicos/agendaOffline.ts, useAgendaLoad, checklist/envioGuardado.ts, useFinalizeFlow, finalizar/remoto.ts ou voucher/remoto.ts.
---

# Verificar o envio offline (App Motoristas)

## 1. Testes e tipos (sempre)

Em `apps/motoristas`: `pnpm typecheck` e `pnpm test` (`tests/envioPendente.test.ts` cobre classificador, fila com backend em memória, reabertura de estados, processador e enviador: offline e depois online, queda no meio do envio com backoff, FIFO estrito, 504 sem duplicar, 401 vira `precisa-acao`, erro de negócio vira `falhou`, trava de concorrência, `finalizadoEm`).
`tests/envioOfflineTipos.test.ts` cobre manutenção, troca e checklist na mesma fila (horário real, reenvio em modo `reenvio`, queda no meio, checklist retomando das fotos já enviadas), `createOneIdempotent` (PK no corpo, 412 conta como sucesso), `guidDeterministico`, manutenção já Realizada e troca já confirmada. `tests/agendaOffline.test.ts` cobre o cache da agenda (hoje e amanhã, limpeza, remoção do enviado, aviso).

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

### Troca (ou manutenção) offline e agenda guardada

- Troca: abra `.agenda-card.troca` > Finalizar, `setOffline(true)`, "Não tenho". Esperado: toast "Salvo no aparelho…", selo "Envio pendente", indicador "Sem conexão · 1 envio pendente"; ao reconectar, toast "Troca da <OS> confirmada". A manutenção não fecha no mock (cidade obrigatória e sem cidades no mock); cubra por testes.
- Agenda sem rede: o mock não usa o modo remoto. Sirva o HTML do dev em `https://org.crm2.dynamics.com/...` com `page.route` (HTML do dev; `/api/data/` aborta com `internetdisconnected`), grave a chave `app-motoristas-agenda-offline-v1` com `addInitScript` (gere o JSON com `salvarAgendaOffline` sobre `agendaMock`), `setOffline(true)` e recarregue. Esperado: agenda de hoje e amanhã e o aviso "Agenda de HH:mm (sem conexão)" no rodapé, sem cobrir conteúdo (confira o fim da lista).

## 2b. UX sem rede (mock, Playwright 390x844)

- `tests/semConexao.test.ts`: `ehErroDeRede` (TypeError "Failed to fetch" e `navigator.onLine` false = rede; HTTP 500 não), 401 não vira `falhou`, indicador `descreverIndicador` mantém "Sem conexão · …" junto com falha/ação, e o logger não mostra toast técnico ("retrieveMultiple falhou.", "Feche e reabra…") quando a causa é rede.
- Forçar offline sem derrubar a página: `Object.defineProperty(Navigator.prototype, "onLine", { get: () => false })` antes do `goto` (o processador não envia offline, então o item semeado no IndexedDB `app-motoristas-envio-pendente` continua pendente).
- Esperado: cartão de checklist com selo "Envio pendente" (como o serviço); com item `falhou` o indicador mostra "Sem conexão · OS-… não foi enviado"; o selo fica na linha da etiqueta (SERVIÇO), abaixo da seta, sem encostar no horário.

## 3. Só se prova no DEV, com celular em modo avião

- Modo avião real e queda no meio do envio (o `TypeError` real do `fetch`/CORS versus o mock).
- Sessão expirada: 401 real ou redirecionamento do login Microsoft abre a tela cheia "Sua sessão da Microsoft expirou" (botão "Entrar de novo" = reload; fila e rascunhos continuam no aparelho) e o item da fila fica `precisa-acao`, nunca `falhou`. No mock: `window.dispatchEvent(new Event("app-motoristas:session-expired"))`.
- Flow de assinatura com 504 e repetição: confirmar que o `cr40f_status` concluído evita gravação dupla.
- Cenário "perguntar" da Infleet: item `precisa-acao/carro` e escolha do carro pelo indicador.
- Formato real de `cr40f_id` no título do toast (no mock cai no id).
- `navigator.storage.persist()` real (Chrome Android concede ou nega conforme engajamento; o app não avisa nada).
- Reabrir o app depois de horas offline e envio automático; `finalizadoEm` gravado com a hora do aparelho.
- Foto e nota fiscal da manutenção pelo Flow: o nome do arquivo é determinístico (`nota-fiscal-N`, `foto-1..3`, pasta por ID); confirmar que repetir o upload com o mesmo nome sobrescreve e não duplica. O vínculo da foto no Dataverse usa GUID determinístico e PK no corpo (412 conta como sucesso).
- Troca reenviada tarde: a janela de horário é validada no servidor com a hora do reenvio; fora da janela vira `falhou` (Tentar de novo ou Descartar). Confirmação já registrada (`new_concluidomotorista*`) retorna sucesso sem chamar a Custom API.
- Checklist: `new_concluidoem` é a hora do servidor no reenvio (o app não consegue levar a hora do aparelho sem mudar o plugin); queda entre o upload de uma foto e a gravação do link na fila pode repetir essa foto.
- Despesa: modo assíncrono já tem diário durável e worker (offline mostra "Salvo no aparelho…" e conta no indicador); modo legado (síncrono, Flow com id do servidor) não é enfileirado por não ser idempotente.
- Agenda guardada no DEV real: `getDriverContext` falhando por rede abre com o cache; confirmar que o aviso some ao reconectar e a agenda atualiza.
