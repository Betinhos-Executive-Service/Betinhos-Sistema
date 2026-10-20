# Frota proativa — Agente Frota (design)

Data: 20/10/2026 · Status: rascunho para aprovação do Renan

## Objetivo
A gestão de frota deixa de depender de alguém abrir a tela: o sistema avisa sozinho o que precisa de decisão.

## Decisões (Renan, 20/10/2026)
- Canais: **aba Pendências da Gestão de Frota** + **página Assistentes** + **e-mail semanal (quarta 08:00)** para quem tiver "Notificações de frota". Sem WhatsApp na v1.
- Motor das regras: Custom API C# `cr40f_FrotaPendencias` (flow e agente) espelhada em TS na tela, com fixtures comuns.
- Reincidência: só aviso (histórico e custo acumulado), sem ação na tela.
- Motor: **regras determinísticas + IA**. Regras garantem o alerta; a IA explica e sugere a ação.
- Pneu: **pelo plano preventivo** (km/data da última troca). Sem tabela de pneus na v1.

## Arquitetura (reutiliza o que existe)
- Novo agente **Frota** no framework de agentes (`cr40f_agente` nova opção; `packages/agentes-ia/src/frota.ts`; case no Switch de `provision-flow-agentes-executar.ps1`; agendamento em `provision-flow-agentes-agendado.ps1`, quarta 07:30, antes do e-mail).
- Regras: Custom API C# `cr40f_FrotaPendencias` (`packages/plugins/Cr40f.Frota.Plugin`) e espelho TS em `apps/shell/src/pages/frota/domain/pendencias.ts`, com fixtures comuns. O agente recebe a saída da Custom API como achados obrigatórios; a IA não pode omitir achados (validação em `validar.ts`).
- E-mail: flow "Frota | Resumo semanal", quarta 08:00, chama a Custom API; sem pendências não envia.
- Custo: 2 execuções por semana (agente + e-mail), desprezível frente ao teto de 10.000 ações/mês.

## Regras v1 (limiares configuráveis em variável de ambiente `new_FrotaLimiares` JSON)
| # | Regra | Gatilho padrão | Proposta |
|---|---|---|---|
| R1 | Preventiva vencida / a vencer | status `vencido` ou `a_vencer` em `preventiva.ts` (inclui troca de pneu, rodízio, alinhamento) | Agendar manutenção |
| R2 | Reincidência | mesmo serviço (`new_servicosmanutencao`) no mesmo veículo ≥ 3 vezes em 120 dias, ou ≥ 5 no total em 12 meses | "Já é a Nª vez. Investigar causa raiz?" com histórico e custo acumulado |
| R3 | Prioridade alta parada | grau alto/urgente em Solicitado há > 2 dias ou Aprovado sem agendamento há > 5 dias | Aprovar / agendar |
| R4 | Hodômetro desatualizado | `cr40f_hodometroem` > 48 h | Conferir Infleet (protege R1) |
| R5 | Custo fora da curva | custo de manutenção 90 dias > 1,5× a mediana da frota por km | Avaliar troca/venda do veículo |
| R6 | Programado vencido | Programado com `cr40f_agendarpara` no passado e não Realizado | Confirmar se foi feito |

Dedup: a mesma regra + veículo + item não gera nova proposta enquanto houver uma aberta, ou descartada há menos de 7 dias.

## Fora da v1
WhatsApp/Teams; tabela de pneus (posição, sulco); integração de abastecimento; ações automáticas sem aprovação.

## Verificação
- Testes unitários das regras R1–R6 com fixtures (incluindo a reincidência da 5ª vez).
- Execução manual do agente Frota no DEV gerando propostas reais; e-mail recebido.
- Página Assistentes mostrando o agente Frota (ux-audit Rápido).
