# Alertas proativos de operação

> **Status: substituída em 15/10/2026.** O módulo `server/vigilancia/` do `whatsapp-inbox` (PR 93, mesclado em 14/10/2026) já cobre risco de atraso com trânsito, carro parado, sem sinal e sem programação, com aviso no grupo de WhatsApp da operação, e o chat "Vigilância da operação" o está migrando para um Worker da Cloudflare. Esta spec fica como referência histórica. **Só o resumo diário de documentos e multas segue em frente**, como um flow pequeno de Power Automate: ver a seção "Escopo remanescente" no fim. Não execute o resto (geocoding, Worker, tabela de alertas, e-mail e Teams de atraso), porque duplica o outro módulo e a operação receberia o mesmo atraso duas vezes.

Data: 15/10/2026. Desenho aprovado por Renan no brainstorm desta data e revisado no mesmo dia: o verificador roda em um **Cloudflare Worker no plano grátis**, não no Power Automate. Escopo: Fases 1 e 2 (alertas). A Fase 0 (campo de endereço do Google, em uma cópia do formulário) e a Fase 3 (alertas na tela do Assistente) têm planos próprios.

## Objetivo

Um agente proativo que, sem ninguém abrir tela, identifica problemas de operação e avisa a equipe na hora. O foco principal é o motorista que está atrasado ou que não vai chegar ao embarque a tempo, considerando trânsito. Ele só avisa pessoas. Não grava em registros de negócio e não fala com cliente nem motorista.

## Decisões

| Tema | Decisão |
|---|---|
| Regras | Não chegará a tempo, já atrasado, motorista parado a caminho, sem motorista em até 2 h, CNH ou ASO vencido, documento do veículo vencido, multa sem condutor. |
| Hospedagem | Cloudflare Worker, plano grátis, com dois cron triggers. Código TypeScript em `apps/alertas-worker`, reaproveitando o pacote `packages/alertas-operacao`. |
| Por que não Power Automate | O Renan tem um teto de 10.000 ações por mês. Um verificador a cada 5 minutos gasta cerca de 70.000 por mês só em execuções vazias. O caminho recorrente não usa Power Automate. |
| Canais | E-mail da operação, enviado direto pelo Worker pelo Microsoft Graph. Teams é opcional e entra por um webhook do Workflows, que gasta ações do Power Automate (ver Canais). Push do Power Apps depende do conector do Power Automate e fica fora da primeira versão. |
| Detecção | Regras fixas, sem IA. O Claude continua nos Assistentes. |
| Trânsito | Google Routes API com `TRAFFIC_AWARE`, atrás de um pré-filtro grátis. |
| Pré-filtro | Rota sem trânsito do OSRM (o mesmo que o Infleet MCP usa) vezes um fator pessimista de 2,0. Só consulta o Google se o motorista não está claramente folgado. |
| Posição | Infleet GraphQL (`api.infleet.com.br/v1/graphql`), token como secret do Worker. |
| Dataverse | Web API com um app do Entra ID (client credentials) e um usuário de aplicativo com papel mínimo. |
| Ambiente | Só DEV até pedido explícito. O Worker aponta para o DEV por variável. Nenhuma escrita em PROD. |
| Segredos | Secrets do Worker (`wrangler secret`), definidos pelo Renan. O repositório é público: só nomes e scripts, nunca valores. Nenhum agente lê esses valores. |

## Alternativas descartadas

- **Power Automate (verificador e avaliador em flows):** inviável com 10.000 ações por mês. Também exigia expressões longas e um script de conformidade.
- **Azure Functions:** custo de R$ 0 a R$ 5 por mês, mas a conta do Renan não tem assinatura do Azure. Criar uma exige cartão. Fica de reserva se o Worker grátis não aguentar.
- **Worker pago (US$ 5 por mês):** só se o limite de CPU do plano grátis estourar na medição.
- **GitHub Actions agendado:** grátis em repositório público, mas o agendamento atrasa de forma imprevisível, o que não serve para alerta de atraso.
- **Agente com Claude decidindo e enviando:** muda o contrato "só sugere" e custa mais sem melhorar a detecção.

## Regras

Constantes (arquivo único no pacote): margem 10 min; fator de trânsito 2,0; janela de monitoramento de 60 min antes a 180 min depois da saída; posição considerada velha acima de 10 min; parado = velocidade até 3 km/h por 10 min; chegou ao embarque = a até 150 m; sem motorista = a até 120 min da saída; atrasado = até 60 min após a saída; lembrete após 30 min; Google sempre nos últimos 30 min.

| Regra | Quando dispara | Severidade |
|---|---|---|
| NaoChegaraATempo | Antes da saída, veículo rastreado e ainda não chegou, e a chegada prevista com trânsito passa de saída menos margem. | Alta se a chegada passa da saída; média se cabe dentro da margem. |
| JaAtrasado | Passou da saída até 60 min, veículo rastreado e ainda não chegou. | Alta. |
| MotoristaParado | Até 90 min da saída, parado há 10 min ou mais, a mais de 500 m do embarque. | Alta se faltam 30 min ou menos; senão média. |
| SemMotorista | Serviço Confirmado ou Programado sem motorista, a 120 min ou menos da saída. | Alta se faltam 60 min ou menos; senão média. |
| CNH ou ASO vencido | Motorista escalado hoje com `cr40f_validadedacnh` anterior a hoje ou ASO com mais de 12 meses. | Resumo diário. |
| Documento do veículo vencido | Veículo escalado hoje com `cr40f_documento` Vigente e validade anterior a hoje. | Resumo diário. |
| Multa sem condutor | `cr40f_multas` com status "Notificar o Condutor", sem motorista e `cr40f_dataparaindicar` em até 3 dias. | Resumo diário. |

Lacunas explícitas desta versão:
- Veículo sem posição recente (acima de 10 min) não gera alerta de atraso. A regra "sem rastreamento perto da saída" não foi selecionada.
- Serviço com vários embarques monitora só o primeiro.
- Motorista sem veículo atribuído não é rastreável.

## Dados

### Coordenadas do embarque (colunas novas em `cr40f_reservadeveculos`)

O endereço do serviço é texto livre, por exemplo "Aerop. Guarulhos no voo DL105" ou "Tenaris Tubos - Portaria 01". Por isso o Worker geocodifica e guarda o resultado no próprio serviço.

| Coluna | Tipo | Observação |
|---|---|---|
| `cr40f_embarquelatitude`, `cr40f_embarquelongitude` | decimal, 7 casas | |
| `cr40f_embarqueprecisao` | choice | Informado (Fase 0), Geocodificado, Aproximado, Indisponível |
| `cr40f_embarquetexto` | texto 500 | Texto que foi geocodificado. Se o endereço mudar, geocodifica de novo. |
| `cr40f_embarquegeocodificadoem` | data/hora | Serviço Indisponível só é tentado de novo após 24 h. |

Texto enviado ao Google: `new_enderecodesaidapersonalizado`, senão `cr40f_endereodesada`. Usa só a primeira linha ou item (quebra de linha ou ponto e vírgula). Se o texto começa com um dígito, ponto e espaço ("1. "), usa só o que vem depois do primeiro " - " (ou remove o número). Assim o nome do passageiro não vai ao Google.

Classificação da resposta do Geocoding: `ROOFTOP` ou `RANGE_INTERPOLATED` sem correspondência parcial é Geocodificado; `GEOMETRIC_CENTER` ou correspondência parcial é Aproximado e o alerta diz "local aproximado"; `APPROXIMATE` ou sem resultado é Indisponível e o serviço não gera alerta de atraso.

### Tabela `cr40f_alertaoperacao`

| Coluna | Tipo |
|---|---|
| `cr40f_alertaoperacaonome` | texto 200, nome primário (o título do alerta) |
| `cr40f_regra` | choice: NaoChegaraATempo, JaAtrasado, MotoristaParado, SemMotorista, DocumentosResumo, FalhaDoAgente |
| `cr40f_chave` | texto 200, `regra|idDoServico` |
| `cr40f_reserva` | lookup para `cr40f_reservadeveculos` |
| `cr40f_severidade` | choice: Média, Alta |
| `cr40f_status` | choice: Aberto, Resolvido |
| `cr40f_resolucao` | choice: Condição encerrada, Fora da janela |
| `cr40f_mensagem` | memo |
| `cr40f_envios` | inteiro |
| `cr40f_ultimoenvioem`, `cr40f_resolvidoem` | data/hora |
| `cr40f_canais` | texto 100 |

### Configuração do Worker

Secrets (o Renan define com `wrangler secret put`): `INFLEET_TOKEN`, `GOOGLE_MAPS_KEY` (restrita às APIs Routes e Geocoding), `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `SEGREDO_EXECUCAO_MANUAL`, `TEAMS_WEBHOOK_URL` (opcional).
Variáveis simples (em `wrangler.toml`, sem segredo): `DATAVERSE_URL`, `ALERTAS_LIGADO` (sim ou não), `ALERTAS_CANAIS` (por exemplo `email,teams`), `EMAIL_REMETENTE`, `EMAIL_OPERACAO`, `EMAIL_TI`.

## Arquitetura

Um Worker, duas rotinas, mais o pacote de regras puro.

1. **Verificar (cron a cada 5 min, 04:00 às 23:59 de Brasília):** `*/5 7-23,0-2 * * *` em UTC. Coleta serviços e alertas abertos no Dataverse, geocodifica os serviços sem coordenada, lê a posição de toda a frota no Infleet, calcula a rota OSRM, chama `avaliar` do pacote, consulta o Google só para quem o `avaliar` pediu, chama `avaliar` de novo com a resposta, grava e encerra alertas e envia os avisos.
2. **Resumo diário (cron às 07:00 de Brasília, dias úteis):** `0 10 * * 1-5` em UTC. Conferência de CNH, ASO, documento do veículo e multa para quem está escalado hoje. Manda um único resumo, só se houver itens.
3. **Execução manual e saúde:** `POST /executar` (exige o cabeçalho com `SEGREDO_EXECUCAO_MANUAL`) roda o Verificar uma vez, para testes. `GET /saude` devolve só estado (última execução e status), sem dados de serviços.

### Fluxo do Verificar

1. Se `ALERTAS_LIGADO` não for "sim", encerra.
2. Lê serviços ativos (Confirmado 202410001, Programado 202410005, Em Execução 202410006) com saída entre 60 min atrás e 180 min à frente, e os alertas abertos. Sem nenhum dos dois, encerra (caminho barato).
3. Geocodifica no Google os embarques sem coordenada válida e grava no serviço.
4. Uma chamada ao Infleet com a posição de todos os veículos.
5. Uma chamada ao OSRM `table` com as origens e destinos de todos os serviços rastreados (a diagonal da matriz dá a rota de cada veículo ao seu embarque). Para quem está parado agora, consulta as posições dos últimos 20 min no Infleet e calcula há quantos minutos está parado.
6. Chama `avaliar`. Para os serviços listados em `precisaGoogle`, chama o Google Routes (`TRAFFIC_AWARE`, campos duração e distância) e chama `avaliar` de novo só com eles e com `regras: ['NaoChegaraATempo']`.
7. Grava os alertas novos e atualizados, marca como Resolvido os que `avaliar` mandou encerrar e envia os avisos. Gravações em lote, com o `$batch` da Web API do Dataverse.
8. Falha em qualquer etapa grava `FalhaDoAgente` e manda e-mail ao TI, no máximo um por hora.

### Orçamento de chamadas externas

O plano grátis permite 50 chamadas externas por execução e 10 ms de CPU. O orçamento do Verificar é de 40 chamadas. O pior caso planejado soma uma de token do Entra, duas de leitura do Dataverse, até cinco de geocoding, uma ou duas do Infleet, uma do OSRM, até cinco de posições, até cinco de rota do Google, uma de lote de gravação, uma de token do Graph e até cinco e-mails. Se o contador passar de 40, o Worker adia geocoding e a conferência de "parado" para a execução seguinte e registra isso. O CPU é medido na prova; se estourar, a saída é o plano pago (US$ 5 por mês) ou a Azure.

### Dedupe

A chave é `regra|idDoServico`. Sem alerta aberto com a chave, cria e envia. Com alerta aberto e severidade maior, reenvia. Com alerta aberto, severidade igual, um único envio feito e 30 min ou mais desde o envio, manda um lembrete. Fora isso, não envia. Quando a condição some, ou o serviço sai da janela, o alerta é encerrado sem aviso. Se `avaliar` pediu o Google para um serviço e ainda não há resposta, os alertas de NaoChegaraATempo daquele serviço ficam como estão.

### Canais

- **E-mail (padrão):** direto pelo Worker, `POST /users/{EMAIL_REMETENTE}/sendMail` do Microsoft Graph, com token de aplicativo. Exige a permissão de aplicativo `Mail.Send` com consentimento de administrador e, recomendado, uma política de acesso que restrinja o app à caixa remetente.
- **Teams (opcional, desligado por padrão):** webhook do Workflows (`TEAMS_WEBHOOK_URL`). Cada mensagem roda um flow do Power Automate com cerca de 3 ações. Com 30 alertas por dia, são cerca de 2.700 ações por mês, o que pesa no teto de 10.000. Só vale para alertas de severidade alta, a decisão do Renan.
- **Push do Power Apps:** fora da primeira versão. O conector roda dentro do Power Automate e gastaria cerca de 6 ações por alerta.

### Mensagens

E-mail e Teams, em pt-BR, sem telefone e sem nome de passageiro. Exemplo:

> **[Operação] Risco de atraso: OS 1234 às 14:00.** Motorista João, placa ABC1D23, cliente Embraer. Chegada prevista com trânsito às 14:07, 7 min depois da saída. Abrir o serviço: link do registro no app model-driven.

## Custo (estimativa)

Premissas: mais de 1.000 serviços por mês, US$ 1 = R$ 5,50, preços da página oficial do Google atualizada em 14/10/2026, plano Pro de rotas (US$ 10 por mil, 5.000 grátis por mês).

| Item | Consultas por mês | Custo por mês |
|---|---|---|
| Rotas com trânsito, com pré-filtro | ~5.500 a 8.300 | R$ 30 a R$ 180 |
| Rotas com trânsito, sem pré-filtro | ~24.000 a 36.000 | ~R$ 1.050 a R$ 1.600 |
| Geocoding (1 por serviço novo) | ~1.000 | R$ 0, dentro dos 10.000 grátis |
| Cloudflare Worker, plano grátis | 8.640 execuções | R$ 0 |
| E-mail pelo Graph | | R$ 0 |

A página do Google não diz qual plano cobre trânsito. Se for o Enterprise (US$ 15 por mil, 1.000 grátis), o custo com pré-filtro sobe cerca de 85%. O número real sai do relatório de uso do Google Cloud nas primeiras semanas.

## Riscos e mitigação

- **CPU de 10 ms por execução no plano grátis:** conta só processamento, não a espera de rede. O trabalho de 30 serviços deve caber, mas não está medido. Mitigação: medir na prova do DEV com o painel do Worker; se estourar, plano pago de US$ 5 por mês ou Azure Functions.
- **Limite de 50 chamadas externas:** mitigado pelo orçamento de 40 e pelas chamadas em lote (OSRM `table`, `$batch` do Dataverse).
- **Teto de 10.000 ações do Power Automate:** o caminho recorrente não usa. Os dois flows agendados dos Assistentes gastam cerca de 3.000 por mês, por estimativa. Confirmar a origem do teto e a licença.
- **Acesso ao Dataverse:** exige um app do Entra ID e um usuário de aplicativo, passos de administrador. Papel de segurança mínimo: leitura nas tabelas consultadas, escrita nas colunas de embarque de `cr40f_reservadeveculos` e criação e escrita em `cr40f_alertaoperacao`. A escrita no serviço vale para a tabela inteira, porque o Dataverse concede por tabela. O Worker só atualiza as colunas de embarque.
- **OSRM público:** servidor de demonstração, sem garantia e com política de uso justo. Se falhar, o Worker consulta o Google para aquele serviço. Se o volume incomodar, hospedamos o nosso.
- **Qualidade do endereço:** a taxa de acerto do geocoding de texto livre é desconhecida. A medição com 30 endereços reais do PROD (só leitura) roda antes de ligar o Worker.
- **Chave do Google:** o Worker não tem IP fixo, então a chave não pode ser restrita por IP. Mitigação: restrição por API (Routes e Geocoding), cota diária por API e alerta de orçamento no Google Cloud.
- **Dados em mais um lugar:** posições, horários e locais de embarque passam pela Cloudflare, além de Infleet e Google. Só texto de local e coordenadas vão ao Google. Nome de passageiro é removido do texto.
- **Mail.Send de aplicativo:** dá, em tese, acesso a qualquer caixa. Mitigação: política de acesso do Exchange restrita à caixa remetente.

## Pré-requisitos do Renan

1. Conta na Cloudflare e o `wrangler` instalado e logado. Plano grátis.
2. Projeto no Google Cloud com cobrança, uma chave com Routes API e Geocoding API ativas, cota diária por API e alerta de orçamento.
3. Um app do Entra ID para o Worker (novo e dedicado, recomendado; ou o app do Graph de e-mail que já existe, se preferir reaproveitar), com permissão de aplicativo `Mail.Send` consentida e a política de acesso de caixa. Criar a credencial é sua tarefa, não minha.
4. Definir os secrets com `wrangler secret put` (os valores nunca passam por mim): token do Infleet, chave do Google, os três do Entra, o segredo da execução manual e, se quiser Teams, o webhook.
5. Preencher em `wrangler.toml` os e-mails de operação, remetente e TI.

Eu cuido de: tabela e colunas no DEV, usuário de aplicativo e papel de segurança no DEV (a conta de serviço usada nos scripts já é administradora do DEV), código do Worker, testes, publicação com `wrangler deploy` e as provas.

## Testes e verificação

1. **Unitário** (`packages/alertas-operacao`, vitest): cada regra e cada limite, dedupe, encerramento e casos de borda, com tabela de vetores.
2. **Unitário do Worker** (`apps/alertas-worker`, vitest): clientes com `fetch` simulado (Dataverse, Infleet, OSRM, Google, Graph), o texto limpo do endereço, a classificação do geocoding, o orçamento de chamadas e uma execução completa do Verificar com todos os clientes simulados.
3. **DEV, ponta a ponta:** serviço de teste no DEV com veículo real do Infleet e embarque propositalmente distante: espera-se NaoChegaraATempo, depois o encerramento. Dedupe provado (nenhum aviso repetido em 30 min, um lembrete aos 30). Medição de CPU e de chamadas externas no painel do Worker.
4. **Medição do geocoding** com 30 endereços do PROD, só leitura, rodada pelo Renan com a própria chave.
5. **Pronto:** as sete regras provadas no DEV, dedupe provado, CPU abaixo de 10 ms na prova e custo do Google medido por 7 dias.

## Fora do escopo

Aviso ao motorista ou ao cliente, ação automática sobre o serviço, alerta de veículo sem rastreamento, vários embarques por serviço, push do Power Apps e PROD.

## Planos seguintes

- **Fase 0:** campo de endereço do Google (Places), gravando latitude, longitude e identificador do lugar no serviço. **Restrição do Renan (15/10/2026):** a mudança vale só para uma cópia do formulário dentro do Sistema Betinhos. O WebResource ativo no model-driven (`new_formulario_geral.html`, que o shell abre hoje no overlay da tela Geral) não pode ser alterado. A Fase 0 cria um WebResource novo, copiado do código de `Tela Formulário Geral` (um arquivo de mais de 15 mil linhas, com plano próprio), e só aponta o shell para ele (`FORM_WEBRESOURCE` em `apps/shell/src/pages/geral/data/source.ts`) depois da validação do Renan. Enquanto não existir, o geocoding do Worker cobre.
- **Fase 3:** alertas ativos na página do Assistente de Logística, com "Resolver manualmente". Depende da mescla da branch dos Assistentes.


---

## Escopo remanescente: resumo diário de pendências

Decisão do Renan em 15/10/2026: manter só o resumo diário de documentos e multas, como um flow de Power Automate na solução AppBetinhos. Sem Worker, sem tabela nova e sem app do Entra ID. O módulo de vigilância do `whatsapp-inbox` cobre o resto; pelo resumo do PR 93 ele não cobre documentos nem multas (confirmar com o outro chat).

| Item | Decisão |
|---|---|
| Quando | 07:00 de Brasília, dias úteis. |
| O quê | Um único e-mail à operação, só se houver itens: CNH vencida e ASO vencido de motorista escalado hoje; documento Vigente vencido de veículo escalado hoje; multa sem condutor com prazo de indicação em até 3 dias (multa não depende de escala). |
| Regras | As três últimas linhas da tabela "Regras" acima (CNH ou ASO vencido, documento do veículo vencido, multa sem condutor). |
| Hospedagem | Flow `Flow Alertas | Resumo diário` no Power Automate, na AppBetinhos, criado desligado e ativado pelo Renan. Ligar e desligar é ativar ou desativar o flow. |
| Configuração | Variável de ambiente `cr40f_ResumoEmailOperacao` (e-mails separados por ponto e vírgula, valor preenchido pelo Renan) e a referência de conexão do Office 365 Outlook na solução. |
| Histórico | O próprio e-mail. Falha de execução aparece no histórico do flow e no aviso padrão do Power Automate ao dono. |
| Conteúdo do e-mail | Apelido do motorista, placa do veículo, nome do documento e código da multa. Sem CPF, RG, telefone, e-mail de passageiro ou nome de passageiro. |
| Limites | Até 150 serviços do dia e até 150 itens por consulta. |
| Custo em ações | Cerca de 18 a 26 por execução e 22 execuções por mês, ou seja, de 400 a 600 ações por mês, contra o teto de 10.000 do Renan. É estimativa: a prova mede as ações reais. |
| Ambiente | Só DEV até pedido explícito. |

Como as consultas filtram: motoristas ativos (`cr40f_status` 0, `cr40f_funcao` 202410000) com `cr40f_validadedacnh` anterior a hoje ou `cr40f_datadoaso` anterior a hoje menos 12 meses; documentos com `cr40f_situacao` 100000000 (Vigente), veículo preenchido e `cr40f_validade` anterior a hoje; multas com `cr40f_status` 202410000 (Notificar o Condutor), motorista vazio e `cr40f_dataparaindicar` até hoje mais 3 dias. "Escalado hoje" é um serviço Confirmado (202410001), Programado (202410005) ou Em Execução (202410006) com saída entre 00:00 e 24:00 de Brasília.

## Estado em 15/10/2026

- Flow `Flow Alertas | Resumo diário` (id `2a319205-9fc8-f111-a05c-7ced8da8c473`) **ativo no DEV**, na AppBetinhos; `checkFlowErrors` sem erros e as 13 conferências por leitura de volta passaram.
- **Sem itens:** a execução termina em `Encerrar_sem_itens`, sem e-mail, com 17 ações executadas.
- **Com itens:** com dados de teste, o e-mail saiu com as quatro linhas (CNH vencida, ASO vencido, documento vencido do veículo com a placa e multa sem condutor), sem dado pessoal, e o motorista com CNH vencida sem serviço hoje ficou de fora. 24 ações executadas.
- **Consumo estimado:** de 17 a 24 ações por execução, 22 dias úteis, ou seja, de 370 a 530 ações por mês contra o teto de 10.000.
- **Achado da prova:** no DEV, uma automação limpa o veículo do serviço de origem "Automático" quando o motorista não tem veículo atual. O resumo só enxerga documento de veículo que está de fato no serviço; isso é o esperado.
- Dados de teste apagados.
- **Pendências do Renan:** repor em `cr40f_ResumoEmailOperacao` os e-mails reais (vários, separados por ponto e vírgula); decidir se troca a variável pela marcação "Notificações operacionais" do cadastro de funcionários; levar ao PROD só com pedido explícito.

### Destinatários pelo cadastro de funcionários (15/10/2026)

- Decisão do Renan: o flow não usa mais a variável de ambiente. Recebe o resumo quem é funcionário ativo com "Notificações operacionais" marcado e "E-mail Betinhos" preenchido, editáveis na tela Funcionários do Sistema Betinhos.
- A consulta de destinatários só roda quando há itens. Sem ninguém marcado, a execução falha com o motivo (`SemDestinatarios`), visível no histórico do flow.
- Prova no DEV: 4 itens, 1 destinatário (o Renan, único marcado no DEV), 27 ações executadas. Dados de teste apagados.
- Consumo estimado: de 17 (sem itens) a 27 ações por execução, ou seja, de 370 a 600 ações por mês.
- A variável `cr40f_ResumoEmailOperacao` (valor e definição) foi excluída do DEV em 15/10/2026, a pedido do Renan, depois de confirmar que nenhum flow a usava.
