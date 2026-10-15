# Alertas proativos de operação

Data: 15/10/2026. Desenho aprovado por Renan no brainstorm desta data. Escopo: Fases 1 e 2 (alertas). A Fase 0 (campo de endereço do Google no formulário) e a Fase 3 (alertas na tela do Assistente) têm planos próprios, listados no fim.

## Objetivo

Um agente proativo que, sem ninguém abrir tela, identifica problemas de operação e avisa a equipe na hora. O foco principal é o motorista que está atrasado ou que não vai chegar ao embarque a tempo, considerando trânsito. Ele só avisa pessoas. Não grava em registros de negócio e não fala com cliente nem motorista.

## Decisões

| Tema | Decisão |
|---|---|
| Regras | Não chegará a tempo, já atrasado, motorista parado a caminho, sem motorista em até 2 h, CNH ou ASO vencido, documento do veículo vencido, multa sem condutor. |
| Canais | E-mail da operação, Teams (canal) e notificação do Power Apps. Cada canal liga e desliga por variável de ambiente. |
| Detecção | Regras fixas, sem IA. É mais rápida, barata e previsível. O Claude continua nos Assistentes. |
| Hospedagem | Power Automate na solução AppBetinhos, mesmo padrão dos flows de agentes. |
| Trânsito | Google Routes API com `TRAFFIC_AWARE`, atrás de um pré-filtro grátis. |
| Pré-filtro | Rota sem trânsito do OSRM (o mesmo que o Infleet MCP usa) vezes um fator pessimista de 2,0. Só consulta o Google se o motorista não está claramente folgado. |
| Posição | Infleet GraphQL (`api.infleet.com.br/v1/graphql`), token em variável de ambiente. |
| Ambiente | Só DEV até pedido explícito. Nenhuma escrita em PROD. |
| Segredos | Variáveis de ambiente do Dataverse. O repositório é público: só nomes e scripts. |

## Alternativas descartadas

- **Azure Function com código TS:** mais fácil de testar e sem limite de ações por dia, mas exige serviço novo, identidade e CI/CD. Fica como caminho de saída se o flow esbarrar no limite de ações do Power Automate (ver Riscos).
- **Cadência adaptativa de 15 minutos:** o pré-filtro já corta o custo do Google, e a posição de toda a frota vem em uma única chamada ao Infleet. Todo ciclo avalia todos os serviços da janela, o que também simplifica o encerramento dos alertas.
- **Agente com Claude decidindo e enviando:** muda o contrato "só sugere" e custa mais sem melhorar a detecção.

## Regras

Constantes (arquivo único no pacote, gerado para o flow): margem 10 min; fator de trânsito 2,0; janela de monitoramento de 60 min antes a 180 min depois da saída; posição considerada velha acima de 10 min; parado = velocidade até 3 km/h por 10 min; chegou ao embarque = a até 150 m; sem motorista = a até 120 min da saída; atrasado = até 60 min após a saída; lembrete após 30 min; Google sempre nos últimos 30 min.

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

O endereço do serviço é texto livre, por exemplo "Aerop. Guarulhos no voo DL105" ou "Tenaris Tubos - Portaria 01". Por isso o flow geocodifica e guarda o resultado no próprio serviço.

| Coluna | Tipo | Observação |
|---|---|---|
| `cr40f_embarquelatitude`, `cr40f_embarquelongitude` | decimal, 7 casas | |
| `cr40f_embarqueprecisao` | choice | Informado (Fase 0), Geocodificado, Aproximado, Indisponível |
| `cr40f_embarquetexto` | texto 500 | Texto que foi geocodificado. Se o endereço mudar, geocodifica de novo. |
| `cr40f_embarquegeocodificadoem` | data/hora | Serviço Indisponível só é tentado de novo após 24 h. |

Texto enviado ao Google: `new_enderecodesaidapersonalizado`, senão `cr40f_endereodesada`. Se o texto começa com "N. " (item numerado de passageiro), usa só o que vem depois do primeiro " - " e só a primeira linha. Assim o nome do passageiro não vai ao Google.

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

### Variáveis de ambiente (só definição; o valor é preenchido pelo Renan no DEV)

`new_InfleetToken`, `cr40f_GoogleMapsChave` (restrita às APIs Routes e Geocoding), `cr40f_AlertasLigado` (sim ou não, chave geral), `cr40f_AlertasCanais` (por exemplo `email,teams,push`), `cr40f_AlertasEmailOperacao`, `cr40f_AlertasEmailTI`, `cr40f_AlertasTeamsEquipeId`, `cr40f_AlertasTeamsCanalId`, `cr40f_AlertasPushDestinatarios`, `cr40f_FlowUrlAlertasAvaliar` (URL do flow avaliador, com assinatura).

## Arquitetura

Três flows na AppBetinhos. A decisão fica toda no avaliador, que é puro e testável.

1. **Alertas | Avaliar** (gatilho HTTP): recebe um JSON com o horário, os serviços já enriquecidos e os alertas abertos. Devolve quais serviços precisam do Google, as ações (criar, reenviar, lembrar) e quais alertas encerrar. Não faz nenhuma chamada externa.
2. **Alertas | Verificar** (recorrência a cada 5 min, das 04:00 às 23:59 de Brasília): coleta os dados, chama o avaliador, consulta o Google só para quem o avaliador pediu, chama o avaliador de novo com a resposta e executa as ações (grava `cr40f_alertaoperacao` e envia nos canais).
3. **Alertas | Resumo diário** (07:00 em dias úteis): conferência de CNH, ASO, documento do veículo e multa para quem está escalado hoje. Envia um único resumo, só se houver itens.

Por que o avaliador é separado: o Logic Apps não tem trigonometria nem raiz quadrada, então a lógica usa só comparações e aritmética simples, e um conjunto de vetores de teste em TS vale para o código de referência e para o flow. Um script de conformidade envia cada vetor ao flow no DEV e compara a resposta.

### Fluxo do Verificar

1. Se `cr40f_AlertasLigado` não for "sim", encerra.
2. Lista serviços ativos (Confirmado 202410001, Programado 202410005, Em Execução 202410006) com saída entre 60 min atrás e 180 min à frente. Se não houver nenhum, encerra (caminho barato).
3. Uma chamada ao Infleet com a posição de todos os veículos.
4. Geocodifica o embarque dos serviços sem coordenada válida e grava no serviço.
5. Para cada serviço com veículo rastreado: rota OSRM da posição até o embarque (minutos e metros). Para quem está parado agora, consulta as posições dos últimos 15 min e calcula há quantos minutos está parado.
6. Chama o avaliador. Para os serviços listados em `precisaGoogle`, chama o Google Routes (`TRAFFIC_AWARE`, campos duração e distância) e chama o avaliador de novo só com eles.
7. Para cada ação: cria ou atualiza `cr40f_alertaoperacao` e envia nos canais ligados. Para cada alerta a encerrar: marca Resolvido.
8. Qualquer falha grava `FalhaDoAgente` e manda um e-mail ao TI, no máximo um por hora.

### Dedupe

A chave é `regra|idDoServico`. Sem alerta aberto com a chave, cria e envia. Com alerta aberto e severidade maior, reenvia. Com alerta aberto, severidade igual, um único envio feito e 30 min ou mais desde o envio, manda um lembrete. Fora isso, não envia. Quando a condição some, ou o serviço sai da janela, o alerta é encerrado sem aviso. Se o avaliador pediu o Google para um serviço e ainda não há resposta, os alertas de NaoChegaraATempo daquele serviço ficam como estão.

### Mensagens

E-mail e Teams, em pt-BR, sem telefone e sem nome de passageiro. Exemplo:

> **[Operação] Risco de atraso: OS 1234 às 14:00.** Motorista João, placa ABC1D23, cliente Embraer. Chegada prevista com trânsito às 14:07, 7 min depois da saída. Abrir o serviço: link do registro no app model-driven.

A notificação push leva só o título e a hora.

## Custo (estimativa)

Premissas: mais de 1.000 serviços por mês, US$ 1 = R$ 5,50, preços da página oficial do Google atualizada em 14/10/2026, plano Pro de rotas (US$ 10 por mil, 5.000 grátis por mês).

| Item | Consultas por mês | Custo por mês |
|---|---|---|
| Rotas com trânsito, com pré-filtro | ~5.500 a 8.300 | R$ 30 a R$ 180 |
| Rotas com trânsito, sem pré-filtro | ~24.000 a 36.000 | ~R$ 1.050 a R$ 1.600 |
| Geocoding (1 por serviço novo) | ~1.000 | R$ 0, dentro dos 10.000 grátis |

A página do Google não diz qual plano cobre trânsito. Se for o Enterprise (US$ 15 por mil, 1.000 grátis), o custo com pré-filtro sobe cerca de 85%. O número real sai do relatório de uso do Google Cloud nas primeiras semanas.

## Riscos e mitigação

- **Limite de ações do Power Automate:** 288 execuções por dia com dezenas de ações cada podem passar de 40.000 ações por 24 h no plano Premium por usuário, pelo que conheço; confirmar a licença do dono dos flows. Mitigação: encerrar cedo quando não há serviço na janela, usar Select e Filter em vez de loops, medir as ações reais na primeira semana. Se estourar, migrar o Verificar para a Azure Function.
- **OSRM público:** servidor de demonstração, sem garantia e com política de uso justo. Se falhar, o flow consulta o Google para aquele serviço. Se o volume incomodar, hospedamos o nosso.
- **Qualidade do endereço:** a taxa de acerto do geocoding de texto livre é desconhecida. A tarefa de medição com 30 endereços reais do PROD (só leitura) roda antes de ligar o flow.
- **Chave do Google:** o Power Automate não tem IP fixo, então a chave não pode ser restrita por IP. Mitigação: restrição por API (Routes e Geocoding), cota diária por API e alerta de orçamento no Google Cloud.
- **Dado pessoal ao Google:** só o texto do local de embarque e coordenadas. Nome de passageiro é removido do texto.
- **Push:** só chega a quem tem o aplicativo Power Apps no celular com notificações ativas.

## Pré-requisitos do Renan

1. Projeto no Google Cloud com cobrança, uma chave com Routes API e Geocoding API ativas, cota diária por API e alerta de orçamento. O valor vai para `cr40f_GoogleMapsChave` no DEV, pelo maker portal.
2. O token do Infleet em `new_InfleetToken` no DEV, pelo maker portal. Eu nunca leio nem copio esses valores.
3. Conexões Outlook, Teams e Notificações do Power Apps criadas na solução AppBetinhos, com a conta de serviço que já é dona dos outros flows.
4. Valores de e-mail da operação, e-mail do TI, equipe e canal do Teams e destinatários do push.

## Testes e verificação

1. **Unitário** (`packages/alertas-operacao`, vitest): cada regra e cada limite, dedupe, encerramento e os casos de borda, com vetores em JSON.
2. **Conformidade:** script que envia os vetores ao flow avaliador no DEV e compara a resposta com a esperada.
3. **DEV, ponta a ponta:** serviço de teste no DEV com veículo real do Infleet e embarque propositalmente distante: espera-se NaoChegaraATempo e depois o encerramento. Teste dos três canais e do push no celular do Renan.
4. **Medição do geocoding** com 30 endereços do PROD, só leitura, antes de ligar.
5. **Pronto:** as sete regras provadas no DEV, dedupe provado (nenhum aviso repetido em 30 min), custo do Google medido por 7 dias.

## Fora do escopo

Aviso ao motorista ou ao cliente, ação automática sobre o serviço, alerta de veículo sem rastreamento, vários embarques por serviço e PROD.

## Planos seguintes

- **Fase 0:** campo de endereço do Google (Places) no formulário legado `Tela Formulário Geral`, gravando latitude, longitude e identificador do lugar no serviço. É um repositório e um arquivo de mais de 15 mil linhas, com plano próprio. Enquanto não existir, o geocoding do flow cobre.
- **Fase 3:** alertas ativos na página do Assistente de Logística, com "Resolver manualmente". Depende da mescla da branch dos Assistentes.
