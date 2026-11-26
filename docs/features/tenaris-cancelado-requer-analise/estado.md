# Cancelado da Tenaris passa pela trava e vira Requer Análise

- Nível: 2 (plugin de proteção, plugin do aviso, flow Tenaris, flow do aviso, flow da gestão e coluna nova)
- Etapa: 6 de 7 Provar (concluída no DEV)
- Próximo passo: homologação do Renan no DEV; depois PROD pelo develop → main · com você
- Branch e PR: feat/tenaris-cancelado-requer-analise · #773
- Protótipo: sem protótipo
- Go: 26/11/2026 14:57 por Renan (card)
- PROD: ainda não
- Atualizado: 26/11/2026 16:32

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
| 26/11/2026 | Status sem proteção segue a mesma regra do protegido (aberto vira Requer Análise com a marca; fechado não muda) | Os avisos valem para todo cancelamento da Tenaris | Renan (card) |
| 26/11/2026 | Requer Análise vindo da planilha conta como cancelamento, junto com o Cancelado, só quando o snapshot anterior não tinha nenhum dos dois | A Tenaris nunca manda "Cancelado": nas 312 execuções do flow no PROD desde 21/10 (9.497 linhas), o cancelamento chega como Requer Análise. O snapshot anterior evita desfazer a reabertura da equipe e a rajada nas Concluídas antigas | Renan (card) |
| 26/11/2026 | Requer Análise da planilha avisa como cancelamento: a gestão recebe "A Tenaris cancelou o serviço" e o motorista do Programado, o aviso Cancelado | Na prática é o cancelamento da Tenaris | Renan (card) |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | `ProtecaoCampos`: Cancelado (202410002) da sincronização com status protegido aberto vira Requer Análise (100000001); fechado continua barrado | — | 1, 2, 3 | testes xUnit do `Cr40f.Protecao.Plugin` | Opus | 26 testes passando (lista de abertos, revisão); com RA e sem proteção, 41 |
| 2 | `DriverNoticeRules`: Programado → Requer Análise com snapshot no Target gera aviso Cancelado ao motorista; sem snapshot, nada | — | 4, 5 | testes xUnit do DriverRecordSharing | Opus | 982 testes passando (aviso com Cancelado ou Requer Análise no snapshot) |
| 3 | Flow Aviso Enviar: corpo genérico do Cancelado | — | 6 | teste do provision + Deploy no DEV | Sonnet | teste do provision 26/26; Deploy 45883149848 (55f55106) ok no DEV; aviso Enviado nos cenários 1 e 3 |
| 4 | Flow Tenaris: `Upsert_Geral` deixa o Cancelado passar com o status protegido (`patch-flow-tenaris-cancelado.mjs`, simulação, `--apply` no DEV, backup) | 1 | 1 | teste node + simulação e aplicação no DEV (rascunho) | Sonnet | 14 testes node passando; aplicado no DEV 26/11 15:02 (statecode 0 mantido), backup `Flow-Tenaris-DEV-20261126-150243.json` no checkout principal. Requer Análise também passa (formato `so-cancelado` → final): 20 testes node; simulação no DEV reconhece a primeira versão; final aplicado no DEV 26/11 depois do merge (statecode 0 mantido), backup `Flow-Tenaris-DEV-20261126-162606.json` |
| 6 | Coluna `cr40f_cancelamentocliente` (migration) e imagem `pre` com ela no registrador | — | 7, 8 | simulação da migration no DEV | Sonnet | simulação ok; Deploy 45883149848 criou a coluna no DEV e a imagem `pre` do step tem a coluna |
| 7 | `ProtecaoCampos`: grava o rótulo do status anterior (aberto) ou "Concluído" quando o snapshot anterior não tinha Cancelado; limpa quando o status muda fora da sincronização ou pela sincronização sem ser este cancelamento | 6 | 7, 8, 9 | testes xUnit | Opus | 31 testes passando (revisão Opus: sem repetição depois da decisão do financeiro, sem rajada nas Concluídas antigas) |
| 8 | Flow Requer Análise: gatilho pela coluna, sem motorista só no caso Tenaris, mensagem e título "Cancelado pela Tenaris" (`patch-flow-requer-analise-tenaris.mjs`) | 6 | 7, 8 | teste node + simulação e `--apply` no DEV | Sonnet | 5 testes novos (19 no total) passando; aplicado no DEV 26/11 15:27 com o filtro `cr40f_status eq 100000001 or (cr40f_status eq 202410008 and cr40f_cancelamentocliente ne null)` (rascunho, statecode 0 mantido); backup do original `Flow-RequerAnalise-DEV-20261126-152200.json` no checkout principal. O gatilho cita a coluna que só existe depois do Deploy: ligar o flow no DEV só depois |
| 5 | Prova no DEV: OS de teste Programada protegida + Update com snapshot e Requer Análise (snapshot anterior sem cancelamento) → Requer Análise com a marca, aviso Cancelado ao motorista, notificação da gestão; repetir com Cancelado, sem proteção, sem motorista, Concluído uma vez e reabertura não desfeita | 1–4 e Deploy | 1, 4, 6, 7, 8, 9, 10, 11 | registro com `cr40f_cancelamentocliente`, aviso Enviado, notificação "Cancelado pela Tenaris" | — | DEV 26/11, OS-1733 (gravações com snapshot pela Web API; flow Tenaris não rodou de ponta a ponta). (1) protegido, Programado + RA → RA, marca "Programado", aviso Cancelado Enviado, notificação "Estava: Programado · Agora: Requer Análise … Motorista: Renan (avisado no App)" ✓. (2) reabertura: equipe volta a Programado, sincronização com RA e snapshot anterior em RA → fica Programado, sem marca, aviso ou notificação ✓. (3) sem proteção, Cancelado → RA, marca, aviso e notificação ✓. (4) sem motorista, Confirmado → RA, marca "Confirmado", notificação "Motorista: sem motorista", sem aviso ✓. (5) Concluído protegido + RA → fica Concluído, marca "Concluído", notificação "Agora: Concluído (status mantido)"; segunda sincronização não repete ✓. Saíram 2 notificações no (5) porque a gravação da equipe (RA → Concluído) caiu 5 s antes da sincronização e o gatilho relê o registro; repetido com 2 min de intervalo (16:30), a equipe fechar como Concluído não dispara nada ✓. Flow da gestão ligado só durante a prova e devolvido a rascunho; OS-1733 de volta a Programado, sem proteção nem snapshot |

## Pendências e fora de escopo
- Flow da gestão (`3b12fce1…`) é rascunho no DEV: a homologação precisa ligá-lo; no PROD vem pelas soluções.
- Duas gravações no mesmo registro em segundos (equipe + sincronização) podem gerar duas notificações da gestão: o gatilho relê o registro já com a marca. Raro na prática; não tratado.
- "A Tenaris" está fixo no texto da gestão; cliente novo com sincronização pede texto próprio.
- OS já em Requer Análise por outro motivo, cancelada pela Tenaris: nada muda e a gestão não recebe aviso.
- Requer Análise da planilha que não seja cancelamento (se a Tenaris passar a usar para outra coisa) também vira "A Tenaris cancelou".
- PROD: os serviços que já estão com Requer Análise no snapshot não geram aviso (regra "uma vez só"); só os cancelamentos novos depois da publicação.
- PROD: conferir depois do import que a imagem `pre` do step do `Cr40f.Protecao` traz `cr40f_cancelamentocliente` (sem ela, o caso Concluído não é limpo pela equipe, mas não repete: o snapshot segura).
- "Cancelado com ressalvas" vindo da Tenaris continua barrado quando o status está protegido.
- Se o financeiro reabrir o serviço (ex.: volta para Programado), a sincronização seguinte não o leva de novo para Requer Análise enquanto a planilha continuar cancelada; só um novo cancelamento (planilha sai e volta para cancelado) conta.
- Em execução → Requer Análise pela sincronização não avisa o motorista (o aviso só parte de Programado, como hoje).
- O portal do cliente mostra Requer Análise como "em análise".
- PROD: plugins e flows pelas soluções no próximo develop → main; flow Tenaris no PROD pelo "Publicar soluções" (está na BetinhosAutomacao).

## Retro
-
