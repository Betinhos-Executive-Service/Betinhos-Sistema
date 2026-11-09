# Contexto do Projeto - Tela Formulario Geral

## Objetivo

Recriar em HTML, CSS e JavaScript o formulario de agendamento de servicos que hoje existe em um Power Apps Canvas App.

O novo formulario sera publicado como web resource e usado dentro de um Model-driven App, substituindo a Custom Page atual.

## Contexto atual

- Usuario principal: equipe interna Betinhos Executive Service.
- Aplicacao host: Model-driven App.
- Tela atual: Canvas App usado como Custom Page.
- Finalidade: agendamento de servicos.
- Plataforma de dados esperada: Dataverse.
- Idioma: pt-BR.
- Moeda: BRL.
- Fuso horario: America/Sao_Paulo.

## Direcao tecnica

- Entregar uma tela standalone em HTML/CSS/JS.
- Usar `Xrm.WebApi` quando estiver dentro do Model-driven App.
- Preservar o funcionamento real do Canvas App antes de redesenhar.
- Mapear regras, campos, validacoes, automacoes e estados antes de implementar.
- Evitar dependencia de framework se o formulario puder ser mantido com vanilla JS.
- Tratar o web resource como produto operacional, nao como landing page.

## Contratos que precisam ser levantados

### Dados

- Tabelas Dataverse usadas pelo formulario.
- Campos obrigatorios.
- Campos calculados ou preenchidos automaticamente.
- Lookups.
- Choices/optionsets.
- Relacionamentos.
- Regras de duplicidade.
- Status do agendamento.

### Fluxo do formulario

- Sequencia de preenchimento.
- Campos condicionais.
- Validacoes por etapa.
- Regras para salvar rascunho.
- Regras para finalizar/enviar.
- Mensagens de erro.
- Permissoes por perfil.

### Integracoes

- Power Automate acionado pelo formulario.
- Parametros enviados para fluxos.
- Retorno esperado dos fluxos.
- Emails, notificacoes ou atualizacoes em outras tabelas.
- Dependencias com SharePoint, Outlook, Teams, RD Station ou outros servicos.

### UI e UX

- Layout atual do Canvas App.
- Campos visiveis por perfil.
- Comportamento desktop.
- Comportamento mobile/tablet, se existir.
- Popups, paineis laterais, etapas, abas ou componentes reutilizados.
- Identidade visual desejada para a nova tela.
- O formulario deve usar 100% do espaco disponivel do web resource; nao usar `max-width` no shell/conteudo principal.
- Topbar, menu lateral e titulos devem ser compactos para otimizar area util de preenchimento.

## Regras de implementacao

- Nao inventar schema.
- Nao inferir regra de negocio sem confirmar no Canvas App, Dataverse ou fluxo.
- Se faltar dado, registrar como pendencia.
- Se houver divergencia entre Canvas App e Dataverse, Dataverse vence para schema.
- Se houver divergencia entre comportamento esperado e codigo atual, registrar antes de alterar.

## Entregaveis previstos

1. Auditoria do formulario atual.
2. Mapa de dados e regras.
3. Especificacao funcional do novo web resource.
4. Implementacao HTML/CSS/JS.
5. Checklist de publicacao no Dataverse.
6. Teste dentro do Model-driven App.

## Pendencias imediatas

- Exportar ou copiar as formulas principais do Canvas App.
- Listar as telas e componentes usados no formulario.
- Identificar as tabelas Dataverse envolvidas.
- Identificar os fluxos Power Automate chamados.
- Definir se o novo web resource precisa editar registro existente, criar novo registro, ou ambos.

## Fonte auditada em 2026-05-18

- `OnStart_Formulario_CanvasApps.fx`
- `Formulario_Canvas_Apps.YAML`
- `C:\Users\mendo\Desktop\vscode\CONTEXTO\contexto.md`
- Export da solucao `AppBetinhos_1_0_0_133_managed` para confirmar logical names.
- `metadata-AppBetinhos-2026-05-18T12-03-52-460Z.json`
  - Gerado em: `2026-05-18T12:03:52.446Z`
  - Ambiente: `https://org23b93544.crm2.dynamics.com/`
  - Solucao: `AppBetinhos` versao `1.0.0.152`

## Arquitetura entregue

- `index.html`: estrutura do novo web resource.
- `styles.css`: UI operacional responsiva.
- `app.js`: estado, validacoes, carga Dataverse e salvamento.
- `scripts/coletar_metadata_dataverse_console.js`: script de console para baixar metadata da solucao Dataverse.
- `metadata-AppBetinhos-2026-05-18T12-03-52-460Z.json`: snapshot do metadata utilizado para o primeiro contrato real.

## Novidades (2026-05-18)

- Shell operacional com **topbar**, badge de ID do registro, tabs e áreas funcionais separadas (`Detalhes`, `Banco de Dados`, `Retorno`, `Repetir`).
- Selects padronizados em componente customizado com busca, painel flutuante e acessibilidade (keyboard).
- Fluxo de passageiros com lista dinâmica, ordem, validação de duplicidade e remoção por linha.
- `Endereço de saída` por passageiro com modo de endereço personalizado no serviço principal.
- Retorno e repetição tratados como blocos separados, com validações independentes.
- `mock mode` ativável via `?mock=1` / `?mockData=1` para execução fora do host do Dataverse.
- Salvar principal/retorno e serviços frequentes respeitando as regras:
  - retorno e repetição só no contexto de criação;
  - na criação, retorno separado e repetição podem ser usados juntos;
  - na edição, retorno e repetição continuam bloqueados;
  - na edição, remove e recria relações de passageiros.
- Feedback operacional com overlay de carregamento, toast stack e overlay de sucesso.
- Favicon embutido no HTML para evitar 404 em ambiente local.
- Conferência operacional e agendamentos adicionais foram removidos da interface e do fluxo de criação.
- Rascunho local automático e edição direta de passageiro existente seguem na aba Banco de Dados.

## Novidades (2026-05-19)

- IDs fantasma removidos do contrato JS: `riskList`, `saveLogList`, `draftStatus`, `confirmSaveButton` e `bdExistingPassenger`.
- `Choices` de fallback em `app.js` foram alinhados ao metadata real auditado; valores mock inventados foram removidos.
- Dados mock de passageiro tambem sao normalizados para os mesmos valores de Choice usados no Dataverse.
- Dados mock de passageiro sao deduplicados por ID antes de renderizar selects e buscas locais.
- Passageiros carregam ate 5000 registros no inicio para o solicitante e o Banco de Dados listarem sem exigir texto. A busca server-side continua disponivel para complementar por nome/telefone e para carga pontual por IDs em edicao/rascunho.
- Cadastro de passageiro novo agora executa conferencia de duplicidade por telefone, email, nome parecido, cliente, CR e departamento.
- Quando houver candidato provavel, a tela mostra o registro encontrado e pergunta: "Certeza que este nao e o passageiro desejado?".
- Validacao de passageiro parecido busca tambem o pool do mesmo cliente e aceita nome com transposicao, ordem diferente, particulas ignoraveis, telefone com 1 digito divergente e email quase igual quando ha contexto suficiente.
- Validacoes adicionadas: retorno antes da saida bloqueia salvamento; periodo recorrente acima do limite bloqueia geracao.

## Telas / abas replicadas

- `Detalhes`: dados principais do servico.
- `Banco de Dados`: cadastro rapido de passageiro e **área de manutenção/atualização de passageiro** (deve permitir abrir e editar passageiro já existente).
- `Retorno`: agendamento de retorno separado.
- `Repetir`: servicos frequentes.

No Canvas App, `BD`, `Retorno` e `Repetir` aparecem apenas para registro novo. Em edicao, retorno e frequencia sao bloqueados.

## Tabelas Dataverse confirmadas

### Tabelas usadas pelo formulario

| Papel | Logical name | EntitySetName |
|---|---|---|
| Reserva | `cr40f_reservadeveculos` | `cr40f_reservadeveculoses` |
| Banco de Dados / Passageiros | `cr40f_bancodedados` | `cr40f_bancodedadoses` |
| Cliente | `cr40f_clientes1` | `cr40f_clientes1s` |
| Funcionarios / Motoristas | `cr40f_funcionarios` | `cr40f_funcionarioses` |
| Servicos por Passageiro | `cr40f_servicosporpassageiro` | `cr40f_servicosporpassageiros` |
| Ordens de Pagamento | `cr40f_financeiro` | `cr40f_financeiros` |

### Tabelas presentes no JSON da solucao

| Logical name | EntitySetName | Label |
|---|---|---|
| `cr40f_bancodedados` | `cr40f_bancodedadoses` | Banco de Dados |
| `cr40f_clientes1` | `cr40f_clientes1s` | Cliente |
| `cr40f_funcionarios` | `cr40f_funcionarioses` | Funcionarios |
| `cr40f_reservadeveculos` | `cr40f_reservadeveculoses` | Geral |
| `cr40f_infracaodetransito` | `cr40f_infracaodetransitos` | Infracao de Transito |
| `cr40f_manutencoes` | `cr40f_manutencoeses` | Manutencoes |
| `cr40f_multas` | `cr40f_multases` | Multas |
| `cr40f_financeiro` | `cr40f_financeiros` | Ordens de Pagamento |
| `cr40f_pagantes` | `cr40f_paganteses` | Pagantes |
| `cr40f_registrodeviagem` | `cr40f_registrodeviagems` | Registro de Viagem |
| `cr40f_servicosporpassageiro` | `cr40f_servicosporpassageiros` | Servicos por Passageiro |
| `cr40f_statusdamanutencao` | `cr40f_statusdamanutencaos` | Status da Manutencao |
| `cr40f_trocasdecarro` | `cr40f_trocasdecarros` | Trocas de Carro |
| `cr40f_veiculos` | `cr40f_veiculoses` | Veiculos |
| `cr40f_contafinanceira` | `cr40f_contafinanceiras` | Conta Financeira |
| `new_possedeveiculo` | `new_possedeveiculos` | Posse de Veiculo |
| `cr40f_anexodespesa` | `cr40f_anexodespesas` | Anexo de Despesa |
| `cr40f_despesa` | `cr40f_despesas` | Despesa |
| `cr40f_politicadespesa` | `cr40f_politicadespesas` | Politica de Despesa |
| `cr40f_composicaodeprecos` | `cr40f_composicaodeprecoses` | Composicao de Precos |
| `cr40f_solicitacaosincronizacao` | `cr40f_solicitacaosincronizacaos` | Solicitacao de Sincronizacao |
| `new_marketing` | `new_marketings` | Marketing |
| `new_centraldenotificacoes` | `new_centraldenotificacoeses` | Central de Notificacoes |
| `cr40f_categoriadespesa` | `cr40f_categoriadespesas` | Categoria de Despesa |
| `cr40f_transacaofinanceira` | `cr40f_transacaofinanceiras` | Transacao Financeira |
| `cr40f_cartaomotorista` | `cr40f_cartaomotoristas` | Cartao por Motorista |

## Campos principais da reserva

| Campo no Canvas | Logical name |
|---|---|
| GUID Reserva de Veiculos | `cr40f_reservadeveculosid` |
| ID | `cr40f_id` |
| Status de Operacao | `cr40f_status` |
| Status de Faturamento | `cr40f_statusdefaturamento` |
| Data e horario de saida | `cr40f_dataehorriodesada` |
| Previsao de retorno | `cr40f_horrioprevistoderetorno` |
| Tipo do Servico | `cr40f_tipodoservico` |
| Tipo de Veiculo | `cr40f_tipodeveiculo` |
| Destino | `cr40f_destino` |
| Ed de Saida - VIEW | `cr40f_endereodesada` |
| Endereco de Saida Personalizado | `new_enderecodesaidapersonalizado` |
| Obs de Operacao | `cr40f_obsdeoperao` |
| Observacao interna | `cr40f_observaointerna` |
| Observacao Final | `new_observacaofinal` |
| Perfil do passageiro | `cr40f_perfildopassageiro` |
| Email | `cr40f_email` |
| Pax - VIEW | `cr40f_passageirosetelefonedecontato` |
| Trajeto | `cr40f_trajeto` |
| Cotacao | `cr40f_cotao` |
| Receber | `cr40f_receber` |
| CR | `cr40f_cr` |
| Forma de Pagamento | `cr40f_formadepagamento` |
| OP | `cr40f_financeiro` |

## Campos principais do Banco de Dados

| Campo no Canvas | Logical name |
|---|---|
| GUID Banco de Dados | `cr40f_bancodedadosid` |
| Nome do Passageiro | `cr40f_nomedopassageiro` |
| Telefone | `cr40f_telefone` |
| Endereco de Saida | `cr40f_enderecodesaida` |
| Preferencias do Passageiro | `cr40f_preferenciasdopassageiro` |
| Email | `cr40f_email` |
| Cliente | `cr40f_cliente` |
| CR | `cr40f_cr` |
| Cargo | `cr40f_cargo` |
| Data de Nascimento | `cr40f_datadenascimento` |
| Sexo | `cr40f_sexo` |
| Idioma | `cr40f_idioma` |
| Departamento | `cr40f_departamento` |
| Data de Cadastro | `cr40f_datadecadastro` |
| Classificacao | `cr40f_classificacao` |
| Status | `cr40f_status` |
| Tipo do Veiculo | `new_tipodoveiculo` |

Observacao critica: no Banco de Dados, `cr40f_tipodeveiculo` nao existe no metadata auditado. O campo real e `new_tipodoveiculo`.

## Relacionamento Servicos por Passageiro

| Campo | Logical name |
|---|---|
| GUID | `cr40f_servicosporpassageiroid` |
| Reserva pai | `cr40f_geral` |
| Passageiro | `cr40f_bancodedados` |
| Ordem de selecao | `cr40f_ordemdeselecao` |
| Endereco de saida por passageiro | `new_enderecodesaidacolunaservicosporpassageiro` |

Na edicao, o app atualiza ou cria os filhos `Servicos por Passageiro` desejados primeiro e remove apenas os vinculos que sairam da lista depois das gravacoes novas concluirem.

## Navigation properties confirmadas para `@odata.bind`

| Tabela | Campo lookup | Bind name | Tabela destino |
|---|---|---|---|
| `cr40f_reservadeveculos` | `cr40f_cliente` | `cr40f_Cliente` | `cr40f_clientes1` |
| `cr40f_reservadeveculos` | `cr40f_solicitante` | `cr40f_Solicitante` | `cr40f_bancodedados` |
| `cr40f_reservadeveculos` | `cr40f_motorista` | `cr40f_Motorista` | `cr40f_funcionarios` |
| `cr40f_reservadeveculos` | `cr40f_financeiro` | `cr40f_Financeiro` | `cr40f_financeiro` |
| `cr40f_bancodedados` | `cr40f_cliente` | `cr40f_Cliente` | `cr40f_clientes1` |
| `cr40f_servicosporpassageiro` | `cr40f_geral` | `cr40f_Geral` | `cr40f_reservadeveculos` |
| `cr40f_servicosporpassageiro` | `cr40f_bancodedados` | `cr40f_BancodeDados` | `cr40f_bancodedados` |

Contrato para payload:

- `payload["cr40f_Cliente@odata.bind"] = "/cr40f_clientes1s(<guid>)"`
- `payload["cr40f_Solicitante@odata.bind"] = "/cr40f_bancodedadoses(<guid>)"`
- `payload["cr40f_Motorista@odata.bind"] = "/cr40f_funcionarioses(<guid>)"`
- `payload["cr40f_Financeiro@odata.bind"] = "/cr40f_financeiros(<guid>)"`
- `payload["cr40f_Geral@odata.bind"] = "/cr40f_reservadeveculoses(<guid>)"`
- `payload["cr40f_BancodeDados@odata.bind"] = "/cr40f_bancodedadoses(<guid>)"`

## Choices confirmados no metadata

### Reserva

`cr40f_status` - Status de Operacao:

| Valor | Label |
|---:|---|
| `202410002` | Cancelado |
| `100000001` | Requer Analise |
| `202410010` | Cancelado com Ressalvas |
| `202410000` | Pre-reserva |
| `202410004` | Solicitado |
| `202410001` | Confirmado |
| `202410005` | Programado |
| `202410006` | Em Execucao |
| `202410008` | Concluido |

`cr40f_statusdefaturamento` - Status de Faturamento:

| Valor | Label |
|---:|---|
| `202410011` | Nao Faturavel |
| `202410005` | Pendente |
| `100000001` | Composicao Realizada |
| `202410000` | Cancelado Sem Taxa |
| `202410002` | Cancelado Com Taxa |
| `202410003` | Cortesia |
| `202410004` | Permuta |
| `202410006` | Pagante em Viagem |
| `202410007` | Pagamento Pendente |
| `202410012` | Pagamento Em Atraso |
| `202410008` | Faturamento Mensal |
| `202410010` | Pago |

`cr40f_formadepagamento` - Forma de Pagamento:

| Valor | Label |
|---:|---|
| `202410000` | Cartao de credito |
| `202410001` | Pedido de compra |
| `202410002` | Pix |

`cr40f_tipodoservico` - Tipo do Servico:

| Valor | Label |
|---:|---|
| `202410000` | Guarulhos |
| `202410001` | Sao Paulo |
| `202410002` | Outras Cidades |
| `202410003` | Vale do Paraiba |
| `202410004` | Rio de Janeiro |
| `202410005` | Pindamonhangaba |
| `202410006` | Sao Jose dos Campos |
| `202410007` | Congonhas |
| `202410008` | Campinas |
| `202410009` | Dentro de Sao Paulo |
| `202410010` | Litoral |
| `202410011` | Regiao dos Lagos |
| `202410012` | Extrema |
| `202410013` | Nova Odessa |
| `202410014` | Baixada Santista |
| `202410015` | Minas Gerais |
| `202410016` | GPX |

`cr40f_tipodeveiculo` / `new_tipodoveiculo` - Tipo de Veiculo:

| Valor | Label |
|---:|---|
| `202410000` | Basico |
| `202410001` | Executivo |
| `202410002` | Blindado |
| `202410003` | Van |
| `202410004` | Van Blindado |
| `202410005` | Spin |
| `202410006` | Somente Motorista |

### Banco de Dados

`cr40f_classificacao` - Classificacao:

| Valor | Label |
|---:|---|
| `202410000` | Passageiro Frequente |
| `202410001` | Visitante |
| `202410002` | Solicitante |
| `202410003` | Grupo |
| `202410004` | Lead |

`cr40f_idioma` - Idioma:

| Valor | Label |
|---:|---|
| `202410000` | Portugues |
| `202410001` | Ingles |
| `202410002` | Espanhol |

`cr40f_sexo` - Sexo:

| Valor | Label |
|---:|---|
| `202410000` | Masculino |
| `202410001` | Feminino |

`cr40f_cargo` - Cargo:

| Valor | Label |
|---:|---|
| `202410000` | C-Level |
| `202410001` | Presidente |
| `202410002` | Vice Presidente |
| `202410003` | Diretor |
| `202410004` | Assistente Executiva |
| `202410005` | Gerente |
| `202410006` | Supervisor |
| `202410007` | Analista |
| `202410008` | Comprador |
| `202410009` | Engenheiro |
| `100000001` | Conselheiro |

## Obrigatoriedade Dataverse confirmada

| Tabela | Campo | RequiredLevel |
|---|---|---|
| `cr40f_reservadeveculos` | `cr40f_status` | Recommended |
| `cr40f_reservadeveculos` | `cr40f_tipodoservico` | Recommended |
| `cr40f_reservadeveculos` | `cr40f_tipodeveiculo` | Recommended |
| `cr40f_reservadeveculos` | `cr40f_statusdefaturamento` | None |
| `cr40f_reservadeveculos` | `cr40f_formadepagamento` | None |
| `cr40f_bancodedados` | `cr40f_nomedopassageiro` | ApplicationRequired |
| `cr40f_bancodedados` | `cr40f_idioma` | ApplicationRequired |
| `cr40f_bancodedados` | `cr40f_status` | ApplicationRequired |
| `cr40f_bancodedados` | `cr40f_email` | Recommended |
| `cr40f_bancodedados` | `cr40f_datadecadastro` | Recommended |
| `cr40f_bancodedados` | `cr40f_sexo` | Recommended |
| `cr40f_bancodedados` | `cr40f_cliente` | Recommended |

## Regras do OnStart / OnVisible

- `gblRecordId = Param("id")`.
- `gblIsNewRecord = IsBlank(gblRecordId)`.
- Registro existente carrega reserva por `GUID Reserva de Veiculos`.
- Registro existente carrega observacoes:
  - `ObsInterna`
  - `ObsMotorista`
  - `ObsFinal`
- Aba inicial: `Detalhes`.
- Observacao inicial: `Motorista`.
- Em novo registro:
  - `colPassageirosServico` inicia com uma linha vazia.
  - `colEnderecoRascunho` inicia com uma linha vazia.
- Em edicao:
  - busca `Servicos por Passageiro` filtrando pela reserva.
  - ordena por `cr40f_ordemdeselecao`.
  - detecta endereco personalizado se `new_enderecodesaidapersonalizado` estiver preenchido ou se todos os filhos nao tiverem endereco por passageiro.

## Regras de passageiros

- Botao adicionar passageiro bloqueia se existir linha sem passageiro.
- Passageiros sao ordenados por `OrdemSelecao`.
- Ao selecionar passageiro:
  - grava GUID.
  - grava telefone.
  - grava endereco de saida do Banco de Dados no rascunho.
  - se cliente principal ainda estiver vazio, usa o cliente do passageiro.
  - reseta tipo de veiculo e CR para recalcular pelos passageiros.
- Remover passageiro:
  - remove linha em `colPassageirosServico`.
  - remove endereco em `colEnderecoRascunho`.
  - reindexa as ordens.
- Endereco personalizado:
  - ativado: esconde endereco por linha e usa um texto unico.
  - desativado: restaura enderecos por passageiro a partir do rascunho/BD.

## Regras de observacao

Ha quatro buffers:

- Motorista -> `cr40f_obsdeoperao`
- Interna -> `cr40f_observaointerna`
- Final -> `new_observacaofinal`
- Pref Pax -> texto concatenado das preferencias dos passageiros

Ao trocar o tipo de observacao, o texto atual e salvo no buffer anterior.

## Validacoes antes de salvar

- Data e horario de saida obrigatorios.
- Tipo do Servico obrigatorio, exceto quando status for `Troca de Veiculos`.
- Tipo do Veiculo obrigatorio, exceto quando status for `Troca de Veiculos`.
- Trajeto obrigatorio, exceto quando status for `Troca de Veiculos`.
- Pelo menos um passageiro obrigatorio, exceto quando status for `Troca de Veiculos`.
- Endereco de saida obrigatorio, exceto quando status for `Troca de Veiculos`.
- Destino obrigatorio, exceto quando status for `Troca de Veiculos`.
- Se retorno ativado:
  - Data de Retorno obrigatoria.
  - Endereco de Saida - Retorno obrigatorio.
  - Destino - Retorno obrigatorio.
- Se repetir ativado:
  - Data de Inicio e Data de Fim obrigatorias.
  - Tipo de Servico Frequente obrigatorio.
- Novo registro pode usar Retorno e Repetir ao mesmo tempo.
- Passageiro duplicado bloqueia salvamento.

## Regras de data e retorno

- `varDataHoraPrincipal`: data de saida + hora + minuto.
- `varDataHoraRetorno`: data de retorno + hora + minuto.
- `varDataHoraRetornoPrevista`:
  - vazio se hora/minuto previstos estiverem vazios.
  - se horario previsto for menor que saida, soma 1 dia.
  - se horario previsto for `00:00`, usa meia-noite do dia base.
- Retorno separado inverte `Trajeto` usando separador `" / "`.
- Retorno separado usa:
  - endereco de saida = destino do servico principal.
  - destino = endereco completo invertido dos passageiros.

## Regras de servicos frequentes

- Disponivel apenas na criacao.
- Gera datas entre inicio e fim, inclusive.
- Se `Contabilizar Sab e Dom?` estiver falso, remove sabado e domingo.
- Tipo `Ida` cria registros de ida, exceto a data/hora principal ja criada.
- Tipo `Retorno` cria registros de retorno.
- Tipo `Ida e retorno` cria ambos.
- Retorno frequente usa horario de retorno informado; se vazio, usa 18:00.
- Quando Retorno e Repetir estao juntos, o sistema cria:
  - servico principal;
  - recorrencia conforme `Tipo`;
  - retorno separado original.
- A previsao de retorno das idas recorrentes e recalculada por data gerada, usando o horario previsto e a mesma regra de virada de dia do Canvas App.
- Se Retorno ou Repetir tiverem campos editados mas a chave `Ativado` estiver desligada:
  - a aba mostra bolinha amarela;
  - ao clicar em `Agendar servicos`, o sistema abre popup para revisar, salvar sem ativar ou ativar e agendar;
  - bolinha verde continua significando aba ativada.
- Data final anterior a inicial bloqueia.

## Validacao local - 2026-05-18

- `app.js` foi ajustado para usar `new_tipodoveiculo` no cadastro/consulta de Banco de Dados.
- O select `Tipo de Veiculo` do Banco de Dados carrega as choices do campo `new_tipodoveiculo`.
- O default de tipo de veiculo do servico tenta usar o valor do passageiro e, se necessario, cai para o label equivalente no choice da Reserva.
- O horario carregado de registros existentes arredonda minutos para baixo em blocos de 5 minutos, evitando minuto invalido `60`.
- A tela recalcula o destino invertido do retorno quando passageiros/endereco mudam.
- Console local tinha 404 de `favicon.ico`; foi corrigido com favicon embutido no `index.html`.

## Pendencias tecnicas para fechar 100%

- Testar criacao real dentro do Model-driven App.
- Testar edicao real com exclusao/recriacao dos filhos.
- Criar mecanismo explícito para **atualizar dados do passageiro existente** na aba/seção de Banco de Dados (não apenas criar novo registro).
