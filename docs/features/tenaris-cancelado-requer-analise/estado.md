# Cancelado da Tenaris passa pela trava e vira Requer Análise

- Nível: 2 (plugin de proteção, plugin do aviso, flow Tenaris e flow do aviso)
- Etapa: 4 de 7 Go
- Próximo passo: Go do Renan · com você
- Branch e PR: feat/tenaris-cancelado-requer-analise · ainda não
- Protótipo: sem protótipo
- Go: pendente
- PROD: ainda não
- Atualizado: 26/11/2026 14:55

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Só o status passa pela trava; os outros campos protegidos continuam barrados | Mantém as edições da equipe; a auditoria guarda a troca | Renan |
| 26/11/2026 | Cancelado da Tenaris com status protegido aberto (não Concluído, Requer Análise, Cancelado ou Cancelado com ressalvas) vira Requer Análise | O financeiro decide se cobra; fechado não muda, senão a Tenaris desfaria a decisão a cada sincronização | Renan |
| 26/11/2026 | Vale para toda gravação com `new_snapshotsharepoint` (hoje só o flow Tenaris) | Cliente novo com sincronização herda a regra | Renan |
| 26/11/2026 | Motorista recebe o aviso Cancelado quando a sincronização tira de Programado para Requer Análise; o "cancelado no local" do App continua sem aviso | Motorista não se surpreender com o serviço sumindo | Renan |
| 26/11/2026 | Corpo do aviso Cancelado vira genérico: "Este serviço foi cancelado e saiu da sua agenda." | Serve para gestor e cliente, sem tipo novo | Renan |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | `ProtecaoCampos`: Cancelado (202410002) da sincronização com status protegido aberto vira Requer Análise (100000001); fechado continua barrado | — | 1, 2, 3 | testes xUnit do `Cr40f.Protecao.Plugin` | Opus | |
| 2 | `DriverNoticeRules`: Programado → Requer Análise com snapshot no Target gera aviso Cancelado ao motorista; sem snapshot, nada | — | 4, 5 | testes xUnit do DriverRecordSharing | Opus | |
| 3 | Flow Aviso Enviar: corpo genérico do Cancelado | — | 6 | teste do provision + Deploy no DEV | Sonnet | |
| 4 | Flow Tenaris: `Upsert_Geral` deixa o Cancelado passar com o status protegido (`patch-flow-tenaris-cancelado.mjs`, simulação, `--apply` no DEV, backup) | 1 | 1 | teste node + simulação e aplicação no DEV (rascunho) | Sonnet | |
| 5 | Prova no DEV: OS de teste Programada protegida + Update com snapshot e Cancelado → Requer Análise, aviso Cancelado ao motorista, e-mail da gestão | 1–4 e Deploy | 1, 4, 6 | registro, aviso Enviado, execução do flow Requer Análise | — | |

## Pendências e fora de escopo
- Status não protegido continua como hoje: o Cancelado da Tenaris grava Cancelado direto.
- "Cancelado com ressalvas" vindo da Tenaris continua barrado quando o status está protegido.
- Se o financeiro reabrir o serviço (ex.: volta para Programado), a próxima sincronização com Cancelado o leva de novo para Requer Análise.
- Em execução → Requer Análise pela sincronização não avisa o motorista (o aviso só parte de Programado, como hoje).
- O portal do cliente mostra Requer Análise como "em análise".
- PROD: plugins e flows pelas soluções no próximo develop → main; flow Tenaris no PROD pelo "Publicar soluções" (está na BetinhosAutomacao).

## Retro
-
