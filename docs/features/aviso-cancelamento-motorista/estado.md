# Aviso ao motorista de serviço cancelado

- Nível: 2 (schema: opção nova em choice; plugin; flow)
- Etapa: 7 de 7 Entregar
- Próximo passo: QA e merge do PR na develop; depois a tarefa 4 (prova no DEV) · com você
- Branch e PR: t3/notificacao-cancelamento-servico-motoristas · https://github.com/Betinhos-Executive-Service/Betinhos-Sistema/pull/768
- Protótipo: sem protótipo (só texto de push)
- Go: 26/11/2026 13:24 por Renan (card)
- PROD: ainda não
- Atualizado: 26/11/2026 13:38

## Diagnóstico (PROD, leitura, 26/11/2026)
- Romildo relatou que não recebe aviso de serviço cancelado.
- `DriverNoticePlugin` só cria aviso `Novo` e `Retirado`; `Retirado` exige troca de motorista com status anterior Programado. Mudar só o status para Cancelado não gera aviso.
- A operação cancela trocando o motorista para o funcionário "Cancelado" (PROD `6bc5e712-…`, sem e-mail; não existe no DEV) e depois o status. Nessa ordem sai `Retirado` ("Serviço retirado da sua agenda"); na ordem inversa não sai nada.
- 55 serviços programados cancelados desde 06/11: 8 com aviso `Retirado`, 47 sem aviso. Caso do Romildo: OS-12121 (12/11), `Retirado` marcado Enviado.
- Romildo não tem inscrição de Web Push no PROD (push só pelo Power Apps). Renan: "não tem problema".

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Criar aviso do tipo "Cancelado" (migration + plugin + flow), em qualquer ordem de gravação | 47 de 55 cancelamentos sem aviso | Renan |
| 26/11/2026 | Texto "Serviço cancelado" / "Cancelado pelo gestor. Toque para ver a agenda atualizada." | Mesmo formato dos avisos atuais | Renan |
| 26/11/2026 | Só Cancelado avisa; Cancelado com ressalvas fica como está | Escolha do Renan | Renan |
| 26/11/2026 | Funcionário de nome "Cancelado" reconhecido pelo nome: aviso Cancelado ao anterior, nunca aviso para ele | Funciona no DEV e no PROD sem id fixo | Renan |
| 26/11/2026 | Sem ação sobre a inscrição de Web Push do Romildo | "não tem problema" | Renan |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | Migration: opção Cancelado 100000002 em new_avisomotorista.new_tipo | — | Deploy aplica no DEV → opção existe | dry-run local + metadata DEV após merge | Opus | feito; metadata no DEV pendente do Deploy |
| 2 | Plugin: regras e testes (DriverNoticeRules/Plugin/Writer, PluginConfig) | 1 | cenários 1–6 | dotnet test (casos novos) | Opus | feito: 978/978 no projeto de testes |
| 3 | Flow Enviar: título/corpo/link do Cancelado + doc da virada | 1 | cenário 7 | teste do gerador do flow + DEV após merge | Opus | feito: node --test 26/26; DEV pendente |
| 4 | Prova no DEV após merge | 1–3 | cenários 1, 5, 7 numa OS de teste | registros new_avisomotorista + execução do flow | — | pendente |

## Pendências e fora de escopo
- Se a migration falhar no Deploy do DEV e o plugin publicar, todo cancelamento de serviço Programado falha no save (valor fora do choice). Conferir a opção no DEV logo após o Deploy.
- Programado(P) → motorista limpo → status Cancelado gera Retirado (não Cancelado). Fora da spec; confirmar se a operação cancela limpando o motorista.
- Funcionário "Cancelado" reconhecido pelo nome (decisão do Renan); renomear o registro no PROD desliga a regra. Alternativa futura: coluna "não é pessoa" em cr40f_funcionarios.
- Otimização não feita: o Retrieve do nome e o do e-mail (HasApp) do mesmo funcionário poderiam ser um só.

## Retro
- Revisão Opus pegou: comparação do nome sensível a maiúsculas e teste que não provava a avaliação preguiçosa; corrigidos.
- Armadilha: diff contra origin/develop com dois pontos mostra outros PRs; use três pontos.
