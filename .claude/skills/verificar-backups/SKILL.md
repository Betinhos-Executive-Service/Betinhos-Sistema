---
name: verificar-backups
description: "Verifica o backup do PROD (workflow \"Backup do PROD\", exportação do Dataverse, planilhas CSV do time, planilha de operação .xlsx, zip AES-256, rotação no R2) e a página dos backups (Worker apps/backups atrás do Cloudflare Access). Use após mudar .github/workflows/backup-prod.yml, packages/deploy/backup/** ou apps/backups/**."
---
# Verificar backups

## Cobre
- `.github/workflows/backup-prod.yml`: o agendamento (develop) dispara na `main`; jobs `power-platform` e `r2` só na `main` (environment `prod`).
- `packages/deploy/backup/`: `exportar-dataverse.mjs` (NDJSON + manifesto com nome, chave primária, rótulos, `semFuso`, `numericas`), `planilhas.mjs` (CSV pt-BR por tabela), `operacao.mjs` + `xlsx.mjs` (planilha de operação: abas Próximos serviços, Últimos 60 dias e Contatos, xlsx feito à mão porque o job `r2` roda node puro) e `LEIA-ME-operacao.txt`, `retencao.mjs` (7 diárias, 8 semanais, 12 mensais, contadas por tipo: `betinhos-prod-*` e `betinhos-prod-operacao-*`).
- `apps/backups/`: Worker `backups-betinhos` (lista e baixa do bucket `betinhos-backup-prod`; login pelo Access, token conferido em `src/acesso.mjs`).

## Roteiro
1. Testes: `pnpm --filter @betinhos/deploy test` e `pnpm --filter @betinhos/backups test`; `pnpm --filter @betinhos/backups check`.
2. Planilhas com dados do DEV (só leitura): exporte algumas tabelas do DEV com token do `az` (`az account get-access-token --resource <url do DEV>`) chamando `exportarTabela` e montando um `manifesto.json` como o de `exportar-dataverse.mjs`; rode `node packages/deploy/backup/planilhas.mjs <pasta> <saida>`. Confira na Geral (`cr40f_reservadeveculos`): cabeçalho com nomes de exibição em ordem alfabética, lookups e choices pelo nome, datas `dd/mm/aaaa HH:mm` em Brasília (coluna "independente de fuso" sem conversão), dinheiro cru com vírgula, nenhuma coluna de GUID técnico (chave primária, owninguser).
2b. Escopo (só leitura): passe `EntityDefinitions` do PROD (`$select=LogicalName,EntitySetName,TableType,DisplayName,PrimaryIdAttribute`) por `escolherTabelas`: só `cr40f_*`, `new_*`, `account` e `contact` (129 em 18/11/2026), sem `cr40f_segredo` e sem tabelas da plataforma (`flowlog`, `msdyn_*`), que o Dataverse recusa e deixavam a run vermelha.
2c. Planilha de operação: `node packages/deploy/backup/operacao.mjs <pasta> op.xlsx` (mesma pasta do passo 2) imprime `Operação: N próximos, N nos últimos 60 dias, N contatos.`; abra no LibreOffice (`soffice --headless --convert-to csv op.xlsx`) ou Excel: cabeçalho congelado com filtro, próximos em ordem crescente a partir da meia-noite de hoje (Brasília), histórico decrescente, cancelados com o status, veículo real antes do planejado (`placa · modelo`), telefone do motorista e do solicitante; sem valores nem faturamento.
3. Zip: `7z a -tzip -mem=AES256 -pX t.zip <pasta>`; `7z t -pX t.zip` passa e `7z t -perrada` falha.
4. Página local: em `apps/backups`, `npx wrangler r2 object put "betinhos-backup-prod/diario/betinhos-prod-AAAAMMDD-HHMM.zip" --file t.zip --local` (alguns em diario/semanal/mensal) e `pnpm dev` (porta 52431, `DEV_SEM_LOGIN` só vale em localhost). Conferir: card principal com status ("Backup em dia"; cópia com mais de 48 h = aviso vermelho "Backup parado" com `role="alert"`; sem cópia = "Aguardando a primeira cópia" sem botão), data da última cópia e botões "Baixar planilha de operação" (primário) e "Baixar backup completo · tamanho" (secundário, ponha também `betinhos-prod-operacao-<mesmo carimbo>.zip`); na lista anterior, dois ícones por linha; "Cópias anteriores" recolhida, sem repetir o mesmo arquivo de diario/semanal/mensal (etiquetas Semanal/Mensal); "Quem baixou" recolhida; rodapé com LGPD e espaço usado de 10 GB. Fontes e logo em `/estatico/*` (assets do Worker, CSP `img-src`/`font-src 'self'`). `/baixar/<chave>` devolve o zip e grava um objeto vazio em `registros/downloads/` (metadata e-mail e cópia) que aparece em "Quem baixou" (mais novo primeiro); `HEAD` sem corpo e sem registro; `/baixar/..%2Fx` = 404. Print em 1280 px e 375 px (`npx -y playwright@1.49.1 screenshot --full-page`): versão no rodapé sem cobrir nada.
   - O `compatibility_date` não pode passar do suportado pelo workerd local (o `wrangler dev` recusa).
5. Publicado (só com Access configurado): `https://backups-betinhos.<conta>.workers.dev` sem login cai no Access; com e-mail autorizado lista as cópias; e-mail fora da política é recusado. Sem os secrets `ACCESS_EQUIPE`/`ACCESS_AUD` o Worker responde 403 (falha fechada).
6. Workflow real: só pelo Renan ou com pedido explícito (`gh workflow run "Backup do PROD" --ref main`); conferir no resumo o tamanho do zip e as planilhas geradas. PROD é só leitura.

## Casos de borda
- Planilha que falha não derruba o backup (aviso no log, o zip vai só com os dados técnicos).
- Planilha de operação que falha (tabela de serviços vazia, erro no 7z) não derruba o completo: `::warning::` e só o completo sobe ao R2. Tabela de apoio ausente (`cr40f_funcionarios`, `cr40f_veiculos`, `cr40f_bancodedados`) gera `::warning::` e a planilha sai sem aqueles telefones.
- Planilha de operação sem o completo do mesmo carimbo: a página mostra só o botão que existe.
- Kid desconhecido no token busca as chaves do Access de novo uma vez.
- Nunca registrar dado real de cliente em evidência versionada (repositório público).
