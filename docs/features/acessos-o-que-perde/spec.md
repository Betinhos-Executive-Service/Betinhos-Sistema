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
### 2. Custom API `cr40f_AcessoPrevia` (função, só leitura, roda como SYSTEM)
- Entrada: `Usuario`, `Perfis` (mesmo JSON do `DefinirPerfis`), `RetirarAmplo` (bool; só o Administrador do Sistema pode mandar verdadeiro, senão `SEM_PERMISSAO`) e `Tabelas` (opcional).
- Mesmas travas de quem chama do `DefinirPerfis`, menos `PROPRIO_ACESSO`.
- Sem `Tabelas`, devolve `{ admin: {antes, depois}, perdas: [{chave, tabela|null, perde: [tipos], incerto}], colunas: [{coluna, incerto}], grupos: [{nome, perdeDonos: n}], flows: [{nome, tipo}], conexoes: [{nome}] }`.
  - Com `RetirarAmplo`: sem Administrador do Sistema direto, sem papéis antigos diretos (`Acesso-Betinhos-MDA`, `DEV - Usuário`) e sem as equipes de grupo do Entra que dão esses papéis (com os perfis de coluna dessas equipes e os registros de que a equipe é dona, em `perdeDonos`).
  - Colunas: perfis de coluna diretos e de equipe, antes e depois do pedido, para qualquer pessoa (não só quem perde o admin). Coluna fora do `acessosColunas.json` vai para "Outras colunas".
  - Flows e conexões de que a pessoa é dona (`workflows` categoria 5 e `connectionreferences`) entram quando ela perde privilégio usado por eles ou o admin.
- Com `Tabelas` (até 25 por chamada): o servidor recalcula as perdas e só conta tabelas que estão nelas (nunca `cr40f_segredo`). Uso = registros com (`createdby` = pessoa e `createdon` nos últimos 90 dias) ou (`modifiedby` = pessoa e `modifiedon` nos últimos 90 dias); a alteração só aparece se foi a última. Agregado acima do limite = incerto.
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
