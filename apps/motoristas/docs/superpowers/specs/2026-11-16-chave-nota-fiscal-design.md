# Chave da nota fiscal na despesa (fase 3 de 3)

Status em 16/11/2026: desenho aprovado pelo Renan na entrevista de 13 a 16/11/2026. Ainda não implementado. Depende das fases 1 (`2026-11-16-prova-captura-midia-design.md`) e 2 (`2026-11-16-galeria-pdf-repetida-design.md`): selos na prova de mídia, galeria e PDF na despesa, selos visíveis no Sistema.

As três fases:

1. **Fase 1:** prova da câmera do app e limites.
2. **Fase 2:** galeria e PDF por tela, selos e foto repetida.
3. **Fase 3 (esta):** leitura do QR e da chave da nota fiscal, conferência gratuita da chave, nota repetida, e valor e data preenchidos pela leitura rápida.

## Problem Statement

A foto ou o PDF do comprovante prova que existe um papel, não que a nota é verdadeira, daquele mês e usada uma vez só. Hoje um motorista consegue:

- lançar a mesma nota em duas despesas;
- lançar uma nota de outro mês;
- anexar um cupom inventado ou editado.

Também consegue digitar um valor diferente do comprovante. A análise de IA da despesa só pega isso depois, e nem sempre.

A Betinhos não consegue consultar na SEFAZ o conteúdo de uma nota emitida para outra pessoa, como o CPF do motorista ou um consumidor não identificado: só quem é parte da nota consulta. As APIs comerciais que fazem essa consulta custariam de R$ 300 a R$ 700 por mês, e o Renan decidiu não contratar (16/11/2026). A conferência possível é a da própria chave de acesso, que traz estado, mês, CNPJ do emitente, modelo, número e dígito verificador.

## Solution

Na despesa, depois da foto ou do PDF do comprovante, o app pede a **chave da nota**. O motorista tem quatro caminhos:

1. **Ler o QR ou o código de barras** do cupom ou do DANFE pela câmera. Esse é o caminho principal.
2. **Digitar os 44 dígitos.** O app recusa na hora se o dígito verificador não conferir.
3. **"Não consigo ler":** cupom apagado ou rasgado. A despesa segue com o selo **"nota não verificada"**.
4. **"Comprovante sem nota fiscal":** estacionamento, pedágio, recibo à mão, comprovante Pix. A despesa segue com o selo **"sem nota fiscal"** e vai para a análise de IA que já existe.

Quando o comprovante é PDF, o app procura a chave no texto do PDF antes de pedir.

**Bloqueios.** O app avisa na hora, e o servidor bloqueia de novo ao gravar, quando:

- o dígito verificador da chave é inválido;
- o modelo não é de nota fiscal: 55 (NF-e), 65 (NFC-e) e 59 (CF-e SAT) são aceitos;
- o estado não existe;
- o CNPJ do emitente é inválido;
- o mês de emissão da chave é diferente do mês da despesa;
- a chave já foi usada em outra despesa que não foi cancelada nem recusada.

**Valor e data.** A leitura rápida por IA, que já existe na despesa, preenche o valor e a data a partir da foto. O motorista pode corrigir. Se corrigir, o anexo ganha o selo **"valor alterado"**.

## User Stories

1. Como motorista, quero ler o QR do cupom com a câmera logo depois de fotografá-lo, para não digitar nada.
2. Como motorista, quero ler o código de barras do DANFE, porque a nota fiscal eletrônica nem sempre tem QR.
3. Como motorista, quero que a chave seja encontrada sozinha quando anexo a nota em PDF, para não ter que ler nem digitar.
4. Como motorista, quero digitar os 44 dígitos quando a câmera não lê, com aviso na hora se errei um número, para não ser recusado depois.
5. Como motorista, quero que o app aceite a chave com espaços, como vem impressa no DANFE, para digitar como leio.
6. Como motorista com o cupom apagado, quero tocar em "Não consigo ler" e seguir, para não ficar travado.
7. Como motorista no estacionamento ou no pedágio, quero marcar "Comprovante sem nota fiscal" e seguir, porque esses lugares muitas vezes não dão nota.
8. Como motorista, quero que o valor e a data venham preenchidos pela leitura rápida, para lançar mais rápido.
9. Como motorista, quero poder corrigir o valor quando a leitura errar, sabendo que a correção fica marcada.
10. Como motorista, quero saber na hora, com o motivo, que a nota é de outro mês, para conferir se peguei o cupom certo.
11. Como motorista, quero saber na hora que a nota já foi usada noutra despesa, com a data desse lançamento, para não lançar duas vezes sem querer.
12. Como motorista, quero relançar uma nota cuja despesa anterior foi recusada ou cancelada, porque o lançamento anterior não valeu.
13. Como motorista que abasteceu em São Paulo ou Minas, quero que a nota de lá seja aceita como a do Rio, porque a chave segue o mesmo padrão.
14. Como motorista que abasteceu em São Paulo, quero que o cupom do SAT (modelo 59) seja aceito, porque alguns postos de lá ainda o usam.
15. Como motorista, quero que a nota de emitente com CNPJ alfanumérico seja aceita, porque esse CNPJ passou a ser emitido em 2026.
16. Como operação, quero ver o CNPJ do emitente, o estado, o modelo e o número da nota em cada comprovante, para conferir com o estabelecimento.
17. Como operação, quero ver o selo "nota não verificada" quando o motorista não leu a chave, para olhar com mais atenção.
18. Como operação, quero ver o selo "sem nota fiscal" quando o comprovante não tinha nota, para saber que não houve conferência.
19. Como operação, quero ver o selo "valor alterado" e o valor que a leitura rápida tinha lido, quando o motorista corrigiu, para comparar.
20. Como operação, quero que nota repetida e nota de outro mês nem cheguem ao Sistema, para não perder tempo com elas.
21. Como gestor, quero que os bloqueios sejam feitos também no servidor, para o motorista não conseguir pular só mexendo no app.
22. Como gestor, quero que a análise de IA da despesa receba a chave e os selos, para usá-los no parecer.
23. Como desenvolvedor, quero um módulo único de chave de nota fiscal no app, puro e testável, para validação, leitura do QR e extração do PDF ficarem num lugar só.

## Implementation Decisions

### Onde vale

- **Só na tela de despesas,** para todo comprovante anexado:
  - pela câmera do app (foto);
  - pela galeria (foto);
  - pelo PDF.

  A obrigatoriedade é por despesa: pelo menos um comprovante da despesa passa por um dos quatro caminhos.
- **Fora desta fase:**
  - **Devolução de despesa:** o comprovante dela é de transferência, não é nota.
  - **Finalizar manutenção:** a nota da oficina costuma ser NFS-e, de outro padrão. Ver Out of Scope.

### App, módulo de chave de nota fiscal (novo, puro)

- **Normalização:** aceita a chave com espaços ou pontos, e minúsculas nas posições do CNPJ. Recusa o que não tem 44 posições depois da limpeza.
- **Validação:**
  - dígito verificador em módulo 11, com pesos de 2 a 9 da direita para a esquerda. Cada posição vale o código ASCII menos 48, o que cobre o CNPJ alfanumérico; para os dígitos, dá o resultado de sempre;
  - código de UF entre os 27 do IBGE;
  - AAMM com mês de 01 a 12;
  - modelo 55, 65 ou 59;
  - CNPJ do emitente com DV válido, no cálculo alfanumérico.
- **Decomposição:** UF, ano e mês de emissão, CNPJ do emitente, modelo, série e número.
- **Leitura do QR da NFC-e:**
  - extrai a chave do parâmetro `p` da URL. Nas versões 2 e 3, a chave é o primeiro campo antes de `|`;
  - aceita também QR que só contém a chave.
- **Extração do PDF:**
  - descomprime os fluxos de texto do PDF com o `DecompressionStream` do navegador, sem dependência nova;
  - procura sequências de 44 posições, com ou sem espaços;
  - fica com a primeira que passa na validação.
- **Leitor de código:**
  - usa o `BarcodeDetector` do navegador quando existe (QR e Code 128);
  - quando não existe (Safari no iPhone), usa um leitor JavaScript pequeno de QR e de Code 128, como dependência nova;
  - a escolha da biblioteca exata fica para a implementação: a de menor tamanho que leia os dois formatos;
  - a leitura roda na mesma tela de câmera, num modo "ler código" sem carimbo.
- **Checagem do mês:**
  - o AAMM da chave tem de ser igual ao mês da data da despesa;
  - tolerância: quando a data da despesa está no primeiro ou no último dia do mês, aceita também o mês vizinho (cupom emitido depois da meia-noite);
  - a data da despesa vale como está no formulário no momento do envio.

### Leitura rápida (pacote de IA das despesas e flow da leitura rápida)

- **A resposta ganha o campo `chave_acesso`,** anulável: os 44 dígitos quando estão impressos e legíveis na foto. O app só aceita esse valor se ele passar na validação do módulo; um erro de leitura da IA quase nunca acerta o dígito verificador.
- **A leitura rápida da foto do comprovante:**
  - preenche valor e data, como hoje;
  - também tenta a chave, antes de pedir o QR. Se ela encontrar uma chave válida, o app mostra a chave para o motorista confirmar e pula a leitura do QR.
- **Valor alterado:** o app guarda o valor e a data que a leitura preencheu. Se o motorista mudar algum dos dois antes de enviar, a prova do comprovante grava o selo e os valores lidos.

### Servidor

- **Colunas novas no comprovante da despesa** (tabela de anexo da despesa):
  - chave de acesso;
  - UF;
  - AAMM;
  - CNPJ do emitente;
  - modelo;
  - número;
  - origem da chave (choice: QR, código de barras, PDF, leitura rápida, digitada);
  - situação da nota (choice: verificada pela chave, não verificada, sem nota fiscal).

  Entram por migration.
- **Plugin novo, síncrono, em pré-operação, no create e no update da chave no anexo da despesa.** Ele refaz a validação da chave e as duas checagens:
  - mês igual ao da despesa, com a mesma tolerância do app;
  - chave ausente em qualquer outro anexo de despesa não cancelada nem recusada.

  Falhou, o plugin recusa a gravação com mensagem em português. Ele é o bloqueio que vale; o do app é só aviso antecipado.

  Fica no plugin que já trata as despesas do app, se houver um adequado, ou no `Betinhos.DriverRecordSharing`.
- **Situação "verificada pela chave":** quer dizer que a chave é válida, do mês certo e única. **Não** quer dizer que a SEFAZ confirmou a nota. O texto no Sistema diz "Chave conferida", nunca "Nota confirmada".
- **Selos novos na prova de mídia:** nota não verificada, sem nota fiscal, valor alterado. A prova ganha também valor lido e data lida.
- **Análise de IA da despesa:** recebe a chave decomposta, a situação da nota e os selos, para considerar no parecer. Por exemplo: CNPJ do emitente que não é de posto, numa despesa de combustível.

### Sistema

- **Página de despesas:** cada comprovante mostra a situação da nota ("Chave conferida", "Nota não verificada", "Sem nota fiscal"), o CNPJ do emitente formatado, a UF, o modelo e o número.
- **Selo "valor alterado":** mostra o valor e a data que a leitura rápida tinha lido.

## Testing Decisions

- **Bom teste:** fala do comportamento visível. Por exemplo: "chave com um dígito trocado é recusada" e "a mesma chave numa segunda despesa é recusada pelo servidor". Não fala da forma do cálculo.
- **Ponto de teste 1, módulo de chave de nota fiscal do app.** Testes puros, sem mock. Casos:
  - chaves reais anonimizadas e chaves geradas para cada modelo (55, 65, 59);
  - CNPJ alfanumérico;
  - chave com espaços;
  - DV errado;
  - UF e mês inválidos;
  - URLs de QR das versões 2 e 3;
  - PDF pequeno de fixture com a chave em texto comprimido;
  - PDF sem chave;
  - tolerância do mês na virada.

  Prior art: os testes de regras de despesa do app.
- **Ponto de teste 2, plugin do anexo da despesa,** com o serviço falso. Casos:
  - chave válida grava;
  - DV inválido recusa;
  - mês diferente recusa;
  - repetida noutra despesa recusa;
  - repetida noutra despesa cancelada ou recusada grava;
  - update sem mudar a chave não revalida a repetida contra o próprio anexo.

  Prior art: os testes dos plugins do `Betinhos.DriverRecordSharing`.
- **Leitura rápida:** testes do pacote de IA das despesas para o campo novo. Casos: resposta com chave, resposta sem chave, chave que a validação recusa. Prior art: os testes que já existem da leitura rápida.
- **Fluxo na tela de despesas,** com o mock. Casos: os quatro caminhos, o selo "valor alterado" e o aviso de repetida.
- **Não verificável na nuvem:** leitura real de QR e código de barras em cupom térmico, com iPhone e Android. Na entrega, a verificação é no DEV, com pelo menos um cupom NFC-e do RJ, um DANFE e um PDF de NF-e. O resultado vai no PR.

## Out of Scope

- **Consulta à SEFAZ ou a API paga** (Infosimples, NFE.io e outras), por decisão de 16/11/2026.
  - Sem ela, uma nota cancelada ou com valor diferente do impresso passa pela checagem da chave.
  - A arquitetura deixa um ponto para ligar depois: a situação da nota ganharia "confirmada na SEFAZ", e o plugin consultaria a API.
- **NFS-e,** incluindo a nota de serviço da oficina e o pedágio pela NFS-e Via: tem padrão de chave próprio. Hoje entra como "sem nota fiscal" ou "não consigo ler". Ver a primeira nota.
- **Nota na finalização de manutenção e na devolução de despesa.**
- **Confirmar o Pix ou o boleto pelo banco.**
- **Conferir se o CNPJ do emitente é do ramo esperado:** posto, estacionamento. Fica com a análise de IA, como sinal.

## Further Notes

- **NFS-e é o próximo passo natural.** A nota de serviço nacional tem chave própria e consulta pública, e cobre a oficina e o pedágio. Vale uma spec separada, se o volume de "sem nota fiscal" em manutenção e pedágio justificar.
- **Volume dos selos:** se o "não consigo ler" virar rotina, a leitura obrigatória não estará funcionando. O indicador é a proporção de "nota não verificada" sobre despesas com cupom. Vale olhar no DEV e no primeiro mês do PROD.
- **CNPJ alfanumérico:** começou a ser emitido em julho de 2026. O cálculo com ASCII menos 48 vale para o DV da chave e para o DV do CNPJ, e para CNPJ só numérico dá o mesmo resultado de sempre. Os testes precisam cobrir os dois.
- **Ordem de entrega:**
  1. schema e plugin;
  2. app e leitura rápida;
  3. Sistema.

  Os passos 1 e 2 podem ir no mesmo PR, porque o app sem o plugin só perde o bloqueio no servidor.
