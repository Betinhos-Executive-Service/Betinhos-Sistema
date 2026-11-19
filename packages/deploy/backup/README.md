# Backup externo do PROD (Cloudflare R2)

Cópia dos registros do PROD fora da Microsoft, feita pelo job `r2` do workflow "Backup do PROD"
(`.github/workflows/backup-prod.yml`), todo dia às 03:23 (Brasília) ou à mão (Actions → Backup do PROD → Run workflow, sempre na branch `main`).
O environment `prod` só aceita a `main`: o agendamento roda na `develop` (branch padrão) e só dispara o workflow na `main`;
execução à mão em outra branch pula os jobs de backup.
O job `power-platform` do mesmo workflow faz o `pac admin backup` (ponto de restauração dentro do Power Platform).

## O que vai

- As tabelas da Betinhos no PROD (`cr40f_*` e `new_*`), mais `account` e `contact`, um
  `<tabela>.ndjson.gz` por tabela (uma linha JSON por registro, como a Web API devolve) e `manifesto.json` (contagens e
  falhas). As personalizadas da plataforma (sem prefixo, `msdyn_*`) ficam fora: dados internos que não se restauram e
  que em parte o Dataverse nem deixa ler (17 falhas no primeiro backup, 18/11/2026).
- **Nunca** a `cr40f_segredo`: segredo não sai do Dataverse (ver CLAUDE.md, seção Segredos).
- Não vão: arquivos do SharePoint (fotos, comprovantes, anexos), anexos de anotação, colunas de arquivo, soluções/flows
  (esses estão no repositório). Outras tabelas padrão entram por `BACKUP_TABELAS_EXTRA` em `exportar-dataverse.mjs`
  (fora do workflow hoje: padrão `account,contact`). Para tirar tabelas grandes use a variável `BACKUP_TABELAS_EXCLUIR`
  do environment `prod` (vírgula).

Tudo vai num único `betinhos-prod-AAAAMMDD-HHMM.zip` com senha (AES-256, senha `BACKUP_SENHA`, abre no 7-Zip):

- `planilhas/`: um CSV por tabela para o time (`planilhas.mjs`): nome de exibição da tabela e das colunas, lookups e
  choices pelo rótulo, datas em Brasília, números com vírgula, colunas sempre vazias fora. Abre no Excel com dois cliques.
- `dados-tecnicos/`: os `.ndjson.gz` completos e o `manifesto.json`, para restaurar.
- `LEIA-ME.txt`: o que é cada pasta e o cuidado com dados pessoais.

O R2 só guarda o zip com senha; nada passa por artefato do GitHub (repositório público).

## Acesso do time (página dos backups)

`apps/backups` é um Worker (`backups-betinhos.<subdomínio>.workers.dev`) que lista as cópias do bucket e baixa a
escolhida, só leitura. O login é do **Cloudflare Access** (código por e-mail, fora da Microsoft, para funcionar mesmo
com o M365 fora do ar); quem entra é a lista de e-mails da política do app no Zero Trust. O Worker confere o token do
Access de novo (`src/acesso.mjs`, secrets `ACCESS_EQUIPE` e `ACCESS_AUD`) e recusa todo mundo se faltar configuração.
Cada download fica em Workers Logs (e-mail e arquivo). Quem baixa ainda precisa da `BACKUP_SENHA` para abrir.

Publicar: `pnpm --filter @betinhos/backups push` (wrangler logado na conta da Betinhos). Incluir ou tirar alguém:
Zero Trust → Access → Applications → backups-betinhos → política → e-mails.

## Rotação (10 GB gratuitos)

`retencao.mjs`: cada execução grava em `diario/`; no domingo também em `semanal/`; no dia 1 também em `mensal/`.
Ficam as **7 diárias, 8 semanais e 12 mensais** mais novas (cerca de 27 cópias, um ano para trás). A limpeza roda só
depois do envio e é por quantidade: se o backup parar de rodar, nenhuma cópia antiga some. Arquivo com outro nome ou
em outra pasta do bucket nunca é apagado. O resumo da execução mostra o tamanho de cada cópia e do bucket, com aviso
acima de 9 GB.

## Configurar (uma vez)

1. **Cloudflare** → R2 → criar o bucket (ex. `betinhos-backup-prod`), sem acesso público.
2. R2 → Manage API tokens → **Create API token**: permissão *Object Read & Write*, só neste bucket (a rotação precisa
   listar e apagar). Anote Access Key ID, Secret Access Key e o endpoint S3
   (`https://<id-da-conta>.r2.cloudflarestorage.com`).
3. **GitHub** → Settings → Environments → `prod`:
   - variáveis: `R2_ENDPOINT` (o endpoint acima), `R2_BUCKET` (nome do bucket);
   - secrets: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_SENHA`.
4. `BACKUP_SENHA`: senha longa e aleatória, **guardada também fora do GitHub** (gerenciador de senhas). Sem ela nenhuma
   cópia abre, e o objetivo é restaurar mesmo sem GitHub. Trocar a senha não recifra as cópias antigas: guarde as duas
   até as antigas saírem da rotação (um ano).
5. Rodar o workflow à mão na `main` uma vez e conferir no resumo o tamanho da cópia.

## Restaurar

Para consultar: página dos backups → Baixar → abrir com 7-Zip → `planilhas/`. Para restaurar pelo terminal (`aws` cli e
`7z`; pelo painel do R2 também dá para baixar):

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto
aws s3 ls --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/" --recursive
aws s3 cp --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/diario/betinhos-prod-AAAAMMDD-HHMM.zip" .
7z x -orestaurado betinhos-prod-AAAAMMDD-HHMM.zip   # pede a BACKUP_SENHA
zcat restaurado/dados-tecnicos/tabelas/cr40f_servico.ndjson.gz | head
```

Os registros ficam como a Web API devolve (ids, `_<lookup>_value`, choices numéricos, mais os valores formatados). Ainda **não há script de
reimportação** no Dataverse: recuperar um registro ou uma tabela hoje é consultar o arquivo e regravar (à mão ou com
script feito na hora, respeitando a ordem dos lookups). O ambiente em si (schema, telas, flows, plugins) volta pelas
soluções do repositório.

A pasta aberta tem dados pessoais (CPF, telefone, endereço): apagar depois de usar, nunca versionar nem anexar em issue.
