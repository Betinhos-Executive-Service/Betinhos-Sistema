# Total vazio na Composição de Preço (Ajuste nulo)

- Nível: 3 (dado real financeiro no PROD)
- Etapa: 7 de 7 Entregar (DEV e PROD corrigidos e conferidos)
- Próximo passo: merge do PR na develop · com você
- Branch e PR: hotfix/composicao-total-ajuste-vazio · PR a abrir
- PROD: gravado em 26/11/2026 com aprovação do Renan (card), só dado; fórmula sem mudança, sem camada Active
- Atualizado: 26/11/2026

## Causa
Desde a migration `20261123-1500-total-soma-ajuste`, `new_valortotal` (calculada clássica) soma `new_ajuste`. `Add` com nulo dá nulo: as linhas antigas (até 10/04/2026) com Ajuste vazio ficaram com Total vazio (R$ 0,00 na tela). PROD: 1.578 linhas, 347 com Subtotal > 0. DEV: 8.896.

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Hotfix no PROD hoje | relato da operação | Renan |
| 26/11/2026 | Corrigir o dado (`new_ajuste = 0` onde nulo), não a fórmula | o validador recusa `SelectFirstNonNull` com 2 parâmetros e não deixa tirar atividades | Claude (Assumi), dentro de "solução escalável e mantível" do Renan |
| 26/11/2026 | Gravar com bypass de plugins, regras e flows | o Total volta ao valor de antes de 23/11; OP, validação do portal e Geral não podem mudar | Claude (Assumi) |
| 26/11/2026 | Gravar no PROD (card de ação crítica) | backup, simulação e plano de volta conferidos | Renan |
| 26/11/2026 | OPs antigas com valor diferente da soma das composições: ignorar por ora | é anterior a 23/11, nenhuma alterada desde 18/11 | Renan |
| 26/11/2026 | Trava: passo na `verificar-composicao` (as duas contagens dão 0) | erro que se repete vira trava | Renan |

## Provas
- DEV 26/11/2026: 8.896 gravadas; `new_ajuste eq null` = 0; `new_subtotal gt 0 and new_valortotal eq null` = 0; amostra de 96 com Total = Subtotal + extras + Ajuste; `modifiedon` mais recente das OPs e da Geral sem mudança; segunda execução não grava nada.
- Backup do PROD (fora do repo): `~/Desktop/vscode/backups-prod/composicao-total-ajuste-vazio-2026-11-26/` (ids e valores das 1.578, fórmula, OPs ligadas).

- PROD 26/11/2026: 1.578 gravadas (2 lotes); `new_ajuste eq null` = 0; `new_subtotal gt 0 and new_valortotal eq null` = 0; CP-ANTG9234 com Total R$ 96,01; nenhuma OP nem Geral alterada desde o início da gravação; as 66 OPs ligadas com valor e `modifiedon` iguais ao levantamento.
- Revisão adversarial (Opus): sem bloqueante; corrigidos a leitura do `$batch` no pwsh 7 (byte[]), a parada em lote sem efeito e a conferência final rebaixada para aviso.

## Pendências
- 64 das 66 OPs ligadas (62 pagas) têm valor diferente da soma das composições desde antes de 23/11; editar reserva ou composição delas recalcula a OP, mesmo paga. Ignorado por ora (Renan).
- Painel de filtros mostrando GUID e códigos crus (à parte).
