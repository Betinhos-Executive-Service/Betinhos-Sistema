# Troca de carro — modo da janela (Horário marcado × Entre serviços)

Data: 05/10/2026 · Status: design aprovado por Renan · Ambiente de implementação: DEV primeiro

## Problema
A janela da troca (`cr40f_iniciodajaneladetroca`–`cr40f_fimdajaneladetroca`) é lida pelos motoristas como horário obrigatório. Caso real: dois motoristas livres de manhã esperaram a janela da tarde para trocar. A gestão usa a janela, na maioria das vezes, como sugestão.

## Objetivo
Deixar explícito, no registro e no App Motoristas, se a troca tem **horário marcado** (obrigatório) ou deve acontecer **entre dois serviços da agenda de cada motorista**, no momento em que ambos estiverem livres.

## Decisões
| Tema | Decisão |
|---|---|
| Modos | `Horário marcado` e `Entre serviços` |
| Onde vale `Entre serviços` | Só tipo **Troca** (100000000). Devolução/Retirada da base: sempre Horário marcado |
| Padrão no registro de Troca | `Entre serviços` |
| Trocas existentes | Tratadas como Horário marcado (campo vazio = Horário marcado) |
| Âncora do Entre serviços | **Posição na agenda, uma por motorista**: "depois da OS-A, antes da OS-B". Sem cálculo de horário de término (só 12% dos serviços têm retorno previsto: 161/1.289 em set/2026, PROD) |
| Extremos | "Depois de" vazio = desde o início do dia; "antes de" vazio = até o fim do dia. Âncoras opcionais: motorista sem serviço no dia fica sem âncoras = livre o dia todo |
| Janela gravada (técnica) | `inicio` = menor saída entre os "depois de" (ou 00:00 do dia); `fim` = maior saída entre os "antes de" (ou 23:59). Serve só ao `ExchangeConflictValidator`; não é exibida como horário |
| Agenda muda | Alertas (âncora cancelada, reatribuída, ordem invertida) **calculados na exibição**, como "atrasada". A janela técnica é calculada só no registro/atualização pela API; não há recálculo automático (o guard de pré-validação só enxerga a requisição raiz, então um update de troca disparado por update de serviço seria indistinguível de edição direta). Atualizar a troca pela API recalcula |
| Confirmação fora da janela | Horário marcado: fora de início–fim. Entre serviços: depois da saída da própria OS-B. Permitida com **motivo obrigatório**; marca alerta |
| Local da troca | Campo opcional; app mostra se preenchido |
| Conclusão | Inalterada: conclui quando os dois motoristas confirmam |
| Atrasada | Calculada na exibição (OS-B do motorista já saiu e troca não concluída); destaque na tela da gestão. Sem agendador/flow |
| App Motoristas | Selo + frase (ver abaixo); cada motorista vê só a própria frase |

## Schema (`cr40f_trocasdecarro`)
- `new_mododajanela` — choice: Horário marcado 100000000 · Entre serviços 100000001. Opcional (vazio = Horário marcado).
- `new_m1depoisde`, `new_m1antesde`, `new_m2depoisde`, `new_m2antesde` — lookups `cr40f_reservadeveculos` (âncoras por motorista), todas opcionais.
- `new_localdatroca` — texto (200), opcional.
- `new_alertajanela` — texto (500). Gravado pela confirmação fora da janela; vazio = sem alerta.
- `new_motivoforadajanelamotorista1` / `...motorista2` — texto multilinha.
Incluir na solução AppBetinhos; publicar.

## Custom APIs
- `new_RegistrarTrocaDeCarro`: novos inputs opcionais `new_ModoJanela` (int) e `new_M1DepoisDe`, `new_M1AntesDe`, `new_M2DepoisDe`, `new_M2AntesDe` (EntityReference) e `new_Local` (string). Com Entre serviços, o servidor ignora `new_Inicio`/`new_Fim` enviados e calcula a janela técnica. Entram no `new_requesthash`.
- `new_AtualizarTrocaDeCarro`: aceita trocar modo e âncoras (mesmas regras).
- `new_ConfirmarTrocaMotorista`: novo input `new_MotivoForaDaJanela`; obrigatório se agora estiver fora da janela (modo Horário marcado) ou depois da saída da OS-B do próprio motorista (Entre serviços). Grava no campo do motorista e preenche `new_alertajanela`.
- Validação: Entre serviços exige tipo Troca; cada âncora ativa, do mesmo dia, atribuída ao respectivo motorista; OS-A sai antes da OS-B; OS-B ainda não saiu. Erros: `[EXCHANGE_ANCHOR_INVALID]`, `[EXCHANGE_WINDOW_MODE_INVALID]`, `[EXCHANGE_OUT_OF_WINDOW_REASON_REQUIRED]`.

## Plugins
- `ExchangeLifecycleCommandHandler`: cálculo da janela no registro/atualização; motivo fora da janela na confirmação.
- `ExchangeMutationGuard`: bloquear raw update dos novos campos (só via API/plugin).
- `ExchangeConflictValidator`: segue igual, usando a janela calculada.
- `ExchangeAnchorLoader`: lê as âncoras (saída, motorista, cancelado) para validação nas APIs. Sem sincronização automática por update de serviço.
- Parâmetro inteiro opcional omitido chega como 0 pela Web API: `new_ModoJanela = 0` é tratado como não informado.

## Telas
- **Tela Funções Operacionais** (registro): seletor de modo (padrão Entre serviços para Troca); em Entre serviços, mostrar a agenda do dia de cada motorista e escolher a posição ("depois de / antes de") para cada um; em Horário marcado, início/fim como hoje. Campo local opcional. Lista/detalhe exibe selo, alerta e "atrasada".
- **App Motoristas** (card da troca):
  - Horário marcado → selo "Horário marcado" + "Troque entre 14:00 e 15:00".
  - Entre serviços → selo "Entre serviços" + "Troque depois da OS-1230 e antes da OS-1234" (a frase de cada motorista usa as próprias âncoras). Sem âncoras → "Troque com o <outro motorista>".
  - Local preenchido → linha "Local: …".
  - Confirmar fora da janela → pede motivo curto.
- Model-driven (formulário de troca): campos novos somente leitura.

## Skill assistente-betinhos (última etapa)
Novo `references/trocas.md`: registrar via `new_RegistrarTrocaDeCarro` (`invoke_api`), padrão Entre serviços com âncoras por motorista; sugerir troca quando o serviço exige veículo que o motorista não tem, listando opções (carros na base e motoristas com o carro). Ações extras (cancelar/concluir/alterar/reverter) a definir.

## Fora de escopo
Cálculo de lacunas livres; Entre serviços para Devolução/Retirada; notificação push nova.

## Verificação
- Testes unitários: janela técnica a partir das âncoras e extremos vazios; âncora inválida (outro motorista, outro dia, ordem invertida); fora da janela.
- E2E em DEV: `scripts/verify-exchange-window-mode-e2e.ps1` (update sem modo recalcula pelas âncoras, âncora de outro motorista, ordem invertida, âncora em horário marcado, edição direta bloqueada, volta para horário marcado). Confirmação fora da janela exige usuário mapeado como motorista: testar pelo App Motoristas.
- App Motoristas e Tela Funções Operacionais testados no navegador autenticado em DEV.
- PROD só após aprovação explícita.
