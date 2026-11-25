# Acessos por perfil, plano 4: o corte

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** tirar da equipe `Team-Betinhos-MDA` os papéis antigos (`Acesso-Betinhos-MDA` e, no DEV, `DEV - Usuário`), deixando só `Perfil - Base`; tirar das pessoas os papéis antigos diretos e o Administrador do Sistema direto (menos as pessoas configuradas); tudo pelo Deploy (DEV) e pela Produção (PROD), com relatório que trava, foto cifrada e desfazer versionado. Depois do corte do PROD, proteger as colunas de contato do passageiro em `cr40f_bancodedados`.

**Arquitetura:** lógica pura em `packages/deploy/acessos/corte-regras.mjs` (privilégios antes e depois, critério de 90 dias, travas, plano do corte, foto e desfazer), leitura do Dataverse em `corte-estado.mjs` sobre o cliente comum `dv.mjs`, relatório somente leitura em `relatorio-corte.mjs` e a execução em `corte.mjs`. Um workflow reutilizável `.github/workflows/acessos-corte.yml` roda num job `acessos` do Deploy (DEV, depois do job `dev`) e da Produção (PROD, depois do `marcar`). O modo de cada ambiente vem de `packages/deploy/acessos/corte.json`. Os papéis antigos não são alterados: só as associações (equipe ↔ papel, pessoa ↔ papel). A proteção do passageiro é uma migration que o CI só aceita depois do corte do PROD; ela chega ao PROD pela "Publicar soluções" como qualquer schema.

**Stack:** Node 22 (`node:test`, `fetch`, `node:util` `parseArgs`), Dataverse Web API v9.2, GitHub Actions (workflow reutilizável, artefato cifrado com `packages/deploy/solucoes/artefato-cifrado.sh`), PowerShell 5.1 na migration (`_dv.ps1`, `aplicar-perfis.ps1`).

**Spec:** `docs/superpowers/specs/2026-11-23-acessos-por-perfil-design.md` mais as decisões do Renan de 24/11/2026 copiadas abaixo.

**Planos irmãos:** `docs/superpowers/plans/2026-11-23-acessos-por-perfil-1-backend.md` (papéis `Perfil - *`, motor e Custom API), `2026-11-23-acessos-por-perfil-2-shell.md` (tela `#/acessos`), `2026-11-24-acessos-por-perfil-3-niveis-telas.md` (níveis por tela). Este plano só começa a ativar depois de os perfis estarem atribuídos (passo (a) da ativação).

## Decisões do Renan (24/11/2026) que este plano segue

1. Corte = troca dos papéis da equipe. Papéis antigos nunca são alterados (estão na BetinhosCore; `DEV - Usuário` também em Active). Quem tem papel antigo direto perde o papel direto. Duas pessoas continuam Administrador do Sistema direto; vêm de `ACESSOS_ADMINS_MANTER` (variável do environment), nunca do repositório. Desfazer = devolver à equipe e às pessoas o que a foto guardou.
2. Integrado ao Deploy e à Produção; `corte.json` liga por ambiente; idempotente; foto cifrada antes de aplicar; desfazer versionado; conta de serviço.
3. Trava: o relatório precisa zerar. Critério por pessoa ativa: tabelas em que perderia criar/gravar (antes = equipes + diretos; depois = Base + perfis diretos) E em que criou ou alterou registro nos últimos 90 dias. Leitura não trava; vai como informativo.
4. Flows ligados: trava se o dono perde privilégio numa tabela do flow; se as tabelas do flow não forem conhecidas com segurança, trava em todo flow ligado cujo dono não seja a conta de serviço nem admin mantido. Referências de conexão de quem perde acesso: informativo.
5. Passageiro: `cr40f_telefone`, `cr40f_email`, `cr40f_datadenascimento` (DateTime) e `cr40f_enderecodesaida` protegidas por migration, coluna antes da permissão; Operacional edita, Financeiro lê, `Motoristas` lê telefone e endereço de saída, perfil novo `Passageiros - automação` para conta de serviço e donos de flow.
6. Motor `aplicar-perfis.ps1` não muda; código novo em Node; `dv.mjs` extraído com testes.

## Restrições globais

- PROD só muda pelo GitHub (workflow); nenhum passo do plano roda contra o PROD à mão. MCP `Dataverse_PROD` é somente leitura.
- Repositório público: nada de nome de pessoa, id real de usuário/equipe, CPF, `sig=`, token ou segredo em código, teste, plano, commit, PR ou log do Actions; saída com dados de pessoas só em artefato cifrado.
- Segredo/credencial nunca em variável de ambiente nova, código ou solução (tabela `cr40f_segredo`); ids de pessoas a manter não são segredo, mas não vão para o repo: variável do environment.
- Sessões/worktrees nunca rodam `pnpm push`, `sitemap:*`, `push:plugin:*`, `provision-*`; `Connect-Dv` recusa host que não é o DEV para scripts locais.
- Testes locais só dos arquivos tocados (node:test/vitest conforme o pacote, `--maxWorkers=2`); suíte completa no CI.
- PR para `develop`, merge do Renan; commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Regras deste plano que derivam delas:
- Todo id nos testes é sintético (`00000000-0000-0000-0000-0000000000NN`).
- `relatorio-corte.mjs` e `corte.mjs` só gravam ids reais em pasta fora do repositório (`foraDoRepo`); o stdout tem contagens e `hashCurto` (10 hex de sha256 com o host como sal).
- `--aplicar` só vale com `GITHUB_ACTIONS=true` e token da conta de serviço; com `DV_ACCESS_TOKEN` (local) só DEV e sempre dry-run.

## Mapa de arquivos

| Arquivo | Ação | Tarefa |
|---|---|---|
| `packages/deploy/acessos/corte.json` | criar | 1 |
| `packages/deploy/acessos/corte-regras.mjs` / `.test.mjs` | criar | 1, 3, 4, 5 |
| `packages/deploy/acessos/dv.mjs` / `dv.test.mjs` | criar | 2 |
| `packages/deploy/acessos/quem-le.mjs` | editar (usa `dv.mjs`) | 2, 13 |
| `packages/deploy/acessos/corte-estado.mjs` / `.test.mjs` | criar | 6 |
| `packages/deploy/acessos/relatorio-corte.mjs` | criar | 7 |
| `packages/deploy/acessos/corte.mjs` | criar | 8 |
| `packages/deploy/caminho-publicacao.mjs` / `.test.mjs` | editar | 9 |
| `packages/deploy/package.json` | editar (lista de testes) | 1, 2, 6, 12 |
| `.github/workflows/acessos-corte.yml` | criar | 10 |
| `.github/workflows/deploy.yml` | editar (paths e job `acessos`) | 10 |
| `.github/workflows/producao.yml` | editar (job `acessos`) | 11 |
| `packages/deploy/acessos/corte-ci.mjs` / `.test.mjs`, `.github/workflows/ci.yml` | criar / editar | 12 |
| `apps/shell/src/nav/acessosColunas.json`, `packages/deploy/acessos/perfis.gerado.json`, `gerar.test.mjs` | editar | 13 |
| `packages/deploy/migrations/AAAAMMDD-HHMM-acessos-passageiro.ps1` | criar (PR próprio, depois do corte do PROD) | 13 |
| `packages/deploy/acessos/prova.mjs` | editar só o cabeçalho | 13 |
| `.claude/skills/verificar-acessos/SKILL.md`, `CLAUDE.md` | editar | 14 |

## Vocabulário

- **Equipe do corte:** `Team-Betinhos-MDA`.
- **Papéis antigos:** `Acesso-Betinhos-MDA` e `DEV - Usuário`. **Admin:** `Administrador do Sistema` / `System Administrator`.
- **Plano do corte:** `{ equipeRemover, equipeAdicionar, pessoasRemover }`. Vazio = ambiente já cortado (idempotência).
- **Perdas:** por pessoa, `escrita` (tabelas em que Create ou Write cai de nível) e `leitura` (só Read cai).
- **Uso recente:** a pessoa é `createdby` ou `modifiedby` de algum registro da tabela com data `ge` hoje − 90 dias (00:00 UTC).
- **Trava:** pessoa com perda de escrita em tabela usada (ou tabela sem medida), flow ligado em risco, ou admin a manter inválido. Relatório "zero" = nenhuma trava.
- **Foto:** JSON v1 com o que o plano tira (papéis da equipe e papéis diretos por pessoa), cifrado no artefato `acessos-foto-<ambiente>` (90 dias).
- **Tag `acessos-corte-<ambiente>`:** marca que o corte começou no ambiente; o desfazer só age com ela e a apaga no fim.
- **Modo:** valor do ambiente em `corte.json`: `esperar`, `cortar` ou `desfazer`.

---

### Tarefa 1: `corte.json` e leitura dos parâmetros

**Arquivos:** criar `packages/deploy/acessos/corte.json`, `packages/deploy/acessos/corte-regras.mjs`, `packages/deploy/acessos/corte-regras.test.mjs`; editar `packages/deploy/package.json`.

**Interfaces.** Consome: nada. Produz: `AMBIENTES`, `MODOS`, `EQUIPE`, `PAPEL_BASE`, `PAPEIS_ANTIGOS`, `ADMIN`, `DIAS`, `NIVEL`, `ESCRITA`, `PERFIL_AUTOMACAO`, `GUID`, `lerCorte(texto, ambiente) → modo`, `lerIds(texto) → string[]`, `desde(hoje, dias?) → ISO`.

- [ ] **Passo 1: teste que falha.** Criar `packages/deploy/acessos/corte-regras.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desde, lerCorte, lerIds } from './corte-regras.mjs'

test('corte.json: lê o modo de cada ambiente', () => {
  const texto = '﻿{ "dev": "cortar", "prod": "esperar" }'
  assert.equal(lerCorte(texto, 'dev'), 'cortar')
  assert.equal(lerCorte(texto, 'prod'), 'esperar')
})

test('corte.json: recusa modo, chave, ambiente e JSON inválidos', () => {
  assert.throws(() => lerCorte('{ "dev": "ligar", "prod": "esperar" }', 'dev'), /dev precisa ser/)
  assert.throws(() => lerCorte('{ "dev": "esperar", "prod": "esperar", "test": "cortar" }', 'dev'), /chave desconhecida test/)
  assert.throws(() => lerCorte('{ "dev": "esperar", "prod": "esperar" }', 'test'), /ambiente desconhecido/)
  assert.throws(() => lerCorte('{ dev: esperar }', 'dev'), /não é JSON válido/)
  assert.throws(() => lerCorte('{ "dev": "esperar" }', 'prod'), /prod precisa ser/)
})

test('o corte.json versionado começa esperando nos dois ambientes', async () => {
  const { readFileSync } = await import('node:fs')
  const texto = readFileSync(new URL('./corte.json', import.meta.url), 'utf8')
  assert.equal(lerCorte(texto, 'dev'), 'esperar')
  assert.equal(lerCorte(texto, 'prod'), 'esperar')
})

test('ids da variável: vírgulas, espaços, maiúsculas e repetidos', () => {
  assert.deepEqual(lerIds(''), [])
  assert.deepEqual(lerIds(undefined), [])
  assert.deepEqual(
    lerIds(' 00000000-0000-0000-0000-0000000000AA , 00000000-0000-0000-0000-0000000000aa,00000000-0000-0000-0000-0000000000bb '),
    ['00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000bb'],
  )
  assert.throws(() => lerIds('00000000-0000-0000-0000-0000000000aa, fulano'), /1 id\(s\) fora do formato GUID/)
})

test('janela de 90 dias começa à 00:00 UTC', () => {
  assert.equal(desde(new Date('2026-11-24T15:00:00Z')), '2026-08-26T00:00:00Z')
  assert.equal(desde(new Date('2026-11-24T02:00:00Z'), 1), '2026-11-23T00:00:00Z')
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → falha com `Cannot find module ... corte-regras.mjs`.

- [ ] **Passo 3: implementar.** Criar `packages/deploy/acessos/corte.json`:

```json
{
  "dev": "esperar",
  "prod": "esperar"
}
```

Criar `packages/deploy/acessos/corte-regras.mjs`:

```js
// Regras puras do corte dos acessos (plano 4 dos acessos por perfil). Sem rede: corte-estado.mjs lê o Dataverse e
// entrega o estado; relatorio-corte.mjs e corte.mjs só combinam estas funções. Nada aqui imprime id ou nome de pessoa.
import { hashCurto } from './dv.mjs'

export const AMBIENTES = ['dev', 'prod']
export const MODOS = ['esperar', 'cortar', 'desfazer']
export const EQUIPE = 'Team-Betinhos-MDA'
export const PAPEL_BASE = 'Perfil - Base'
// Saem da equipe e de quem os tem direto. Os papéis em si nunca mudam (estão na BetinhosCore).
export const PAPEIS_ANTIGOS = ['Acesso-Betinhos-MDA', 'DEV - Usuário']
export const ADMIN = ['Administrador do Sistema', 'System Administrator']
export const DIAS = 90
export const NIVEL = { Basic: 1, Local: 2, Deep: 4, Global: 8 }
export const ESCRITA = ['Create', 'Write']
export const PERFIL_AUTOMACAO = 'Passageiros - automação'
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function lerCorte(texto, ambiente) {
  if (!AMBIENTES.includes(ambiente)) throw new Error(`ambiente desconhecido: ${ambiente}`)
  let json
  try {
    json = JSON.parse(String(texto).replace(/^﻿/, ''))
  } catch {
    throw new Error('corte.json não é JSON válido')
  }
  const extras = Object.keys(json).filter((k) => !AMBIENTES.includes(k))
  if (extras.length) throw new Error(`corte.json: chave desconhecida ${extras.join(', ')}`)
  const modo = json[ambiente]
  if (!MODOS.includes(modo)) throw new Error(`corte.json: ${ambiente} precisa ser ${MODOS.join(' | ')}`)
  return modo
}

export function lerIds(texto) {
  const ids = String(texto ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const ruins = ids.filter((id) => !GUID.test(id))
  if (ruins.length) throw new Error(`${ruins.length} id(s) fora do formato GUID na variável`)
  return [...new Set(ids)]
}

export function desde(hoje, dias = DIAS) {
  const meiaNoite = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  return new Date(meiaNoite - dias * 86_400_000).toISOString().replace('.000Z', 'Z')
}
```

O `import { hashCurto } from './dv.mjs'` só resolve depois da Tarefa 2. Para esta tarefa passar sozinha, faça a Tarefa 2 antes do Passo 4 ou crie já o `dv.mjs` da Tarefa 2 (ordem recomendada: Tarefa 2 inteira, depois esta).

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `fail 0`.

- [ ] **Passo 5: lista de testes do pacote.** Em `packages/deploy/package.json`, no script `test`, trocar o final `acessos/gerar.test.mjs"` por `acessos/gerar.test.mjs acessos/corte-regras.test.mjs"`.

- [ ] **Passo 6: commit.**

```bash
git add packages/deploy/acessos/corte.json packages/deploy/acessos/corte-regras.mjs packages/deploy/acessos/corte-regras.test.mjs packages/deploy/package.json
git commit -m "feat(acessos): corte.json por ambiente e leitura dos parâmetros do corte

corte.json começa em esperar no DEV e no PROD. lerCorte recusa modo,
chave e JSON inválidos; lerIds normaliza a lista de ids da variável do
environment; desde() dá o início da janela de 90 dias em UTC.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: cliente comum `dv.mjs` e `quem-le.mjs` sobre ele

**Arquivos:** criar `packages/deploy/acessos/dv.mjs`, `packages/deploy/acessos/dv.test.mjs`; editar `packages/deploy/acessos/quem-le.mjs`, `packages/deploy/package.json`. `prova.mjs` não muda (o `chamar` dele devolve status para os cenários e só roda no DEV; trocar não traz ganho).

**Interfaces.** Consome: `fetch`. Produz: `HOSTS`, `limpo(texto)`, `hashCurto(id, sal)`, `ambienteDoHost(url)`, `tokenDoAmbiente({ env, fetch, somenteDevLocal }) → { url, ambiente, token, local }`, `criarCliente({ url, token, fetch, espera }) → { api, chamar(metodo, caminho, corpo?, extra?), todos(caminho), um(caminho), ligacao(logico, campos) }`.

- [ ] **Passo 1: teste que falha.** Criar `packages/deploy/acessos/dv.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOSTS, ambienteDoHost, criarCliente, hashCurto, limpo, tokenDoAmbiente } from './dv.mjs'

const URL_DEV = `https://${HOSTS.dev}`
const resposta = (status, corpo, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(cabecalhos),
  text: async () => (corpo === undefined ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
})
function falso(respostas) {
  const chamadas = []
  const fetch = async (url, init = {}) => {
    chamadas.push({ url, init })
    return respostas.shift()
  }
  return { fetch, chamadas }
}

test('todos segue o nextLink e pede páginas de 500', async () => {
  const proxima = `${URL_DEV}/api/data/v9.2/roles?$skiptoken=2`
  const { fetch, chamadas } = falso([resposta(200, { value: [1], '@odata.nextLink': proxima }), resposta(200, { value: [2] })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  assert.deepEqual(await dv.todos('roles?$select=name'), [1, 2])
  assert.equal(chamadas[0].url, `${URL_DEV}/api/data/v9.2/roles?$select=name`)
  assert.equal(chamadas[1].url, proxima)
  assert.equal(chamadas[0].init.headers.Prefer, 'odata.maxpagesize=500')
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer t')
})

test('chamar repete 429 e 5xx e depois devolve o JSON', async () => {
  const esperas = []
  const { fetch } = falso([resposta(429, 'devagar', { 'Retry-After': '1' }), resposta(503, 'fora'), resposta(200, { ok: 1 })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch, espera: async (ms) => esperas.push(ms) })
  assert.deepEqual(await dv.chamar('GET', 'WhoAmI'), { ok: 1 })
  assert.deepEqual(esperas, [1000, 4000])
})

test('erro sai sem GUID e 204 vira null', async () => {
  const id = '00000000-0000-0000-0000-000000000001'
  const { fetch } = falso([resposta(400, `papel ${id} recusado`), resposta(204)])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  await assert.rejects(dv.chamar('DELETE', `teams(${id})/teamroles_association(${id})/$ref`), (e) => {
    assert.match(e.message, /DELETE teams\(<id>\)\/teamroles_association\(<id>\)\/\$ref falhou: 400 papel <id> recusado/)
    assert.doesNotMatch(e.message, /0000-0000/)
    return true
  })
  assert.equal(await dv.chamar('POST', 'x', { a: 1 }), null)
})

test('corpo vai em JSON com Content-Type e cabeçalho extra passa', async () => {
  const { fetch, chamadas } = falso([resposta(204)])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  await dv.chamar('POST', 'teams(x)/teamroles_association/$ref', { '@odata.id': 'r' }, { MSCRMCallerID: 'u' })
  assert.equal(chamadas[0].init.body, '{"@odata.id":"r"}')
  assert.equal(chamadas[0].init.headers['Content-Type'], 'application/json')
  assert.equal(chamadas[0].init.headers.MSCRMCallerID, 'u')
})

test('ligacao pega o EntitySetName da metadata', async () => {
  const { fetch, chamadas } = falso([resposta(200, { EntitySetName: 'teamrolescollection' }), resposta(200, { value: [{ teamid: 'a' }] })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  assert.deepEqual(await dv.ligacao('teamroles', 'teamid,roleid'), [{ teamid: 'a' }])
  assert.equal(chamadas[0].url, `${URL_DEV}/api/data/v9.2/EntityDefinitions(LogicalName='teamroles')?$select=EntitySetName`)
  assert.equal(chamadas[1].url, `${URL_DEV}/api/data/v9.2/teamrolescollection?$select=teamid,roleid`)
})

test('token: host desconhecido e PROD local são recusados', async () => {
  await assert.rejects(tokenDoAmbiente({ env: { DV_URL: 'https://outro.crm2.dynamics.com', DV_ACCESS_TOKEN: 't' } }), /não é o DEV nem o PROD/)
  await assert.rejects(tokenDoAmbiente({ env: { DV_URL: `https://${HOSTS.prod}/`, DV_ACCESS_TOKEN: 't' } }), /PROD só pelo workflow/)
  const prod = await tokenDoAmbiente({ env: { DV_URL: `https://${HOSTS.prod}/`, DV_ACCESS_TOKEN: 't' }, somenteDevLocal: false })
  assert.deepEqual(prod, { url: `https://${HOSTS.prod}`, ambiente: 'prod', token: 't', local: true })
})

test('token: conta de serviço pede client_credentials com o escopo do ambiente', async () => {
  const { fetch, chamadas } = falso([resposta(200, { access_token: 'srv' })])
  const env = { DV_ENVIRONMENT_URL: `${URL_DEV}/`, DV_TENANT_ID: 'ten', DV_CLIENT_ID: 'cli', DV_CLIENT_SECRET: 'seg' }
  const s = await tokenDoAmbiente({ env, fetch })
  assert.deepEqual(s, { url: URL_DEV, ambiente: 'dev', token: 'srv', local: false })
  assert.equal(chamadas[0].url, 'https://login.microsoftonline.com/ten/oauth2/v2.0/token')
  const corpo = new URLSearchParams(String(chamadas[0].init.body))
  assert.equal(corpo.get('grant_type'), 'client_credentials')
  assert.equal(corpo.get('scope'), `${URL_DEV}/.default`)
  await assert.rejects(tokenDoAmbiente({ env: { DV_ENVIRONMENT_URL: URL_DEV }, fetch }), /faltam DV_TENANT_ID/)
})

test('hash curto, limpo e host', () => {
  const id = '00000000-0000-0000-0000-0000000000AB'
  assert.match(hashCurto(id, 'h'), /^[0-9a-f]{10}$/)
  assert.equal(hashCurto(id, 'h'), hashCurto(id.toLowerCase(), 'h'))
  assert.notEqual(hashCurto(id, 'h'), hashCurto(id, 'outro'))
  assert.equal(limpo(`x ${id} y`), 'x <id> y')
  assert.equal(ambienteDoHost(`https://${HOSTS.dev.toUpperCase()}/`), 'dev')
  assert.equal(ambienteDoHost('https://outro.crm2.dynamics.com'), null)
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/dv.test.mjs` → `Cannot find module ... dv.mjs`.

- [ ] **Passo 3: implementar.** Criar `packages/deploy/acessos/dv.mjs`:

```js
// Cliente comum da Web API para os scripts de acessos (corte, relatório, quem-le). Sem efeito ao importar.
// Token: no CI, conta de serviço (client_credentials, como projetos/publicados.mjs); local, DV_ACCESS_TOKEN do az,
// que por padrão só vale para o DEV. Mensagens de erro saem sem GUID (o log do Actions é público).
import { createHash } from 'node:crypto'

export const HOSTS = { dev: 'org23b93544.crm2.dynamics.com', prod: 'orgf261ae8e.crm2.dynamics.com' }
const GUID_EM_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export const limpo = (texto) => String(texto ?? '').replace(GUID_EM_TEXTO, '<id>')
export const hashCurto = (id, sal) => createHash('sha256').update(`${sal}|${String(id).toLowerCase()}`).digest('hex').slice(0, 10)

export function ambienteDoHost(url) {
  const host = new URL(url).host.toLowerCase()
  return Object.keys(HOSTS).find((k) => HOSTS[k] === host) ?? null
}

export async function tokenDoAmbiente({ env = process.env, fetch = globalThis.fetch, somenteDevLocal = true } = {}) {
  const url = String(env.DV_ENVIRONMENT_URL ?? env.DV_URL ?? '').replace(/\/+$/, '')
  if (!url) throw new Error('Defina DV_ENVIRONMENT_URL (CI) ou DV_URL (local).')
  const ambiente = ambienteDoHost(url)
  if (!ambiente) throw new Error('host não é o DEV nem o PROD; nada feito')
  if (env.DV_ACCESS_TOKEN) {
    if (somenteDevLocal && ambiente !== 'dev') throw new Error('token local só vale para o DEV; o PROD só pelo workflow')
    return { url, ambiente, token: env.DV_ACCESS_TOKEN, local: true }
  }
  const { DV_TENANT_ID: tenant, DV_CLIENT_ID: cliente, DV_CLIENT_SECRET: segredo } = env
  if (!tenant || !cliente || !segredo) throw new Error('faltam DV_TENANT_ID, DV_CLIENT_ID ou DV_CLIENT_SECRET')
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cliente, client_secret: segredo, scope: `${url}/.default` }),
  })
  if (!r.ok) throw new Error(`token da conta de serviço falhou: ${r.status}`)
  return { url, ambiente, token: JSON.parse(await r.text()).access_token, local: false }
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))

export function criarCliente({ url, token, fetch = globalThis.fetch, espera = dormir }) {
  const api = `${url.replace(/\/+$/, '')}/api/data/v9.2`
  async function chamar(metodo, caminho, corpo, extra = {}) {
    const alvo = caminho.startsWith('http') ? caminho : `${api}/${caminho}`
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra }
    if (corpo !== undefined) headers['Content-Type'] = 'application/json'
    for (let tentativa = 1; ; tentativa++) {
      const r = await fetch(alvo, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
      if ((r.status === 429 || r.status >= 500) && tentativa < 4) {
        const depois = Number(r.headers?.get?.('Retry-After'))
        await espera(depois > 0 ? depois * 1000 : 2000 * tentativa)
        continue
      }
      const texto = await r.text()
      if (!r.ok) throw new Error(`${metodo} ${limpo(caminho.replace(api + '/', '').split('?')[0])} falhou: ${r.status} ${limpo(texto.slice(0, 300))}`)
      return texto ? JSON.parse(texto) : null
    }
  }
  async function todos(caminho) {
    const linhas = []
    let proxima = caminho
    while (proxima) {
      const j = await chamar('GET', proxima, undefined, { Prefer: 'odata.maxpagesize=500' })
      linhas.push(...(j?.value ?? []))
      proxima = j?.['@odata.nextLink'] ?? null
    }
    return linhas
  }
  const um = (caminho) => chamar('GET', caminho)
  // Tabelas de ligação: o nome do conjunto vem da metadata, nunca adivinhado.
  async function ligacao(logico, campos) {
    const meta = await um(`EntityDefinitions(LogicalName='${logico}')?$select=EntitySetName`)
    return todos(`${meta.EntitySetName}?$select=${campos}`)
  }
  return { api, chamar, todos, um, ligacao }
}
```

Conferência do teste de espera: o 429 traz `Retry-After: 1` → 1000 ms; o 503 sem cabeçalho na 2ª tentativa → 4000 ms.

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/dv.test.mjs` → `fail 0`.

- [ ] **Passo 5: guardar a saída atual do `quem-le.mjs` no DEV (somente leitura).** Antes de mexer:

```bash
SCRATCH="$(mktemp -d)"
ORG=org23b93544
export DV_URL=https://$ORG.crm2.dynamics.com
export DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)"
node packages/deploy/acessos/quem-le.mjs > "$SCRATCH/antes.txt"; echo "saida=$?"
```

Esperado: `saida=0` e só nomes de papéis, equipes e contagens.

- [ ] **Passo 6: `quem-le.mjs` usa o `dv.mjs`.** Substituir o trecho que vai de `const BASE = (process.env.DV_URL ?? '').replace(/\/+$/, '')` até o fim de `async function ligacao(logico, campos) { ... }` (linhas 8 a 49) por:

```js
import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'

// Local: DV_URL + DV_ACCESS_TOKEN (DEV ou PROD, só GET). No CI (job acessos): DV_ENVIRONMENT_URL e conta de serviço.
let sessao
try {
  sessao = await tokenDoAmbiente({ somenteDevLocal: false })
} catch (e) {
  console.error(limpo(e.message))
  process.exit(2)
}
const { todos, um, ligacao } = criarCliente(sessao)
const TABELA = 'cr40f_bancodedados'
const ADMIN = ['Administrador do Sistema', 'System Administrator']
```

E na linha `console.log(`${BASE}: ${usuarios.length} usuarios ativos`)` trocar `${BASE}` por `${sessao.url}`. Conferir que não sobrou referência: `grep -n "BASE\|TOKEN\|API" packages/deploy/acessos/quem-le.mjs` → nada além de `DV_ACCESS_TOKEN` em comentário.

- [ ] **Passo 7: mesma saída.** Com as mesmas variáveis do Passo 5: `node packages/deploy/acessos/quem-le.mjs > "$SCRATCH/depois.txt"; diff "$SCRATCH/antes.txt" "$SCRATCH/depois.txt" && echo IGUAL` → `IGUAL` (a primeira linha usa `sessao.url`, sem barra final, igual ao `BASE` antigo).

- [ ] **Passo 8: lista de testes.** No script `test` de `packages/deploy/package.json`, acrescentar ` acessos/dv.test.mjs` ao fim da lista.

- [ ] **Passo 9: commit.**

```bash
git add packages/deploy/acessos/dv.mjs packages/deploy/acessos/dv.test.mjs packages/deploy/acessos/quem-le.mjs packages/deploy/package.json
git commit -m "refactor(acessos): cliente comum dv.mjs para os scripts de acessos

dv.mjs junta token (conta de serviço no CI, az local só no DEV por
padrão), paginação, repetição em 429/5xx, ligação pela metadata, erros
sem GUID e hash curto de id. quem-le.mjs passa a usá-lo com a mesma
saída no DEV; prova.mjs não muda.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: privilégios antes e depois, plano do corte e admins a manter

**Arquivos:** editar `packages/deploy/acessos/corte-regras.mjs`, `packages/deploy/acessos/corte-regras.test.mjs`.

**Interfaces.** Consome: o **estado** (formato abaixo, montado pela Tarefa 6). Produz: `papeisDe`, `efetivos`, `perdas`, `planoDoCorte`, `planoVazio`, `aplicarPlano`, `perdasPorPessoa`, `conferirManter`.

Formato do estado:

```text
{
  servico: userId,                       // WhoAmI da conta que roda
  equipe: { id, bu },                    // Team-Betinhos-MDA
  base: roleId,                          // Perfil - Base na unidade da equipe
  papeis: Map<roleId, { id, nome, admin, privilegios: [{ tabela, tipo, nivel }] }>,  // todos os papéis; privilégios só dos usados
  equipes: Map<teamId, roleId[]>,
  pessoas: [{ id, app, equipes: teamId[], diretos: roleId[] }],   // usuários ativos (sem suporte/delegado)
  tabelas: string[],                     // universo medido (customizadas + padrão listadas)
  catalogo: Map<nome em minúsculas, logico>, conjuntoDe: Map<logico, EntitySetName>
}
```

- [ ] **Passo 1: testes que falham.** Acrescentar ao `corte-regras.test.mjs` (o fixture fica no topo do arquivo, depois dos imports; trocar a linha de import pela abaixo):

```js
import {
  aplicarPlano, conferirManter, desde, efetivos, lerCorte, lerIds, perdasPorPessoa, planoDoCorte, planoVazio,
} from './corte-regras.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const P = { antigo: ID(1), dev: ID(2), admin: ID(3), base: ID(4), op: ID(5) }
const EQ = ID(100), SERV = ID(200), MANTIDO = ID(201), ANA = ID(202), BIA = ID(203)
const priv = (tabela, tipo, nivel = 8) => ({ tabela, tipo, nivel })
function estado() {
  return {
    servico: SERV,
    equipe: { id: EQ, bu: ID(900) },
    base: P.base,
    papeis: new Map([
      [P.antigo, { id: P.antigo, nome: 'Acesso-Betinhos-MDA', admin: false, privilegios: [
        priv('cr40f_reservadeveculos', 'Read'), priv('cr40f_reservadeveculos', 'Write'),
        priv('cr40f_financeiro', 'Read'), priv('cr40f_financeiro', 'Write'), priv('cr40f_funcionarios', 'Read'),
      ] }],
      [P.dev, { id: P.dev, nome: 'DEV - Usuário', admin: false, privilegios: [priv('cr40f_veiculos', 'Write')] }],
      [P.admin, { id: P.admin, nome: 'Administrador do Sistema', admin: true, privilegios: [] }],
      [P.base, { id: P.base, nome: 'Perfil - Base', admin: false, privilegios: [priv('cr40f_reservadeveculos', 'Read', 1)] }],
      [P.op, { id: P.op, nome: 'Perfil - Operacional - Operador', admin: false, privilegios: [
        priv('cr40f_reservadeveculos', 'Read'), priv('cr40f_reservadeveculos', 'Write'),
      ] }],
    ]),
    equipes: new Map([[EQ, [P.antigo, P.dev]]]),
    pessoas: [
      { id: SERV, app: true, equipes: [], diretos: [P.admin] },
      { id: MANTIDO, app: false, equipes: [EQ], diretos: [P.admin] },
      { id: ANA, app: false, equipes: [EQ], diretos: [P.op] },
      { id: BIA, app: false, equipes: [EQ], diretos: [P.antigo, P.admin] },
    ],
    tabelas: ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_reservadeveculos', 'cr40f_veiculos'],
  }
}
const MANTER = new Set([MANTIDO])

test('efetivos: união com o maior nível; admin vale tudo', () => {
  const e = efetivos([{ privilegios: [priv('t', 'Read', 1)] }, { privilegios: [priv('t', 'Read', 4), priv('t', 'Write', 2)] }])
  assert.equal(e.admin, false)
  assert.equal(e.privs.get('t|Read'), 4)
  assert.equal(e.privs.get('t|Write'), 2)
  assert.equal(efetivos([{ admin: true, privilegios: [] }]).admin, true)
})

test('plano: equipe fica só com a Base; antigos e admin direto saem, menos manter e conta de serviço', () => {
  const plano = planoDoCorte(estado(), { manter: MANTER })
  assert.deepEqual(plano.equipeRemover, [P.antigo, P.dev])
  assert.deepEqual(plano.equipeAdicionar, [P.base])
  assert.deepEqual(plano.pessoasRemover, [{ usuario: BIA, papel: P.antigo }, { usuario: BIA, papel: P.admin }])
})

test('plano é idempotente: depois de aplicado, nada a fazer', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  assert.equal(planoVazio(plano), false)
  assert.equal(planoVazio(planoDoCorte(aplicarPlano(e, plano), { manter: MANTER })), true)
})

test('perdas por pessoa: escrita e só leitura', () => {
  const lista = perdasPorPessoa(estado(), planoDoCorte(estado(), { manter: MANTER }))
  const de = (id) => lista.find((p) => p.id === id)
  assert.deepEqual(de(SERV), { id: SERV, escrita: [], leitura: [] })
  assert.deepEqual(de(MANTIDO), { id: MANTIDO, escrita: [], leitura: [] })
  assert.deepEqual(de(ANA), { id: ANA, escrita: ['cr40f_financeiro', 'cr40f_veiculos'], leitura: ['cr40f_funcionarios'] })
  assert.deepEqual(de(BIA).escrita, ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_reservadeveculos', 'cr40f_veiculos'])
})

test('admins a manter: vazio, inexistente e sem admin direto travam', () => {
  assert.equal(conferirManter(estado(), new Set()).length, 1)
  assert.deepEqual(conferirManter(estado(), MANTER), [])
  assert.deepEqual(conferirManter(estado(), new Set([ANA])), [{ id: ANA, motivo: 'admin a manter não tem Administrador do Sistema direto' }])
  assert.deepEqual(conferirManter(estado(), new Set([ID(999)])), [{ id: ID(999), motivo: 'admin a manter não é pessoa ativa' }])
  assert.deepEqual(conferirManter(estado(), new Set([SERV])), [{ id: SERV, motivo: 'admin a manter não é pessoa ativa' }])
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `does not provide an export named 'aplicarPlano'`.

- [ ] **Passo 3: implementar.** Acrescentar ao `corte-regras.mjs`:

```js
const nivelDe = (ef, tabela, tipo) => (ef.admin ? NIVEL.Global : ef.privs.get(`${tabela}|${tipo}`) ?? 0)

export function papeisDe(estado, pessoa) {
  const ids = [...pessoa.diretos, ...pessoa.equipes.flatMap((t) => estado.equipes.get(t) ?? [])]
  return ids.map((id) => estado.papeis.get(id)).filter(Boolean)
}

export function efetivos(papeis) {
  const r = { admin: false, privs: new Map() }
  for (const p of papeis) {
    if (p.admin) r.admin = true
    for (const { tabela, tipo, nivel } of p.privilegios ?? []) {
      const k = `${tabela}|${tipo}`
      if ((r.privs.get(k) ?? 0) < nivel) r.privs.set(k, nivel)
    }
  }
  return r
}

export function perdas(antes, depois, universo) {
  const escrita = [], leitura = []
  for (const t of universo) {
    if (ESCRITA.some((tipo) => nivelDe(depois, t, tipo) < nivelDe(antes, t, tipo))) escrita.push(t)
    else if (nivelDe(depois, t, 'Read') < nivelDe(antes, t, 'Read')) leitura.push(t)
  }
  return { escrita, leitura }
}

// A equipe fica só com a Base. Saem os papéis antigos diretos de todos e o admin direto de quem não está em manter.
// Usuário de aplicação e a conta que roda nunca perdem papel direto.
export function planoDoCorte(estado, { manter }) {
  const nome = (id) => estado.papeis.get(id)?.nome ?? ''
  const daEquipe = estado.equipes.get(estado.equipe.id) ?? []
  const pessoasRemover = []
  for (const p of estado.pessoas) {
    if (p.app || p.id === estado.servico) continue
    for (const r of p.diretos) {
      if (PAPEIS_ANTIGOS.includes(nome(r)) || (ADMIN.includes(nome(r)) && !manter.has(p.id))) pessoasRemover.push({ usuario: p.id, papel: r })
    }
  }
  return {
    equipeRemover: daEquipe.filter((r) => r !== estado.base),
    equipeAdicionar: daEquipe.includes(estado.base) ? [] : [estado.base],
    pessoasRemover,
  }
}

export const planoVazio = (p) => !p.equipeRemover.length && !p.equipeAdicionar.length && !p.pessoasRemover.length

export function aplicarPlano(estado, plano) {
  const equipes = new Map(estado.equipes)
  const atuais = new Set(equipes.get(estado.equipe.id) ?? [])
  for (const r of plano.equipeRemover) atuais.delete(r)
  for (const r of plano.equipeAdicionar) atuais.add(r)
  equipes.set(estado.equipe.id, [...atuais])
  const tirar = new Map()
  for (const { usuario, papel } of plano.pessoasRemover) tirar.set(usuario, new Set([...(tirar.get(usuario) ?? []), papel]))
  const pessoas = estado.pessoas.map((p) => ({ ...p, diretos: p.diretos.filter((r) => !tirar.get(p.id)?.has(r)) }))
  return { ...estado, equipes, pessoas }
}

export function perdasPorPessoa(estado, plano) {
  const depois = aplicarPlano(estado, plano)
  return estado.pessoas.map((p, i) => ({
    id: p.id,
    ...perdas(efetivos(papeisDe(estado, p)), efetivos(papeisDe(depois, depois.pessoas[i])), estado.tabelas),
  }))
}

export function conferirManter(estado, manter) {
  if (!manter.size) return [{ motivo: 'ACESSOS_ADMINS_MANTER vazia: o corte tiraria o admin de todas as pessoas' }]
  const porId = new Map(estado.pessoas.map((p) => [p.id, p]))
  const erros = []
  for (const id of manter) {
    const p = porId.get(id)
    if (!p || p.app || id === estado.servico) erros.push({ id, motivo: 'admin a manter não é pessoa ativa' })
    else if (!p.diretos.some((r) => estado.papeis.get(r)?.admin)) erros.push({ id, motivo: 'admin a manter não tem Administrador do Sistema direto' })
  }
  return erros
}
```

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `fail 0`.

- [ ] **Passo 5: commit.**

```bash
git add packages/deploy/acessos/corte-regras.mjs packages/deploy/acessos/corte-regras.test.mjs
git commit -m "feat(acessos): plano do corte e privilégios antes e depois

planoDoCorte deixa a equipe só com Perfil - Base e tira papéis antigos
e admin direto (menos os admins a manter, usuários de aplicação e a
conta que roda). perdasPorPessoa compara equipes + diretos de hoje com
o estado depois do plano, separando escrita de leitura.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: critério de 90 dias, flows e relatório público

**Arquivos:** editar `packages/deploy/acessos/corte-regras.mjs`, `packages/deploy/acessos/corte-regras.test.mjs`.

**Interfaces.** Consome: `perdasPorPessoa` (Tarefa 3); `uso: Map<tabela, Set<userId>>` e `incertas: Set<tabela>` (Tarefa 6); flows `[{ id, dono: { tipo: 'usuario'|'equipe', id }, tabelas, incerto }]`; referências `[{ id, dono }]`. Produz: `travasDePessoas`, `tabelasDoFlow(clientdata, catalogo)`, `travasDeFlows`, `montarRelatorio`, `resumoPublico(rel, { ambiente, sal })`.

- [ ] **Passo 1: testes que falham.** Acrescentar `montarRelatorio, resumoPublico, tabelasDoFlow, travasDeFlows, travasDePessoas` ao import e:

```js
const plano0 = () => planoDoCorte(estado(), { manter: MANTER })

test('trava só perda de escrita em tabela usada nos 90 dias; o resto é informativo', () => {
  const lista = perdasPorPessoa(estado(), plano0())
  const uso = new Map([['cr40f_financeiro', new Set([ANA])], ['cr40f_reservadeveculos', new Set([ANA])]])
  const r = travasDePessoas(lista, { uso })
  assert.deepEqual(r.travas, [{ id: ANA, tabelas: ['cr40f_financeiro'] }])
  assert.deepEqual(r.informativo, [
    { id: ANA, tabelas: ['cr40f_funcionarios', 'cr40f_veiculos'] },
    { id: BIA, tabelas: ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_reservadeveculos', 'cr40f_veiculos'] },
  ])
})

test('tabela sem medida de uso trava quem perde escrita nela', () => {
  const lista = perdasPorPessoa(estado(), plano0())
  const r = travasDePessoas(lista, { uso: new Map(), incertas: new Set(['cr40f_veiculos']) })
  assert.deepEqual(r.travas, [{ id: ANA, tabelas: ['cr40f_veiculos'] }, { id: BIA, tabelas: ['cr40f_veiculos'] }])
})

const host = { apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps', connectionName: 'shared_commondataserviceforapps' }
const catalogo = new Map([
  ['cr40f_financeiro', 'cr40f_financeiro'], ['cr40f_financeiros', 'cr40f_financeiro'],
  ['cr40f_reservadeveculos', 'cr40f_reservadeveculos'], ['cr40f_reservadeveculoses', 'cr40f_reservadeveculos'],
])
const fluxo = (acoes) => JSON.stringify({ properties: { definition: {
  triggers: { quando: { type: 'OpenApiConnectionWebhook', inputs: { host, parameters: { 'subscriptionRequest/entityname': 'cr40f_financeiro' } } } },
  actions: acoes,
} } })

test('tabelas do flow: gatilho e ações do Dataverse, inclusive aninhadas', () => {
  const texto = fluxo({
    listar: { type: 'OpenApiConnection', inputs: { host, parameters: { entityName: 'cr40f_reservadeveculoses' } } },
    se: { type: 'If', actions: { email: { type: 'OpenApiConnection', inputs: { host: { connectionName: 'shared_office365' }, parameters: {} } } } },
  })
  assert.deepEqual(tabelasDoFlow(texto, catalogo), { tabelas: ['cr40f_financeiro', 'cr40f_reservadeveculos'], incerto: false })
})

test('tabelas do flow: expressão, tabela desconhecida, ação sem tabela e JSON ruim ficam incertos', () => {
  const op = (parameters) => fluxo({ a: { type: 'OpenApiConnection', inputs: { host, parameters } } })
  assert.equal(tabelasDoFlow(op({ entityName: "@variables('t')" }), catalogo).incerto, true)
  assert.equal(tabelasDoFlow(op({ entityName: 'cr40f_naoexiste' }), catalogo).incerto, true)
  assert.equal(tabelasDoFlow(op({ actionName: 'cr40f_AcessoDefinirPerfis' }), catalogo).incerto, true)
  assert.equal(tabelasDoFlow('{', catalogo).incerto, true)
  assert.equal(tabelasDoFlow('', catalogo).incerto, true)
})

test('flows: trava dono que perde tabela do flow, incerto de pessoa comum e equipe do corte', () => {
  const lista = perdasPorPessoa(estado(), plano0())
  const flows = [
    { id: 'f1', dono: { tipo: 'usuario', id: ANA }, tabelas: ['cr40f_financeiro'], incerto: false },
    { id: 'f2', dono: { tipo: 'usuario', id: SERV }, tabelas: [], incerto: true },
    { id: 'f3', dono: { tipo: 'usuario', id: BIA }, tabelas: [], incerto: true },
    { id: 'f4', dono: { tipo: 'equipe', id: EQ }, tabelas: ['cr40f_reservadeveculos'], incerto: false },
    { id: 'f5', dono: { tipo: 'usuario', id: MANTIDO }, tabelas: [], incerto: true },
    { id: 'f6', dono: { tipo: 'usuario', id: ANA }, tabelas: ['cr40f_reservadeveculos'], incerto: false },
  ]
  const travas = travasDeFlows(flows, { perdasPorUsuario: new Map(lista.map((p) => [p.id, p])), servico: SERV, manter: MANTER, equipeCorte: EQ })
  assert.deepEqual(travas.map((t) => t.id), ['f1', 'f3', 'f4'])
  assert.deepEqual(travas[0].tabelas, ['cr40f_financeiro'])
})

test('relatório: zero só sem trava; resumo público sem GUID', () => {
  const e = estado()
  const limpo = montarRelatorio({ estado: e, manter: MANTER, uso: new Map(), incertas: new Set(), flows: [], referencias: [] })
  assert.equal(limpo.zero, true)
  const travado = montarRelatorio({
    estado: e, manter: MANTER, uso: new Map([['cr40f_financeiro', new Set([ANA])]]), incertas: new Set(),
    flows: [{ id: ID(700), dono: { tipo: 'usuario', id: BIA }, tabelas: [], incerto: true }],
    referencias: [{ id: ID(800), dono: BIA }, { id: ID(801), dono: SERV }],
  })
  assert.equal(travado.zero, false)
  assert.equal(travado.referencias.length, 1)
  const texto = resumoPublico(travado, { ambiente: 'dev', sal: 'host' })
  assert.match(texto, /TRAVADO/)
  assert.match(texto, /Travas de pessoas: 1/)
  assert.match(texto, /Travas de flows: 1/)
  assert.doesNotMatch(texto, /[0-9a-f]{8}-[0-9a-f]{4}-/)
  assert.match(resumoPublico(montarRelatorio({ estado: e, manter: new Set(), uso: new Map(), incertas: new Set(), flows: [] }), { ambiente: 'dev', sal: 'h' }), /Erro: ACESSOS_ADMINS_MANTER vazia/)
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `does not provide an export named 'montarRelatorio'`.

- [ ] **Passo 3: implementar.** Acrescentar ao `corte-regras.mjs`:

```js
export function travasDePessoas(lista, { uso, incertas = new Set() }) {
  const travas = [], informativo = []
  for (const p of lista) {
    const usadas = p.escrita.filter((t) => incertas.has(t) || uso.get(t)?.has(p.id))
    const semUso = [...p.leitura, ...p.escrita.filter((t) => !usadas.includes(t))]
    if (usadas.length) travas.push({ id: p.id, tabelas: usadas })
    if (semUso.length) informativo.push({ id: p.id, tabelas: semUso })
  }
  return { travas, informativo }
}

const DATAVERSE = /commondataserviceforapps/i

// Tabelas que o flow toca pelo conector do Dataverse. Qualquer operação do conector sem tabela conhecida
// (expressão, ação sem entityName, nome fora do catálogo) deixa o flow incerto.
export function tabelasDoFlow(clientdata, catalogo) {
  let definicao
  try {
    definicao = JSON.parse(clientdata)?.properties?.definition
  } catch {
    return { tabelas: [], incerto: true }
  }
  if (!definicao) return { tabelas: [], incerto: true }
  const tabelas = new Set()
  let incerto = false
  const visitar = (no) => {
    const host = no?.inputs?.host
    if (host && DATAVERSE.test(JSON.stringify(host))) {
      const p = no.inputs.parameters ?? {}
      const bruto = p.entityName ?? p['subscriptionRequest/entityname']
      const logico = typeof bruto === 'string' && !bruto.includes('@') ? catalogo.get(bruto.toLowerCase()) : undefined
      if (logico) tabelas.add(logico)
      else incerto = true
    }
    for (const v of Object.values(no ?? {})) if (v && typeof v === 'object') visitar(v)
  }
  visitar(definicao)
  return { tabelas: [...tabelas].sort(), incerto }
}

export function travasDeFlows(flows, { perdasPorUsuario, servico, manter, equipeCorte }) {
  const travas = []
  for (const f of flows) {
    if (f.dono.tipo === 'equipe') {
      if (f.dono.id === equipeCorte) travas.push({ id: f.id, motivo: 'dono é a equipe do corte' })
      continue
    }
    if (f.dono.id === servico || manter.has(f.dono.id)) continue
    if (f.incerto) {
      travas.push({ id: f.id, motivo: 'tabelas do flow incertas: mover o flow para a conta de serviço' })
      continue
    }
    const p = perdasPorUsuario.get(f.dono.id)
    const perdidas = f.tabelas.filter((t) => p && (p.escrita.includes(t) || p.leitura.includes(t)))
    if (perdidas.length) travas.push({ id: f.id, motivo: 'dono perde acesso a tabela do flow', tabelas: perdidas })
  }
  return travas
}

export function montarRelatorio({ estado, manter, uso, incertas, flows, referencias = [] }) {
  const erros = conferirManter(estado, manter)
  const plano = planoDoCorte(estado, { manter })
  const lista = perdasPorPessoa(estado, plano)
  const { travas, informativo } = travasDePessoas(lista, { uso, incertas })
  const perdasPorUsuario = new Map(lista.map((p) => [p.id, p]))
  const travasFlows = travasDeFlows(flows, { perdasPorUsuario, servico: estado.servico, manter, equipeCorte: estado.equipe.id })
  const perdem = new Set(lista.filter((p) => p.escrita.length || p.leitura.length).map((p) => p.id))
  return {
    zero: !erros.length && !travas.length && !travasFlows.length,
    erros, plano, travas, travasFlows, informativo,
    referencias: referencias.filter((r) => perdem.has(r.dono)),
    incertas: [...incertas].sort(),
  }
}

// Log público do Actions: só contagens, nomes de tabela e ids curtos com hash.
export function resumoPublico(rel, { ambiente, sal }) {
  const h = (id) => hashCurto(id, sal)
  const pessoas = new Set(rel.plano.pessoasRemover.map((p) => p.usuario)).size
  const lista = (itens, f) => (itens.length ? ` (${itens.map(f).join('; ')})` : '')
  return [
    `Corte dos acessos (${ambiente}): ${rel.zero ? 'ZERO, pode aplicar' : 'TRAVADO, nada aplicado'}`,
    `Plano: equipe perde ${rel.plano.equipeRemover.length} papel(is) e ganha ${rel.plano.equipeAdicionar.length}; ${rel.plano.pessoasRemover.length} papel(is) direto(s) saem de ${pessoas} pessoa(s)`,
    `Travas de pessoas: ${rel.travas.length}${lista(rel.travas, (t) => `${h(t.id)}: ${t.tabelas.join(', ')}`)}`,
    `Travas de flows: ${rel.travasFlows.length}${lista(rel.travasFlows, (t) => `${h(t.id)}: ${t.motivo}`)}`,
    ...rel.erros.map((e) => `Erro: ${e.id ? `${h(e.id)}: ` : ''}${e.motivo}`),
    `Informativo: ${rel.informativo.length} pessoa(s) perdem acesso sem uso nos últimos ${DIAS} dias; ${rel.referencias.length} referência(s) de conexão de quem perde acesso; tabelas sem medida de uso: ${rel.incertas.join(', ') || 'nenhuma'}`,
  ].join('\n')
}
```

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `fail 0`.

- [ ] **Passo 5: commit.**

```bash
git add packages/deploy/acessos/corte-regras.mjs packages/deploy/acessos/corte-regras.test.mjs
git commit -m "feat(acessos): travas do corte por uso de 90 dias e por flow

Trava quem perderia criar ou gravar numa tabela em que criou ou alterou
registro nos últimos 90 dias (tabela sem medida trava também). Flow
ligado trava quando o dono perde tabela do flow, quando as tabelas são
incertas e o dono não é a conta de serviço nem admin mantido, ou quando
o dono é a equipe do corte. Resumo público só com contagens e hash.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: foto e desfazer

**Arquivos:** editar `packages/deploy/acessos/corte-regras.mjs`, `packages/deploy/acessos/corte-regras.test.mjs`.

**Interfaces.** Consome: estado, plano. Produz: `fotoDoCorte(estado, plano, { ambiente, host, quando, commit })`, `lerFoto(texto)`, `mesmoPlano(foto, plano)`, `planoDesfazer(fotos, estado) → { equipeAdicionar, pessoasAdicionar, ignorados }`.

Formato da foto (v1, cifrada no artefato `acessos-foto-<ambiente>`):

```json
{
  "versao": 1,
  "ambiente": "dev",
  "host": "org23b93544.crm2.dynamics.com",
  "quando": "2026-11-25T12:00:00.000Z",
  "commit": "<sha>",
  "equipe": { "id": "<teamid>", "papeis": ["<roleid que saiu da equipe>"] },
  "base": "<roleid do Perfil - Base>",
  "pessoas": [{ "id": "<systemuserid>", "papeis": ["<roleid direto que saiu>"] }],
  "nomes": { "<roleid>": "<nome do papel>" }
}
```

- [ ] **Passo 1: testes que falham.** Acrescentar `fotoDoCorte, lerFoto, mesmoPlano, planoDesfazer` ao import e:

```js
const META = { ambiente: 'dev', host: 'h', quando: '2026-11-25T12:00:00.000Z', commit: 'abc' }
function devolver(e, pd) {
  const equipes = new Map(e.equipes)
  equipes.set(e.equipe.id, [...(equipes.get(e.equipe.id) ?? []), ...pd.equipeAdicionar])
  const pessoas = e.pessoas.map((p) => ({ ...p, diretos: [...p.diretos, ...pd.pessoasAdicionar.filter((x) => x.usuario === p.id).map((x) => x.papel)] }))
  return { ...e, equipes, pessoas }
}

test('foto: guarda o que sai, relê e confere com o plano', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META)))
  assert.deepEqual(foto.equipe, { id: EQ, papeis: [P.antigo, P.dev] })
  assert.deepEqual(foto.pessoas, [{ id: BIA, papeis: [P.antigo, P.admin] }])
  assert.equal(foto.nomes[P.dev], 'DEV - Usuário')
  assert.equal(mesmoPlano(foto, plano), true)
  assert.equal(mesmoPlano(foto, { ...plano, pessoasRemover: [] }), false)
})

test('foto: formato desconhecido é recusado', () => {
  assert.throws(() => lerFoto('{"versao":2}'), /formato desconhecido/)
  assert.throws(() => lerFoto(JSON.stringify({ ...fotoDoCorte(estado(), planoDoCorte(estado(), { manter: MANTER }), META), pessoas: [{ id: 'fulano', papeis: [] }] })), /formato desconhecido/)
})

test('desfazer devolve à equipe e às pessoas e depois não tem nada a fazer', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  const cortado = aplicarPlano(e, plano)
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META)))
  const pd = planoDesfazer([foto], cortado)
  assert.deepEqual(pd.equipeAdicionar, [P.antigo, P.dev])
  assert.deepEqual(pd.pessoasAdicionar, [{ usuario: BIA, papel: P.antigo }, { usuario: BIA, papel: P.admin }])
  assert.deepEqual(pd.ignorados, [])
  const resto = planoDesfazer([foto, foto], devolver(cortado, pd))
  assert.deepEqual([resto.equipeAdicionar, resto.pessoasAdicionar], [[], []])
})

test('desfazer ignora pessoa inativa e papel que não existe mais; recusa outra equipe', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META)))
  const cortado = aplicarPlano(e, plano)
  const semBia = { ...cortado, pessoas: cortado.pessoas.filter((p) => p.id !== BIA), papeis: new Map([...cortado.papeis].filter(([id]) => id !== P.dev)) }
  const pd = planoDesfazer([foto], semBia)
  assert.deepEqual(pd.equipeAdicionar, [P.antigo])
  assert.deepEqual(pd.pessoasAdicionar, [])
  assert.deepEqual(pd.ignorados.sort(), [P.dev, BIA].sort())
  assert.throws(() => planoDesfazer([{ ...foto, equipe: { id: ID(101), papeis: [] } }], cortado), /outra equipe/)
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `does not provide an export named 'fotoDoCorte'`.

- [ ] **Passo 3: implementar.** Acrescentar ao `corte-regras.mjs`:

```js
export function fotoDoCorte(estado, plano, { ambiente, host, quando, commit }) {
  const porPessoa = new Map()
  for (const { usuario, papel } of plano.pessoasRemover) porPessoa.set(usuario, [...(porPessoa.get(usuario) ?? []), papel])
  const ids = [...plano.equipeRemover, ...plano.pessoasRemover.map((p) => p.papel)]
  return {
    versao: 1, ambiente, host, quando, commit,
    equipe: { id: estado.equipe.id, papeis: [...plano.equipeRemover] },
    base: estado.base,
    pessoas: [...porPessoa].map(([id, papeis]) => ({ id, papeis })),
    nomes: Object.fromEntries(ids.map((id) => [id, estado.papeis.get(id)?.nome ?? ''])),
  }
}

export function lerFoto(texto) {
  let f
  try {
    f = JSON.parse(String(texto).replace(/^﻿/, ''))
  } catch {
    f = null
  }
  const ids = (lista) => Array.isArray(lista) && lista.every((x) => GUID.test(x))
  const ok = f?.versao === 1 && AMBIENTES.includes(f.ambiente) && typeof f.host === 'string' && GUID.test(f.equipe?.id ?? '') &&
    ids(f.equipe.papeis) && Array.isArray(f.pessoas) && f.pessoas.every((p) => GUID.test(p?.id ?? '') && ids(p.papeis))
  if (!ok) throw new Error('foto do corte em formato desconhecido; nada feito')
  return f
}

export function mesmoPlano(foto, plano) {
  const chave = (lista) => JSON.stringify([...lista].sort())
  return chave(foto.equipe.papeis) === chave(plano.equipeRemover) &&
    chave(foto.pessoas.flatMap((p) => p.papeis.map((r) => `${p.id}|${r}`))) === chave(plano.pessoasRemover.map((p) => `${p.usuario}|${p.papel}`))
}

// União de todas as fotos: um corte em mais de uma execução continua desfazível. Perfil - Base fica na equipe.
export function planoDesfazer(fotos, estado) {
  const daEquipe = new Set(estado.equipes.get(estado.equipe.id) ?? [])
  const pessoas = new Map(estado.pessoas.filter((p) => !p.app).map((p) => [p.id, p]))
  const equipe = new Set(), diretos = new Map(), ignorados = new Set()
  for (const f of fotos) {
    if (f.equipe.id !== estado.equipe.id) throw new Error('foto de outra equipe; nada feito')
    for (const r of f.equipe.papeis) {
      if (!estado.papeis.has(r)) ignorados.add(r)
      else if (!daEquipe.has(r)) equipe.add(r)
    }
    for (const p of f.pessoas) {
      const atual = pessoas.get(p.id)
      if (!atual) { ignorados.add(p.id); continue }
      for (const r of p.papeis) {
        if (!estado.papeis.has(r)) ignorados.add(r)
        else if (!atual.diretos.includes(r)) diretos.set(`${p.id}|${r}`, { usuario: p.id, papel: r })
      }
    }
  }
  return { equipeAdicionar: [...equipe], pessoasAdicionar: [...diretos.values()], ignorados: [...ignorados] }
}
```

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/corte-regras.test.mjs` → `fail 0`.

- [ ] **Passo 5: commit.**

```bash
git add packages/deploy/acessos/corte-regras.mjs packages/deploy/acessos/corte-regras.test.mjs
git commit -m "feat(acessos): foto do corte e plano do desfazer

A foto v1 guarda os papéis que saem da equipe e das pessoas, com os
nomes. O desfazer une todas as fotos, devolve só o que falta, ignora
pessoa inativa e papel que não existe mais e mantém Perfil - Base.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: leitura do estado no Dataverse (`corte-estado.mjs`)

**Arquivos:** criar `packages/deploy/acessos/corte-estado.mjs`, `packages/deploy/acessos/corte-estado.test.mjs`; editar `packages/deploy/package.json`.

**Interfaces.** Consome: cliente `dv` (`um`, `todos`, `ligacao`) da Tarefa 2; `tabelasDoFlow` (Tarefa 4). Produz: `PADRAO_MEDIDAS`, `lerCatalogo(dv)`, `lerEstado(dv)`, `lerUso(dv, tabelas, conjuntoDe, desdeIso)`, `lerFlows(dv, catalogo)`, `lerReferencias(dv)`.

- [ ] **Passo 1: teste que falha.** Criar `packages/deploy/acessos/corte-estado.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lerEstado, lerFlows, lerUso } from './corte-estado.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const BU = ID(900), EQ = ID(100), SERV = ID(200), ANA = ID(202)
const P = { antigo: ID(1), admin: ID(3), base: ID(4), solto: ID(6) }

function falso(rotas) {
  const chamadas = []
  const achar = (c) => {
    for (const [prefixo, valor] of rotas) if (c.startsWith(prefixo)) return typeof valor === 'function' ? valor(c) : valor
    throw new Error(`rota sem resposta: ${c}`)
  }
  return {
    chamadas,
    api: 'https://x/api/data/v9.2',
    um: async (c) => (chamadas.push(c), achar(c)),
    todos: async (c) => (chamadas.push(c), achar(c)),
    ligacao: async (l) => (chamadas.push(`ligacao:${l}`), achar(`ligacao:${l}`)),
  }
}

const rotas = () => [
  ['WhoAmI', { UserId: SERV }],
  ['teams?', [{ teamid: EQ, name: 'Team-Betinhos-MDA', _businessunitid_value: BU }]],
  ['roles?', [
    { roleid: P.antigo, name: 'Acesso-Betinhos-MDA', _businessunitid_value: BU },
    { roleid: P.admin, name: 'Administrador do Sistema', _businessunitid_value: BU },
    { roleid: P.base, name: 'Perfil - Base', _businessunitid_value: BU },
    { roleid: P.solto, name: 'Papel sem ninguém', _businessunitid_value: BU },
  ]],
  ['ligacao:teamroles', [{ teamid: EQ, roleid: P.antigo }]],
  ['ligacao:teammembership', [{ teamid: EQ, systemuserid: ANA }]],
  ['ligacao:systemuserroles', [{ systemuserid: SERV, roleid: P.admin }]],
  ['systemusers?', [
    { systemuserid: SERV, applicationid: ID(500), accessmode: 4 },
    { systemuserid: ANA, applicationid: null, accessmode: 0 },
    { systemuserid: ID(300), applicationid: null, accessmode: 3 },
  ]],
  ['EntityDefinitions?', { value: [
    { LogicalName: 'cr40f_financeiro', EntitySetName: 'cr40f_financeiros', IsCustomEntity: true, TableType: 'Standard', Privileges: [{ PrivilegeId: ID(600), PrivilegeType: 'Write' }] },
    { LogicalName: 'systemuser', EntitySetName: 'systemusers', IsCustomEntity: false, TableType: 'Standard', Privileges: [] },
    { LogicalName: 'cr40f_virtual', EntitySetName: 'cr40f_virtuais', IsCustomEntity: true, TableType: 'Virtual', Privileges: [] },
  ] }],
  [`roles(${P.antigo})/`, { RolePrivileges: [{ PrivilegeId: ID(600), Depth: 'Global' }, { PrivilegeId: ID(999), Depth: 'Global' }] }],
  [`roles(${P.base})/`, { RolePrivileges: [] }],
]

test('lerEstado monta equipe, pessoas, papéis e catálogo', async () => {
  const dv = falso(rotas())
  const e = await lerEstado(dv)
  assert.equal(e.servico, SERV)
  assert.deepEqual(e.equipe, { id: EQ, bu: BU })
  assert.equal(e.base, P.base)
  assert.deepEqual(e.pessoas, [
    { id: SERV, app: true, equipes: [], diretos: [P.admin] },
    { id: ANA, app: false, equipes: [EQ], diretos: [] },
  ])
  assert.deepEqual(e.papeis.get(P.antigo).privilegios, [{ tabela: 'cr40f_financeiro', tipo: 'Write', nivel: 8 }])
  assert.equal(e.papeis.get(P.admin).admin, true)
  assert.deepEqual(e.papeis.get(P.solto).privilegios, [])
  assert.ok(!dv.chamadas.some((c) => c.startsWith(`roles(${P.admin})`)), 'admin não lê privilégios')
  assert.ok(!dv.chamadas.some((c) => c.startsWith(`roles(${P.solto})`)), 'papel sem ninguém não lê privilégios')
  assert.deepEqual(e.tabelas, ['cr40f_financeiro'])
  assert.equal(e.catalogo.get('cr40f_financeiros'), 'cr40f_financeiro')
  assert.equal(e.conjuntoDe.get('cr40f_financeiro'), 'cr40f_financeiros')
})

test('lerEstado recusa equipe ausente ou Base fora da unidade da equipe', async () => {
  const semEquipe = rotas().map(([k, v]) => (k === 'teams?' ? [k, []] : [k, v]))
  await assert.rejects(lerEstado(falso(semEquipe)), /0 encontradas/)
  const semBase = rotas().map(([k, v]) => (k === 'roles?' ? [k, v.filter((r) => r.name !== 'Perfil - Base')] : [k, v]))
  await assert.rejects(lerEstado(falso(semBase)), /Perfil - Base não existe/)
})

test('lerUso junta criou e alterou; tabela que falha fica incerta', async () => {
  const dv = falso([
    ['cr40f_financeiros?$apply=filter(createdon', [{ _createdby_value: ANA }]],
    ['cr40f_financeiros?$apply=filter(modifiedon', [{ _modifiedby_value: SERV }, { _modifiedby_value: null }]],
    ['cr40f_outros?', () => { throw new Error('400') }],
  ])
  const conjuntoDe = new Map([['cr40f_financeiro', 'cr40f_financeiros'], ['cr40f_outro', 'cr40f_outros']])
  const { uso, incertas } = await lerUso(dv, ['cr40f_financeiro', 'cr40f_outro'], conjuntoDe, '2026-08-26T00:00:00Z')
  assert.deepEqual([...uso.get('cr40f_financeiro')].sort(), [ANA, SERV].sort())
  assert.deepEqual([...incertas], ['cr40f_outro'])
  assert.ok(dv.chamadas[0].includes('filter(createdon ge 2026-08-26T00:00:00Z)/groupby((_createdby_value))'))
})

test('lerFlows separa dono usuário e equipe', async () => {
  const dv = falso([['workflows?', [
    { workflowid: 'f1', clientdata: '{', _owninguser_value: ANA, _owningteam_value: null },
    { workflowid: 'f2', clientdata: '{', _owninguser_value: null, _owningteam_value: EQ },
  ]]])
  const flows = await lerFlows(dv, new Map())
  assert.deepEqual(flows.map((f) => [f.id, f.dono, f.incerto]), [['f1', { tipo: 'usuario', id: ANA }, true], ['f2', { tipo: 'equipe', id: EQ }, true]])
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/corte-estado.test.mjs` → `Cannot find module ... corte-estado.mjs`.

- [ ] **Passo 3: implementar.** Criar `packages/deploy/acessos/corte-estado.mjs`:

```js
// Lê do Dataverse o estado que corte-regras.mjs avalia. Somente GET.
import { ADMIN, EQUIPE, NIVEL, PAPEL_BASE, tabelasDoFlow } from './corte-regras.mjs'

// Tabelas padrão medidas além das customizadas (as que a operação cria e altera no dia a dia).
export const PADRAO_MEDIDAS = ['account', 'annotation', 'appointment', 'contact', 'email', 'phonecall', 'task']

function agrupar(linhas, chave, valor) {
  const mapa = new Map()
  for (const l of linhas) mapa.set(l[chave], [...(mapa.get(l[chave]) ?? []), l[valor]])
  return mapa
}

export async function lerCatalogo(dv) {
  const linhas = (await dv.um('EntityDefinitions?$select=LogicalName,EntitySetName,IsCustomEntity,TableType,Privileges')).value
  const indice = new Map(), catalogo = new Map(), conjuntoDe = new Map(), tabelas = []
  for (const e of linhas) {
    catalogo.set(e.LogicalName.toLowerCase(), e.LogicalName)
    if (e.EntitySetName) {
      catalogo.set(e.EntitySetName.toLowerCase(), e.LogicalName)
      conjuntoDe.set(e.LogicalName, e.EntitySetName)
    }
    for (const p of e.Privileges ?? []) indice.set(p.PrivilegeId, { tabela: e.LogicalName, tipo: p.PrivilegeType })
    if (e.TableType !== 'Virtual' && e.TableType !== 'Elastic' && (e.IsCustomEntity || PADRAO_MEDIDAS.includes(e.LogicalName))) tabelas.push(e.LogicalName)
  }
  return { indice, catalogo, conjuntoDe, tabelas: tabelas.sort() }
}

export async function lerEstado(dv) {
  const { UserId } = await dv.um('WhoAmI')
  const equipes = await dv.todos(`teams?$select=teamid,name,_businessunitid_value&$filter=name eq '${EQUIPE}'`)
  if (equipes.length !== 1) throw new Error(`equipe ${EQUIPE}: ${equipes.length} encontradas (esperado 1)`)
  const equipe = { id: equipes[0].teamid, bu: equipes[0]._businessunitid_value }
  const linhasPapeis = await dv.todos('roles?$select=roleid,name,_businessunitid_value')
  const base = linhasPapeis.find((r) => r.name === PAPEL_BASE && r._businessunitid_value === equipe.bu)
  if (!base) throw new Error(`${PAPEL_BASE} não existe na unidade da equipe`)
  const teamroles = await dv.ligacao('teamroles', 'teamid,roleid')
  const membros = await dv.ligacao('teammembership', 'teamid,systemuserid')
  const userroles = await dv.ligacao('systemuserroles', 'systemuserid,roleid')
  // accessmode 3 (suporte) e 5 (admin delegado) são contas da Microsoft: fora da avaliação.
  const usuarios = await dv.todos('systemusers?$select=systemuserid,applicationid,accessmode&$filter=isdisabled eq false')
  const equipesPapeis = agrupar(teamroles, 'teamid', 'roleid')
  const equipesDe = agrupar(membros, 'systemuserid', 'teamid')
  const diretosDe = agrupar(userroles, 'systemuserid', 'roleid')
  const pessoas = usuarios
    .filter((u) => u.accessmode !== 3 && u.accessmode !== 5)
    .map((u) => ({ id: u.systemuserid, app: u.applicationid != null, equipes: equipesDe.get(u.systemuserid) ?? [], diretos: diretosDe.get(u.systemuserid) ?? [] }))
  const usados = new Set([
    base.roleid,
    ...(equipesPapeis.get(equipe.id) ?? []),
    ...pessoas.flatMap((p) => [...p.diretos, ...p.equipes.flatMap((t) => equipesPapeis.get(t) ?? [])]),
  ])
  const { indice, catalogo, conjuntoDe, tabelas } = await lerCatalogo(dv)
  const papeis = new Map()
  for (const r of linhasPapeis) {
    const admin = ADMIN.includes(r.name)
    let privilegios = []
    if (!admin && usados.has(r.roleid)) {
      const resp = await dv.um(`roles(${r.roleid})/Microsoft.Dynamics.CRM.RetrieveRolePrivilegesRole()`)
      privilegios = (resp.RolePrivileges ?? []).flatMap((p) => {
        const i = indice.get(p.PrivilegeId)
        return i ? [{ ...i, nivel: NIVEL[p.Depth] ?? 0 }] : []
      })
    }
    papeis.set(r.roleid, { id: r.roleid, nome: r.name, admin, privilegios })
  }
  return { servico: UserId.toLowerCase(), equipe, base: base.roleid, papeis, equipes: equipesPapeis, pessoas, tabelas, catalogo, conjuntoDe }
}

export async function lerUso(dv, tabelas, conjuntoDe, desdeIso) {
  const uso = new Map(), incertas = new Set()
  for (const t of tabelas) {
    try {
      const conjunto = conjuntoDe.get(t)
      if (!conjunto) throw new Error('sem conjunto')
      const ids = new Set()
      for (const [data, campo] of [['createdon', '_createdby_value'], ['modifiedon', '_modifiedby_value']]) {
        for (const l of await dv.todos(`${conjunto}?$apply=filter(${data} ge ${desdeIso})/groupby((${campo}))`)) if (l[campo]) ids.add(l[campo])
      }
      uso.set(t, ids)
    } catch {
      incertas.add(t)
    }
  }
  return { uso, incertas }
}

export async function lerFlows(dv, catalogo) {
  const linhas = await dv.todos('workflows?$select=workflowid,clientdata,_owninguser_value,_owningteam_value&$filter=category eq 5 and statecode eq 1')
  return linhas.map((w) => ({
    id: w.workflowid,
    dono: w._owningteam_value ? { tipo: 'equipe', id: w._owningteam_value } : { tipo: 'usuario', id: w._owninguser_value },
    ...tabelasDoFlow(w.clientdata ?? '', catalogo),
  }))
}

export async function lerReferencias(dv) {
  const linhas = await dv.todos('connectionreferences?$select=connectionreferenceid,_owninguser_value&$filter=statecode eq 0')
  return linhas.map((r) => ({ id: r.connectionreferenceid, dono: r._owninguser_value }))
}
```

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/corte-estado.test.mjs packages/deploy/acessos/corte-regras.test.mjs` → `fail 0`.

- [ ] **Passo 5: lista de testes.** Acrescentar ` acessos/corte-estado.test.mjs` ao fim do script `test` de `packages/deploy/package.json`.

- [ ] **Passo 6: commit.**

```bash
git add packages/deploy/acessos/corte-estado.mjs packages/deploy/acessos/corte-estado.test.mjs packages/deploy/package.json
git commit -m "feat(acessos): leitura do estado do corte no Dataverse

lerEstado traz a equipe do corte, a Base da unidade dela, pessoas
ativas, papéis diretos e de equipe e os privilégios por tabela (via
RetrieveRolePrivilegesRole e o índice de EntityDefinitions). lerUso
mede criou/alterou nos últimos 90 dias com groupby; lerFlows e
lerReferencias trazem flows ligados e referências de conexão.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: `relatorio-corte.mjs` (somente leitura) e dry-run no DEV

**Arquivos:** criar `packages/deploy/acessos/relatorio-corte.mjs`.

**Interfaces.** Consome: `dv.mjs`, `corte-estado.mjs`, `corte-regras.mjs`. Produz: `avaliar(dv, { manter, hoje }) → { estado, relatorio }`, `detalhe(relatorio, estado)`, `foraDoRepo(pasta)`; CLI `node packages/deploy/acessos/relatorio-corte.mjs --pasta <fora do repo>` com saída 0 (zero), 1 (travado), 2 (erro).

- [ ] **Passo 1: implementar.** Criar `packages/deploy/acessos/relatorio-corte.mjs`:

```js
#!/usr/bin/env node
// Somente leitura. Avalia o corte dos acessos no ambiente: plano, perdas, uso de 90 dias, flows e travas.
// stdout: resumo público (contagens e ids curtos com hash). <pasta>/relatorio.json: detalhe com ids reais;
// a pasta fica fora do repositório e, no CI, só sai cifrada.
// Uso local (só DEV): DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN=<az> ACESSOS_ADMINS_MANTER=<ids>
//   node packages/deploy/acessos/relatorio-corte.mjs --pasta <pasta fora do repo>
// Local, a "conta de serviço" é quem fez o az login: ela não perde papel direto no plano local.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'
import { desde, lerIds, montarRelatorio, perdasPorPessoa, planoDoCorte, resumoPublico } from './corte-regras.mjs'
import { lerEstado, lerFlows, lerReferencias, lerUso } from './corte-estado.mjs'

const RAIZ = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

export function foraDoRepo(pasta) {
  if (!pasta) throw new Error('--pasta é obrigatório (fora do repositório)')
  const p = resolve(pasta)
  if (p === RAIZ || p.startsWith(RAIZ + sep)) throw new Error('a pasta do relatório fica fora do repositório (dados de pessoas)')
  mkdirSync(p, { recursive: true })
  return p
}

export async function avaliar(dv, { manter, hoje = new Date() }) {
  const estado = await lerEstado(dv)
  const plano = planoDoCorte(estado, { manter })
  const medir = [...new Set(perdasPorPessoa(estado, plano).flatMap((p) => p.escrita))].sort()
  const { uso, incertas } = await lerUso(dv, medir, estado.conjuntoDe, desde(hoje))
  const flows = await lerFlows(dv, estado.catalogo)
  const referencias = await lerReferencias(dv)
  return { estado, relatorio: montarRelatorio({ estado, manter, uso, incertas, flows, referencias }) }
}

export function detalhe(relatorio, estado) {
  const nome = (id) => estado.papeis.get(id)?.nome ?? ''
  const papel = (id) => ({ id, nome: nome(id) })
  return {
    ...relatorio,
    plano: {
      equipeRemover: relatorio.plano.equipeRemover.map(papel),
      equipeAdicionar: relatorio.plano.equipeAdicionar.map(papel),
      pessoasRemover: relatorio.plano.pessoasRemover.map((p) => ({ ...p, nome: nome(p.papel) })),
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { pasta: { type: 'string' } } })
    const pasta = foraDoRepo(values.pasta)
    const sessao = await tokenDoAmbiente()
    const { estado, relatorio } = await avaliar(criarCliente(sessao), { manter: new Set(lerIds(process.env.ACESSOS_ADMINS_MANTER)) })
    writeFileSync(join(pasta, 'relatorio.json'), JSON.stringify(detalhe(relatorio, estado), null, 2))
    console.log(resumoPublico(relatorio, { ambiente: sessao.ambiente, sal: new URL(sessao.url).host }))
    process.exit(relatorio.zero ? 0 : 1)
  } catch (e) {
    console.error(limpo(e.message))
    process.exit(2)
  }
}
```

- [ ] **Passo 2: sintaxe e trava de pasta.** `node --check packages/deploy/acessos/relatorio-corte.mjs` → sem saída. `DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN=x node packages/deploy/acessos/relatorio-corte.mjs --pasta packages/deploy/acessos/tmp; echo $?` → `a pasta do relatório fica fora do repositório (dados de pessoas)` e `2`.

- [ ] **Passo 3: dry-run no DEV (somente leitura).** O Renan informa os ids a manter do DEV fora do chat público (variável de shell, nunca em arquivo do repo):

```bash
SCRATCH="$(mktemp -d)"
ORG=org23b93544
DV_URL=https://$ORG.crm2.dynamics.com \
DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)" \
ACESSOS_ADMINS_MANTER="$ACESSOS_ADMINS_MANTER" \
node packages/deploy/acessos/relatorio-corte.mjs --pasta "$SCRATCH" > "$SCRATCH/resumo.txt"; echo "saida=$?"
cat "$SCRATCH/resumo.txt"
grep -cE '[0-9a-f]{8}-[0-9a-f]{4}-' "$SCRATCH/resumo.txt"
```

Esperado: `saida=0` ou `saida=1` (não 2); resumo com as seis linhas; o `grep -c` dá `0`. Conferir no `"$SCRATCH/relatorio.json"`: `plano.equipeRemover` tem `Acesso-Betinhos-MDA` e `DEV - Usuário`; `plano.equipeAdicionar` vazio se a Base já está na equipe (plano 1) ou com `Perfil - Base`. Anotar para o Renan as contagens (sem ids). Se `saida=1`, as travas viram pendências da ativação (passo (a)), não deste PR.

- [ ] **Passo 4: commit.**

```bash
git add packages/deploy/acessos/relatorio-corte.mjs
git commit -m "feat(acessos): relatório do corte, somente leitura

Avalia plano, perdas, uso de 90 dias e flows; imprime só contagens e
ids curtos com hash e grava o detalhe em pasta fora do repositório.
Sai 0 quando zera, 1 quando trava e 2 em erro. Local só no DEV.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: `corte.mjs` (aplicar, desfazer, membros da automação) e dry-run no DEV

**Arquivos:** criar `packages/deploy/acessos/corte.mjs`.

**Interfaces.** Consome: tudo acima. Produz: CLI `node packages/deploy/acessos/corte.mjs --etapa <modo|automacao|avaliar|aplicar|desfazer> --ambiente <dev|prod> [--pasta <dir>] [--fotos <dir>] [--aplicar]`; arquivos `<pasta>/estado.txt` (`nada|aplicar|travado`), `<pasta>/relatorio/relatorio.json`, `<pasta>/foto/foto.json`.

- [ ] **Passo 1: implementar.** Criar `packages/deploy/acessos/corte.mjs`:

```js
#!/usr/bin/env node
// Corte dos acessos (plano 4). Quem aplica é só o workflow acessos-corte.yml, na conta de serviço; local vale só no DEV
// e sem --aplicar (dry-run). Etapas:
//   modo       imprime o modo do ambiente em corte.json; não chama o Dataverse;
//   automacao  garante os membros do perfil de coluna "Passageiros - automação" (conta que roda + ACESSOS_AUTOMACAO_MEMBROS);
//   avaliar    relatório (sai 1 se travar), foto do que sai e estado.txt = nada | aplicar | travado;
//   aplicar    reavalia, confere com a foto e aplica: Base na equipe, tira os papéis da equipe e os diretos; confere;
//   desfazer   devolve o que as fotos guardaram (equipe e pessoas ativas) e confere.
// Saída pública: contagens e ids curtos com hash. Ids reais só em <pasta>, que o workflow cifra.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'
import {
  PERFIL_AUTOMACAO, fotoDoCorte, lerCorte, lerFoto, lerIds, mesmoPlano, planoDesfazer, planoDoCorte, planoVazio, resumoPublico,
} from './corte-regras.mjs'
import { lerEstado } from './corte-estado.mjs'
import { avaliar, detalhe, foraDoRepo } from './relatorio-corte.mjs'

const { values: a } = parseArgs({
  options: {
    etapa: { type: 'string' }, ambiente: { type: 'string' }, pasta: { type: 'string' }, fotos: { type: 'string' },
    aplicar: { type: 'boolean', default: false },
  },
})
const escrever = (caminho, obj) => {
  mkdirSync(dirname(caminho), { recursive: true })
  writeFileSync(caminho, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2))
}

async function principal() {
  const modo = lerCorte(readFileSync(new URL('./corte.json', import.meta.url), 'utf8'), a.ambiente)
  if (a.etapa === 'modo') {
    console.log(modo)
    return 0
  }
  const sessao = await tokenDoAmbiente()
  if (sessao.ambiente !== a.ambiente) throw new Error(`--ambiente ${a.ambiente} não bate com o host (${sessao.ambiente}); nada feito`)
  if (a.aplicar && (sessao.local || process.env.GITHUB_ACTIONS !== 'true')) throw new Error('--aplicar só no workflow acessos-corte.yml; local é sempre dry-run')
  const dv = criarCliente(sessao)
  const sal = new URL(sessao.url).host
  const manter = new Set(lerIds(process.env.ACESSOS_ADMINS_MANTER))
  const ref = (conjunto, id) => ({ '@odata.id': `${dv.api}/${conjunto}(${id})` })

  async function automacao() {
    const filtro = encodeURIComponent(`name eq '${PERFIL_AUTOMACAO}'`)
    const perfis = await dv.todos(`fieldsecurityprofiles?$select=fieldsecurityprofileid&$filter=${filtro}`)
    if (!perfis.length) {
      console.log(`Perfil "${PERFIL_AUTOMACAO}" ainda não existe; nada a fazer.`)
      return 0
    }
    const perfil = perfis[0].fieldsecurityprofileid
    const { UserId } = await dv.um('WhoAmI')
    const membros = [...new Set([UserId.toLowerCase(), ...lerIds(process.env.ACESSOS_AUTOMACAO_MEMBROS)])]
    let faltam = 0
    for (const uid of membros) {
      const ja = await dv.todos(`fieldsecurityprofiles(${perfil})/systemuserprofiles_association?$select=systemuserid&$filter=systemuserid eq ${uid}`)
      if (ja.length) continue
      faltam++
      if (a.aplicar) await dv.chamar('POST', `fieldsecurityprofiles(${perfil})/systemuserprofiles_association/$ref`, ref('systemusers', uid))
    }
    console.log(`Perfil "${PERFIL_AUTOMACAO}": ${membros.length} membro(s) esperados; ${faltam} ${a.aplicar ? 'incluído(s)' : 'faltando (dry-run)'}.`)
    return 0
  }

  async function etapaAvaliar() {
    if (modo !== 'cortar') {
      console.log(`Modo ${modo}: nada a avaliar.`)
      return 0
    }
    const pasta = foraDoRepo(a.pasta)
    const { estado, relatorio } = await avaliar(dv, { manter })
    escrever(join(pasta, 'relatorio', 'relatorio.json'), detalhe(relatorio, estado))
    console.log(resumoPublico(relatorio, { ambiente: a.ambiente, sal }))
    if (!relatorio.zero) {
      escrever(join(pasta, 'estado.txt'), 'travado')
      return 1
    }
    if (planoVazio(relatorio.plano)) {
      escrever(join(pasta, 'estado.txt'), 'nada')
      console.log('Nada a cortar: o ambiente já está no estado do corte.')
      return 0
    }
    const meta = { ambiente: a.ambiente, host: sal, quando: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? 'local' }
    escrever(join(pasta, 'foto', 'foto.json'), fotoDoCorte(estado, relatorio.plano, meta))
    escrever(join(pasta, 'estado.txt'), 'aplicar')
    return 0
  }

  async function etapaAplicar() {
    if (modo !== 'cortar') throw new Error(`modo ${modo}: aplicar recusado`)
    const pasta = foraDoRepo(a.pasta)
    const foto = lerFoto(readFileSync(join(pasta, 'foto', 'foto.json'), 'utf8'))
    if (foto.host !== sal) throw new Error('foto de outro ambiente; nada aplicado')
    const { estado, relatorio } = await avaliar(dv, { manter })
    if (!relatorio.zero) {
      console.log(resumoPublico(relatorio, { ambiente: a.ambiente, sal }))
      return 1
    }
    if (!mesmoPlano(foto, relatorio.plano)) {
      console.error('O ambiente mudou entre a foto e a aplicação; nada aplicado. Rode o workflow de novo.')
      return 1
    }
    if (!a.aplicar) {
      console.log('Dry-run: o plano bate com a foto; nada aplicado.')
      return 0
    }
    const { equipeAdicionar, equipeRemover, pessoasRemover } = relatorio.plano
    for (const r of equipeAdicionar) await dv.chamar('POST', `teams(${estado.equipe.id})/teamroles_association/$ref`, ref('roles', r))
    for (const r of equipeRemover) await dv.chamar('DELETE', `teams(${estado.equipe.id})/teamroles_association(${r})/$ref`)
    for (const { usuario, papel } of pessoasRemover) await dv.chamar('DELETE', `systemusers(${usuario})/systemuserroles_association(${papel})/$ref`)
    if (!planoVazio(planoDoCorte(await lerEstado(dv), { manter }))) {
      console.error('Conferência: ainda há papéis a tirar; veja o relatório cifrado e rode de novo.')
      return 1
    }
    console.log(`Corte aplicado: equipe -${equipeRemover.length} +${equipeAdicionar.length}; ${pessoasRemover.length} papel(is) direto(s) retirados.`)
    return 0
  }

  async function etapaDesfazer() {
    if (modo !== 'desfazer') throw new Error(`modo ${modo}: desfazer recusado`)
    const dir = foraDoRepo(a.fotos)
    const arquivos = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('foto.json'))
    if (!arquivos.length) throw new Error('nenhuma foto encontrada; nada desfeito')
    const fotos = arquivos.map((f) => lerFoto(readFileSync(join(dir, f), 'utf8')))
    if (fotos.some((f) => f.host !== sal)) throw new Error('foto de outro ambiente; nada desfeito')
    const estado = await lerEstado(dv)
    const plano = planoDesfazer(fotos, estado)
    console.log(`Desfazer (${a.ambiente}): ${fotos.length} foto(s); equipe +${plano.equipeAdicionar.length}; ${plano.pessoasAdicionar.length} papel(is) direto(s) de volta; ${plano.ignorados.length} item(ns) ignorado(s) (pessoa inativa ou papel ausente).`)
    if (!a.aplicar) return 0
    for (const r of plano.equipeAdicionar) await dv.chamar('POST', `teams(${estado.equipe.id})/teamroles_association/$ref`, ref('roles', r))
    for (const { usuario, papel } of plano.pessoasAdicionar) await dv.chamar('POST', `systemusers(${usuario})/systemuserroles_association/$ref`, ref('roles', papel))
    const resto = planoDesfazer(fotos, await lerEstado(dv))
    if (resto.equipeAdicionar.length || resto.pessoasAdicionar.length) {
      console.error('Conferência: ainda falta devolver papéis; rode de novo.')
      return 1
    }
    return 0
  }

  const etapas = { automacao, avaliar: etapaAvaliar, aplicar: etapaAplicar, desfazer: etapaDesfazer }
  if (!etapas[a.etapa]) throw new Error(`etapa desconhecida: ${a.etapa}`)
  return etapas[a.etapa]()
}

principal().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error(limpo(e.message))
    process.exit(2)
  },
)
```

- [ ] **Passo 2: sem rede.** `node packages/deploy/acessos/corte.mjs --etapa modo --ambiente dev` → `esperar`. `node packages/deploy/acessos/corte.mjs --etapa modo --ambiente test; echo $?` → `ambiente desconhecido: test` e `2`.

- [ ] **Passo 3: `--aplicar` local é recusado.** `DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN=x node packages/deploy/acessos/corte.mjs --etapa automacao --ambiente dev --aplicar; echo $?` → `--aplicar só no workflow acessos-corte.yml; local é sempre dry-run` e `2`. Com `--ambiente prod` e o host do DEV → `não bate com o host`.

- [ ] **Passo 4: dry-run no DEV com o modo `cortar` só na cópia local.** Sem commitar a mudança do `corte.json`:

```bash
SCRATCH="$(mktemp -d)"
ORG=org23b93544
export DV_URL=https://$ORG.crm2.dynamics.com
export DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)"
export ACESSOS_ADMINS_MANTER="$ACESSOS_ADMINS_MANTER"
sed -i 's/"dev": "esperar"/"dev": "cortar"/' packages/deploy/acessos/corte.json
node packages/deploy/acessos/corte.mjs --etapa automacao --ambiente dev; echo "automacao=$?"
node packages/deploy/acessos/corte.mjs --etapa avaliar --ambiente dev --pasta "$SCRATCH" > "$SCRATCH/avaliar.txt"; echo "avaliar=$?"; cat "$SCRATCH/estado.txt"
[ "$(cat "$SCRATCH/estado.txt")" = aplicar ] && node packages/deploy/acessos/corte.mjs --etapa aplicar --ambiente dev --pasta "$SCRATCH"; echo "aplicar=$?"
git checkout packages/deploy/acessos/corte.json
grep -cE '[0-9a-f]{8}-[0-9a-f]{4}-' "$SCRATCH/avaliar.txt"
```

Esperado: `automacao=0` com `ainda não existe; nada a fazer.`; `avaliar=0` com `estado.txt` = `aplicar` (ou `avaliar=1`/`travado`, que vira pendência da ativação); com `aplicar`, `Dry-run: o plano bate com a foto; nada aplicado.` e `aplicar=0`; `grep -c` = `0`; `git diff --quiet packages/deploy/acessos/corte.json` sem diferença. Nada foi gravado no DEV (todas as chamadas foram GET).

- [ ] **Passo 5: commit.**

```bash
git add packages/deploy/acessos/corte.mjs
git commit -m "feat(acessos): corte.mjs aplica e desfaz o corte pelo workflow

Etapas modo, automacao, avaliar, aplicar e desfazer. Aplicar reavalia,
confere com a foto, põe a Base na equipe antes de tirar os papéis e
confere no fim. Desfazer une as fotos e devolve o que falta. --aplicar
só com GITHUB_ACTIONS e conta de serviço; local é dry-run no DEV.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: caminho de publicação dos arquivos do corte

**Arquivos:** editar `packages/deploy/caminho-publicacao.mjs`, `packages/deploy/caminho-publicacao.test.mjs`.

**Interfaces.** Consome: `NEUTRO`. Produz: arquivos do corte → `nada` (a Produção só move a tag e o job `acessos` roda depois do `marcar`); `aplicar-perfis.ps1` e `perfis.gerado.json` continuam em `solucoes`.

- [ ] **Passo 1: teste que falha.** Acrescentar ao `caminho-publicacao.test.mjs`:

```js
test('corte dos acessos não muda o caminho do PROD (roda no job acessos)', () => {
  for (const a of [
    'packages/deploy/acessos/corte.json',
    'packages/deploy/acessos/corte.mjs',
    'packages/deploy/acessos/corte-regras.mjs',
    'packages/deploy/acessos/corte-regras.test.mjs',
    'packages/deploy/acessos/corte-estado.mjs',
    'packages/deploy/acessos/corte-ci.mjs',
    'packages/deploy/acessos/relatorio-corte.mjs',
    'packages/deploy/acessos/dv.mjs',
    'packages/deploy/acessos/dv.test.mjs',
    'packages/deploy/acessos/quem-le.mjs',
    'packages/deploy/acessos/prova.mjs',
    '.github/workflows/acessos-corte.yml',
  ]) assert.equal(caminhoDoArquivo(a), 'nada', a)
  assert.equal(caminhoDaPublicacao(['packages/deploy/acessos/corte.json']).caminho, 'nada')
  assert.equal(caminhoDoArquivo('packages/deploy/acessos/aplicar-perfis.ps1'), 'solucoes')
  assert.equal(caminhoDoArquivo('packages/deploy/acessos/perfis.gerado.json'), 'solucoes')
  assert.equal(caminhoDoArquivo('packages/deploy/acessos/corte-extra.ps1'), 'solucoes')
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/caminho-publicacao.test.mjs` → falha em `packages/deploy/acessos/corte.json` (`'solucoes' !== 'nada'`).

- [ ] **Passo 3: implementar.** Em `caminho-publicacao.mjs`, logo depois da linha `/^packages\/deploy\/projetos\//,`:

```js
  // Corte dos acessos (plano 4): roda no job acessos (acessos-corte.yml) do Deploy e da Produção, depois da publicação;
  // quem-le e prova são só leitura/DEV. O motor e os perfis (aplicar-perfis.ps1, perfis.gerado.json) seguem pelas soluções.
  /^packages\/deploy\/acessos\/(corte\.json|(corte|corte-regras|corte-estado|corte-ci|relatorio-corte|dv|quem-le|prova)(\.test)?\.mjs)$/,
```

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/caminho-publicacao.test.mjs` → `fail 0`.

- [ ] **Passo 5: commit.**

```bash
git add packages/deploy/caminho-publicacao.mjs packages/deploy/caminho-publicacao.test.mjs
git commit -m "feat(deploy): arquivos do corte dos acessos seguem o caminho nada

corte.json e os scripts do corte não publicam nada: o job acessos da
Produção roda depois do marcar. Motor e perfis continuam pelas
soluções.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: workflow reutilizável e job `acessos` no Deploy (DEV)

**Arquivos:** criar `.github/workflows/acessos-corte.yml`; editar `.github/workflows/deploy.yml`.

**Interfaces.** Consome: `corte.mjs`, `quem-le.mjs`, `artefato-cifrado.sh`, secrets `DV_CLIENT_SECRET` (environment) e `PACOTES_SENHA` (repositório), variáveis `DV_ENVIRONMENT_URL`, `DV_TENANT_ID`, `DV_CLIENT_ID`, `ACESSOS_ADMINS_MANTER`, `ACESSOS_AUTOMACAO_MEMBROS`. Produz: artefatos `acessos-relatorio-<amb>` (30 dias) e `acessos-foto-<amb>` (90 dias), cifrados; tag `acessos-corte-<amb>`.

- [ ] **Passo 1: criar `.github/workflows/acessos-corte.yml`.**

```yaml
name: Corte dos acessos

# Plano 4 dos acessos por perfil (decisão do Renan, 24/11/2026). Chamado pelo Deploy (develop → DEV, environment dev) e
# pela Produção (main → PROD, environment prod-front), sempre na conta de serviço. O modo vem de
# packages/deploy/acessos/corte.json:
#  - esperar: só garante os membros do perfil de coluna "Passageiros - automação" (se existir);
#  - cortar: relatório (trava vermelho se não zerar); se houver o que tirar, foto cifrada (90 dias), tag
#    acessos-corte-<ambiente> e corte; ambiente já cortado = nada;
#  - desfazer: com a tag, baixa todas as fotos, devolve os papéis e apaga a tag; sem a tag, nada.
# Log público: contagens e ids curtos com hash. Relatório e foto com ids reais só cifrados (PACOTES_SENHA).
on:
  workflow_call:
    inputs:
      ambiente:
        type: string
        required: true
      environment:
        type: string
        required: true

jobs:
  corte:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: ${{ inputs.environment }}
    permissions:
      contents: write
      actions: read
    env:
      AMB: ${{ inputs.ambiente }}
      DV_ENVIRONMENT_URL: ${{ vars.DV_ENVIRONMENT_URL }}
      DV_TENANT_ID: ${{ vars.DV_TENANT_ID }}
      DV_CLIENT_ID: ${{ vars.DV_CLIENT_ID }}
      DV_CLIENT_SECRET: ${{ secrets.DV_CLIENT_SECRET }}
      ACESSOS_ADMINS_MANTER: ${{ vars.ACESSOS_ADMINS_MANTER }}
      ACESSOS_AUTOMACAO_MEMBROS: ${{ vars.ACESSOS_AUTOMACAO_MEMBROS }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Modo do corte
        id: modo
        run: echo "modo=$(node packages/deploy/acessos/corte.mjs --etapa modo --ambiente "$AMB")" >> "$GITHUB_OUTPUT"
      - name: Membros do perfil de automação
        run: node packages/deploy/acessos/corte.mjs --etapa automacao --ambiente "$AMB" --aplicar
      - name: Quem lê o passageiro (informativo)
        if: steps.modo.outputs.modo != 'esperar'
        continue-on-error: true
        run: node packages/deploy/acessos/quem-le.mjs
      - name: Avaliar o corte
        id: avaliar
        if: steps.modo.outputs.modo == 'cortar'
        run: |
          set +e
          node packages/deploy/acessos/corte.mjs --etapa avaliar --ambiente "$AMB" --pasta "$RUNNER_TEMP/corte"
          codigo=$?
          echo "estado=$(cat "$RUNNER_TEMP/corte/estado.txt" 2>/dev/null || echo erro)" >> "$GITHUB_OUTPUT"
          exit $codigo
      - name: Cifrar o relatório
        if: always() && steps.modo.outputs.modo == 'cortar'
        env:
          PACOTES_SENHA: ${{ secrets.PACOTES_SENHA }}
        run: |
          [ -d "$RUNNER_TEMP/corte/relatorio" ] || { echo "Sem relatório."; exit 0; }
          bash packages/deploy/solucoes/artefato-cifrado.sh cifrar "$RUNNER_TEMP/corte/relatorio" "$RUNNER_TEMP/saida/relatorio.enc"
      - uses: actions/upload-artifact@v4
        if: always() && steps.modo.outputs.modo == 'cortar'
        with:
          name: acessos-relatorio-${{ inputs.ambiente }}
          path: ${{ runner.temp }}/saida/relatorio.enc
          if-no-files-found: ignore
          retention-days: 30
      - name: Cifrar a foto
        if: steps.avaliar.outputs.estado == 'aplicar'
        env:
          PACOTES_SENHA: ${{ secrets.PACOTES_SENHA }}
        run: bash packages/deploy/solucoes/artefato-cifrado.sh cifrar "$RUNNER_TEMP/corte/foto" "$RUNNER_TEMP/foto/foto.enc"
      - uses: actions/upload-artifact@v4
        if: steps.avaliar.outputs.estado == 'aplicar'
        with:
          name: acessos-foto-${{ inputs.ambiente }}
          path: ${{ runner.temp }}/foto/foto.enc
          if-no-files-found: error
          retention-days: 90
      # A tag anda antes de aplicar: um corte que falhe no meio continua desfazível pela foto já guardada.
      - name: Marcar o início do corte
        if: steps.avaliar.outputs.estado == 'aplicar'
        run: |
          git tag -f "acessos-corte-$AMB" "$GITHUB_SHA"
          git push -f origin "refs/tags/acessos-corte-$AMB"
      - name: Aplicar o corte
        if: steps.avaliar.outputs.estado == 'aplicar'
        run: node packages/deploy/acessos/corte.mjs --etapa aplicar --ambiente "$AMB" --pasta "$RUNNER_TEMP/corte" --aplicar
      - name: Baixar as fotos
        id: fotos
        if: steps.modo.outputs.modo == 'desfazer'
        env:
          GH_TOKEN: ${{ github.token }}
          PACOTES_SENHA: ${{ secrets.PACOTES_SENHA }}
        run: |
          if ! git ls-remote --exit-code --tags origin "refs/tags/acessos-corte-$AMB" > /dev/null; then
            echo "Sem a tag acessos-corte-$AMB: nada a desfazer."
            echo "ha=nao" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          gh api "repos/$GITHUB_REPOSITORY/actions/artifacts?name=acessos-foto-$AMB&per_page=100" \
            --jq '.artifacts[] | select(.expired == false) | .id' > "$RUNNER_TEMP/ids.txt"
          if [ ! -s "$RUNNER_TEMP/ids.txt" ]; then
            echo "::error::Nenhuma foto do corte nos últimos 90 dias; o desfazer automático não tem o que devolver."
            exit 1
          fi
          while read -r id; do
            gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$id/zip" > "$RUNNER_TEMP/foto-$id.zip"
            unzip -q -o "$RUNNER_TEMP/foto-$id.zip" -d "$RUNNER_TEMP/zip-$id"
            bash packages/deploy/solucoes/artefato-cifrado.sh decifrar "$RUNNER_TEMP/zip-$id/foto.enc" "$RUNNER_TEMP/fotos/$id"
          done < "$RUNNER_TEMP/ids.txt"
          echo "Fotos: $(wc -l < "$RUNNER_TEMP/ids.txt")"
          echo "ha=sim" >> "$GITHUB_OUTPUT"
      - name: Desfazer o corte
        if: steps.fotos.outputs.ha == 'sim'
        run: node packages/deploy/acessos/corte.mjs --etapa desfazer --ambiente "$AMB" --fotos "$RUNNER_TEMP/fotos" --aplicar
      - name: Apagar a tag do corte
        if: steps.fotos.outputs.ha == 'sim'
        run: git push origin ":refs/tags/acessos-corte-$AMB"
```

- [ ] **Passo 2: `paths` do Deploy.** Em `.github/workflows/deploy.yml`, no fim da lista `on.push.paths` (depois de `'packages/plugins/tools/**'` e das linhas que vierem depois dela, antes de `workflow_dispatch`), acrescentar:

```yaml
      # Corte dos acessos (plano 4): job acessos, depois do dev.
      - 'packages/deploy/acessos/corte.json'
      - 'packages/deploy/acessos/corte*.mjs'
      - 'packages/deploy/acessos/relatorio-corte.mjs'
      - 'packages/deploy/acessos/dv.mjs'
      - '!packages/deploy/acessos/*.test.mjs'
      - '.github/workflows/acessos-corte.yml'
```

Conferir com `sed -n '/^on:/,/^jobs:/p' .github/workflows/deploy.yml | tail -20` que as linhas ficaram dentro de `paths`.

- [ ] **Passo 3: job `acessos` no Deploy.** Em `.github/workflows/deploy.yml`, depois do job `tag-flows` (fim do arquivo), acrescentar:

```yaml
  # Corte dos acessos no DEV (plano 4): modo em packages/deploy/acessos/corte.json; só na develop e depois do dev verde.
  acessos:
    needs: dev
    if: needs.dev.result == 'success' && github.ref == 'refs/heads/develop'
    uses: ./.github/workflows/acessos-corte.yml
    with:
      ambiente: dev
      environment: dev
    secrets: inherit
    permissions:
      contents: write
      actions: read
```

- [ ] **Passo 4: validar a sintaxe.** `node -e "for (const f of ['.github/workflows/acessos-corte.yml','.github/workflows/deploy.yml']) { const t = require('fs').readFileSync(f,'utf8'); if (/\t/.test(t)) throw new Error(f + ': tab') } console.log('ok')"` e, se houver `actionlint` na máquina, `actionlint .github/workflows/acessos-corte.yml .github/workflows/deploy.yml` → sem erro. Sem `actionlint`, a validação fica para o CI do PR (o GitHub recusa workflow inválido na hora do push; confira a aba Actions do PR).

- [ ] **Passo 5: commit.**

```bash
git add .github/workflows/acessos-corte.yml .github/workflows/deploy.yml
git commit -m "ci(acessos): workflow do corte e job acessos no Deploy do DEV

acessos-corte.yml lê o modo do corte.json, garante os membros do
perfil de automação, avalia (trava vermelho se não zerar), guarda a
foto cifrada por 90 dias, marca a tag acessos-corte-<ambiente> e
aplica; no desfazer baixa todas as fotos, devolve e apaga a tag. O
Deploy chama o workflow depois do dev, só na develop.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: job `acessos` na Produção (PROD)

**Arquivos:** editar `.github/workflows/producao.yml`.

**Interfaces.** Consome: `acessos-corte.yml`, environment `prod-front` (conta de serviço do PROD, sem revisor, só `main` e `hotfix/*`). Produz: corte no PROD depois do `marcar`.

- [ ] **Passo 1: comentário do cabeçalho.** Em `producao.yml`, depois da linha `# A tag só anda quando a publicação passa: o que falhou ou foi recusado volta a contar no próximo push.`, acrescentar:

```yaml
# Depois do marcar, em todo caminho (inclusive nada), o job acessos roda o corte dos acessos (acessos-corte.yml) no
# modo de packages/deploy/acessos/corte.json. A tag prod-publicado não espera o corte; corte travado deixa a execução
# vermelha e é reavaliado na próxima publicação.
```

- [ ] **Passo 2: job.** Depois do job `projetos` (fim do arquivo), acrescentar:

```yaml
  # Corte dos acessos no PROD (plano 4). Aprovação = merge do PR develop → main que levou "prod": "cortar" ou "desfazer".
  acessos:
    needs: [caminho, marcar]
    if: ${{ !cancelled() && needs.marcar.result == 'success' }}
    uses: ./.github/workflows/acessos-corte.yml
    with:
      ambiente: prod
      environment: prod-front
    secrets: inherit
    permissions:
      contents: write
      actions: read
```

O `permissions: contents: write` do topo do `producao.yml` não inclui `actions: read`; o job pede as duas, e como o topo define só `contents`, o GitHub concede ao job exatamente o que ele declara (a permissão do job substitui a do topo).

- [ ] **Passo 3: validar.** `actionlint .github/workflows/producao.yml` se disponível; senão, CI do PR.

- [ ] **Passo 4: commit.**

```bash
git add .github/workflows/producao.yml
git commit -m "ci(acessos): job acessos na Produção depois do marcar

O corte do PROD roda em todo caminho, depois de a tag prod-publicado
andar, no environment prod-front (conta de serviço). A publicação não
espera o corte; corte travado deixa a execução vermelha e volta a ser
avaliado na próxima.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: trava no CI para a proteção do passageiro

**Arquivos:** criar `packages/deploy/acessos/corte-ci.mjs`, `packages/deploy/acessos/corte-ci.test.mjs`; editar `.github/workflows/ci.yml`, `packages/deploy/package.json`.

**Interfaces.** Consome: saída de `git diff --name-status -M base...HEAD`, `corte.json`, presença da tag `acessos-corte-prod` no origin. Produz: `PASSAGEIRO` (regex), `checarPassageiro(linhas, { modoProd, tagProd }) → erros`.

- [ ] **Passo 1: teste que falha.** Criar `packages/deploy/acessos/corte-ci.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checarPassageiro } from './corte-ci.mjs'

const NOVA = 'A\tpackages/deploy/migrations/20261201-0900-acessos-passageiro.ps1'

test('migration do passageiro nova sem o corte do PROD reprova', () => {
  assert.equal(checarPassageiro([NOVA], { modoProd: 'esperar', tagProd: false }).length, 1)
  assert.equal(checarPassageiro([NOVA], { modoProd: 'cortar', tagProd: false }).length, 1)
  assert.equal(checarPassageiro([NOVA], { modoProd: 'desfazer', tagProd: true }).length, 1)
  assert.match(checarPassageiro([NOVA], { modoProd: 'esperar', tagProd: false })[0], /só entra depois do corte do PROD/)
})

test('com o PROD cortado passa; sem migration do passageiro não olha nada', () => {
  assert.deepEqual(checarPassageiro([NOVA, ''], { modoProd: 'cortar', tagProd: true }), [])
  assert.deepEqual(checarPassageiro(['M\tpackages/deploy/acessos/corte.json', 'A\tpackages/deploy/migrations/20261201-0900-outra.ps1'], { modoProd: 'esperar', tagProd: false }), [])
  assert.equal(checarPassageiro(['R100\tpackages/deploy/migrations/x.ps1\tpackages/deploy/migrations/20261201-0900-acessos-passageiro.ps1'], { modoProd: 'esperar', tagProd: false }).length, 1)
})
```

- [ ] **Passo 2: rodar e ver falhar.** `node --test packages/deploy/acessos/corte-ci.test.mjs` → `Cannot find module`.

- [ ] **Passo 3: implementar.** Criar `packages/deploy/acessos/corte-ci.mjs`:

```js
#!/usr/bin/env node
// Trava do CI (plano 4): a migration que protege o contato do passageiro só entra depois do corte do PROD, para que a
// proteção não chegue ao PROD pelas soluções antes de as pessoas terem os perfis. Condição: corte.json com
// "prod": "cortar" e a tag acessos-corte-prod no origin.
// Uso: git diff --name-status -M origin/$BASE...HEAD | node packages/deploy/acessos/corte-ci.mjs --tag-prod <0|1>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { lerCorte } from './corte-regras.mjs'

export const PASSAGEIRO = /^packages\/deploy\/migrations\/\d{8}-\d{4}-acessos-passageiro[^/]*\.ps1$/

export function checarPassageiro(linhas, { modoProd, tagProd }) {
  const novas = linhas
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .filter(([s, a, b]) => (s[0] === 'A' && PASSAGEIRO.test(a)) || ((s[0] === 'R' || s[0] === 'C') && PASSAGEIRO.test(b ?? '')))
    .map(([s, a, b]) => (s[0] === 'A' ? a : b))
  if (!novas.length || (modoProd === 'cortar' && tagProd)) return []
  return novas.map((m) => `${m}: a proteção do passageiro só entra depois do corte do PROD (corte.json "prod": "cortar" e tag acessos-corte-prod no origin; hoje "prod": "${modoProd}", tag ${tagProd ? 'presente' : 'ausente'}).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { 'tag-prod': { type: 'string', default: '0' } } })
  const modoProd = lerCorte(readFileSync(new URL('./corte.json', import.meta.url), 'utf8'), 'prod')
  const erros = checarPassageiro(readFileSync(0, 'utf8').split('\n'), { modoProd, tagProd: Number(values['tag-prod']) > 0 })
  for (const e of erros) console.error(`::error::${e}`)
  process.exit(erros.length ? 1 : 0)
}
```

- [ ] **Passo 4: rodar e ver passar.** `node --test packages/deploy/acessos/corte-ci.test.mjs` → `fail 0`. E a CLI: `printf 'A\tpackages/deploy/migrations/20261201-0900-acessos-passageiro.ps1\n' | node packages/deploy/acessos/corte-ci.mjs --tag-prod 0; echo $?` → `::error::...` e `1`.

- [ ] **Passo 5: passo no CI.** Em `.github/workflows/ci.yml`, no job `schema`, depois do passo `Migrations`:

```yaml
      - name: Proteção do passageiro só depois do corte do PROD
        env:
          BASE: ${{ github.base_ref }}
        run: |
          tag=$(git ls-remote --tags origin refs/tags/acessos-corte-prod | wc -l)
          git diff --name-status -M "origin/$BASE...HEAD" | node packages/deploy/acessos/corte-ci.mjs --tag-prod "$tag"
```

- [ ] **Passo 6: lista de testes.** Acrescentar ` acessos/corte-ci.test.mjs` ao fim do script `test` de `packages/deploy/package.json`.

- [ ] **Passo 7: suíte do pacote só com os arquivos desta frente.** `node --test packages/deploy/acessos/corte-regras.test.mjs packages/deploy/acessos/corte-estado.test.mjs packages/deploy/acessos/dv.test.mjs packages/deploy/acessos/corte-ci.test.mjs packages/deploy/acessos/gerar.test.mjs packages/deploy/caminho-publicacao.test.mjs` → `fail 0`.

- [ ] **Passo 8: commit.**

```bash
git add packages/deploy/acessos/corte-ci.mjs packages/deploy/acessos/corte-ci.test.mjs .github/workflows/ci.yml packages/deploy/package.json
git commit -m "ci(acessos): proteção do passageiro só depois do corte do PROD

O job schema do CI reprova migration *-acessos-passageiro*.ps1 nova
enquanto o corte.json não estiver com prod = cortar e a tag
acessos-corte-prod não existir no origin.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Fim do primeiro PR (Tarefas 1 a 12 e 14): abrir PR para a `develop` com `corte.json` em `esperar` nos dois ambientes; nada muda no DEV nem no PROD com o merge (o job `acessos` só roda a etapa de automação, que não acha o perfil).

---

### Tarefa 13: proteção do contato do passageiro (PR próprio, depois do passo (e) da ativação)

**Arquivos:** editar `apps/shell/src/nav/acessosColunas.json`, `packages/deploy/acessos/perfis.gerado.json` (gerado), `packages/deploy/acessos/gerar.test.mjs`, `packages/deploy/acessos/quem-le.mjs` e `prova.mjs` (só cabeçalhos); criar `packages/deploy/migrations/AAAAMMDD-HHMM-acessos-passageiro.ps1` (data e hora do dia da implementação, posterior a `20261124-2100-portal-colunas-reserva.ps1` e a qualquer migration já na `develop`).

**Interfaces.** Consome: motor `Invoke-PerfisDeAcesso` (não muda), `_dv.ps1`, `PERFIL_AUTOMACAO`. Produz: as 4 colunas com `IsSecured`; `Perfil - Operacional - *` com ler e editar, `Perfil - Financeiro - *` com ler, `Motoristas` com ler em telefone e endereço de saída, perfil novo `Passageiros - automação` com ler nas 4 (membro na migration: a conta de serviço; nos outros, o job `acessos` com `ACESSOS_AUTOMACAO_MEMBROS`).

Como chega ao PROD sem antecipar o corte: a trava da Tarefa 12 só deixa este PR entrar na `develop` depois de o corte do PROD ter começado (tag) com `prod: cortar`. O Deploy aplica a migration no DEV; o PR `develop → main` seguinte leva a migration e o `perfis.gerado.json` e cai em "Publicar soluções" (migration e motor estão fora do `NEUTRO`): a BetinhosCore leva ao TEST e ao PROD o `IsSecured`, os perfis de coluna (componente 70) e as permissões num import só, e o job `acessos` da mesma execução põe os membros do perfil de automação.

- [ ] **Passo 1: pré-condição.** `git fetch origin develop --tags && git ls-remote --tags origin refs/tags/acessos-corte-prod` → uma linha; `git show origin/develop:packages/deploy/acessos/corte.json` → `"prod": "cortar"`. Se não, parar: este PR espera o passo (e).

- [ ] **Passo 2: teste que falha.** Em `packages/deploy/acessos/gerar.test.mjs`, trocar o teste `'contato do passageiro fica fora ate o corte'` inteiro por:

```js
test('contato do passageiro: Operacional edita, Financeiro le, os outros nao veem', () => {
  const protegidas = ['cr40f_telefone', 'cr40f_email', 'cr40f_datadenascimento', 'cr40f_enderecodesaida']
  const de = (nome) => gerado.colunas[nome].filter((p) => p.tabela === 'cr40f_bancodedados' && protegidas.includes(p.coluna))
  for (const nivel of ['Operador', 'Gestor']) {
    assert.deepEqual(de(`Perfil - Operacional - ${nivel}`).map((p) => [p.coluna, p.ler, p.editar]).sort(), protegidas.map((c) => [c, true, true]).sort())
    assert.deepEqual(de(`Perfil - Financeiro - ${nivel}`).map((p) => [p.coluna, p.ler, p.editar]).sort(), protegidas.map((c) => [c, true, false]).sort())
  }
  for (const nome of Object.keys(gerado.colunas).filter((n) => !/Operacional|Financeiro/.test(n))) assert.deepEqual(de(nome), [], nome)
})
```

`node --test packages/deploy/acessos/gerar.test.mjs` → falha neste teste (o gerado ainda não tem o passageiro).

- [ ] **Passo 3: mapa de colunas.** Em `apps/shell/src/nav/acessosColunas.json`:
  - `"cr40f_bancodedados": { "cr": ["cr40f_cr"] }` → `"cr40f_bancodedados": { "cr": ["cr40f_cr"], "passageiro": ["cr40f_telefone", "cr40f_email", "cr40f_datadenascimento", "cr40f_enderecodesaida"] }` (mantendo a quebra de linha do arquivo);
  - em `perfis.operacional.operador.editar`, acrescentar `"cr40f_bancodedados.passageiro"` depois de `"cr40f_bancodedados.cr"`;
  - em `perfis.financeiro.operador.ler`, acrescentar `"cr40f_bancodedados.passageiro"` depois de `"cr40f_bancodedados.cr"`.

  O Gestor herda do Operador (`permissoes` em `gerar.mjs` percorre `operador` e `gestor`).

- [ ] **Passo 4: gerar.** `node packages/deploy/acessos/gerar.mjs` e `node --test packages/deploy/acessos/gerar.test.mjs` → o teste do passageiro passa; reprova só `'perfis.gerado.json esta em dia com os mapas'` porque nenhuma migration tem o hash novo.

- [ ] **Passo 5: migration.** Criar `packages/deploy/migrations/AAAAMMDD-HHMM-acessos-passageiro.ps1` (UTF-8 com BOM; comentários em ASCII) com:

```powershell
param([string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/", [switch] $Apply)
# Protecao do contato do passageiro (plano 4 dos acessos por perfil, decisao do Renan de 24/11/2026).
# cr40f_bancodedados: cr40f_telefone, cr40f_email, cr40f_datadenascimento e cr40f_enderecodesaida passam a IsSecured.
# Ordem obrigatoria (0x8004f508 da 1700, refeita na 1900): 1) protege as colunas; 2) motor dos perfis com o hash novo
# (Operacional edita, Financeiro le); 3) perfil Motoristas le telefone e endereco de saida; 4) perfil
# "Passageiros - automacao" le as 4 (membro aqui: a conta que roda; os outros pelo job acessos com
# ACESSOS_AUTOMACAO_MEMBROS). Perfis e permissoes vao na solucao (componente 70); membros nao.
# Idempotente. Somente DEV. So entra depois do corte do PROD (trava packages/deploy/acessos/corte-ci.mjs).
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)
. "$PSScriptRoot/../acessos/aplicar-perfis.ps1"

$tabela = "cr40f_bancodedados"
$colunas = [ordered]@{
  cr40f_telefone         = "StringAttributeMetadata"
  cr40f_email            = "StringAttributeMetadata"
  cr40f_datadenascimento = "DateTimeAttributeMetadata"
  cr40f_enderecodesaida  = "StringAttributeMetadata"
}
$leituraMotoristas = @("cr40f_telefone", "cr40f_enderecodesaida")
$perfilAutomacao = "Passageiros - automação"
$descricaoAutomacao = "Le telefone, e-mail, nascimento e endereco de saida do passageiro (cr40f_bancodedados). Membros: conta de servico e donos de flow, por ambiente."

function Get-Atributo([string] $coluna) {
  Invoke-Dv "GET" "EntityDefinitions(LogicalName='$tabela')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.$($colunas[$coluna])"
}

function Set-Leitura([string] $perfilId, [string] $coluna) {
  $fp = @(Get-Rows "fieldpermissions" "fieldpermissionid,canread" "_fieldsecurityprofileid_value eq $perfilId and entityname eq '$tabela' and attributelogicalname eq '$coluna'")
  if ($fp.Count -eq 0) {
    Invoke-Dv "POST" "fieldpermissions" @{ "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"; entityname = $tabela; attributelogicalname = $coluna; canread = 4; cancreate = 0; canupdate = 0 } | Out-Null
  } elseif ($fp[0].canread -ne 4) {
    Invoke-Dv "PATCH" "fieldpermissions($($fp[0].fieldpermissionid))" @{ canread = 4 } | Out-Null
  }
}

$motoristas = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq 'Motoristas'")
if ($motoristas.Count -ne 1) { throw "Perfil de coluna 'Motoristas': $($motoristas.Count) encontrados (esperado 1)." }
$automacao = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilAutomacao'")

if (-not $Apply) {
  foreach ($c in $colunas.Keys) {
    $a = Get-Atributo $c
    Write-Step "DRY RUN: $tabela.$c IsSecured=$($a.IsSecured) CanBeSecuredForRead=$($a.CanBeSecuredForRead.Value)"
  }
  Write-Step "DRY RUN: perfil '$perfilAutomacao' $(if ($automacao.Count) { 'existe' } else { 'seria criado' })."
  Invoke-PerfisDeAcesso "__HASH__"
  return
}

# 1. Colunas protegidas antes de qualquer fieldpermission.
foreach ($c in $colunas.Keys) {
  $attr = Get-Atributo $c
  if ($attr.IsSecured) { continue }
  if (-not $attr.CanBeSecuredForRead.Value) { throw "$tabela.$c nao aceita seguranca de coluna." }
  $attr.IsSecured = $true
  $corpo = [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.$($colunas[$c])" }
  foreach ($p in $attr.PSObject.Properties) { if ($p.Name -notlike "@odata.*") { $corpo[$p.Name] = $p.Value } }
  Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$tabela')/Attributes($($attr.MetadataId))" $corpo @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Write-Step "$tabela.$c com seguranca de coluna"
}
Publish-Tabela $tabela

# 2. Perfis de acesso com o grupo bancodedados.passageiro (hash do perfis.gerado.json desta mudanca).
Invoke-PerfisDeAcesso "__HASH__"

# 3. Motoristas le telefone e endereco de saida.
$motoristasId = [string] $motoristas[0].fieldsecurityprofileid
foreach ($c in $leituraMotoristas) { Set-Leitura $motoristasId $c }
Add-ComponenteNaSolucao $motoristasId 70

# 4. Perfil de automacao com leitura nas 4 e a conta que roda como membro.
if ($automacao.Count -eq 0) {
  Invoke-Dv "POST" "fieldsecurityprofiles" @{ name = $perfilAutomacao; description = $descricaoAutomacao } | Out-Null
  $automacao = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilAutomacao'")
  Write-Step "criado o perfil '$perfilAutomacao'"
}
$automacaoId = [string] $automacao[0].fieldsecurityprofileid
Add-ComponenteNaSolucao $automacaoId 70
foreach ($c in $colunas.Keys) { Set-Leitura $automacaoId $c }
$eu = [string] (Invoke-Dv "GET" "WhoAmI").UserId
$ja = @((Invoke-Dv "GET" "fieldsecurityprofiles($automacaoId)/systemuserprofiles_association?`$select=systemuserid&`$filter=systemuserid eq $eu").value)
if ($ja.Count -eq 0) {
  Invoke-Dv "POST" "fieldsecurityprofiles($automacaoId)/systemuserprofiles_association/`$ref" @{ "@odata.id" = "$script:DvApi/systemusers($eu)" } | Out-Null
  Write-Step "conta que roda entrou no perfil '$perfilAutomacao'"
}

# 5. Conferencia.
foreach ($c in $colunas.Keys) { if (-not (Get-Atributo $c).IsSecured) { throw "$tabela.$c nao ficou protegida." } }
Write-Step "OK: contato do passageiro protegido; Operacional edita, Financeiro le, Motoristas le telefone e endereco, automacao le as 4."
```

Gravar o hash e conferir (o arquivo nasce com o marcador e sai sem ele):

```bash
M=packages/deploy/migrations/AAAAMMDD-HHMM-acessos-passageiro.ps1   # o nome real criado acima
sed -i "s/__HASH__/$(node packages/deploy/acessos/gerar.mjs --hash)/g" "$M"
grep -c "__HASH__" "$M"                     # 0
grep -c "$(node packages/deploy/acessos/gerar.mjs --hash)" "$M"   # 2
head -c 3 "$M" | od -An -tx1                # ef bb bf (BOM)
```

Se o editor gravou sem BOM: `printf '\xef\xbb\xbf' | cat - "$M" > "$M.tmp" && mv "$M.tmp" "$M"`.

- [ ] **Passo 6: testes.** `node --test packages/deploy/acessos/gerar.test.mjs packages/deploy/migrations-ci.test.mjs` → `fail 0`; `pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/nav/acessosMapa` → todos passam; `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` → sem erro.

- [ ] **Passo 7: dry-run da migration no DEV (não grava).**

```bash
export DOTNET_ROOT=~/.dotnet PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
pwsh -NoProfile -File "$M" 2>&1 | tail -n 20
```

Esperado: 4 linhas `DRY RUN: cr40f_bancodedados.<coluna> IsSecured=False CanBeSecuredForRead=True`, a linha do perfil `seria criado` e o motor listando, como pendência de dry-run, as 4 colunas sem segurança nos perfis Operacional e Financeiro (vira gravação no `-Apply`, depois do passo 1).

- [ ] **Passo 8: quem deixa de ler no DEV (informativo, só GET).** `node packages/deploy/acessos/quem-le.mjs` com `DV_URL`/`DV_ACCESS_TOKEN` do DEV. Anotar as contagens de DEPENDE e EQUIPE SEM COBERTURA para o Renan; donos de flow que leem essas colunas entram em `ACESSOS_AUTOMACAO_MEMBROS` do environment `dev` antes do merge.

- [ ] **Passo 9: cabeçalhos.** Em `quem-le.mjs`, trocar `(adiada para o plano do corte; nao existe migration para ela)` por `(migration *-acessos-passageiro.ps1 do plano 4)`. Em `prova.mjs`, trocar a frase `Fora do alcance: telefone, e-mail, nascimento e endereco de saida do passageiro (protecao adiada para o plano do corte)` por `Contato do passageiro: conferido pelo roteiro da skill verificar-acessos (secao Corte), nao por este script`.

- [ ] **Passo 10: commit e PR.**

```bash
git add apps/shell/src/nav/acessosColunas.json packages/deploy/acessos/perfis.gerado.json packages/deploy/acessos/gerar.test.mjs packages/deploy/acessos/quem-le.mjs packages/deploy/acessos/prova.mjs "$M"
git commit -m "feat(acessos): protege o contato do passageiro em cr40f_bancodedados

Telefone, e-mail, nascimento e endereço de saída passam a ter segurança
de coluna (coluna antes da permissão). Operacional edita, Financeiro
lê, Motoristas lê telefone e endereço de saída e o perfil novo
Passageiros - automação lê as quatro (conta de serviço e donos de
flow). Entra só depois do corte do PROD (trava corte-ci).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR para a `develop`. O CI precisa passar no passo `Proteção do passageiro só depois do corte do PROD`.

- [ ] **Passo 11: prova no DEV depois do Deploy.** O Deploy aplica a migration (job `dev`) e o job `acessos` põe os membros. Com um usuário de teste só com `Perfil - Base` (`DV_TESTE_ID`) e outro com `Perfil - Operacional - Operador` (`DV_ALVO_ID`), atribuídos pelo Renan na ficha do funcionário no DEV:

```bash
ORG=org23b93544
DV_URL=https://$ORG.crm2.dynamics.com \
DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)" \
DV_TESTE_ID="$DV_TESTE_ID" DV_ALVO_ID="$DV_ALVO_ID" node --input-type=module <<'EOF'
import { criarCliente, tokenDoAmbiente } from './packages/deploy/acessos/dv.mjs'
const dv = criarCliente(await tokenDoAmbiente())
const meta = await dv.um("EntityDefinitions(LogicalName='cr40f_bancodedados')?$select=EntitySetName,PrimaryIdAttribute")
const colunas = ['cr40f_telefone', 'cr40f_email', 'cr40f_datadenascimento', 'cr40f_enderecodesaida']
const [linha] = (await dv.um(`${meta.EntitySetName}?$select=${meta.PrimaryIdAttribute}&$filter=cr40f_telefone ne null and cr40f_enderecodesaida ne null&$top=1`)).value
for (const [rotulo, id] of [['teste (Base)', process.env.DV_TESTE_ID], ['alvo (Operacional)', process.env.DV_ALVO_ID]]) {
  const r = await dv.chamar('GET', `${meta.EntitySetName}(${linha[meta.PrimaryIdAttribute]})?$select=${colunas.join(',')}`, undefined, { MSCRMCallerID: id })
  console.log(rotulo, colunas.map((c) => `${c}=${r[c] == null ? 'vazio' : 'cheio'}`).join(' '))
}
EOF
```

Esperado: `teste (Base)` com as 4 `vazio`; `alvo (Operacional)` com `cr40f_telefone=cheio` e `cr40f_enderecodesaida=cheio` (e-mail e nascimento `cheio` quando o registro tiver). Nenhum valor é impresso.

---

### Tarefa 14: documentação e skill de verificação

**Arquivos:** editar `.claude/skills/verificar-acessos/SKILL.md`, `CLAUDE.md`.

**Interfaces.** Consome: tudo acima. Produz: roteiro de verificação do corte e a regra de publicação registrada.

- [ ] **Passo 1: skill.** Em `.claude/skills/verificar-acessos/SKILL.md`:
  - na seção `## Cobre`, no item `Código:`, acrescentar `packages/deploy/acessos/{corte.json,corte*.mjs,relatorio-corte.mjs,dv.mjs}`, `.github/workflows/acessos-corte.yml`, jobs `acessos` do `deploy.yml` e do `producao.yml`, migration `*-acessos-passageiro.ps1`;
  - acrescentar ao fim do `## Roteiro`:

```markdown
## Corte (plano 4)
1. Regras e leitura: `node --test packages/deploy/acessos/corte-regras.test.mjs packages/deploy/acessos/corte-estado.test.mjs packages/deploy/acessos/dv.test.mjs packages/deploy/acessos/corte-ci.test.mjs packages/deploy/caminho-publicacao.test.mjs` → `fail 0`.
2. Relatório no DEV (só GET; pasta fora do repo; `ACESSOS_ADMINS_MANTER` por variável de shell, nunca em arquivo): `DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN="$(az account get-access-token --resource https://org23b93544.crm2.dynamics.com --query accessToken -o tsv)" node packages/deploy/acessos/relatorio-corte.mjs --pasta "$(mktemp -d)"` → saída 0 (zero) ou 1 (travado), stdout sem GUID.
3. Dry-run do corte no DEV: mesmo ambiente, `corte.json` com `"dev": "cortar"` só na cópia local, `corte.mjs --etapa avaliar` e `--etapa aplicar` sem `--aplicar` → `Dry-run: o plano bate com a foto`. Desfaça a mudança do `corte.json`.
4. Depois de um Deploy/Produção com `cortar`: resumo do job `acessos` com `ZERO` e `Corte aplicado`; artefatos `acessos-relatorio-<amb>` e `acessos-foto-<amb>` presentes; tag `acessos-corte-<amb>` no commit. Rodar de novo → `Nada a cortar`.
5. `prova.mjs` com os usuários de teste (roteiro acima) continua passando depois do corte.
6. Passageiro (depois da migration): roteiro da Tarefa 13, passo 11, do plano `docs/superpowers/plans/2026-11-24-acessos-por-perfil-4-corte.md`.
7. Nunca rodar `relatorio-corte.mjs` nem `corte.mjs` contra o PROD à mão (o `dv.mjs` recusa token local no PROD); o PROD só pelo job `acessos` da Produção.
```

- [ ] **Passo 2: `CLAUDE.md`.** Na seção `## Publicação (develop → DEV, main → PROD)`, depois do item **Distribuição.**, acrescentar:

```markdown
- **Corte dos acessos** (plano 4, decisão do Renan de 24/11/2026). `packages/deploy/acessos/corte.json` liga por ambiente (`esperar`, `cortar`, `desfazer`). O job `acessos` (`acessos-corte.yml`) roda no Deploy depois do `dev` e na Produção depois do `marcar` (em todo caminho; os arquivos do corte caem em `nada`), na conta de serviço: relatório somente leitura que trava se alguém perderia criar ou gravar numa tabela usada nos últimos 90 dias ou se um flow ligado fica em risco; foto cifrada (`acessos-foto-<amb>`, 90 dias) antes de aplicar; tag `acessos-corte-<amb>`. O corte tira os papéis da `Team-Betinhos-MDA` (fica só `Perfil - Base`) e os papéis antigos e o admin diretos das pessoas; os papéis antigos não mudam. Admins mantidos vêm de `ACESSOS_ADMINS_MANTER` e membros do perfil de coluna `Passageiros - automação` de `ACESSOS_AUTOMACAO_MEMBROS` (variáveis dos environments `dev` e `prod-front`, ids separados por vírgula, nunca no repo). Desfazer: PR com o ambiente em `desfazer` (devolve o que as fotos guardaram e apaga a tag; sem foto em 90 dias, falha). A migration `*-acessos-passageiro.ps1` só passa no CI depois do corte do PROD (`corte-ci.mjs`).
```

- [ ] **Passo 3: commit.**

```bash
git add .claude/skills/verificar-acessos/SKILL.md CLAUDE.md
git commit -m "docs(acessos): corte dos acessos no CLAUDE.md e na skill verificar-acessos

Registra o corte.json, o job acessos no Deploy e na Produção, as travas,
a foto cifrada, as variáveis dos environments, o desfazer e a trava da
proteção do passageiro; a skill ganha o roteiro do corte.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Passo 4: antes do PR.** Skills `qualidade-antes-do-pr` e `verificacao-manter`; `git diff --cached` revisado em cada commit; `node scripts/dados-pessoais.mjs` → sem achado; `git grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' -- packages/deploy/acessos .github/workflows/acessos-corte.yml | grep -v '00000000-0000-0000-0000-'` → nada (só ids sintéticos nos testes). PR para a `develop`; merge do Renan.

---

## Ativação (depois do merge do primeiro PR)

Cada passo só começa com o anterior verde. Nada aqui roda contra o PROD à mão.

- [ ] **(a) Renan atribui os perfis no DEV** pela ficha do funcionário (`#/acessos` fora do menu desde o plano 3). Renan cria no environment `dev` do GitHub as variáveis `ACESSOS_ADMINS_MANTER` (ids das duas pessoas que ficam admin no DEV) e `ACESSOS_AUTOMACAO_MEMBROS` (donos de flow que leem o passageiro; pode ficar vazia agora). Conferência: dry-run da Tarefa 7, passo 3, sai `0`; se travar, o relatório local (`relatorio.json` na pasta temporária) diz quem e quais tabelas, e o Renan ajusta perfis ou move flows para a conta de serviço até zerar.
- [ ] **(b) PR liga o DEV:** `corte.json` com `"dev": "cortar"` (só essa linha). Merge na `develop` → Deploy → job `acessos`: relatório `ZERO`, foto cifrada, tag `acessos-corte-dev`, `Corte aplicado`. Se travar, nada foi aplicado; corrigir e rodar o Deploy de novo (`workflow_dispatch` na `develop`).
- [ ] **(c) Prova no DEV:** `prova.mjs` com `DV_TESTE_ID`/`DV_ALVO_ID` (roteiro da skill `verificar-acessos`) passa; `relatorio-corte.mjs` local sai `0` com `Plano: equipe perde 0 papel(is) e ganha 0; 0 papel(is) direto(s)`; o Renan usa o DEV com uma pessoa de cada área. Se algo quebrar: PR com `"dev": "desfazer"` → Deploy devolve os papéis e apaga a tag; depois PR de volta para `"dev": "esperar"`.
- [ ] **(d) Renan atribui os perfis no PROD** pela ficha do funcionário (tela `#/acessos`) e cria no environment `prod-front` as variáveis `ACESSOS_ADMINS_MANTER` e `ACESSOS_AUTOMACAO_MEMBROS` com os ids do PROD. Sem caminho local para conferir o PROD: o primeiro relatório do PROD vem do passo (e), que trava sem aplicar se algo faltar.
- [ ] **(e) PR liga o PROD:** `corte.json` com `"prod": "cortar"` para a `develop`; PR `develop → main` (merge do Renan = aprovação). Produção: caminho `nada` (se só isso mudou) → `marcar` → job `acessos`: relatório, foto, tag `acessos-corte-prod`, corte. Travado: execução vermelha, nada aplicado, relatório no artefato `acessos-relatorio-prod` (decifrar localmente com `bash packages/deploy/solucoes/artefato-cifrado.sh decifrar <arquivo.enc> <pasta fora do repo>`); ajustar no PROD pela tela e re-executar a Produção (`workflow_dispatch`, caminho `auto`). Depois do verde: Tarefa 13 (PR do passageiro).
- [ ] **(f) Desfazer** (se preciso, em qualquer ambiente): PR com o ambiente em `"desfazer"`. DEV: merge na `develop`. PROD: `develop → main`. O job baixa todas as fotos `acessos-foto-<amb>` ainda válidas, devolve à equipe e às pessoas ativas o que elas guardaram (`Perfil - Base` fica), confere e apaga a tag. Depois, PR com `"esperar"`. Limites: foto expira em 90 dias (sem foto o job falha e o desfazer vira trabalho do Renan a partir do relatório); o desfazer não tira a proteção do passageiro (se for preciso, migration nova com `IsSecured = false`).

## Auto-revisão

Conferido contra o pedido e corrigido neste arquivo:

1. **Cobertura das decisões.** Troca dos papéis da equipe sem alterar os papéis antigos (Tarefas 3 e 8); admins mantidos por variável (Tarefa 3, `conferirManter`, e workflow); integrado ao Deploy e à Produção com `corte.json` (Tarefas 1, 10, 11); `caminho-publicacao` com teste (Tarefa 9); idempotência (`planoVazio` depois de aplicar, teste na Tarefa 3; job sem nada a fazer sai `nada`); foto cifrada antes de aplicar e desfazer versionado (Tarefas 5, 8, 10); trava em zero com log só de contagens e hash (Tarefas 4, 7); critério de 90 dias com `createdby`/`modifiedby` (Tarefas 4, 6); flows e referências de conexão (Tarefas 4, 6); passageiro com coluna antes da permissão, Motoristas, automação, `acessosColunas.json` e `gerar.test.mjs` (Tarefa 13); motor intocado e `dv.mjs` extraído com testes (Tarefa 2).
2. **Corrigido: corte parcial ficava sem desfazer.** A tag andava só depois de aplicar; passou a andar logo depois de a foto subir, e o desfazer une todas as fotos do ambiente.
3. **Corrigido: desfazer em laço.** Com o modo parado em `desfazer`, cada Deploy devolveria de novo papéis tirados à mão depois; o desfazer agora só age com a tag e a apaga no fim.
4. **Corrigido: papel antigo sem ninguém sumia do estado.** `lerEstado` carregava só os papéis em uso, e depois do corte o desfazer ignoraria `Acesso-Betinhos-MDA`; agora todos os papéis entram no mapa e só os usados leem privilégios (teste com papel solto na Tarefa 6).
5. **Corrigido: mudar `quem-le.mjs` forçaria "Publicar soluções".** `packages/deploy/acessos/*` caía em `solucoes`; `quem-le.mjs` e `prova.mjs` entraram na regra `nada` junto com o corte, com teste, e `aplicar-perfis.ps1`/`perfis.gerado.json` continuam em `solucoes` (teste explícito).
6. **Corrigido: trava do passageiro reprovaria todo PR futuro.** A primeira versão olhava a existência da migration; agora olha só migration adicionada no diff do PR (`A`/`R`/`C`), como o `migrations-ci.mjs`.
7. **Marcador do hash.** A migration nasce com `__HASH__` e o Passo 5 da Tarefa 13 troca pelo valor de `gerar.mjs --hash` e confere `0` marcadores e `2` ocorrências do hash; não sobra placeholder no arquivo commitado.
8. **Ordem de dependência.** `corte-regras.mjs` importa `hashCurto` de `dv.mjs`; a Tarefa 1 avisa para fazer a Tarefa 2 antes do passo de rodar os testes.
9. **Dados de pessoas.** Nenhum id real no plano, nos testes (só `00000000-...`) ou no log: `limpo()` nos erros, `hashCurto` no resumo, `foraDoRepo` nas pastas, `--aplicar` recusado fora do Actions e token local recusado no PROD; Tarefa 14 tem a varredura de GUID antes do PR.
10. **Limites declarados:** tabelas padrão fora de `PADRAO_MEDIDAS` não são medidas (aparecem como perda informativa, não travam); flow de dono equipe só trava se o dono for a equipe do corte; o dry-run local trata quem fez o `az login` como conta de serviço; donos de flow que leem o passageiro precisam estar em `ACESSOS_AUTOMACAO_MEMBROS` antes do PR da Tarefa 13, senão ficam sem ler as quatro colunas por alguns minutos entre o import e o job `acessos`.
