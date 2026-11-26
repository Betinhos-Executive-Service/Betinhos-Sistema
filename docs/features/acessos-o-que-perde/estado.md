# O que a pessoa deixa de ter

- Nível: 3 (é a tela que vai tirar acesso no PROD)
- Etapa: 2 de 7 Spec
- Próximo passo: Go no card · com você
- Branch e PR: feat/acessos-o-que-perde · ainda não
- Protótipo: sem protótipo
- Go: pendente
- PROD: ainda não
- Atualizado: 26/11/2026 15:50

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Retirada pessoa a pessoa; no PROD entra só o preparar | ninguém com menos acesso que hoje | Renan |
| 26/11/2026 | Prévia com acesso e uso de 90 dias | mostrar o que a pessoa vê e usa | Renan |
| 26/11/2026 | Confirmação com a lista ao salvar perda usada | evitar corte por engano | Renan |
| 26/11/2026 | Preparar roda no DEV e fica | base para provar a prévia | Renan |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | Regra única C# + Custom API `cr40f_AcessoPrevia` | Go | Frota, equipe sem herança, colunas de equipe, avulsos, flows → perda certa | dotnet test | unidade | |
| 2 | `RetirarAmplo`/`DevolverAmplo` + migration `cr40f_amplo` | 1 | sem admin → SEM_PERMISSAO; 2 admins → ULTIMO_ADMIN; devolver repõe | dotnet test | unidade | |
| 3 | Bloco "O que deixa de ter" e confirmação | 1 | mock: perda, uso, confirmação, falha | vitest + print | mock | |
| 4 | Preparar no DEV | card | Deploy aplica, conferência zera | log do Deploy | DEV | |
| 5 | Prova no DEV | 1–4 | usuário de teste: prévia, retirar, histórico, voltar | print + consulta | DEV | |

## Ações críticas (só nível 3)
| # | Ação | Alvo real (ambiente, tabela, registros) | Simulação | Backup conferido | Plano de volta | Executada em |
|---|---|---|---|---|---|---|
| A | Preparar no DEV (`corte.json` dev = preparar) | DEV, papéis e perfis de coluna dos administrativos | relatório do preparo no Deploy | estado lido antes (corte-estado) | `desfazer` (já provado, PR #771) | |
| B | Retirar amplo do usuário de teste no DEV | DEV, 1 usuário de teste | prévia na tela | papéis lidos antes | reatribuir pela Web API | |

## Revisão da spec
- Opus, 26/11/2026: 17 achados (3 altos: unidade de negócio, flows da pessoa, universo de privilégios); todos incorporados na spec.

## Pendências e fora de escopo
- Tirar do grupo do Entra continua manual.
- PR #772 (docs da garantia) aberto.

## Retro
-
