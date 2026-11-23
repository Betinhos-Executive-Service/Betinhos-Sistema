# Configuração do App Motoristas — o que cada perfil de motorista vê, com preview

Data: 23/11/2026 · Decisões do Renan na entrevista desta data (5 rodadas). Spec escrita para revisão; nada implementado.

## 1. Objetivo

Hoje o que o motorista vê no App é decidido no código e em duas colunas da ficha do funcionário. Ocultar o módulo Multas exigiu um hotfix no PROD (`MULTAS_OCULTO`, v2.1.930, PR #648).

O sistema passa a ter uma tela onde o gestor liga e desliga módulos e funções do App por perfil de motorista, com exceção por pessoa, e vê ao lado o próprio App como o motorista veria.

- A primeira versão só liga e desliga. Textos, limites e regras numéricas ficam fora.
- O App esconde o que está desligado e o servidor recusa as funções sensíveis.
- A mudança passa por rascunho e publicação, com histórico e volta a uma versão anterior.

Fora do escopo: perfis do escritório (spec `2026-11-23-acessos-por-perfil-design.md`), criar perfis novos pela tela, editar textos ou regras do App, aviso automático ao motorista quando algo muda, registro de última abertura e versão instalada por motorista.

## 2. Estado atual (conferido no código em 23/11/2026)

| O que | Onde | Como funciona hoje |
|---|---|---|
| Grade de módulos | `apps/motoristas/src/features/servicos/InitialScreen.tsx` | Lista fixa: `services`, `history`, `comunicados`, `checklists`, `multas`, `treinamentos`, `postosProximos`, `maintenancePhoto`, `expenses`, `collisions`, `minhaNota`, `ideas` e o bloco condicional `personalReceipt`. |
| Multas oculto | `apps/motoristas/src/app/modulosOcultos.ts` | Constante `MULTAS_OCULTO = true`: tira da grade, das pendências e do tour e manda o link e a rota `#multas` para o Início. Só existe no hotfix (PR #648). |
| Cobrança por QR | `cr40f_funcionarios.cr40f_podecobrarqrcode` | O App mostra o botão (`useReceiveFlow.ts`) e o `QrChargePlugin` recusa no servidor quem não tem a coluna marcada. |
| Recibo personalizado | `cr40f_funcionarios.cr40f_gerarrecibopersonalizado` | Só o App confere (`useReciboPersonalizado.ts`). O recibo grava direto na Web API (`cr40f_recibos_v2`), sem plugin. |
| Vínculo | `cr40f_funcionarios.cr40f_tipodevinculo` | 0 = próprio, 1 = terceiro. O App trata vazio como próprio (`isThirdPartyDriver`: `Number(x) === 1`). A ficha no shell trata vazio como terceiro (`AcessoApp.tsx`, `=== 0 ? 0 : 1`). |
| Regras pelo vínculo | `agendaRemota.ts`, `meu-carro` | Terceiro vê 45 dias de histórico e escolhe o carro pela posse; próprio vê 5 dias. |
| Leitura do motorista | `data/dataverse/cliente.ts` (`getDriverContext`) | Lê a ficha a cada carga da agenda, sem cache próprio. Não relê ao voltar do segundo plano. "Puxar para atualizar" relê. |
| Push por módulo | `packages/deploy/flows/*-push.json` | Um flow por módulo: checklist, comunicados, treinamentos, termo de multa e aceite de multa. Todos enviam pelo Worker `app-motoristas-web-push`. |
| Inscrição de push | `new_inscricaopushmotorista` | Uma linha por aparelho, com lookup para o funcionário. |
| Dados de exemplo | `isLocalhostRuntime()` | O App só usa dados de exemplo quando o endereço é `localhost`. |

Ponto de atenção: o App grava na própria ficha do funcionário (`meu-carro/remoto.ts`, carro atual). Se o papel do motorista puder gravar as colunas de QR e recibo, ele se libera sozinho pela Web API. A conferir na metadata do papel `Acesso-Motoristas`; a tela nova tira a permissão da ficha de qualquer forma.

## 3. Decisões

1. **Tela própria** no shell, no grupo Cadastros, ao lado de Acessos. Reaproveita de Acessos o `temPerfil`, o padrão de Custom API com travas no servidor e o padrão de histórico.
2. **Só depois de Acessos.** A implementação começa quando a fase 1 de Acessos estiver na `develop`.
3. **Três perfis fixos:** Próprio, Terceiro e Admin (grupo piloto).
4. **Próprio e Terceiro vêm do vínculo** da ficha. Vínculo vazio vale como Próprio, com alerta na tela.
5. **Admin é marcado pessoa a pessoa**, só por Administrador do Sistema, e tem tudo ligado.
6. **Granularidade:** módulo, e dentro de Serviços duas funções (Cobrar por QR e Recibo personalizado). Os outros módulos ligam ou desligam inteiros.
7. **Serviços e Comunicados nunca desligam.**
8. **Módulo ou função nova nasce ligada** para todos os perfis.
9. **Exceção por motorista**, para ligar ou para desligar, com motivo obrigatório e validade opcional. Vencida, volta ao perfil.
10. **Módulo desligado some por completo:** grade, pendências e tour. Link ou push antigo abre o Início com aviso. O push do módulo não é enviado.
11. **O servidor recusa** cobrança por QR, recibo personalizado e termo de multa para quem não tem a função.
12. **Matriz dos perfis:** um rascunho único, compartilhado, e Publicar. A confirmação mostra o que muda, quantos motoristas são afetados e quantas pendências ficam sem aviso; nota opcional.
13. **Exceções e grupo piloto valem na hora**, com histórico.
14. **Voltar a uma versão** carrega a versão como rascunho; só vale depois de Publicar.
15. **Sem aviso automático** aos motoristas.
16. **Quem usa:** Administrador do Sistema e Gestor Operacional alteram. Ninguém abre a tela só para consultar.
17. **Preview:** o App real, o mesmo build, em moldura de celular, com dados de exemplo. Seletor por perfil ou por motorista, alternando rascunho e publicado.
18. **Efeito no App:** confere a configuração ao abrir, ao voltar do segundo plano e ao puxar para atualizar. Sem leitura, usa a última salva; sem ela, o padrão do código.
19. **Regras pelo vínculo continuam fixas** (dias de histórico, carro pela posse). A tela só as mostra.
20. **Recibo e QR migram** das colunas da ficha para a tela nova. Quem tem hoje ganha exceção na migração.
21. **Aba Motoristas** mostra perfil, exceções, alerta de vínculo e se o push está ativo.

## 4. Catálogo e regra de resolução

O catálogo é fixo no código, num pacote novo `packages/app-config`, usado pelo shell e pelo App.

| Chave | Nome na tela | Tipo | Padrão |
|---|---|---|---|
| `services` | Serviços | módulo, fixo | ligado |
| `comunicados` | Comunicados | módulo, fixo | ligado |
| `history` | Histórico | módulo | ligado |
| `checklists` | Checklists | módulo | ligado |
| `multas` | Multas | módulo, sensível | desligado; Admin ligado |
| `treinamentos` | Treinamentos | módulo | ligado |
| `postosProximos` | Postos próximos | módulo | ligado |
| `maintenancePhoto` | Manutenção | módulo | ligado |
| `expenses` | Gastos | módulo | ligado |
| `collisions` | Colisões | módulo | ligado |
| `minhaNota` | Minha nota | módulo | ligado |
| `ideas` | Boas ideias | módulo | ligado |
| `services.qrCharge` | Cobrar por QR | função de Serviços, sensível | desligado; Admin ligado |
| `services.personalReceipt` | Recibo personalizado | função de Serviços, sensível | desligado; Admin ligado |

O bloco "Recibo personalizado" da grade segue a função `services.personalReceipt`; não é um módulo à parte.

O padrão do catálogo serve de carga inicial (seção 9) e de reserva quando o App nunca leu a configuração. Entrada nova no catálogo entra com padrão ligado.

**Resolução de uma chave para um motorista**, na ordem:

1. Chave fixa: ligada.
2. Exceção vigente do motorista para a chave (não encerrada, validade vazia ou igual ou posterior a hoje, em America/Sao_Paulo): vale a exceção.
3. Motorista no grupo piloto: ligada.
4. Perfil pelo vínculo (1 = Terceiro; 0 ou vazio = Próprio): vale o valor da matriz publicada. Chave ausente na matriz: ligada.
5. Função só vale com o módulo pai ligado.

Assumi que a exceção vence o grupo piloto (dá para desligar algo de um piloto). Chave fixa não aceita exceção.

A resolução existe em dois lugares: TypeScript (`packages/app-config`, para o preview, o resumo do Publicar e a reserva do App) e C# (servidor). Um arquivo de casos (`packages/app-config/casos.json`) é lido pelos testes dos dois lados, para as duas não divergirem.

## 5. Backend

### Tabelas (BetinhosCore, por migration)

**`cr40f_appconfigversao`**, pertencente à organização. Uma linha por versão da matriz.

- `cr40f_name`, `cr40f_numero` (inteiro, chave alternativa).
- `cr40f_estado`: Rascunho, Publicada, Substituída. No máximo um Rascunho e uma Publicada.
- `cr40f_conteudo` (memo, JSON): `{ "proprio": { "<chave>": true|false }, "terceiro": { ... } }`. Admin não entra: é sempre ligado.
- `cr40f_nota`, `cr40f_publicadoem`, `cr40f_publicadopor` e `cr40f_alteradopor` (lookups para `systemuser`).

**`cr40f_appconfigpessoa`**, pertencente à organização. Uma linha por exceção ou por entrada no grupo piloto.

- `cr40f_Funcionario` (lookup obrigatório para `cr40f_funcionarios`, Restrict).
- `cr40f_tipo`: Exceção, Piloto.
- `cr40f_chave` (texto; vazio no Piloto), `cr40f_ligado` (Sim/Não).
- `cr40f_motivo`, `cr40f_validade` (só data).
- `cr40f_criadopor`, `cr40f_encerradoem`, `cr40f_encerradopor`.

As linhas nunca são excluídas: encerrar grava `cr40f_encerradoem`. As duas tabelas juntas são o histórico; não há tabela de histórico separada. Auditoria do Dataverse ligada nas duas.

Privilégios: nenhum papel recebe Create, Write ou Delete; só o plugin grava, como SYSTEM. Read para `Perfil - Operacional - Gestor` e Administrador do Sistema. O papel do motorista não lê nenhuma das duas: o App recebe a configuração pela Custom API. Como essas tabelas entram no gerador de papéis de Acessos fica para o plano, depois de o gerador existir.

Os registros são dado de cada ambiente e não entram em solução: o PROD é configurado na tela do PROD.

### Custom APIs (`Cr40f.Acesso.Plugin`)

| Custom API | Entrada | Saída |
|---|---|---|
| `cr40f_AppConfigEfetiva` | `Funcionario` (opcional) | `Resultado` (JSON): versão, perfil, `semVinculo` e o valor de cada chave |
| `cr40f_AppConfigSalvarRascunho` | `Conteudo` (JSON), `Base` (marca da versão lida), `Descartar` | Rascunho gravado |
| `cr40f_AppConfigPublicar` | `Nota` | Número da versão publicada |
| `cr40f_AppConfigDefinirPessoa` | `Funcionario`, `Tipo`, `Chave`, `Ligado`, `Motivo`, `Validade`, `Encerrar` | Linha criada ou encerrada |

Travas, todas no servidor:

| Regra | Erro |
|---|---|
| Salvar, publicar e definir exceção exigem `Perfil - Operacional - Gestor` ou Administrador do Sistema | `SEM_PERMISSAO` |
| Colocar ou tirar alguém do grupo piloto exige Administrador do Sistema | `SEM_PERMISSAO` |
| `cr40f_AppConfigEfetiva` com `Funcionario` de outra pessoa exige o mesmo perfil ou a conta de serviço dos flows | `SEM_PERMISSAO` |
| Chave fora do catálogo | `CHAVE_INVALIDA` |
| Chave fixa desligada, na matriz ou em exceção | `CHAVE_FIXA` |
| Rascunho alterado por outra pessoa desde a leitura | `RASCUNHO_ALTERADO` |
| Publicar sem rascunho ou com rascunho igual à versão publicada | `NADA_A_PUBLICAR` |
| Exceção sem motivo | `MOTIVO_OBRIGATORIO` |
| Validade no passado | `VALIDADE_INVALIDA` |
| Funcionário inativo ou sem acesso ao App | `MOTORISTA_INVALIDO` |

Publicar cria a versão seguinte como Publicada, marca a anterior como Substituída e remove o rascunho. Exceção nova para uma chave que já tem exceção vigente encerra a anterior.

### Recusa no servidor

- **Cobrança por QR:** o `QrChargePlugin` troca a leitura de `cr40f_podecobrarqrcode` pela chave `services.qrCharge`.
- **Termo de multa:** as Custom APIs do módulo (`new_MinhasMultas`, `new_DeclararAceiteMulta`, `new_AssinarTermoMulta`, `new_ContestarTermoMulta`) recusam com a chave `multas` desligada.
- **Recibo personalizado:** hoje não passa por plugin. Entra um step síncrono no Create de `cr40f_recibos_v2` que recusa com `services.personalReceipt` desligada.

Esses plugins estão no assembly `Betinhos.DriverRecordSharing`, e as Custom APIs novas no `Cr40f.Acesso.Plugin`. O resolvedor em C# é um arquivo de código incluído nos dois, como já acontece com o `SecretReader.cs` (existe uma cópia em cada assembly que o usa).

### Push

Os flows `checklist-push`, `treinamentos-push`, `termo-multa-push` e `multa-aceite-push` ganham um passo antes do envio: chamam `cr40f_AppConfigEfetiva` com o funcionário e, com o módulo desligado, não enviam. `comunicados-push` não muda (módulo fixo).

## 6. App Motoristas

- **Leitura.** Módulo novo `apps/motoristas/src/app/configApp.ts`: chama `cr40f_AppConfigEfetiva`, guarda o resultado no aparelho (versão, chaves e data da leitura) e expõe `ligado(chave)`.
- **Quando lê.** Ao abrir, ao voltar do segundo plano (no máximo uma vez a cada 5 minutos) e ao puxar para atualizar.
- **Sem leitura.** Usa a última guardada. Sem nenhuma, usa o padrão do catálogo. As funções sensíveis continuam barradas pelo servidor.
- **Onde aplica.** Os mesmos pontos do `MULTAS_OCULTO`, agora para qualquer chave: grade, pendências, passo do tour (`optional`), rota inicial e deep link. `modulosOcultos.ts` deixa de existir.
- **Link ou push de módulo desligado.** Abre o Início com o aviso "Este módulo não está disponível para você".
- **No meio de um fluxo.** A configuração nova só é aplicada quando o motorista volta ao Início; a tela aberta não é desmontada. O que já está na fila offline é enviado.
- **QR e recibo.** `useReceiveFlow.ts` e `useReciboPersonalizado.ts` passam a ler as chaves em vez das colunas.
- **Modo preview** (`?preview=1`): força os dados de exemplo, que hoje só valem em `localhost`; não registra service worker nem inscrição de push; não grava nada; recebe a configuração e o motorista simulado por mensagem da página do shell, aceitando só a mesma origem.

## 7. Shell

Rota `#/app-motoristas`, em `apps/shell/src/pages/app-motoristas/`, com componentes do `@betinhos/ui`. Item "App Motoristas" no grupo Cadastros de `apps/shell/src/nav/menu.ts`, visível só para Administrador do Sistema e `temPerfil('operacional', 'gestor')`. Rota aberta por link sem o perfil mostra a página "Sem acesso" de Acessos.

Estrutura: configuração à esquerda, preview fixo à direita. Abaixo de 1100 px o preview vira drawer, aberto pelo botão "Ver no App".

```
+--------------------------------------+  +-----------+
| Perfis | Motoristas | Histórico      |  | Ver como: |
|--------------------------------------|  | [Terceiro]|
| Módulo          Próprio Terc. Admin  |  | .-------. |
| Serviços   (fixo) [on]  [on]  [on]   |  | | Olá,  | |
|    Cobrar por QR  [off] [off] [on]   |  | | Ana   | |
|    Recibo pers.   [off] [off] [on]   |  | |[Serv.]| |
| Comunicados(fixo) [on]  [on]  [on]   |  | |[][][] | |
| Gastos            [on]  [on]  [on]   |  | |[][][] | |
| Multas            [off] [off] [on]   |  | '-------' |
|--------------------------------------|  | rascunho  |
| Rascunho: 3 mudanças     [Publicar]  |  | /publicado|
+--------------------------------------+  +-----------+
```

**Aba Perfis.** Uma linha por módulo, uma coluna por perfil. Serviços abre para mostrar as duas funções. Chaves fixas e a coluna Admin aparecem travadas em ligado. Célula diferente da versão publicada fica destacada. Cada perfil mostra, como informação, as regras fixas do vínculo (dias de histórico, carro pela posse). Barra inferior: quantas mudanças o rascunho tem, quem alterou por último e quando, "Descartar rascunho" e "Publicar".

**Publicar.** Diálogo com a lista do que muda, quantos motoristas cada mudança afeta (já descontadas as exceções) e quantas pendências ficam sem aviso (checklists, treinamentos e termos pendentes dos motoristas que perdem o módulo). Campo de nota opcional. Se o rascunho mudou no servidor desde a leitura, a tela recarrega e avisa antes de publicar.

**Aba Motoristas.** Lista no padrão `useListView` dos funcionários ativos com acesso ao App: nome, perfil, piloto, exceções (um chip por exceção, com a validade) e push ativo. Filtros: perfil, com exceção, sem vínculo, sem push. Quem está sem vínculo aparece com alerta. O drawer do motorista mostra o valor de cada chave e a origem (perfil, exceção ou piloto), cria e encerra exceção, tem a chave do grupo piloto (desabilitada para quem não é Administrador do Sistema) e o botão "Ver no preview".

**Aba Histórico.** Linha do tempo única: versões publicadas (número, quem, quando, nota e o que mudou) e eventos por pessoa (exceção criada, encerrada ou vencida; entrada e saída do piloto). "Voltar a esta versão" carrega a versão como rascunho; se já existe rascunho com mudanças, pede confirmação.

**Preview.** Iframe com o web resource do App do próprio ambiente (`new_app-motoristas-v2`) em `?preview=1`. "Ver como" escolhe um perfil ou busca um motorista (aplica vínculo, piloto e exceções dele; os dados continuam de exemplo). Alterna entre rascunho e publicado. A cada mudança na matriz o preview recebe a configuração nova sem recarregar.

Drawers: clique fora, X e Esc fecham; com alteração não salva perguntam "Descartar alterações?"; não fecham durante o salvamento.

URL: `aba`, `ver` (`perfil:<id>` ou `motorista:<id>`), `modo` (`rascunho` ou `publicado`) e `motorista=<id>` (drawer).

Em modo mock (`isLocalHost()`), a tela usa dados fictícios. De onde o iframe carrega o App no `pnpm dev` fica para o plano.

## 8. Erros

| Situação | O que a pessoa vê |
|---|---|
| Publicar com rascunho alterado por outra pessoa | "Fulano alterou o rascunho às HH:mm. Revise antes de publicar." e a matriz recarregada |
| Sem permissão no servidor | "Você não tem permissão para alterar a configuração do App." |
| Preview não carrega | Moldura com "Não foi possível abrir o preview" e "Tentar de novo"; a configuração continua editável |
| App sem leitura da configuração | Nada: usa a última guardada |
| Função desligada chamada mesmo assim | A mensagem de recusa do servidor, no toast que o App já usa |

## 9. Entrega e transição

Tudo entra por PR na `develop`. Schema por migration; o PROD recebe pelas soluções.

**Fase A — base.** Pacote `packages/app-config` (catálogo, resolução, casos de teste). Migration das duas tabelas. Custom APIs. Carga inicial da versão 1, igual ao comportamento de hoje: Multas desligado para Próprio e Terceiro, QR e recibo desligados nos perfis, o resto ligado. Uma exceção sem validade, com motivo "Migrado da ficha do funcionário", para cada pessoa com `cr40f_podecobrarqrcode` ou `cr40f_gerarrecibopersonalizado` marcada. Nada muda para o motorista.

**Fase B — o App obedece.** Leitura, cache e pontos de aplicação no App; `MULTAS_OCULTO` sai. Recusa no servidor (QR, multas, recibo). Passo novo nos flows de push. Modo preview do App.

**Fase C — a tela.** `#/app-motoristas` com as três abas, rascunho, publicação e preview. A ficha do funcionário passa a tratar vínculo vazio como Próprio e troca as chaves de QR e recibo por um link para a tela nova.

As colunas `cr40f_podecobrarqrcode` e `cr40f_gerarrecibopersonalizado` ficam até o PROD estar na fase B; a remoção é uma migration destrutiva própria, depois.

No PROD, a carga inicial e as exceções da migração são registros, não componente de solução: rodam por script, com pedido explícito do Renan, depois de o schema chegar pelas soluções.

O PR #648 (hotfix do `MULTAS_OCULTO`) entra na `develop` antes da fase B.

## 10. Limites conhecidos

- O servidor só recusa as três funções sensíveis. Para os outros módulos, desligar esconde no App mas não impede uma chamada direta à Web API por quem tem o papel do motorista.
- A mudança publicada só chega quando o App confere a configuração. Quem deixa o App aberto na mesma tela continua vendo o que já estava aberto.
- Um aparelho que nunca leu a configuração e está sem rede mostra o padrão do catálogo, que pode ser diferente da versão publicada.
- O preview usa dados de exemplo: mostra o que aparece e o que some, não os serviços reais do motorista.

## 11. Testes e verificação

- **Resolução:** `casos.json` cobre chave fixa, exceção que liga e que desliga, exceção vencida, piloto, vínculo vazio, chave ausente na matriz e função com módulo pai desligado. Os testes de TypeScript e de C# leem o mesmo arquivo.
- **Plugin:** um teste por trava da seção 5; publicação cria a versão seguinte e substitui a anterior; recusa de QR, multa e recibo com a chave desligada.
- **App:** grade, pendências, tour, rota e deep link para uma chave desligada qualquer; reserva sem leitura; configuração nova aplicada só na volta ao Início; modo preview não grava nem registra push.
- **Flows:** teste de estrutura dos quatro flows de push com o passo novo.
- **Shell:** matriz, rascunho, diálogo de publicação, drawer do motorista e histórico em mock (desktop e 375 px), com print.
- **No DEV, com conta de motorista de teste:**
  1. Desligar Gastos para Terceiro e publicar: o módulo some do App de um terceiro e continua no de um próprio.
  2. Exceção ligando QR para um motorista: o botão aparece e a cobrança é aceita; encerrada, o servidor recusa.
  3. Exceção com validade de ontem não vale.
  4. Colocar um motorista no piloto: Multas aparece só para ele.
  5. Push de checklist não chega a quem está com Checklists desligado.
  6. Preview como o mesmo motorista mostra a mesma grade do aparelho.

Skill de verificação nova: `verificar-config-app-motoristas`, criada junto com a fase C.

## 12. Pontos em aberto para o plano

1. **Recibo:** conferir quem mais cria `cr40f_recibos_v2` (escritório, gerador de recibo) para o step novo recusar só o motorista sem a função.
2. **Papel do motorista:** conferir na metadata se `Acesso-Motoristas` grava as colunas de QR e recibo na própria ficha.
3. **Outros pushes:** `provision-flow-aviso-motorista.ps1` e `conciliacao-cartao-diario.json` também usam a inscrição de push; classificar a que módulo pertencem.
4. **Status do push não enviado:** cada flow tem a sua coluna de status; definir o valor para "módulo desligado".
5. **Preview no `pnpm dev`:** de onde o shell carrega o App (servidor de desenvolvimento do App ou o build).
6. **Gerador de papéis de Acessos:** como declarar duas tabelas que só o Gestor lê e ninguém grava.
