# O que a pessoa deixa de ter

- Nível: 3 (é a tela que vai tirar acesso no PROD)
- Etapa: 5 de 7 Construir
- Próximo passo: prints, ux-audit e PR para a develop; depois card da ação A · sozinho
- Branch e PR: feat/acessos-o-que-perde · ainda não
- Protótipo: sem protótipo
- Go: 26/11/2026 16:04 (Renan, card)
- PROD: ainda não
- Atualizado: 26/11/2026 17:35

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Retirada pessoa a pessoa; no PROD entra só o preparar | ninguém com menos acesso que hoje | Renan |
| 26/11/2026 | Prévia com acesso e uso de 90 dias | mostrar o que a pessoa vê e usa | Renan |
| 26/11/2026 | Confirmação com a lista ao salvar perda usada | evitar corte por engano | Renan |
| 26/11/2026 | Preparar roda no DEV e fica | base para provar a prévia | Renan |
| 26/11/2026 | Grupo do Entra: manual, com aviso na tela | sem segredo com escrita em grupos | Renan |
| 26/11/2026 | Coluna `cr40f_amplo` e botão "Devolver acesso amplo" | desfazer pela tela com registro do que saiu | Renan |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | Regra única C# + Custom API `cr40f_AcessoPrevia` | Go | Frota, equipe sem herança, colunas de equipe, avulsos, flows → perda certa | dotnet test | unidade | ok: 253/253 (26/11) |
| 2 | `RetirarAmplo`/`DevolverAmplo` + migration `cr40f_amplo` | 1 | sem admin → SEM_PERMISSAO; 2 admins → ULTIMO_ADMIN; devolver repõe | dotnet test | unidade | ok: 253/253 (26/11) |
| 3 | Bloco "O que deixa de ter" e confirmação | 1 | mock: perda, uso, confirmação, falha | vitest + print | mock | vitest e tsc ok; prints pendentes |
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
- Achados do code-review aceitos (vão no PR): Devolver usa o `perfisJson` da tela; checagem de `ULTIMO_ADMIN` não é atômica; `RetirarAmplo` em quem só tem o amplo pela equipe devolve sucesso sem mudar nada.

## Retro
-
