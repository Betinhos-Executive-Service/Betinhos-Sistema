# Acessos: visão por papel, ver como e saída de administrativo

- Nível: 2 (várias telas e um caminho novo de encerrar acesso; sem schema novo; saída com revisão Opus de segurança)
- Etapa: 5 de 7 Construir (PR 2, Ver como); PR 1 mergeado (#780) e provado no DEV em 27/11/2026
- Próximo passo: tarefa 7, Ver como (PR 2) · sozinho
- Branch e PR: feat/acessos-visao-papel (base feat/acessos-o-que-perde, PR #777) · ainda não
- Protótipo: A (matriz pessoa × área, filtros: ainda com o amplo, só o Base, encerrados) e ficha com banner "Vendo como", Encerrar com confirmação pelo primeiro nome e Reativar com os perfis anteriores; B descartada
- Go: 27/11/2026 09:26 por Renan (clique no card)
- PROD: ainda não
- Atualizado: 27/11/2026 09:26

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 27/11/2026 | Visão por papel (matriz pessoas × áreas) | ver o todo no corte do PROD | Renan |
| 27/11/2026 | Saída de administrativo: bloquear no Dataverse e tirar perfis e amplo, com histórico; licença e conta M365 ficam com a TI | Encerrar acesso atual só cobre motorista (CONTA_FORA_DO_GRUPO) | Renan |
| 27/11/2026 | Ver como: simulado no shell (menu e telas pelos perfis da pessoa, dados de quem vê) | seguro, nada gravado em nome dela | Renan |
| 27/11/2026 | Sem tela de revisão periódica | não precisa | Renan |
| 27/11/2026 | Ordem: visão por papel (com a saída) → ver como; um PR por parte | a matriz vira o painel do corte | Renan |
| 27/11/2026 | Encerrar e reativar: perfil Administrador de acessos (nunca o próprio nem o último admin) | quem troca perfis também encerra | Renan |
| 27/11/2026 | Reativar devolve o que a pessoa tinha (perfis e amplo gravados no histórico do encerramento) | não refazer perfis à mão | Renan |
| 27/11/2026 | Visão por papel: botão "Acessos por papel" em Funcionários; #/acessos continua fora do menu | mesmo caminho do "Acessos sem ficha" | Renan |
| 27/11/2026 | Protótipo: matriz A e ficha como no esboço | uma linha por pessoa responde "quem tem o quê" | Renan |
| 27/11/2026 | Encerrar quem tem o amplo (direto ou por equipe): só o Administrador do Sistema | mantém a regra do DefinirPerfis | Renan |
| 27/11/2026 | Encerrar tira a pessoa das equipes que dão papel; o Reativar devolve | o papel da equipe valeria se o bloqueio fosse desfeito | Renan |
| 27/11/2026 | "Ver como" na ficha, bloco Acesso ao sistema, mostrando também o rascunho | ver antes de salvar | Renan |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | Plugin: `EncerrarAdministrativoHandler`, `ReativarAdministrativoHandler`, plugins, registro das 2 Custom APIs no registrador e `Devolver` ignorando encerrar/reativar; testes xUnit | — | cenários 7 a 11 em teste | `dotnet test` do Acesso.Plugin | Opus | passou (local): 266/0, 13 novos, commit 7b131cea. Incertos: SetState do reativar com conta sem licença; `cr40f_amplo` 4000 caracteres; perfil de coluna que o Dataverse recuse tirar; equipe de grupo do Entra fica (etapa pulada). 1ª execução do `dotnet test` deu 254 falhas e as 2 seguintes passaram: instável na 1ª compilação |
| 2 | Shell (dados): `source.ts` com `encerrar`/`reativar`, leitura dos encerrados, `HistoricoLista` com Encerrado/Reativado, mock | 1 (contrato) | cenários 4, 7 e 10 no mock | vitest dos arquivos tocados | Sonnet | passou (mock): 233 testes em acessos+funcionarios, tsc limpo, commit dfd4606d. Revisar na tarefa 5: `encerrados()` lê todas as contas bloqueadas e cruza no cliente (peso) |
| 3 | Shell (matriz): `#/acessos?visao=papel`, botão "Acessos por papel" em Funcionários, chips e busca, clique para a ficha ou a gaveta | 2 | cenários 1 a 5 | vitest + print no mock (1280 e 375) | Sonnet | passou (mock): 242 testes em acessos+funcionarios, tsc limpo; prints em `prints/matriz-*.png`. Incertos: ficha de encerrado só abre se o funcionário existir (sem ficha a linha não clica); Administrador do Sistema aparece como Gestor em todas as áreas |
| 4 | Shell (ficha): Encerrar com diálogo e confirmação, estado encerrado e Reativar, botão travado para amplo | 2 | cenários 6, 8 e 11 | vitest + print no mock | Sonnet | passou (mock): 251 testes em acessos+funcionarios, tsc limpo; prints `prints/ficha-*.png`. Mock: ficha m9 (Joana) é a encerrada, com id próprio (colidia com o de Carlos). Incertos: a lista "o que perde" não traz equipes (o bloco não as lê); 403 de recurso externo no console do mock |
| 5 | Revisão de segurança (Opus) do diff 1 a 4, qualidade, verificar-acessos atualizada, PR 1 → develop (base #777) | 1 a 4 | — | code-review high + ux-audit Fluxo | Opus | passou (local): revisão Opus com 2 importantes e 9 menores corrigidos (cba17b72 plugin, d1648c37 shell), qualidade 023f8212, verificação bf6ea657 (277 testes do plugin, 263 do shell, tsc limpo, mock 1280/375). Segurança: superfície tocada (Custom API sem privilégio próprio), revisada |
| 6 | Prova no DEV depois do merge (Deploy registra as APIs): encerrar e reativar um usuário de teste e conferir papéis, equipes, bloqueio e histórico | 5 | cenários 7, 9 e 10 reais | saída sem ids | — (sessão principal, card antes) | passou (DEV, 27/11/2026, Deploy b48dbcbb): usuário de teste com Base + Financeiro Operador → encerrar tirou 2 papéis e 1 perfil de coluna, bloqueou, gravou `acao:encerrar` e a conferência deu "acesso retirado"; reativar repôs os 2 papéis e o perfil e desbloqueou; recusas sem efeito: CONFIRMACAO_INVALIDA, SEM_PERMISSAO (impersonação de Base), JA_ENCERRADO, NADA_A_REATIVAR (2x). Usuário voltou ao só Base. Não provados no DEV: PROPRIO_ACESSO, ULTIMO_ADMIN e equipe com papel (testes unitários) |
| 7 | Ver como (PR 2): override no `AcessosProvider`, banner no AppShell, botão na ficha | 5 | cenários 12 a 14 | vitest + print | Sonnet | |

## Pendências e fora de escopo
- Revisão periódica de uso: fora (decisão de 27/11/2026)
- Para decidir: corrida no `ULTIMO_ADMIN` (já aceita no #777) e se o encerrar administrativo deve recusar motorista.
- ux-audit: sem mensagem de sucesso ao reativar; aviso "Peça à TI" só depois de encerrar; mock sem pessoa com ficha, conta e sem o amplo.
- `inicio/domain/domain.test.ts` espera "R$ 1 mil" e recebe "R$ 1,0 mil" localmente (fora do diff; conferir no CI).

## Retro
- A revisão de segurança (Opus) achou 11 pontos no plugin depois de pronto; o principal (reativar sem conferir o bloqueio) era regra que a spec já pedia. Cenário de recusa vira teste antes do handler.
- O code-review rodou no worktree errado na 1ª vez: o brief de revisão passa a levar o caminho absoluto do worktree.
- O ux-audit pegou o Esc do diálogo fechando a gaveta: diálogo dentro de drawer precisa de teste de teclado no roteiro.
- PR #780 aberto em 27/11/2026.
