# Plano — Frota proativa

Spec: `docs/superpowers/specs/2026-10-20-frota-proativa-design.md` · Branch: `claude/fleet-proactive-automation-c06c54`

Modelo de referência: Documentos (`Cr40f.Documentos.Plugin` com `DocumentosResumoPlugin` + Fixtures JSON + `provision-flow-documentos-resumo.ps1`). Copiar a estrutura, não reinventar.

## Princípio
Uma regra, três superfícies: **aba Pendências da Frota** (TS, tempo real), **Custom API `cr40f_FrotaPendencias`** (C#, para flow e agente) e **fixtures JSON compartilhadas** que os dois lados testam. Se TS e C# divergirem num fixture, o teste quebra.

## Tarefas

### Fase 1 — Regras na tela (entrega valor sozinha)
1. **Fixtures** `packages/frota-regras/fixtures/*.json`: entrada (veículos, manutenções, plano, baselines, despesas, hoje) → pendências esperadas. Casos: preventiva km/data/pneu, 3ª em 120 dias, 5ª em 12 meses, serviço diferente não conta, Alta parada 3 dias, Urgente aprovada sem data 6 dias, hodômetro 49 h, custo 1,6× mediana, programado vencido, frota com 1 veículo (sem mediana).
2. **Limiares** `apps/shell/src/pages/frota/domain/limiares.ts` (padrões da spec) lidos de `new_FrotaLimiares` com fallback; mesmo JSON exportado para os fixtures.
3. **Novos tipos em `domain/pendencias.ts`**: `reincidencia`, `prioridade` (Alta/Urgente parada, substitui a ordenação dentro de `aprovar`/`programar` sem duplicar item), `hodometro`, `custo`. `agendada` já cobre R6; preventiva já cobre R1 (conferir itens de pneu no plano padrão). Funções puras novas: `reincidencias.ts`, `custoForaDaCurva.ts`. TDD com os fixtures.
4. **View `views/Pendencias.tsx`**: grupos novos com rótulo, contagem e detalhe — reincidência mostra "Nª vez de <serviço> em <período>", lista das ocorrências (data, oficina, valor) e custo acumulado; só aviso, sem ação (decisão do Renan). Badge da aba soma tudo. Clique abre a ficha do veículo.
5. **Plano padrão**: garantir itens Troca de pneu / Rodízio / Alinhamento-balanceamento em `cr40f_itemplanopreventivo` (script de seed idempotente no DEV; não PROD).

### Fase 2 — Custom API (cálculo fora da tela)
6. `packages/plugins/Cr40f.Frota.Plugin`: `FrotaRepository` (consultas), `Regras/*.cs` (porte 1:1 das funções TS), `FrotaPendenciasPlugin` (Custom API sem parâmetros de entrada; saída `pendencias` JSON). Testes xUnit rodando **os mesmos fixtures**.
7. `push-frota-plugin.ps1` + script `push:plugin:frota:dev`; registrar Custom API e incluir na solução AppBetinhos. Validar no DEV comparando a saída com a aba Pendências (mesmos totais).

### Fase 3 — E-mail semanal
8. Schema: coluna booleana `cr40f_notificacoesfrota` ("Notificações de frota") em `cr40f_funcionarios`, exposta no cadastro de funcionário do shell.
9. Flow "Frota | Resumo semanal": recorrência **quarta 08:00 America/Sao_Paulo** → chama a Custom API → se houver pendências, monta HTML (grupos, máx. 10 por grupo + link para a aba Pendências via `new_URLSistemaBetinhos`) → envia para quem tem a coluna marcada e e-mail Betinhos. Sem pendências ou sem destinatários: não envia. `provision-flow-frota-resumo.ps1` no modelo do de documentos.

### Fase 4 — Agente Frota (Assistentes)
10. Choice `cr40f_agente` nova opção Frota; tipos de proposta `agendar_preventiva`, `aprovar_manutencao`, `avaliar_veiculo`, `investigar_reincidencia` (só informativa).
11. `packages/agentes-ia/src/frota.ts` + `constantes/schema/validar`: contexto = saída da Custom API; trava em `validar.ts` exige uma proposta por pendência de prioridade/reincidência/custo (IA não omite). Dedup por regra+veículo+item (aberta ou descartada < 7 dias).
12. Flow Executar: case Frota chamando a Custom API; Agendado: incluir Frota **quarta 07:30** (antes do e-mail, que linka as propostas). UI: entrada em `agentes.ts` e ações em `acoes.ts`.

### Fase 5 — Verificação e entrega
13. `pnpm typecheck && pnpm test`, `dotnet test`; ux-audit Rápido na aba Pendências (mock) e verificação autenticada no DEV; criar `verificar-frota` via `verificacao-criar`. PR → merge → `pnpm push` da `main` (sem PROD; PROD congelado até o checklist).

## Riscos
- Divergência TS×C#: mitigada pelos fixtures comuns.
- Hodômetro sem atualizar distorce R1 e R5: R4 avisa; R5 ignora veículo sem km confiável.
- `new_servicosmanutencao` vazio em manutenções antigas (classificação por IA): reincidência usa só as classificadas; contar quantas ficam de fora e mostrar na view.
- Custo de flow: 1 execução semanal + 1 do agente, desprezível frente ao teto de 10.000/mês.
