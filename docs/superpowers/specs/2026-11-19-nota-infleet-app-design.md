# Minha nota (Infleet) no App Motoristas — design

Data: 19/11/2026 · Decisões do Renan na sessão de 18–19/11/2026.

## Objetivo

MVP do Score do motorista: o motorista vê no App Motoristas a própria nota de condução calculada pela Infleet (0–100), as notas por comportamento e a evolução mensal. É o primeiro pilar do Score geral (Cliente, Trânsito, Processos), que fica para depois.

## Fora do escopo

- Score geral com outros pilares; visão da gestão no Sistema (o dashboard já tem o `scoreMotoristas` próprio, em `apps/shell/src/pages/dashboard/domain/score.ts`, que não muda).
- Posição no ranking (motorista não vê os outros nem a posição).
- Histórico gravado no Dataverse, tabela nova, flow ou migration.
- Funcionamento offline (a nota exige internet).

## Fonte: API GraphQL da Infleet

Endpoint `https://api.infleet.com.br/v1/graphql` (já usado por `InfleetGraphQlGateway`, token `infleet.token`). Conferido no DEV em 19/11/2026:

- `driverProfile(filters:{driverId, period:{startAt, endAt}})` → `distanceTraveled` (km), `currentDriverGrades: Grades`.
- `Grades`: `generalGrade` e, por comportamento, `hardAcceleration`, `hardBraking`, `hardCornering`, `deviceOverspeed`, `deviceIdle`, `usingPhone`, `fatigue`, `distraction`, `seatbeltUnbuckled`, `smoking`, `eyesClosed`, `yawning`, `forwardCollision`, `laneDeparture`, `vehicleTooClose` (0–100; `null` quando não se aplica, ex. sem câmera).
- `driverRankingEvolution` devolveu `months` vazio; não usar. A evolução sai de um `driverProfile` por mês na mesma consulta (aliases), ~3 s no total.
- Configuração da organização: mínimo de 50 km e 1 h de ignição para entrar no ranking.

Consulta única (aliases): `p90` = últimos 90 dias até agora; `m0..m5` = mês corrente e os 5 anteriores (fronteiras em 00:00 America/Sao_Paulo, convertidas para UTC).

## Backend: Custom API `new_NotaInfleet`

- Unbound, sem parâmetro de entrada; saída `new_Result` (String, JSON). Plugin `Betinhos.DriverRecordSharing.NotaInfleetPlugin`.
- Fluxo: `DriverResolver.ResolveFromUser(InitiatingUserId)` → funcionário → `new_infleetdriverid` (`PluginConfig.EmployeeInfleetDriverId`). Token via `InfleetGraphQlGateway.ReadToken` (tabela → configuração segura). Leitura da Infleet num método novo do gateway, com o timeout e as tentativas atuais.
- Resposta (`schema: 1`):

```json
{
  "schema": 1,
  "situacao": "ok | em_formacao | sem_cadastro",
  "periodo": { "inicio": "2026-08-21", "fim": "2026-11-19" },
  "km": 5156.2,
  "nota": 82.9,
  "comportamentos": [{ "chave": "hardBraking", "rotulo": "Frenagem brusca", "nota": 67.0 }],
  "meses": [{ "ano": 2026, "mes": 11, "nota": 99.8, "km": 6985.0 }]
}
```

- Regras:
  - Funcionário sem `new_infleetdriverid` → `situacao: "sem_cadastro"`, sem chamar a Infleet.
  - `km < 50` nos 90 dias ou `generalGrade` nulo → `situacao: "em_formacao"` (sem `nota`; comportamentos e meses vêm se houver).
  - `comportamentos`: só os não nulos, com rótulo em pt-BR fixo no plugin; ordenados da pior para a melhor nota.
  - `meses`: só meses com `km > 0` e nota não nula, em ordem cronológica.
  - Usuário sem motorista → `InvalidPluginExecutionException("Motorista não encontrado para este usuário.")`, como `new_AvaliarPosto`.
  - Falha da Infleet (HTTP, timeout, `errors`) → `InvalidPluginExecutionException` com mensagem curta ("Não foi possível consultar a Infleet agora."). Trace nunca leva token nem resposta crua; só a fonte do token e o status.
- Registro: `packages/plugins/scripts/register-notainfleet-customapi.ps1`, no padrão do `register-provamidia-customapi.ps1` (ids fixos, idempotente, `-Apply`, só DEV, inclui na AppBetinhos). Roda à mão do checkout principal na `develop`, depois que o Deploy publicar o assembly. PROD pelas soluções.

## App Motoristas

- Módulo "Minha nota" (ícone coerente e distinto) na grade da `InitialScreen`, antes de "Boas ideias"; tela `minhaNota` em `apps/motoristas/src/features/minha-nota/` (`rotas.tsx`, `MinhaNotaScreen.tsx`, `notaInfleet.ts`, css), seguindo o padrão de `meu-carro`/`treinamentos`.
- `notaInfleet.ts`: chama `executeCustomApi("new_NotaInfleet", {})`, valida `schema: 1` e mapeia; em modo mock (fora do Dataverse) devolve dados fictícios fixos.
- Tela:
  - Nota grande (arredondada, sem casa decimal) com faixa: ≥90 "Ótima", 75–89 "Boa", <75 "Atenção"; texto "Últimos 90 dias · N km".
  - Comportamentos em barras 0–100; as 2 piores abaixo de 90 marcadas como "O que melhorar".
  - Evolução: barras simples por mês (CSS, sem biblioteca), rótulo "nov/26".
  - Estados: carregando (skeleton), `em_formacao` ("Sua nota está em formação: precisa de pelo menos 50 km nos últimos 90 dias"), `sem_cadastro` ("Seu cadastro ainda não está ligado à telemetria. Fale com a operação."), erro/sem internet (mensagem + "Tentar de novo").
- Versão do App incrementa no build de publicação, como de costume.

## Testes

- C# (`Betinhos.DriverRecordSharing.Tests`): montagem da consulta (aliases, períodos em UTC a partir de São Paulo), parse da resposta, regras `sem_cadastro`/`em_formacao`/ordenação/meses vazios, erro da Infleet sem vazar token.
- Vitest (App): mapeamento e validação do JSON, faixas, "o que melhorar", estados da tela no mock.
- Prova no DEV depois do registro: motorista real com ID da Infleet vê a nota igual à do `driverProfile` de 90 dias.

## Riscos

- Nota da Infleet muda se a organização alterar pesos no painel dela; o App só reflete.
- Cada abertura da tela faz uma chamada à Infleet (~3 s); aceitável no MVP, cache entra se houver reclamação ou limite de taxa.
