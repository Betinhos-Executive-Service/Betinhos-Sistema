# Troca de carro — modo da janela (Horário marcado × Entre serviços)

Data: 05/10/2026 · Status: design aprovado por Renan · Ambiente de implementação: DEV primeiro

## Problema
A janela da troca (`cr40f_iniciodajaneladetroca`–`cr40f_fimdajaneladetroca`) é lida pelos motoristas como horário obrigatório. Caso real: dois motoristas livres de manhã esperaram a janela da tarde para trocar. A gestão usa a janela, na maioria das vezes, como sugestão.

## Objetivo
Deixar explícito, no registro e no App Motoristas, se a troca tem **horário marcado** (obrigatório) ou deve acontecer **assim que os motoristas estiverem livres, antes de um serviço-alvo**.

## Decisões
| Tema | Decisão |
|---|---|
| Modos | `Horário marcado` e `Entre serviços` |
| Onde vale `Entre serviços` | Só tipo **Troca** (100000000). Devolução/Retirada da base: sempre Horário marcado |
| Padrão no registro de Troca | `Entre serviços` |
| Trocas existentes | Tratadas como Horário marcado (campo vazio = Horário marcado) |
| Âncora do Entre serviços | **Serviço-alvo**: a reserva que precisa do carro |
| Fim da janela | Saída do serviço-alvo − **30 min** (constante em `PluginConfig`) |
| Início da janela | Momento do registro |
| Lacunas livres em comum | **Não calculadas** — só 12% dos serviços têm horário previsto de retorno (161/1.289 em set/2026, PROD) |
| Agenda muda | Serviço-alvo muda horário → recalcula o fim. Serviço-alvo cancelado, sem motorista da troca, ou fim < agora → alerta para a gestão |
| Confirmação fora da janela | Permitida com **motivo obrigatório**; marca alerta |
| App Motoristas | Selo + frase (ver abaixo) |

## Schema (`cr40f_trocasdecarro`)
- `new_mododajanela` — choice: Horário marcado 100000000 · Entre serviços 100000001. Opcional (vazio = Horário marcado).
- `new_servicoalvo` — lookup `cr40f_reservadeveculos`. Obrigatório quando modo = Entre serviços.
- `new_alertajanela` — texto (500). Motivo do alerta atual; vazio = sem alerta.
- `new_motivoforadajanelamotorista1` / `...motorista2` — texto multilinha.
Incluir na solução AppBetinhos; publicar.

## Custom APIs
- `new_RegistrarTrocaDeCarro`: novos inputs opcionais `new_ModoJanela` (int) e `new_ServicoAlvo` (EntityReference). Com Entre serviços, o servidor ignora `new_Fim` enviado e calcula; `new_Inicio` = agora. Entram no `new_requesthash`.
- `new_AtualizarTrocaDeCarro`: aceita trocar modo e serviço-alvo (mesmas regras).
- `new_ConfirmarTrocaMotorista`: novo input `new_MotivoForaDaJanela`; obrigatório se agora estiver fora da janela (modo Horário marcado) ou depois do fim (Entre serviços). Grava no campo do motorista e preenche `new_alertajanela`.
- Validação: Entre serviços exige tipo Troca, serviço-alvo ativo, futuro e com motorista 1 ou 2 da troca; fim calculado > agora. Erros: `[EXCHANGE_TARGET_REQUIRED]`, `[EXCHANGE_TARGET_INVALID]`, `[EXCHANGE_WINDOW_MODE_INVALID]`, `[EXCHANGE_OUT_OF_WINDOW_REASON_REQUIRED]`.

## Plugins
- `ExchangeLifecycleCommandHandler`: cálculo da janela no registro/atualização; motivo fora da janela na confirmação.
- `ExchangeMutationGuard`: bloquear raw update dos novos campos (só via API/plugin).
- `ExchangeConflictValidator`: segue igual, usando a janela calculada.
- `ServiceExchangeSynchronizer` (ou novo passo no update da reserva): quando `cr40f_dataehorriodesada`, status ou motorista do serviço-alvo mudar, recalcular o fim das trocas abertas que o apontam, ou gravar `new_alertajanela`.

## Telas
- **Tela Funções Operacionais** (registro): seletor de modo (padrão Entre serviços para Troca); em Entre serviços, escolher o serviço-alvo entre os próximos serviços dos dois motoristas e mostrar "até HH:mm" calculado; em Horário marcado, início/fim como hoje. Lista/detalhe exibe selo e alerta.
- **App Motoristas** (card da troca):
  - Horário marcado → selo "Horário marcado" + "Troque entre 14:00 e 15:00".
  - Entre serviços → selo "Quando estiverem livres" + "Troquem assim que ambos estiverem livres, até 13:30 (antes da OS-1234)".
  - Confirmar fora da janela → pede motivo curto.
- Model-driven (formulário de troca): campos novos somente leitura.

## Skill assistente-betinhos (última etapa)
Novo `references/trocas.md`: registrar via `new_RegistrarTrocaDeCarro` (`invoke_api`), padrão Entre serviços com serviço-alvo; sugerir troca quando o serviço exige veículo que o motorista não tem, listando opções (carros na base e motoristas com o carro). Ações extras (cancelar/concluir/alterar/reverter) a definir.

## Fora de escopo
Cálculo de lacunas livres; Entre serviços para Devolução/Retirada; notificação push nova.

## Verificação
- Testes unitários do cálculo (fim = saída − 30 min; alvo inválido; fora da janela).
- E2E em DEV estendendo `scripts/verify-exchange-lifecycle-*-e2e.ps1`: registrar Entre serviços, mudar horário do serviço-alvo e conferir recálculo, cancelar alvo e conferir alerta, confirmar fora da janela com e sem motivo.
- App Motoristas e Tela Funções Operacionais testados no navegador autenticado em DEV.
- PROD só após aprovação explícita.
