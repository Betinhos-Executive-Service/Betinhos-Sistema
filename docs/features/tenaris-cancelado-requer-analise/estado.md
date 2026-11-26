# Cancelado da Tenaris passa pela trava e vira Requer Análise

- Nível: 2 (plugin de proteção, plugin do aviso, flow Tenaris, flow do aviso, flow da gestão e coluna nova)
- Etapa: 5 de 7 Construir
- Próximo passo: merge do PR na develop (Renan); depois Deploy e tarefa 5 (prova no DEV) · com você
- Branch e PR: feat/tenaris-cancelado-requer-analise · #773
- Protótipo: sem protótipo
- Go: 26/11/2026 14:57 por Renan (card)
- PROD: ainda não
- Atualizado: 26/11/2026 15:28

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Só o status passa pela trava; os outros campos protegidos continuam barrados | Mantém as edições da equipe; a auditoria guarda a troca | Renan |
| 26/11/2026 | Cancelado da Tenaris com status protegido aberto (não Concluído, Requer Análise, Cancelado ou Cancelado com ressalvas) vira Requer Análise | O financeiro decide se cobra; fechado não muda, senão a Tenaris desfaria a decisão a cada sincronização | Renan |
| 26/11/2026 | Vale para toda gravação com `new_snapshotsharepoint` (hoje só o flow Tenaris) | Cliente novo com sincronização herda a regra | Renan |
| 26/11/2026 | Motorista recebe o aviso Cancelado quando a sincronização tira de Programado para Requer Análise; o "cancelado no local" do App continua sem aviso | Motorista não se surpreender com o serviço sumindo | Renan |
| 26/11/2026 | Corpo do aviso Cancelado vira genérico: "Este serviço foi cancelado e saiu da sua agenda." | Serve para gestor e cliente, sem tipo novo | Renan |
| 26/11/2026 | Gestão recebe "Cancelado pela Tenaris" (texto Direto, com Estava/Agora e motorista) em vez de "Novo Serviço com Status Requer Análise" | Não confundir com o cancelado no local | Renan (card) |
| 26/11/2026 | Sem motorista também avisa, só no caso Tenaris ("Motorista: sem motorista") | A gestão precisa saber do cancelamento mesmo sem motorista | Renan (card) |
| 26/11/2026 | Concluído cancelado pela Tenaris: status mantido, aviso uma vez só "(status mantido)" | Saber que a Tenaris cancelou algo já feito, sem desfazer a decisão | Renan (card) |
| 26/11/2026 | Status anterior em coluna nova `cr40f_cancelamentocliente`, gravada pelo plugin de proteção | O flow não sabe o status de antes; a coluna também evita repetir o aviso | IA (dentro do Go) |
| 26/11/2026 | Tudo no PR #773 | Mesma feature | Renan (card) |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | `ProtecaoCampos`: Cancelado (202410002) da sincronização com status protegido aberto vira Requer Análise (100000001); fechado continua barrado | — | 1, 2, 3 | testes xUnit do `Cr40f.Protecao.Plugin` | Opus | 26 testes passando (lista de abertos, revisão) |
| 2 | `DriverNoticeRules`: Programado → Requer Análise com snapshot no Target gera aviso Cancelado ao motorista; sem snapshot, nada | — | 4, 5 | testes xUnit do DriverRecordSharing | Opus | 982 testes passando (aviso só com Cancelado no snapshot, revisão) |
| 3 | Flow Aviso Enviar: corpo genérico do Cancelado | — | 6 | teste do provision + Deploy no DEV | Sonnet | teste do provision 26/26; Deploy pendente |
| 4 | Flow Tenaris: `Upsert_Geral` deixa o Cancelado passar com o status protegido (`patch-flow-tenaris-cancelado.mjs`, simulação, `--apply` no DEV, backup) | 1 | 1 | teste node + simulação e aplicação no DEV (rascunho) | Sonnet | 14 testes node passando; aplicado no DEV 26/11 15:02 (statecode 0 mantido), backup `Flow-Tenaris-DEV-20261126-150243.json` no checkout principal |
| 6 | Coluna `cr40f_cancelamentocliente` (migration) e imagem `pre` com ela no registrador | — | 7, 8 | simulação da migration no DEV | Sonnet | simulação ok ("criaria cr40f_reservadeveculos.cr40f_cancelamentocliente"); o Deploy aplica |
| 7 | `ProtecaoCampos`: grava o rótulo do status anterior (aberto) ou "Concluído" quando o snapshot anterior não tinha Cancelado; limpa quando o status muda fora da sincronização ou pela sincronização sem ser este cancelamento | 6 | 7, 8, 9 | testes xUnit | Opus | 31 testes passando (revisão Opus: sem repetição depois da decisão do financeiro, sem rajada nas Concluídas antigas) |
| 8 | Flow Requer Análise: gatilho pela coluna, sem motorista só no caso Tenaris, mensagem e título "Cancelado pela Tenaris" (`patch-flow-requer-analise-tenaris.mjs`) | 6 | 7, 8 | teste node + simulação e `--apply` no DEV | Sonnet | 5 testes novos (19 no total) passando; aplicado no DEV 26/11 15:27 com o filtro `cr40f_status eq 100000001 or (cr40f_status eq 202410008 and cr40f_cancelamentocliente ne null)` (rascunho, statecode 0 mantido); backup do original `Flow-RequerAnalise-DEV-20261126-152200.json` no checkout principal. O gatilho cita a coluna que só existe depois do Deploy: ligar o flow no DEV só depois |
| 5 | Prova no DEV: OS de teste Programada protegida + Update com snapshot e Cancelado → Requer Análise, aviso Cancelado ao motorista, e-mail da gestão | 1–4 e Deploy | 1, 4, 6, 7, 8, 9 | registro com `cr40f_cancelamentocliente`, aviso Enviado, notificação "Cancelado pela Tenaris" (com e sem motorista, Concluído uma vez) | — | |

## Pendências e fora de escopo
- Status não protegido continua como hoje: o Cancelado da Tenaris grava Cancelado direto e a gestão não recebe aviso (inclusive Concluído sem proteção, ex.: concluído antes do snapshot).
- "A Tenaris" está fixo no texto da gestão; cliente novo com sincronização pede texto próprio.
- OS-1733 do DEV voltar para Programado depois da prova.
- OS já em Requer Análise por outro motivo, cancelada pela Tenaris: nada muda e a gestão não recebe aviso.
- PROD: conferir depois do import que a imagem `pre` do step do `Cr40f.Protecao` traz `cr40f_cancelamentocliente` (sem ela, o caso Concluído não é limpo pela equipe, mas não repete: o snapshot segura).
- "Cancelado com ressalvas" vindo da Tenaris continua barrado quando o status está protegido.
- Se o financeiro reabrir o serviço (ex.: volta para Programado), a próxima sincronização com Cancelado o leva de novo para Requer Análise.
- Em execução → Requer Análise pela sincronização não avisa o motorista (o aviso só parte de Programado, como hoje).
- O portal do cliente mostra Requer Análise como "em análise".
- PROD: plugins e flows pelas soluções no próximo develop → main; flow Tenaris no PROD pelo "Publicar soluções" (está na BetinhosAutomacao).

## Retro
-
