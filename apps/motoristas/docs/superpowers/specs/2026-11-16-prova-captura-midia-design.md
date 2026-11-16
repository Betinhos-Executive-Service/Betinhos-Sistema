# Prova de captura e limites de mídia (fase 1 de 3)

Status em 16/11/2026: desenho aprovado pelo Renan na entrevista de 13 a 16/11/2026. Ainda não implementado.

As três fases do anexo seguro:

1. **Fase 1 (esta):** prova da câmera do app e limites de tamanho.
2. **Fase 2:** galeria e PDF por tela, selos, bloqueio de foto repetida.
3. **Fase 3:** leitura do QR e da chave de nota fiscal, conferência gratuita da chave e nota repetida.

Cada fase é um PR separado, testado no DEV antes da seguinte.

## Problem Statement

A operação da Betinhos não tem como saber se a foto ou o vídeo que o motorista anexou foi feito naquele momento.

- **Frescor fraco:** a única proteção hoje é comparar a data de alteração do arquivo com o toque no botão, com 15 segundos de folga. Só vale para a câmera nativa do celular. No iPhone essa data costuma vir com a hora atual, então a checagem não prova nada.
- **Nada ligado à mídia:** nenhuma foto carrega data, local, código ou impressão digital. Uma foto de outro dia, de outro carro ou alterada depois de enviada fica igual a uma legítima.
- **Envio sem limite:** vídeo grava sem limite de duração e sobe inteiro em base64 num único POST para o flow. A foto da câmera nativa sobe sem compressão.
- **Vídeo na despesa:** a despesa aceita vídeo como comprovante, mas a análise de IA da despesa recusa vídeo e arquivo acima de 5 MB. O motorista consegue enviar e a IA reprova depois.

## Solution

Toda foto e todo vídeo tirados pela câmera do app passam a levar uma **prova de captura**:

- **Código do servidor:** pedido no momento em que a câmera abre. Prova que a mídia não existia antes daquele instante.
- **Carimbo impresso na foto:** data, hora, placa, identificação do registro e o código curto. A foto fica inútil em outro contexto e qualquer reaproveitamento salta aos olhos. No vídeo o carimbo não é impresso; a prova fica só nos dados.
- **Localização da captura:** só registrada, para consulta. Não gera selo nem bloqueia.
- **Impressão digital do arquivo:** SHA-256 dos bytes enviados. Permite provar depois que o arquivo guardado no SharePoint é o mesmo que saiu do celular.
- **Horários do servidor:** quando o código foi emitido e quando a prova foi registrada, independentes do relógio do celular.

Sem rede, o motorista tira a foto mesmo assim, com a hora do celular. O anexo ganha o selo **"capturada sem rede"** e a prova registra quanto tempo a mídia levou para chegar.

Também entram limites:

- vídeo até 2 minutos e 70 MB;
- foto reduzida para no máximo 2048 px no maior lado, em JPEG;
- despesa só com foto, sem vídeo.

O motorista vê o motivo na hora, em linguagem simples.

## User Stories

1. Como motorista, quero que a câmera abra como hoje, para não ter um passo a mais ao registrar.
2. Como motorista, quero ver o carimbo com data, hora e placa na prévia da foto, para saber o que a operação vai ver.
3. Como motorista sem sinal na garagem ou no subsolo, quero tirar a foto mesmo assim, para não ficar travado.
4. Como motorista sem sinal, quero que a foto seja enviada quando a rede voltar, como já acontece com os rascunhos, para não ter que repetir.
5. Como motorista, quero que o app peça a permissão de localização uma vez, com uma explicação curta, para entender por que ela é pedida.
6. Como motorista que negou a localização, quero continuar tirando fotos normalmente, porque a localização só é registrada.
7. Como motorista, quero saber na hora que o vídeo passou de 2 minutos, para não perder a gravação.
8. Como motorista gravando ao vivo, quero que a gravação pare sozinha em 2 minutos e fique salva, para não perder o que gravei.
9. Como motorista no iPhone, quero que um vídeo da câmera nativa acima de 2 minutos ou de 70 MB seja recusado com o motivo, para regravar mais curto.
10. Como motorista, quero que a despesa não ofereça vídeo, para não enviar algo que a análise vai reprovar.
11. Como motorista, quero que a foto suba mais rápido em rede móvel, porque ela vai reduzida.
12. Como motorista, quero que a nota fiscal continue legível depois da redução, para não ter a despesa recusada por foto ruim.
13. Como operação, quero saber de cada foto e vídeo se veio da câmera ao vivo do app ou da câmera nativa do celular, para avaliar a confiança.
14. Como operação, quero saber a hora do servidor em que a câmera abriu e em que a mídia chegou, para não depender do relógio do celular.
15. Como operação, quero ver o código curto impresso na foto e achar a prova correspondente, para conferir uma foto suspeita.
16. Como operação, quero saber quando uma mídia foi capturada sem rede e quanto tempo levou para chegar, para julgar se o atraso faz sentido.
17. Como operação, quero a localização da captura e a precisão informada pelo celular, para conferir onde a foto foi tirada quando houver dúvida.
18. Como operação, quero saber quando o motorista negou a localização, para diferenciar "sem permissão" de "sem sinal de GPS".
19. Como operação, quero a impressão digital do arquivo, para provar numa disputa que a foto não foi trocada depois de enviada.
20. Como operação, quero que a prova aponte para o registro de origem (despesa, recebimento, manutenção, finalização, colisão ou checklist) e para o link do arquivo, para chegar do anexo à prova e da prova ao anexo.
21. Como operação, quero que um código de outro motorista, adulterado ou já vencido seja marcado na prova, para identificar tentativa de fraude.
22. Como gestor, quero que a hora e o código venham do servidor e sejam assinados, para que mudar o relógio do celular não engane a prova.
23. Como gestor, quero que a chave usada para assinar o código fique na tabela de segredos, como as demais, para não ficar exposta no código nem em variável de ambiente.
24. Como desenvolvedor, quero um único módulo de prova de captura usado por todas as telas, para não repetir a lógica em seis lugares.
25. Como desenvolvedor, quero que falha ao registrar a prova nunca derrube o envio do anexo, para não trocar segurança por anexo perdido. A prova pendente é tentada de novo.
26. Como desenvolvedor, quero que o modo mock do app simule a emissão e o registro da prova, para desenvolver e testar a UI na VM sem Dataverse.

## Implementation Decisions

### Telas cobertas

- **Telas que usam a captura comum:** despesas, recebimento, manutenção (solicitação), finalizar manutenção (nota e FOTO1 a FOTO3), colisão e checklist.
- **Selfie do termo de multa:** fica como está. Ela já é só câmera frontal ao vivo e tem validação própria no plugin do termo.
- **Devolução de despesa:** continua aceitando galeria como hoje. A regra de galeria por tela entra na fase 2.

### Fluxo da prova

1. **Ao abrir a câmera,** o app chama a Custom API nova de prova de mídia com a ação **emitir**. Envia a tela e o identificador do registro.
2. **O servidor devolve:**
   - o identificador da prova;
   - um código curto legível, com 6 caracteres sem ambíguos;
   - a hora do servidor;
   - uma assinatura HMAC de motorista, tela, registro, código e hora.

   O motorista é resolvido pelo usuário chamador, como nas outras Custom APIs do plugin.
3. **Na captura,** o app faz o seguinte:
   - guarda a hora do celular e a localização, se houver permissão;
   - na foto, imprime o carimbo e reduz para 2048 px;
   - calcula o SHA-256 dos bytes finais.
4. **Depois que o flow devolve o link do arquivo,** o app chama a mesma Custom API com a ação **registrar**. Envia o código assinado, o link, o hash, o tamanho, o tipo de mídia, a duração do vídeo, a origem da captura, a hora do celular e a localização.
5. **O servidor valida e grava:**
   - confere a assinatura e se o motorista é o mesmo;
   - grava a linha da prova com a hora de recebimento do servidor;
   - calcula o atraso e marca os selos.

   Código inválido, de outro motorista ou adulterado **não bloqueia o anexo**: grava a prova com o selo "código inválido".
6. **Sem rede na abertura da câmera,** o app gera um código local marcado como "sem rede" e segue. No registrar, o servidor grava a prova com o selo "capturada sem rede", a hora do celular declarada e o atraso até o recebimento.
7. **Falha no registrar** não impede o anexo. A prova pendente fica guardada no aparelho junto do rascunho da mídia e é reenviada na próxima abertura do app, ou quando a rede voltar.

### Módulos

- **App, módulo de prova de captura (novo, compartilhado):**
  - interface: `iniciar(tela, registro)` → sessão; `aplicarNaFoto(sessão, foto, contexto do carimbo)` → foto final e dados da prova; `dadosDoVideo(sessão, vídeo)` → dados da prova; `registrar(sessão, link, dados)`;
  - esconde a chamada à Custom API, o carimbo, a redução, o hash, a localização, o modo sem rede e a fila de provas pendentes;
  - é chamado pela tela de captura comum e pelas funções de envio de cada tela, depois de o link existir.
- **App, tela de captura comum:**
  - pede o código ao abrir;
  - mostra o carimbo na prévia;
  - para a gravação ao vivo em 2 minutos;
  - recusa vídeo da câmera nativa acima de 2 minutos ou de 70 MB, com mensagem;
  - grava ao vivo a 4 Mbps;
  - reduz a foto da câmera nativa, que hoje sobe crua.
- **App, despesas:** a tela deixa de passar o tratamento de vídeo para a captura, então não oferece vídeo.
- **App, porta de dados (data port) e modo mock:** ganham as duas operações da prova. O mock devolve código e hora fixos.
- **Plugin `Betinhos.DriverRecordSharing`, Custom API nova `new_ProvaMidia`:**
  - ações `emitir` e `registrar`, no mesmo padrão de ação por parâmetro da `new_CobrancaQR`;
  - lê a chave HMAC pelo `SecretReader`, do segredo `midia.prova-captura`;
  - sem a chave, emite códigos marcados "não assinado" em vez de falhar, e o trace registra a ausência;
  - registrada como as outras Custom APIs do plugin; vai ao PROD pelas soluções.
- **Schema por migration:**
  - tabela nova de prova de mídia na BetinhosCore, uma linha por anexo;
  - privilégios: motorista sem leitura nem escrita, já que só o plugin grava; operação com leitura.

### Contrato da prova (colunas)

| Grupo | Colunas |
|---|---|
| Quem e onde | motorista (lookup), tela (choice: despesa, recebimento, manutenção, finalizar manutenção, colisão, checklist), tabela e id do registro de origem (texto) |
| Arquivo | link do arquivo (texto, chega ao anexo pelo link), tipo de mídia (foto ou vídeo), tamanho em bytes, duração do vídeo em segundos, SHA-256 |
| Origem da captura | choice: câmera ao vivo do app, câmera nativa pelo app; a galeria entra na fase 2 |
| Horários | código curto, emitido em (servidor), capturado em (celular, declarado), recebido em (servidor), atraso em minutos |
| Localização | latitude, longitude, precisão em metros, estado (registrada, negada, indisponível) |
| Selos | multi-choice: capturada sem rede, código inválido, código não assinado. A fase 2 acrescenta outros |

### Carimbo

- **Posição e conteúdo:** faixa no rodapé da foto, com data e hora do celular, placa, identificação curta do registro e código.
- **Sem rede:** no lugar do código entra "SEM REDE".
- **Legibilidade:** fonte e contraste legíveis em fundo claro e escuro, sem cobrir mais de 10% da altura.
- **Cobertura:** vale para foto da câmera ao vivo e da câmera nativa. A foto nativa é redesenhada em canvas, o que já descarta o EXIF original. A leitura de EXIF entra só na fase 2, para galeria.

### Limites

- **Foto:** maior lado até 2048 px, JPEG 0,85, para qualquer origem.
- **Vídeo:** até 120 s e 70 MB, o que vier primeiro.
  - **Por que 70 MB e não os 100 MB combinados:** o vídeo sobe em base64 num único POST ao flow de salvar arquivos, e base64 aumenta o tamanho em cerca de um terço. Com 70 MB, o corpo fica abaixo de 100 MB, que é o que a requisição HTTP do Power Automate costuma aceitar. Decisão de 16/11/2026, delegada pelo Renan.
  - **Ao vivo:** a taxa de gravação cai para 4 Mbps, contra 8 a 12 Mbps hoje, para 2 minutos caberem em 70 MB. O app para a gravação no limite de tempo e mostra o contador.
  - **Câmera nativa:** o app lê a duração pelos metadados do elemento de vídeo e o tamanho pelo arquivo, e recusa acima de qualquer um dos limites. O motivo aparece em linguagem simples, por exemplo "Vídeo muito grande. Grave até 1 minuto e meio."
- **Despesa:** só foto.

## Testing Decisions

- **Bom teste:** exercita a interface pública e o comportamento visível, nunca a ordem interna de chamadas. Na prova: "com rede, a prova registrada tem o código emitido, o hash do arquivo enviado e nenhum selo"; "sem rede, tem o selo e o atraso".
- **Ponto de teste 1, módulo de prova de captura do app:**
  - testado pela interface pública, com a porta de dados mock;
  - casos: com rede, sem rede, falha no registrar e reenvio da pendente, localização negada, carimbo presente na foto (dimensão e faixa) e redução para 2048 px;
  - referências: os testes de câmera e mídia já existentes, os testes de chamada de Custom API do app, e os testes de envio do checklist e da conferência.
- **Ponto de teste 2, handler da Custom API no plugin:**
  - testado com o serviço falso de organização, como nos testes dos plugins de checklist, comunicado e cobrança;
  - casos: emitir devolve código assinado e hora; registrar com assinatura válida grava sem selo; assinatura adulterada, de outro motorista ou ausente grava com o selo certo; sem chave no segredo emite "não assinado".
- **Tela de captura:** testes de comportamento para o limite de vídeo (recusa acima de 120 s e de 70 MB, parada automática) e para a despesa sem vídeo.
- **Não verificável na nuvem:** câmera, localização e gravação reais. A verificação é num iPhone e num Android de verdade, no DEV, e a declaração entra no PR.

## Out of Scope

- **Na fase 2:**
  - galeria e PDF por tela;
  - leitura do EXIF e selos de data da galeria;
  - bloqueio de foto repetida, pela impressão digital visual;
  - exibição dos selos nas telas do Sistema.
- **Na fase 3:** leitura do QR e da chave de nota fiscal, conferência da chave, nota repetida.
- **Fora de todas as fases:**
  - detector de IA (decisão de 16/11/2026);
  - consulta paga à SEFAZ;
  - selo ou bloqueio por distância do local;
  - carimbo impresso no vídeo.
- **Selfie do termo de multa:** fica como está.

## Further Notes

- **Limite do flow a confirmar primeiro no DEV.** O flow de salvar arquivos não está versionado no repositório, então o teto de 100 MB por requisição é presumido. O primeiro teste no DEV é enviar um vídeo de 70 MB.
- **Vídeo da câmera nativa no iPhone:** em 1080p a 30 fps, o iPhone grava cerca de 40 a 60 MB por minuto. Na prática, o limite de 70 MB corta perto de 1 min 10 s a 1 min 45 s, antes dos 2 minutos. Se isso atrapalhar a operação, o próximo passo é o envio de vídeo em partes direto ao SharePoint, que retira o teto do flow. Isso fica fora desta fase.
- **O que a prova garante:** a mídia não é anterior à emissão do código, porque o carimbo imprime um código que não existia antes, e o arquivo guardado é o mesmo que saiu do celular. Ela não impede fotografar uma tela que mostra outra imagem. Isso foi aceito ao descartar o detector de IA.
- **Novo segredo:** o `midia.prova-captura` entra na tabela de segredos do CLAUDE.md da raiz. Cada ambiente grava o seu com o script de gravar segredo.
- **Selos:** vão para uma coluna multi-choice para que a fase 2 acrescente valores sem mudar o contrato.
