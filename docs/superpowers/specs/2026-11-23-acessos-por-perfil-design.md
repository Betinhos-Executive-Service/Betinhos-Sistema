# Acessos por perfil — níveis de acesso no Dataverse com gestão pela tela

Data: 23/11/2026 · Aprovado por Renan (brainstorm desta data, três partes).

## 1. Objetivo

Hoje quem trabalha no escritório enxerga e altera tudo. O sistema passa a ter perfis de acesso por área, com dois níveis, aplicados **no Dataverse** (papel de segurança e segurança de coluna), e uma tela para o administrador atribuir os perfis sem abrir o Power Platform.

- Restringir primeiro: Financeiro, RH, Frota e multas, Clientes e passageiros.
- Granularidade: módulo e coluna. Restrição registro a registro fica fora (fase 3, seção 8).
- O administrador **atribui perfis prontos**. O conteúdo de cada perfil é versionado no repositório, não editado na tela.

Fora do escopo: App Motoristas (papel `Acesso-Motoristas`, equipe `Team-Betinhos-Canvas`), portal do cliente, editor de permissões na tela, restrição por registro, retirada da coluna `cr40f_loginsesenhas` (item próprio).

## 2. Estado atual (auditoria de 23/11/2026, DEV e PROD, somente leitura)

O inventário detalhado da auditoria fica fora do repositório (repositório público). O que importa para o desenho:

- Uma unidade de negócio por ambiente. Sem equipes por área.
- O escritório entra pela equipe `Team-Betinhos-MDA`, ligada a um grupo de segurança do Entra. Os papéis que ela carrega são amplos e não distinguem área nem nível.
- Papéis customizados em uso: `Acesso-Betinhos-MDA`, `DEV - Usuário` (só DEV), `Acesso-Betinhos-Canvas`, `Acesso-Motoristas`. Os dois primeiros leem e alteram quase todas as tabelas `cr40f_`/`new_` em profundidade Global, e excluem em boa parte delas.
- **Segurança de coluna já está ligada** em 31 colunas de `cr40f_funcionarios`, em `cr40f_financeiro.cr40f_valor`, em 23 colunas de `cr40f_veiculos` e em 7 de `cr40f_reservadeveculos`. Perfis de coluna existentes: `Motoristas`, `Termo de multa - leitura`, `Segredos – automação` e o de administrador. Quem não está em nenhum vê essas colunas vazias. O PROD tem as mesmas colunas protegidas do DEV (conferido em 23/11/2026) e dois perfis de coluna a mais, `Perfil Interno` e `Perfil Motoristas`, não gerenciados e sem membros: não são reaproveitados.
- `cr40f_bancodedados` (passageiros) não tem coluna protegida além de `cr40f_cr`.
- O shell não filtra menu por papel (`apps/shell/src/nav/menu.ts`). Já lê os papéis do usuário em `apps/shell/src/app/viewStore.ts` (`systemusers(<id>)/systemuserroles_association`).
- `Cr40f.Acesso.Plugin` já tem o padrão de Custom API com autorização por papel (`Autorizacao.cs`).

## 3. Decisões

1. **Enforcement no Dataverse.** Matriz de permissões avaliada só no shell foi descartada: a Web API passa por cima. O filtro do shell é conforto, não segurança.
2. **Perfis:** Base, Operacional, Financeiro, Frota, RH, Administrador de acessos.
3. **Dois níveis** para Operacional, Financeiro, Frota e RH: **Operador** (lê, cria, edita) e **Gestor** (também exclui e vê/edita as colunas sensíveis do módulo). Base e Administrador de acessos não têm nível.
4. **Papel direto na pessoa**, não por equipe. Papel herdado de equipe não cobre os registros da própria pessoa em profundidade Básica sem ajuste em cada papel, e equipe é dado por ambiente.
5. **Só Administrador do Sistema concede o perfil Administrador de acessos.** O Administrador de acessos distribui os demais.
6. **Dados pessoais de passageiros** (telefone, e-mail, nascimento, endereço de saída): Operacional e Financeiro veem. Frota e RH veem nome e empresa.
7. **`cr40f_loginsesenhas`:** nenhum perfil novo recebe. Só Administrador do Sistema lê.
8. **Tela no grupo Cadastros** do menu, item "Acessos".
9. **Transição em paralelo, corte no fim** (seção 8).
10. **Depois do corte:** dois Administradores do Sistema no PROD (Renan e uma reserva). A equipe `Team-Betinhos-MDA` passa a carregar só o perfil Base.
11. **Colunas já protegidas entram na fase 1:** cada perfil nasce com a leitura das colunas protegidas do seu módulo. Sem isso, quem deixa de ser administrador abre a tela com campos vazios.

## 4. Perfis

Cada perfil com nível é um papel do Dataverse mais um perfil de segurança de coluna, com o mesmo nome:

| Perfil | Papel e perfil de coluna | Enxerga no menu |
|---|---|---|
| Base | `Perfil - Base` | Início e o que não é de nenhuma área restrita |
| Operacional | `Perfil - Operacional - Operador` / `- Gestor` | grupo Operacional; Pessoas e Clientes |
| Financeiro | `Perfil - Financeiro - Operador` / `- Gestor` | grupo Financeiro; Cartões corporativos; Pessoas e Clientes |
| Frota | `Perfil - Frota - Operador` / `- Gestor` | grupo Frota; Equipamentos |
| RH | `Perfil - RH - Operador` / `- Gestor` | grupo RH; Funcionários, Documentos, Currículos, Treinamentos |
| Administrador de acessos | `Perfil - Administrador de acessos` | Acessos |

Regras dos papéis:

- **Base:** o mínimo para abrir o sistema (o que hoje vem de Basic User e App Opener, mais leitura das tabelas de apoio: cidades, categorias, tipos, visões). Não lê nenhuma tabela das quatro áreas restritas.
- **Operador:** Read, Create, Write, Append e AppendTo nas tabelas do módulo; sem Delete. Lookups para tabelas de outro módulo recebem só Read e AppendTo.
- **Gestor:** o mesmo, mais Delete nas tabelas do módulo.
- **Administrador de acessos:** lê usuários, papéis e o histórico; chama a Custom API. Não recebe `prvAssignRole` (quem associa é o plugin, seção 5).
- Uma pessoa pode ter vários perfis; o Dataverse soma.
- Nenhum papel `Perfil - *` recebe privilégio de personalização (web resource, workflow, publicar, solução) nem lê `cr40f_segredo`.

A lista de tabelas de cada módulo sai do código: cada rota do shell declara as tabelas que usa (seção 6) e o gerador dos papéis parte daí. Tabela usada por rota de dois perfis entra nos dois.

Colunas (perfil de coluna; "lê" = `canread`, "edita" = `canupdate` e `cancreate`):

| Colunas | Operador | Gestor |
|---|---|---|
| `cr40f_financeiro.cr40f_valor`; em `cr40f_reservadeveculos`: cotação, composição de preço, status de faturamento | Financeiro lê | Financeiro edita |
| `cr40f_reservadeveculos`: as 7 protegidas, menos composição de preço | Operacional lê e edita | igual |
| `cr40f_veiculos`: as 23 protegidas | Frota lê; edita as operacionais (status, motorista atual, pneus, óleo) | Frota edita todas (compra, venda, nota fiscal, chassi, Renavam) |
| `cr40f_funcionarios`: CNH e validade da CNH | Frota lê | Frota lê |
| `cr40f_funcionarios`: função, status, vínculo, contatos corporativos, admissão, demissão, ASO, apelido, notificações, veículo atual | RH lê e edita | igual |
| `cr40f_funcionarios`: CPF, RG, endereço, filiação, telefone pessoal, celular, telefone de emergência, aniversário, link de documentos | RH não vê | RH edita |
| `cr40f_bancodedados`: telefone, e-mail, nascimento, endereço de saída (passam a ser protegidas) | Operacional e Financeiro leem; Operacional edita | igual |
| `cr40f_funcionarios.cr40f_loginsesenhas` | ninguém | ninguém |

Nome, empresa, cargo e status de pessoas e passageiros não são protegidos. A lista coluna a coluna é conferida na metadata do DEV antes de gerar cada perfil (nomes lógicos reais, e `CanBeSecuredForRead`).

## 5. Backend

**Custom API `cr40f_AcessoDefinirPerfis`** no `Cr40f.Acesso.Plugin`, um `IPlugin` e um handler testável, como as três existentes.

- Entrada: `Usuario` (id do `systemuser`) e `Perfis` (JSON: lista de `{ perfil, nivel }`). Saída: `Resultado` (JSON com perfis antes, depois e o id do histórico).
- O plugin roda como SYSTEM para associar e desassociar; a identidade de quem chamou vem do contexto (`InitiatingUserId`).
- Aplica só a diferença entre o que a pessoa tem e o pedido: associa e desassocia o papel (`systemuserroles_association`) e o perfil de coluna (`systemuserprofiles_association`) de mesmo nome.
- O catálogo de perfis válidos é uma lista fixa no plugin. Nome fora do catálogo é recusado.

Travas, todas no servidor:

| Regra | Erro |
|---|---|
| Quem chama precisa de `Perfil - Administrador de acessos` ou Administrador do Sistema | `SEM_PERMISSAO` |
| Conceder ou retirar `Perfil - Administrador de acessos` exige Administrador do Sistema | `SEM_PERMISSAO` |
| Ninguém altera os próprios perfis | `PROPRIO_ACESSO` |
| O alvo tem de ser pessoa ativa (não aplicação, não desativado) | `USUARIO_INVALIDO` |
| Um perfil por área: Operador ou Gestor, nunca os dois | `PERFIL_INVALIDO` |
| Só toca papéis e perfis de coluna `Perfil - *`; nunca Administrador do Sistema, System Customizer nem papéis de aplicativo | (por construção) |

Se a aplicação falhar no meio, a transação do Dataverse desfaz tudo, inclusive o histórico.

**Histórico: tabela `cr40f_acessohistorico`** (BetinhosCore, pertencente à organização): `cr40f_usuario` (lookup systemuser), `cr40f_alteradopor` (lookup systemuser), `cr40f_perfisantes`, `cr40f_perfisdepois` (texto, JSON), `createdon`. Só o plugin grava. Nenhum papel recebe Create, Write ou Delete; `Perfil - Administrador de acessos` recebe Read. Auditoria do Dataverse ligada na tabela.

A leitura da tela não passa pelo plugin: usuários ativos, papéis de cada um e histórico vêm pela Web API com os privilégios do Administrador de acessos.

## 6. Shell

- **`apps/shell/src/app/acessos.ts`:** lê os papéis do usuário uma vez (mesma consulta do `viewStore.ts`, que passa a usar este módulo) e expõe `temPerfil(area, nivel?)`. Administrador do Sistema vale como todos os perfis.
- **Menu:** cada item de `MENU` (`apps/shell/src/nav/menu.ts`) ganha `perfis`, a lista de áreas que o enxergam. Item sem `perfis` aparece para todos. Grupo sem item visível some. Teste falha se uma rota das quatro áreas ficar sem `perfis`.
- **Rota aberta por link** sem o perfil: página "Sem acesso a este módulo", com o nome do perfil necessário. Nenhuma chamada de dados é feita.
- **Botões de excluir** e campos sensíveis seguem o nível (`Gestor`); para o Operador o botão não aparece. Se o Dataverse negar mesmo assim, o erro existente de permissão é mostrado.
- **Tabelas por rota:** cada rota declara as tabelas que usa, num mapa único que alimenta o gerador dos papéis (seção 4) e o relatório da transição (seção 8).

**Tela `#/acessos`** (`apps/shell/src/pages/acessos/`, componentes do `@betinhos/ui`, lista no padrão `useListView`):

- Lista das pessoas ativas: nome, e-mail, perfis (um chip por perfil, com o nível) e data da última alteração. Busca por nome e filtro por perfil ("quem tem Financeiro").
- Drawer da pessoa: um bloco por área com três opções (sem acesso, Operador, Gestor); Administrador de acessos como chave separada, desabilitada para quem não é Administrador do Sistema. Resumo "o que muda" antes de salvar. Clique fora, X e Esc fecham; com alteração não salva pergunta "Descartar alterações?"; não fecha durante o salvamento.
- Aba Histórico na ficha e histórico geral na página.
- A própria linha do usuário logado abre só para leitura.
- Só aparece no menu para Administrador de acessos e Administrador do Sistema.

Em modo mock (`isLocalHost()`), a tela usa dados fictícios e o shell assume todos os perfis.

## 7. Erros

| Situação | Comportamento |
|---|---|
| Custom API recusa | Mensagem do erro no drawer; nada muda; o drawer continua aberto |
| Papel `Perfil - *` não existe no ambiente | `PERFIL_INDISPONIVEL` com o nome; a tela marca o perfil como indisponível |
| Falha ao ler os papéis do usuário no shell | Menu só com os itens sem `perfis`, e aviso "Não foi possível carregar seus acessos" com "Tentar de novo" |
| Pessoa sem nenhum perfil de área | Vê só o Base; o Início explica a quem pedir acesso |

## 8. Entrega e transição

Tudo entra por PR na `develop`. Schema por migration (`packages/deploy/migrations/`); o PROD recebe pelas soluções.

**Fase 0 — preparação.** Mapa de tabelas por rota; gerador dos papéis; conferência da metadata das colunas.

**Fase 1 — perfis, tela e menu.** Migrations criam os papéis `Perfil - *`, os perfis de coluna (com as colunas já protegidas e as novas de passageiros), a tabela de histórico e incluem tudo na BetinhosCore. Plugin e Custom API. Tela `#/acessos`. Menu filtrado. Nesta fase os papéis antigos continuam valendo: nada é tirado de ninguém.

**Fase 2 — corte.** Só depois de, em cada ambiente:

1. Renan atribuir os perfis na tela.
2. O relatório "quem perderia o quê" zerar. É um script somente leitura (`packages/deploy/acessos/relatorio-corte.mjs`) que compara, por pessoa, os privilégios efetivos de hoje com os dos perfis atribuídos, limitado às tabelas das rotas que a pessoa usa.
3. Levantar flows, conexões e connection references cujo dono deixará de ser administrador, e mover para a conta de serviço o que depender disso.

O corte: uma migration reduz `Acesso-Betinhos-MDA` e `DEV - Usuário` ao conteúdo do Base. No PROD, a equipe `Team-Betinhos-MDA` perde os papéis amplos e fica só com `Perfil - Base`; ficam dois Administradores do Sistema, com papel direto. A parte do PROD que não é componente de solução (papéis da equipe, papel direto das pessoas) é feita com pedido explícito do Renan, com o estado anterior salvo para desfazer.

Reversão: devolver os papéis anteriores à equipe (estado salvo no passo anterior). Os perfis novos não precisam ser removidos.

**Fase 3 — restrição por registro.** Só se aparecer necessidade concreta.

## 9. Limites conhecidos

- Tabela pertencente à organização não aceita profundidade: é tudo ou nada para quem tem o privilégio.
- Segurança de coluna vale também para flows e plugins que rodam como o usuário. Plugin como SYSTEM não é afetado; flow roda como o dono da conexão (por isso o passo 3 da fase 2).
- Coluna calculada, rollup ou chave alternativa pode não aceitar proteção: confere-se `CanBeSecuredForRead` antes.
- O filtro do menu não protege nada sozinho.
- A tela não cria nem edita perfis. Perfil novo é mudança de código, com revisão.

## 10. Testes e verificação

- **Plugin:** testes do handler para cada trava da seção 5, diferença aplicada (só o que mudou), catálogo fechado e histórico gravado.
- **Gerador dos papéis:** teste que falha se um papel `Perfil - *` receber privilégio de personalização, de `cr40f_segredo` ou Delete no nível Operador.
- **Shell:** `temPerfil`, filtro do menu (grupo vazio some, rota sem `perfis` nas áreas restritas reprova), página "Sem acesso", e a tela `#/acessos` em mock (desktop e 375 px).
- **Prova no DEV com usuário de teste sem administrador**, uma por perfil:
  1. Só com Base: abre o sistema; leitura das tabelas `cr40f_financeiro`, `cr40f_funcionarios` e `cr40f_veiculos` pela Web API devolve 403.
  2. Financeiro Operador: lê e edita Financeiro com o valor preenchido; excluir devolve 403; `cr40f_funcionarios` abre só para leitura, com CPF e RG vazios; editar devolve 403. Escrita e exclusão são conferidas pelos privilégios efetivos (`RetrieveUserPrivileges`), sem gravar em dado de negócio.
  3. RH Operador: lê Funcionários com CPF e RG vazios; RH Gestor lê preenchidos.
  4. Frota Operador: de Funcionários lê nome, CNH e validade; CPF vazio.
  5. Administrador de acessos: atribui um perfil pela tela e o histórico registra; tentar alterar o próprio acesso ou conceder Administrador de acessos é recusado.
  6. Chamada direta da Custom API por usuário sem o perfil devolve `SEM_PERMISSAO`.
- Skill `verificar-acessos` em `.claude/skills/` com esse roteiro, criada junto com a fase 1.

Os nomes dos conjuntos de entidades usados na prova são conferidos na metadata antes de rodar.
