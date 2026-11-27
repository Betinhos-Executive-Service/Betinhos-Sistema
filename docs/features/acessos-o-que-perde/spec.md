# O que a pessoa deixa de ter (prévia no editor de perfis)

## Objetivo
No PROD ninguém começa com menos acesso do que tem hoje: entra só o preparar (só adiciona). Depois o Renan tira o acesso amplo e ajusta os perfis pessoa a pessoa, no editor de perfis, vendo antes de salvar exatamente o que aquela pessoa vê e usa hoje e vai deixar de ter.

## Decisões (26/11/2026, Renan)
- Retirada pessoa a pessoa; o corte geral (`cortar`) sai do caminho do PROD. No PROD entra só o `preparar`.
- A prévia mostra acesso e uso de 90 dias. Leitura sem gravação não é detectável; a tela diz isso.
- Salvar algo que tira o que a pessoa usou abre uma confirmação com a lista.
- O `preparar` roda no DEV e fica (card antes).

## Fatos que mudam o desenho
- `Team-Betinhos-MDA` no PROD é equipe de grupo de segurança do Entra (`teamtype` 2). O Dataverse não tira membro desse tipo de equipe: quem sai do grupo sai no Entra. O DEV não tem essa equipe.
- O Administrador de acessos não lê papéis, privilégios nem as tabelas de Financeiro e RH. A prévia precisa rodar no servidor, como SYSTEM.
- O shell não registra navegação; uso = registros criados ou alterados pela pessoa (`createdby`/`modifiedby`, `modifiedon` nos últimos 90 dias).

## Desenho
### 1. Regra única em C# (`AcessoPrevisao`, `Cr40f.Acesso.Plugin`)
- Uma função monta os papéis e perfis de coluna de "depois" e é usada pelo `DefinirPerfis` (para gravar) e pela prévia (para simular): troca só o que o `Ajustar` troca (papéis diretos do catálogo na unidade do alvo e as cópias da Frota); `Perfil - *` de equipe ou de outra unidade fica como está.
- Cobertura por privilégio = conjunto de (unidade do papel, profundidade): Global cobre tudo, Deep a unidade e as filhas, Local só a unidade, Basic só o que é da pessoa. Perde quando o "depois" não cobre o "antes". Papel de equipe sem herança (`isinherited` = 0) vale só para registros da equipe: entra como "incerto", nunca como cobertura.
- Universo: todos os privilégios do ambiente (tabelas de sistema e privilégios avulsos, como exportar para Excel e edição em massa, inclusive). Mapa privilégio → tabela em cache estático no plugin (recarrega a cada 30 min).
- O C# passa a ser a fonte da regra; testes próprios, incluindo Frota, equipe sem herança, coluna por perfil de equipe e admin. O `corte-regras.mjs` continua só para o preparar e o desfazer.
### 2. Custom API `cr40f_AcessoPrevia` (ação, só leitura, roda como SYSTEM)
- Entrada: `Usuario`, `Perfis` (mesmo JSON do `DefinirPerfis`), `RetirarAmplo` (bool; só o Administrador do Sistema pode mandar verdadeiro, senão `SEM_PERMISSAO`) e `Tabelas` (opcional).
- Mesmas travas de quem chama do `DefinirPerfis`, menos `PROPRIO_ACESSO`.
- Sem `Tabelas`, devolve `{ admin: {antes, depois}, perdas: [{chave, tabela|null, perde: [tipos], incerto}], colunas: [{coluna, incerto}], grupos: [{nome, perdeDonos: n}], flows: [{nome, tipo}], conexoes: [{nome}] }`.
  - Com `RetirarAmplo`: sem Administrador do Sistema direto, sem papéis antigos diretos (`Acesso-Betinhos-MDA`, `DEV - Usuário`) e sem as equipes de grupo do Entra que dão esses papéis (com os perfis de coluna dessas equipes e os registros de que a equipe é dona, em `perdeDonos`).
  - Colunas: perfis de coluna diretos e de equipe, antes e depois do pedido, para qualquer pessoa (não só quem perde o admin). Coluna fora do `acessosColunas.json` vai para "Outras colunas".
  - Flows e conexões de que a pessoa é dona (`workflows` categoria 5 e `connectionreferences`) entram quando ela perde privilégio usado por eles ou o admin.
- Com `Tabelas` (até 200 numa chamada só): o servidor recalcula as perdas e só conta tabelas que estão nelas (nunca `cr40f_segredo`). Uso = registros com (`createdby` = pessoa e `createdon` nos últimos 90 dias) ou (`modifiedby` = pessoa e `modifiedon` nos últimos 90 dias); a alteração só aparece se foi a última. Agregado acima do limite = incerto.
### 3. `cr40f_AcessoDefinirPerfis` ganha `RetirarAmplo` e `DevolverAmplo`
- Só o Administrador do Sistema usa (`SEM_PERMISSAO`).
- `RetirarAmplo` tira o Administrador do Sistema direto e os papéis antigos diretos; nunca mexe em equipe. `DevolverAmplo` devolve os papéis gravados na última retirada.
- `ULTIMO_ADMIN`: recusa se, depois de retirar, sobrarem menos de 2 pessoas com Administrador do Sistema direto (mesmo filtro do `administrativos()`: ativa, `accessmode` 0, não aplicação, não a conta de serviço). A conta é refeita depois de desassociar, na mesma transação; se falhar, desfaz.
- Coluna nova `cr40f_amplo` (texto, migration) no `cr40f_acessohistorico`: nomes e ids dos papéis retirados ou devolvidos. Grava sempre que retirar ou devolver, mesmo sem mudar os perfis.
### 4. Editor de perfis (ficha do funcionário e gaveta do `#/acessos`)
- Abaixo de "O que muda ao salvar", bloco "O que deixa de ter". A prévia é pedida ao abrir e a cada mudança do rascunho (espera de 400 ms, cancelando a anterior):
  - Telas que somem do menu: `menuVisivel` com os papéis diretos e de equipe (`lerPapeis`) antes e depois.
  - Por tela que fica: ações perdidas (ver, criar, editar, excluir, vincular) pelas tabelas do `acessosMapa.json`.
  - Colunas que ficam vazias, pelo rótulo do grupo em `acessosColunas.json`.
  - Flows e conexões que vão parar.
  - Uso de 90 dias por item ("criou ou alterou 37 registros"); sem uso: "sem gravação em 90 dias (leitura não é registrada)". Incerto: "não deu para medir".
  - O que não tem tela no mapa: "Outras tabelas e permissões", recolhido, com a lista.
- Interruptor "Tirar acesso amplo (legado)", só para o Administrador do Sistema e só quando a pessoa tem Administrador do Sistema ou papel antigo, direto ou por grupo. Com grupo do Entra: aviso "Continua com acesso pelo grupo <nome>: tire a pessoa do grupo no Entra"; a prévia já conta sem o grupo. No histórico, retirada com "Devolver acesso amplo".
- Salvar abre "Confirmar retirada" com a lista quando há qualquer perda de leitura, coluna, flow ou conexão, perda com uso, ou item incerto. Só ganho, ou perda só de excluir sem uso, salva direto.
- Prévia que falhou: aviso; salvar só depois de marcar "Salvar sem a prévia".
- Mock: prévia de exemplo e `?falha=previa`.
### 5. Deploy
- `corte.json`: PR com `"dev": "preparar"` (só adiciona). O PROD continua `esperar`; quando o Renan pedir, o PROD vai para `preparar` e fica. `cortar` não roda no PROD.

## Fora de escopo
- Tirar a pessoa do grupo no Entra pela tela (precisaria de segredo com permissão de escrita em grupos).
- Registro de navegação ou leitura.
- Mudar o conteúdo dos perfis.

## Verificação
1. Testes C# da regra: Frota (unidade filha), equipe sem herança (incerto), coluna por perfil de equipe, admin, privilégio avulso, flow da pessoa.
2. Testes do handler: `RetirarAmplo` sem ser Administrador do Sistema → `SEM_PERMISSAO`; com 2 admins → `ULTIMO_ADMIN`; `cr40f_amplo` gravado; `DevolverAmplo` devolve; prévia com `Tabelas` fora das perdas → recusa.
3. Shell (mock): trocar Financeiro Gestor → Operador mostra "Financeiro: perde excluir" e as colunas sensíveis; tirar a área mostra as telas que somem; salvar com uso abre a confirmação; `?falha=previa` mostra o aviso.
4. DEV, depois do `preparar`: usuário de teste com Administrador do Sistema direto → prévia com "Tirar acesso amplo" mostra perda zero (o preparar cobriu); tirar o Gestor de uma área mostra a perda e o uso; salvar retira e o histórico grava. Volta ao estado anterior no fim.
5. Não verificável no DEV: o caso do grupo do Entra (o DEV não tem a equipe). Fica coberto por teste do handler e por leitura no PROD.

## Contrato

Os dois rodam como SYSTEM e só aceitam quem tem Administrador do Sistema ou Administrador de acessos (papel direto ou de equipe). Erro vem como `InvalidPluginExecutionException` com a mensagem `CODIGO: texto`. `Perfis` é sempre a lista JSON do editor (`[{"perfil":"financeiro","nivel":"gestor"},{"perfil":"acessos"}]`; `[]` = só o Base). `Resultado` é texto com JSON.

### `cr40f_AcessoPrevia` (ação, `POST`, não grava nada)

Entrada:

| Parâmetro | Tipo | Obrigatório | Uso |
|---|---|---|---|
| `Usuario` | Guid | sim | `systemuserid` de quem muda |
| `Perfis` | String (JSON) | sim | o pedido, como no DefinirPerfis |
| `RetirarAmplo` | Boolean | não | simula tirar o Administrador do Sistema direto, os papéis antigos diretos (`Acesso-Betinhos-MDA`, `DEV - Usuário`) e as equipes de grupo do Entra (`teamtype` 2 ou 3) que dão algum deles, com os perfis de coluna delas; só o Administrador do Sistema |
| `Tabelas` | String (JSON) | não | lista de 1 a 200 nomes lógicos; troca a resposta pelo uso dessas tabelas |

Chamada: `POST cr40f_AcessoPrevia` com o corpo `{"Usuario":"<guid>","Perfis":"[...]","RetirarAmplo":true,"Tabelas":"[...]"}` (`RetirarAmplo` e `Tabelas` só quando pedidos). Ação porque a lista de `Tabelas` não cabe na URL de uma função.

Saída sem `Tabelas`:

```json
{
  "admin": { "antes": true, "depois": false },
  "perdas": [
    { "chave": "cr40f_cotacao", "tabela": "cr40f_cotacao", "rotulo": "Cotação", "perde": ["Write", "Delete"], "incerto": false },
    { "chave": "prvExportToExcel", "tabela": null, "rotulo": null, "perde": ["Use"], "incerto": false }
  ],
  "colunas": [ { "tabela": "cr40f_pagante", "coluna": "cr40f_pagante.cr40f_cpf", "rotulo": "Pagante", "perde": ["ler", "criar", "gravar"], "incerto": false } ],
  "grupos": [ { "nome": "<equipe do Entra>", "perdeDonos": 12, "limitado": false } ],
  "apps": [ { "nome": "<app model-driven>" } ],
  "flows": [ { "nome": "<flow>", "tipo": "tabela", "dona": true } ],
  "conexoes": [ { "nome": "<referência de conexão>" } ]
}
```

- `admin`: Administrador do Sistema direto ou de equipe com herança, antes e depois.
- `perdas`: uma linha por tabela (`chave` = `tabela` = nome lógico) ou por privilégio avulso (`chave` = nome do privilégio, `tabela` null). `rotulo` = nome de exibição da tabela na metadata (o nome lógico se não houver; null no privilégio avulso). `perde` traz os tipos que deixam de valer em algum alcance, na ordem `Read`, `Create`, `Write`, `Delete`, `Append`, `AppendTo`, `Assign`, `Share`, `Use` (avulso). Cobertura por privilégio = (unidade do papel, profundidade): Global cobre tudo, Deep cobre a unidade e as filhas, Local só a unidade, Basic é coberto por qualquer alcance. `incerto: true` quando algum tipo da linha depende de papel de equipe sem herança (`isinherited` 0, que nunca conta como cobertura) ou de profundidade desconhecida. Com Administrador do Sistema antes e não depois, entram todos os privilégios do ambiente. Ordenado por `chave`.
- `colunas`: colunas protegidas (`tabela.coluna`) em que algum perfil de coluna da pessoa (direto ou de equipe) dava ler, criar ou gravar (`canread`, `cancreate`, `canupdate` = 4) e nenhum do depois dá; `rotulo` como em `perdas`; `perde` traz os direitos perdidos (`ler`, `criar`, `gravar`). Quem tinha Administrador do Sistema perde os três em todas as colunas `IsSecured` da metadata, mais as que aparecem em perfis de coluna. `incerto` hoje é sempre false.
- `grupos`: só com `RetirarAmplo`; `perdeDonos` = registros de que a equipe é dona nas tabelas `cr40f_*`, `new_*` e nas padrão medidas (`account`, `annotation`, `appointment`, `contact`, `email`, `phonecall`, `task`) que têm `owningteam` na metadata; conta só ids, uma página de 5000 por tabela, e `limitado: true` quando alguma tabela passou disso (a tela mostra "5000+"); null se alguma contagem falhou.
- `apps`: apps model-driven (`appmodule` por `appmoduleroles`, pelo papel e pela cópia raiz dele) que algum papel do antes abria e nenhum do depois abre; quem perde o Administrador do Sistema perde todos; vazio se continua administrador. Apps canvas compartilhados não entram (a tela avisa).
- `flows`: flows de nuvem ligados (`workflow`, category 5, statecode 1) de que a pessoa é dona (`dona: true`) ou coproprietária pelo compartilhamento (`principalobjectaccess` da própria pessoa, `dona: false`; o de equipe não entra). `tipo`: `admin` (perde o Administrador do Sistema; entram todos), `tabela` (usa pelo conector do Dataverse uma tabela das `perdas`), `incerto` (há perda e alguma ação do Dataverse tem tabela que não deu para ler).
- `conexoes`: referências de conexão ativas de que a pessoa é dona, sempre que há alguma perda (admin, `perdas`, `colunas`, `apps` ou `flows`).

Saída com `Tabelas` (perdas recalculadas; cada tabela precisa estar nas `perdas` desta prévia):

```json
{ "uso": [ { "tabela": "cr40f_cotacao", "registros": 7, "limitado": false, "incerto": false } ] }
```

`registros` = ids (uma página de 5000) de `(createdby = pessoa e createdon ≥ hoje − 90 dias) ou (modifiedby = pessoa e modifiedon ≥ hoje − 90 dias)`, data em UTC; `limitado: true` quando há mais que 5000 (a tela mostra "5000+"). Tabela ou uma das 4 colunas ausente na metadata → `registros: null`, `incerto: true`.

Erros: `SEM_PERMISSAO` (chamador sem papel; `RetirarAmplo` sem Administrador do Sistema; mudar o Administrador de acessos sem ser Administrador do Sistema), `PERFIL_INVALIDO`, `USUARIO_INVALIDO` (ausente, desativado ou de aplicação), `PERFIL_INDISPONIVEL`, `TABELA_INVALIDA` (JSON inválido, lista vazia, mais de 200, tabela fora das `perdas` ou `cr40f_segredo`). A prévia aceita a própria pessoa (sem `PROPRIO_ACESSO`). No shell, resposta sem o formato do contrato (admin sem os dois booleanos, lista ausente, `uso` que não é lista) é falha da prévia, nunca "não perde nada".

### `cr40f_AcessoDefinirPerfis` (ação, `POST`)

Entrada:

| Parâmetro | Tipo | Obrigatório | Uso |
|---|---|---|---|
| `Usuario` | Guid | sim | `systemuserid` de quem muda |
| `Perfis` | String (JSON) | sim | o pedido |
| `RetirarAmplo` | Boolean | não | tira o Administrador do Sistema e os papéis antigos diretos (nunca de equipe); só o Administrador do Sistema |
| `DevolverAmplo` | Boolean | não | repõe os papéis da última retirada da pessoa gravada pelo próprio plugin (`createdby` = usuário do plugin), só os que são amplos, ainda existem e ela não tem; retirada sem papéis é pulada; só o Administrador do Sistema |

Corpo: `{"Usuario":"<guid>","Perfis":"[...]","RetirarAmplo":true}`.

Saída:

```json
{
  "antes": [ { "perfil": "financeiro", "nivel": "gestor" } ],
  "depois": [ { "perfil": "financeiro", "nivel": "operador" } ],
  "amplo": { "acao": "retirar", "papeis": [ { "id": "<roleid>", "nome": "Administrador do Sistema" } ] },
  "historico": "<cr40f_acessohistoricoid>"
}
```

`amplo` é null sem `RetirarAmplo`/`DevolverAmplo` e também na retirada sem nenhum papel amplo direto (nada vai para `cr40f_amplo`); com eles traz os papéis de fato retirados ou repostos (na devolução, lista vazia se nada faltava). O mesmo JSON de `amplo` vai na coluna `cr40f_amplo` (texto multilinha) do `cr40f_acessohistorico`, que é gravado sempre que os perfis mudam ou há retirada/devolução; `cr40f_perfisantes` e `cr40f_perfisdepois` não levam o amplo. `historico` é null quando nada foi gravado.

Erros: `SEM_PERMISSAO`, `PEDIDO_INVALIDO` (`RetirarAmplo` e `DevolverAmplo` juntos), `PROPRIO_ACESSO`, `PERFIL_INVALIDO`, `USUARIO_INVALIDO`, `PERFIL_INDISPONIVEL`, `ULTIMO_ADMIN` (a retirada deixaria menos de 2 pessoas com Administrador do Sistema direto, ativas, `accessmode` 0 e sem `applicationid`; a retirada é desfeita), `NADA_A_DEVOLVER` (a última entrada com `cr40f_amplo` gravada pelo plugin, fora as retiradas vazias, não é uma retirada).
