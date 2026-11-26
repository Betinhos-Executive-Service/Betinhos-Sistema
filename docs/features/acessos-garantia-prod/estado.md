# Garantia de acesso no corte do PROD

- Nível: 3 (muda permissões; o alvo final é o PROD)
- Etapa: 6 de 7 Entregar (PR aberto)
- Próximo passo: CI verde e merge do PR #765 na develop; depois do Deploy, card da ação crítica A (preparar no DEV) · com você
- Branch e PR: feat/acessos-garantia-prod · https://github.com/Betinhos-Executive-Service/Betinhos-Sistema/pull/765
- Protótipo: sem protótipo
- Go: aprovado em 26/11/2026 11:32 (construir no DEV e abrir PR para a develop; card antes de cada ação crítica no DEV)
- PROD: ainda não
- Atualizado: 26/11/2026 12:39

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | As 3 camadas (cobrir tabelas, atribuir antes, trava nova) antes de qualquer corte no PROD | administrativos começam com acesso a tudo e nada quebra | Renan |
| 26/11/2026 | Administrativos = equipe Team-Betinhos-MDA + quem tem Administrador do Sistema direto | motoristas ficam fora | Renan |
| 26/11/2026 | ACESSOS_ADMINS_MANTER no PROD = 2 contas (lista só na variável do environment) | os outros ficam com os 4 Gestores e o System Customizer direto | Renan |
| 26/11/2026 | Administrativos calculados pelo corte, sem variável nova | lista some ao virar dado; nenhum id no repo | Claude (Assumi) |
| 26/11/2026 | Duas fases: `preparar` só adiciona; `cortar` retira uma pessoa por vez com a trava | ninguém perde nada na fase 1; cada retirada é conferida | Renan |
| 26/11/2026 | ACESSOS_ADMINS_MANTER no PROD: a conta admin do Renan é a de serviço noreply | não há conta pessoal do Renan no PROD | Renan |
| 26/11/2026 | Uma pessoa por vez: todas as administrativas em ACESSOS_ADMINS_MANTER, tira-se uma por execução | sem mudar o corte que já existe | Claude (Assumi) |
| 26/11/2026 | Perfil de coluna herdado de equipe não conta como "já tem"; o preparo dá direto | o corte pode tirar a equipe depois | Claude (Assumi) |
| 26/11/2026 | Trava de conexão estrita: dono que perde qualquer leitura ou escrita trava | flow quebraria sem aviso | Claude (Assumi) |
| 26/11/2026 | Mapa das 48 tabelas aceito; divergências registradas no PR | proposta conferida pelo consumidor | Renan |
| 26/11/2026 | Cidade, Local de base, Comunicado da home, Notícia externa, Proposta de agente, Erros do sistema e Log do App Motoristas: criar e editar no Operacional - Gestor (`gestorCria`) | administrativas não perdem cadastro de apoio | Renan |
| 26/11/2026 | Tabelas da automação (execução de agente e as 3 da Infleet) exigem só leitura na trava (`travaSoLeitura`) | quem grava é a automação | Renan |
| 26/11/2026 | Visão de tabela: perda da escrita em visões de outra pessoa aceita (leitura Global continua) | cada um edita as próprias | Renan |
| 26/11/2026 | Colunas: trava reprova administrativa que perde o admin sem perfil direto que leia toda coluna protegida das tabelas cr40f_/new_; logins e senhas só o admin (`colunasSoAdmin`); termo de multa só leitura no Gestor | ninguém vê campo vazio depois do corte | Renan |
| 26/11/2026 | Perfil de coluna de equipe não conta na trava de colunas | conservador: o corte pode tirar a equipe | Claude (Assumi) |
| 26/11/2026 | Tabelas padrão medidas (account, annotation, appointment, contact, email, phonecall, task) não travam: perda vai ao informativo | o Base copia o Basic User e nenhum perfil dá Global nelas | Renan |
| 26/11/2026 | `atribui` respeita `local`: profundidade Local vale também para Assign e Share | mesma regra das outras ações | Claude (Assumi) |
| 26/11/2026 | `cr40f_senhahash` (portal) em `colunasSoAdmin` | só o Worker do portal lê | Claude (Assumi) |
| 26/11/2026 | Trava do passageiro no CI confere a tag `acessos-cortado-prod`, gravada só pelo `cortar` aplicado e apagada no desfazer; o modo vem do corte.json da base do PR | a `acessos-corte-<amb>` já nasce no preparar | Claude (Assumi) |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | Camada 1: `foraDosPerfis`, tabelas nas áreas, teste de cobertura, gerado e migration | — | 1 | teste do mapa e do gerar (vitest/node) | 4 | passou: mapa 11/11, gerar 15/15; hash 07cf6f3f… |
| 2 | Fase 1 `preparar` (adições, foto v3, desfazer) e fase 2 (trava de administrativos, resumo) | 1 | 3, 6 | testes de corte-regras, corte-preparo e corte-estado | 4 | passou: node --test 79/79 (travas de só leitura, colunas e tabelas padrão) |
| 3 | DEV: migration pelo Deploy, `preparar` → conferir (`prova.mjs`) → `desfazer` | 1, 2 (merge na develop) | 2, 4, 5 | saída do relatório e do prova.mjs | 5 | |

## Ações críticas (só nível 3)
| # | Ação | Alvo real (ambiente, tabela, registros) | Simulação | Backup conferido | Plano de volta | Executada em |
|---|---|---|---|---|---|---|
| A | Preparar no DEV (`corte.json` dev: preparar) | DEV: papéis e perfis de coluna das pessoas administrativas; DEV não tem a equipe | plano no log do modo preparar sem `--aplicar` | foto do corte (artefato cifrado) | `desfazer` | |
| B | (futuro, fora desta entrega) cortar no PROD | PROD: equipe com 3 papéis a retirar, 4 membros ativos; admin direto sai de 1 pessoa; 1 pessoa só tem a equipe | relatório no PROD | foto | `desfazer` | |

## Pendências e fora de escopo
- Retirar `msdyn_kbattachment` do Perfil - Base (rodada anterior).
- Levar `matriz.mjs`/`lacuna.mjs` para `packages/deploy/acessos/`.
- Trava olha só privilégios de tabela das tabelas do catálogo; privilégios que não são de tabela (ex.: exportar, ações gerais) não entram.
- Trava de conexão olha o dono da connection reference; impersonação e workflows clássicos ficam fora.
- Artefatos cifrados (fotos do corte) expiram em 90 dias: o `desfazer` depois disso precisa de foto guardada à parte.
- A troca da unidade Frota não passa por `aplicarPlano`; a simulação não a reflete.
- Pessoa com item ignorado ainda perde o preparo.
- O sal do hash dos ids no log é público: o hash só evita leitura casual, não identificação.
- Testes do corte usam estado montado à mão; o ensaio no DEV é a prova real.
- Coluna protegida sem nenhuma linha em fieldpermissions passa sem trava.
- O desfazer não alcança usuários desabilitados depois do corte e remove também papel dado à mão no meio.
- `gestorCria` e `atribui` não entram no `nivel.ts` do shell.

## Retro
-
