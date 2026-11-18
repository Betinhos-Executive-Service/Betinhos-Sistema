# Backup externo do PROD (Cloudflare R2)

Cópia dos registros do PROD fora da Microsoft, feita pelo job `r2` do workflow "Backup do PROD"
(`.github/workflows/backup-prod.yml`), todo dia às 03:23 (Brasília) ou à mão (Actions → Backup do PROD → Run workflow, sempre na branch `main`).
O environment `prod` só aceita a `main`: o agendamento roda na `develop` (branch padrão) e só dispara o workflow na `main`;
execução à mão em outra branch pula os jobs de backup.
O job `power-platform` do mesmo workflow faz o `pac admin backup` (ponto de restauração dentro do Power Platform).

## O que vai

- Todas as tabelas personalizadas do PROD (`cr40f_*`, `new_*` e demais), mais `account` e `contact`, um
  `<tabela>.ndjson.gz` por tabela (uma linha JSON por registro, como a Web API devolve) e `manifesto.json` (contagens e
  falhas).
- **Nunca** a `cr40f_segredo`: segredo não sai do Dataverse (ver CLAUDE.md, seção Segredos).
- Não vão: arquivos do SharePoint (fotos, comprovantes, anexos), anexos de anotação, colunas de arquivo, soluções/flows
  (esses estão no repositório). Outras tabelas padrão entram por `BACKUP_TABELAS_EXTRA` em `exportar-dataverse.mjs`
  (fora do workflow hoje: padrão `account,contact`). Para tirar tabelas grandes use a variável `BACKUP_TABELAS_EXCLUIR`
  do environment `prod` (vírgula).

Tudo vai num único `betinhos-prod-AAAAMMDD-HHMM.tar.enc`, cifrado com AES-256 (PBKDF2, `artefato-cifrado.sh`) com a
senha `BACKUP_SENHA`. O R2 só guarda o arquivo cifrado; nada passa por artefato do GitHub (repositório público).

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

Baixar e abrir uma cópia (qualquer máquina com `aws` cli, `openssl` e `tar`; pelo painel do R2 também dá para baixar):

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto
aws s3 ls --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/" --recursive
aws s3 cp --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/diario/betinhos-prod-AAAAMMDD-HHMM.tar.enc" .
PACOTES_SENHA='<BACKUP_SENHA>' bash packages/deploy/solucoes/artefato-cifrado.sh decifrar betinhos-prod-AAAAMMDD-HHMM.tar.enc restaurado
zcat restaurado/tabelas/cr40f_servico.ndjson.gz | head
```

Os registros ficam como a Web API devolve (ids, `_<lookup>_value`, choices numéricos). Ainda **não há script de
reimportação** no Dataverse: recuperar um registro ou uma tabela hoje é consultar o arquivo e regravar (à mão ou com
script feito na hora, respeitando a ordem dos lookups). O ambiente em si (schema, telas, flows, plugins) volta pelas
soluções do repositório.

A pasta aberta tem dados pessoais (CPF, telefone, endereço): apagar depois de usar, nunca versionar nem anexar em issue.
