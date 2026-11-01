---
name: verificar-abastecimento
description: "Verifica a gestão de combustível do shell (#/abastecimento: importação de extratos CTF/Ticket Log/cartão, painel por veículo e motorista, anomalias, dicas e alertas, pendências), o contexto de combustível do Agente Frota em packages/agentes-ia e o provision da tabela cr40f_abastecimento. Use após mudar apps/shell/src/pages/abastecimento/**, packages/agentes-ia/src/abastecimento.ts ou packages/deploy/provision-abastecimento.ps1."
---
# Verificar Abastecimento

## Cobre
- Código: `apps/shell/src/pages/abastecimento/**` (domínio puro em `domain/`: `parse.ts` CSV/números/datas pt-BR, `arquivo.ts` CSV/XLSX, `mapeamento.ts` colunas por operadora salvas no navegador, `importacao.ts` dedupe/motorista/pendência, `indicadores.ts` km/l e resumos, `anomalias.ts`, `dicas.ts` propostas e contexto da IA; dados em `data/` (`queries.ts`, `source.ts`, `mock.ts`); UI em `AbastecimentoPage.tsx`, `components/ImportarDrawer.tsx`, `components/Paineis.tsx`, `components/AbastecimentosList.tsx`); rota `abastecimento` em `app/routes.tsx`, item Frota › Abastecimento (`nav/menu.ts`, ícone `Fuel` em `app/AppShell.tsx`).
- IA: `packages/agentes-ia/src/abastecimento.ts` (`SYSTEM_ABASTECIMENTO`, `montarContextoAbastecimento`, `obrigatoriosAbastecimento`) e os tipos `FrotaConsumo` e `FrotaDicaCombustivel` no fim de `TIPOS_POR_AGENTE.frota` (valores do choice `cr40f_tipo` = 100000000 + índice; `provision-agentes-schema.ps1` acrescenta as opções com `GarantirOpcoes`).
- Schema no DEV: `packages/deploy/provision-abastecimento.ps1` (tabela `cr40f_abastecimento` UserOwned, lookups `cr40f_Veiculo` → `cr40f_veiculos` e `cr40f_Motorista` → `cr40f_funcionarios` com RemoveLink, choice `cr40f_origem` CTF/Ticket Log/App Motoristas/Crédito, chave alternativa em `cr40f_chave`, coluna `cr40f_capacidadetanque` em `cr40f_veiculos`).

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/abastecimento src/nav` → todos passam (30 testes no módulo em 01/11/2026: `domain/domain.test.ts` parser, mapeamento, importação, indicadores, anomalias, dicas e contexto; `domain/arquivo.test.ts` CSV UTF-8/1252 e XLSX mínimo; `AbastecimentoPage.test.tsx` painel, filtros, anomalias, importação, reimportação, confirmação ao fechar, mapeamento incompleto, pendência, chaves já gravadas no servidor, conferência que falha bloqueia, aviso das despesas do App, erro de carga). Fora do módulo, `src/app/useDocumentosBadge.test.ts` falha desde 01/11/2026 porque compara o mock de 13/10 com o dia de hoje; não é regressão deste módulo.
2. `cd packages/agentes-ia && pnpm test && pnpm typecheck` → 28 testes (contexto vazio, obrigatórios, tipos no schema e no agente, prompt cita as três regras).
3. `pnpm typecheck` na raiz → sem erros. Suíte completa (`pnpm test`) antes do PR.

## Dados do mock (`pnpm dev`)
`data/mock.ts` gera relativo a hoje; a página recarrega o mock ao sair e voltar (importações somem).
- TST1A11 (Toyota Corolla, tanque 50 L, Carlos Alberto Teste): a cada 4 dias, 40 L, ~11 km/l. Semeados: 54 L há 12 dias (anomalia "Acima do tanque"), trecho de 4,5 km/l há 28 dias ("Consumo fora da curva"), dois abastecimentos com 35 min de diferença há 8 dias ("Dois em menos de 1 h"), um de Crédito sem odômetro há 15 dias.
- TST2B22 (VW Virtus, Bruna Ficticia Lima): metade sem odômetro → dica "odômetro em branco". Uma despesa do App no mesmo dia e valor de um extrato → "1 despesa do App já no extrato" no cartão Gasto.
- TST4D44 (Kia Carnival, Diego Exemplo Rocha, sem capacidade cadastrada): 60 L, 7,0 km/l, preço ~8% acima → dica "paga R$ …/L, frota R$ …/L"; uma despesa só do App (origem App na lista).
- XYZ9Z99: placa sem cadastro → aba Pendências.

## Roteiro em mock (navegador)
Com `pnpm dev` rodando em `apps/shell` (porta da sessão; na VM cloud 36472):
`PLAYWRIGHT_MODULE=<playwright> CHROMIUM=<chrome> node .claude/skills/verificar-abastecimento/fluxo-mock.cjs <pasta-dos-prints> [desktop|mobile|ambos] [http://localhost:<porta>/]` (na VM cloud os padrões `/opt/node-tools` e `/opt/pw-browsers` servem). Uma linha ✅/❌ por passo e prints `<viewport>-NN-<passo>.png`:
1. Painel por veículo com "Dados de exemplo", versão do build no canto, sem rolagem horizontal em 1366 px; TST4D44 com 7,0 km/l.
2. Filtro Motorista = Bruna → só TST2B22 e `motorista=m2` na URL; o filtro Mês lista "Todos os meses" e os meses com dado.
3. Aba Abastecimentos: busca "Graal" acha as linhas do posto; colunas Data, Veículo, Motorista, Litros, Valor, Preço/L, km/l, Origem, Posto (Odômetro oculta na visão padrão); visões prontas "Só CTF/Ticket Log/App/Crédito" e "Sem odômetro".
4. Aba Anomalias: "54,0 L em um tanque de 50 L", "35 min depois do anterior (…)" e "Consumo fora da curva" com o km/l e o histórico ± desvio.
5. Aba Dicas e alertas: alerta "TST1A11: N anomalias de abastecimento" (prioridade alta), dicas "Diego Exemplo Rocha: paga …" e "Bruna Ficticia Lima: odômetro em branco em …"; "Copiar para WhatsApp" e "Copiar contexto da IA".
6. Importar extrato com `exemplo-ctf.csv` (`;`, vírgula decimal, aspas, placa com hífen, nome abreviado "Bruna Lima", linha duplicada, linha sem data): mapeamento sugerido pelos cabeçalhos do CTF; "3 abastecimentos novos para importar", "1 linha já importada", "1 linha com placa sem cadastro", "1 linha inválida: linha 6 sem data"; Importar → "3 abastecimentos importados"; "Ver pendências" mostra ZZZ0Z00.
7. Importar o mesmo arquivo de novo → "Nada novo para importar", "4 linhas já importadas", botão Importar desabilitado; fechar pelo X → "Descartar importação?" (Continuar / Descartar).
8. Operadora Ticket Log com `exemplo-ticket.csv` (vírgula, ponto decimal, data ISO, cabeçalhos em maiúsculas) → "2 abastecimentos novos", importa, e `localStorage['betinhos.abastecimento.mapeamento.ticket']` guarda o mapeamento.
9. Aba Pendências: escolher TST2B22 para XYZ9Z99 e Vincular → toast "XYZ9Z99 vinculada ao veículo." e a pendência some.
10. Console sem `console.error` nem `pageerror`.

## Verificação no DEV (só depois do merge)
Só na `main` do checkout principal, com `git pull`. Nunca em worktree ou sessão cloud; nunca PROD (o script recusa o host de PROD e `DV_BLOCKED_HOSTS`).
1. Conferir o `.ps1` no Windows: parser sem erros e BOM (`ef bb bf`). Rodar com `powershell.exe` (5.1).
2. `powershell.exe -File packages/deploy/provision-abastecimento.ps1` (dry run) → "DRY RUN criaria a tabela cr40f_abastecimento" e "DRY RUN criaria cr40f_veiculos.cr40f_capacidadetanque". Depois `-Apply` → `SCHEMA OK`; conferir `cr40f_data` UserLocal, `cr40f_origem` com 4 opções na ordem CTF, Ticket Log, App Motoristas, Crédito (igual a `ORIGEM_VALOR`), lookups com RemoveLink, chave alternativa `cr40f_abastecimento_chave` com índice Active.
3. `provision-agentes-schema.ps1` (dry run e `-Apply`) para o choice `cr40f_tipo` ganhar `FrotaConsumo` (100000021) e `FrotaDicaCombustivel` (100000022).
4. Privilégios: copiar para `cr40f_abastecimento` os papéis que acessam `cr40f_veiculos` (criar `conceder-privilegios-abastecimento.ps1` nos moldes de `conceder-privilegios-equipamentos.ps1`); sem `prvCreate` a importação falha com a mensagem do Dataverse no resumo.
5. Preencher `cr40f_capacidadetanque` nos veículos (sem valor a regra do tanque fica desligada para o veículo).
6. `pnpm push` e commit do bump. Teste autenticado em `…/cr40f_SistemaBetinhos.html#/abastecimento`: importar um extrato real do CTF (aba Rede: um POST em `cr40f_abastecimentos` por linha nova com `cr40f_chave`, `cr40f_Veiculo@odata.bind`, `cr40f_Motorista@odata.bind`); reimportar → 0 novos; despesas de combustível do App do período aparecem com origem App e as cobertas pelo extrato saem do total; antes do provision a página mostra "Tabela cr40f_abastecimento não encontrada na metadata." sem cair em mock.

## Casos de borda
- CSV com `;`/`,`/tab e vírgula decimal; `123.456` (ponto em grupos de três) é milhar; `45.9` é decimal. Windows-1252 cai automaticamente se o UTF-8 vier quebrado. XLSX: só a primeira aba; data sem formato vem como número de série e é convertida.
- Odômetro ausente quebra a sequência: o abastecimento seguinte fica sem km/l (sem erro). Salto > 5.000 km ou odômetro que não avança também não gera trecho.
- Anomalia de consumo exige 4 trechos no veículo; compara cada trecho com os demais (desvio mínimo 10% da média).
- Motorista: nome igual ou primeiro+último iguais; homônimos só se resolvem pelo motorista atual do veículo; extrato sem nome usa o motorista atual do veículo.
- Despesa do App coberta pelo extrato = mesmo veículo, mesmo dia e valor com até R$ 0,50 de diferença.

## Limites
- A deduplicação confere no servidor as chaves do intervalo de datas do arquivo (`Source.chaves`); falha nessa conferência bloqueia a importação.
- Flow agendado que envia o contexto ao Agente Frota e a Custom API para calcular no servidor ficam fora: hoje o contexto sai da tela ("Copiar contexto da IA") e `SYSTEM_ABASTECIMENTO` está pronto para o flow.
- Schema, privilégios e teste com extrato real só no DEV, pela main.
