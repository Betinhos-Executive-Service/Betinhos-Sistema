# Galeria, PDF, selos e foto repetida (fase 2 de 3)

Status em 16/11/2026: implementado e publicado no DEV (PRs #503, #517 e #509). Aguarda o teste em aparelho e a publicação no PROD. Depende da fase 1 (`2026-11-16-prova-captura-midia-design.md`): a Custom API `new_ProvaMidia`, a tabela de prova de mídia e o módulo de prova de captura do app.

As três fases:

1. **Fase 1:** prova da câmera do app e limites.
2. **Fase 2 (esta):** galeria e PDF por tela, leitura da data gravada no arquivo, selos visíveis no Sistema e bloqueio de foto repetida.
3. **Fase 3:** leitura do QR e da chave de nota fiscal, conferência gratuita da chave e nota repetida.

## Problem Statement

Depois da fase 1, o motorista só consegue anexar o que a câmera do app captura na hora. Isso trava casos legítimos:

- **Documento já digital:** nota fiscal eletrônica, orçamento da oficina, BO e comprovante de transferência chegam ao motorista como PDF ou imagem por WhatsApp e e-mail.
- **Foto que não veio da câmera do app:** a avaria fotografada por um terceiro, a peça trocada que o mecânico mandou e a foto feita no susto com a câmera do celular, numa colisão.

Além disso, nada impede o golpe mais comum: reaproveitar uma foto antiga, do mesmo motorista ou de outro, num registro novo.

A operação também não vê no Sistema o que a fase 1 registra. Não sabe que uma foto foi capturada sem rede, nem de onde ela veio.

## Solution

**Galeria e PDF por tela.** O botão principal continua sendo a câmera do app. Um botão secundário, "Escolher da galeria ou arquivo", aparece só onde foi liberado:

| Tela | Documento da galeria ou em PDF | Foto ou vídeo do momento da galeria |
|---|---|---|
| Despesas (comprovante) | sim | não se aplica: o comprovante é documento; a despesa não aceita vídeo |
| Devolução de despesa | sim (já aceita foto; passa a aceitar PDF e entra nas regras abaixo) | não se aplica |
| Manutenção, solicitação (nota, orçamento, fotos) | sim | sim |
| Finalizar manutenção (nota fiscal e fotos finais FOTO1 a FOTO3) | sim | sim |
| Colisão (BO e fotos) | sim | sim |
| Recebimento | não | sim |
| Checklist | não | não: só a câmera do app |

**Data gravada no arquivo.** Toda foto e todo vídeo da galeria têm a data lida antes de qualquer redução: o `DateTimeOriginal` do EXIF na foto e o `creation_time` no vídeo.

- Se a data cai fora da janela do evento, o anexo ganha o selo **"fora da janela"**.
- Se não existe data, o anexo ganha o selo **"sem data"**.
- **A data nunca bloqueia.** O iPhone converte a foto no envio e o seletor do Android remove metadados, então foto honesta sem data é comum.

**PDF.** Até 10 MB e até 20 páginas. A data interna do PDF não é usada como prova, porque qualquer editor a altera.

**Foto repetida.** É **bloqueada** antes do envio quando for a mesma foto, ou quase a mesma, já usada nos últimos 12 meses em qualquer registro, de qualquer motorista e de qualquer tela. O reenvio dentro do mesmo registro é liberado.

**Selos no Sistema.** Todo anexo mostra a origem ("câmera do app" ou "galeria/arquivo") e os selos, nas telas que já existem. Não há fila nova de revisão.

## User Stories

1. Como motorista, quero que o botão principal continue sendo "Tirar foto", para o caminho de sempre não mudar.
2. Como motorista, quero um botão "Escolher da galeria ou arquivo" só nas telas onde isso é aceito, para não tentar e ser recusado.
3. Como motorista, quero anexar a nota fiscal em PDF que recebi por e-mail na despesa, para não ter que imprimir e fotografar.
4. Como motorista, quero anexar à despesa a foto do comprovante que já está na galeria, para lançar o gasto à noite com a foto tirada no posto.
5. Como motorista, quero anexar o comprovante de transferência em PDF na devolução de despesa, porque o banco entrega o comprovante assim.
6. Como motorista, quero anexar o orçamento e a nota da oficina em PDF na manutenção, porque a oficina manda por WhatsApp.
7. Como motorista, quero anexar as fotos que o mecânico mandou da peça trocada, na solicitação e nas fotos finais, para provar o serviço feito.
8. Como motorista numa colisão, quero anexar fotos e vídeos tirados por outra pessoa ou pela câmera do celular, porque no susto nem sempre abro o app.
9. Como motorista numa colisão, quero anexar o BO em PDF, para completar o registro.
10. Como motorista no recebimento, quero anexar uma foto da galeria, para não perder o registro quando a câmera do app falhar.
11. Como motorista, quero que o checklist continue só com a câmera do app, porque é o estado do carro naquele momento.
12. Como motorista, quero ser avisado na hora que um PDF passou de 10 MB ou de 20 páginas, com o motivo, para mandar outro arquivo.
13. Como motorista, quero que um vídeo da galeria acima de 2 minutos ou de 70 MB seja recusado com o motivo, como na câmera.
14. Como motorista, quero que uma foto da galeria sem data seja aceita, porque o celular às vezes apaga essa informação sem eu saber.
15. Como motorista, quero que a foto repetida seja recusada com uma explicação clara, sem dados de outro motorista, para entender por que não entrou.
16. Como motorista, quero reenviar a mesma foto no mesmo registro depois de uma falha de envio, sem ser bloqueado como repetida.
17. Como operação, quero ver em cada anexo se veio da câmera do app ou da galeria, para saber quanto confiar.
18. Como operação, quero ver o selo "fora da janela" quando a data gravada na foto não bate com o evento, para olhar com mais atenção.
19. Como operação, quero ver o selo "sem data" quando a foto da galeria não tem data, para diferenciar de uma foto da câmera do app.
20. Como operação, quero ver a data gravada no arquivo e o aparelho (marca e modelo), para comparar com o celular do motorista.
21. Como operação, quero ver os selos da fase 1 ("capturada sem rede", "código inválido"), para que o registro feito lá sirva para alguma coisa.
22. Como operação, quero ver os selos na tela de despesas do Sistema, na de recebimentos e na de checklists, que já mostram os anexos.
23. Como operação, quero ver os selos das fotos de colisão e de manutenção nos formulários desses registros, que hoje mostram os anexos.
24. Como operação, quero saber quando uma foto parecida demais com outra foi aceita no modo observar, para calibrar o bloqueio antes de ligá-lo.
25. Como gestor, quero que o bloqueio de foto repetida comece em modo observar e só passe a bloquear quando eu decidir, para não travar motorista honesto por foto parecida.
26. Como gestor, quero que a checagem de repetida seja feita no servidor, para o motorista não conseguir pular só mexendo no app.
27. Como desenvolvedor, quero que galeria e PDF passem pelo mesmo módulo de prova de captura da fase 1, para haver um caminho só para todas as mídias.

## Implementation Decisions

### App

- **Módulo de prova de captura (fase 1), estendido:**
  - ganha a origem "galeria/arquivo" e a leitura de metadados;
  - ganha o cálculo da impressão digital visual e a checagem de repetida;
  - continua sendo o único ponto pelo qual as telas preparam e registram mídia.
- **Seletor de arquivo:**
  - fica na tela de captura comum, como ação secundária;
  - é ligado por tela com dois sinais: aceita documento (imagem e PDF) e aceita foto ou vídeo do momento;
  - as telas não liberadas não mostram o botão.
- **Leitor de metadados próprio, sem dependência nova:**
  - EXIF do JPEG: `DateTimeOriginal`, `OffsetTimeOriginal`, `Make`, `Model`, `Software`;
  - caixa `mvhd` do MP4/MOV: `creation_time`, já convertendo a época de 1904;
  - lê só os bytes iniciais do arquivo;
  - `File.lastModified` **não** é usado como data, porque no iPhone ele traz a hora atual.
- **Ordem do processamento de foto da galeria:**
  1. ler os metadados;
  2. calcular as impressões digitais;
  3. reduzir para 2048 px, JPEG 0,85.

  A foto da galeria **não** recebe carimbo, porque não foi capturada pelo app. O carimbo identificaria como "do app" uma foto que não é.
- **PDF:**
  - o app conta as páginas com o `pdf-lib`, que já é dependência;
  - recusa acima de 10 MB ou de 20 páginas;
  - não reduz nem altera o arquivo, que sobe como veio, com o SHA-256 do original.
- **Janela do evento:**
  - **início:** a data de referência do registro menos 24 h. A referência de cada tela:
    - despesa: data da despesa;
    - devolução: data da despesa devolvida;
    - manutenção: abertura da solicitação;
    - finalizar: abertura da manutenção;
    - colisão: data da colisão;
    - recebimento: data do serviço.
  - **fim:** agora, mais 10 min de tolerância de relógio.
  - Só o servidor calcula o selo, na hora de registrar, com a data gravada no registro de origem.
- **Impressão digital visual:**
  - dHash de 64 bits, calculado sobre a imagem antes do carimbo e da redução;
  - nas fotos da câmera do app, um segundo hash sobre a imagem final, já com carimbo;
  - com os dois hashes, quem salva da galeria a foto carimbada do app e tenta reenviar também é pego;
  - vídeo usa só o SHA-256 em toda a fase.
- **Mensagem de repetida:** "Esta foto já foi usada em outro registro em DD/MM/AAAA. Tire uma foto nova." Não mostra motorista, tela nem link do outro registro.

### Custom API `new_ProvaMidia` (plugin `Betinhos.DriverRecordSharing`)

- **Ação nova `conferir`:**
  - chamada antes do envio do arquivo, com SHA-256, os dHash, tela, tabela e registro;
  - responde **livre**, **repetida** (só com a data do uso anterior) ou **parecida em observação**.
- **`registrar` ganha campos:**
  - origem "galeria" e os metadados lidos;
  - os dHash, o número de páginas do PDF e o tipo de mídia "pdf".
- **`registrar` refaz a checagem de repetida.** Se alguém pular o `conferir`, a prova grava o selo **"repetida"**, porque o arquivo já subiu.
- **`registrar` recalcula o selo da janela** com a data de referência lida do registro de origem.
- **Regra de repetida:**
  - SHA-256 igual, ou distância de Hamming até **3** entre qualquer dHash novo e qualquer dHash guardado;
  - considera as provas dos últimos 12 meses, menos as do mesmo registro (tabela e id iguais).
- **Busca dos parecidos:**
  - cada dHash é guardado também em 4 faixas de 16 bits;
  - a consulta busca as provas com alguma faixa igual e calcula a distância no plugin;
  - com distância até 3, pelo menos uma faixa é obrigatoriamente igual, então nenhum parecido escapa da busca.
- **Modo da repetida:** variável de ambiente nova, não secreta, com dois valores.
  - **`observar`** é o valor inicial. A repetida exata por SHA-256 já bloqueia; a parecida por dHash entra com o selo "parecida" e não bloqueia.
  - **`bloquear`** bloqueia as duas.

  O Renan troca o valor quando os selos "parecida" do DEV e do PROD mostrarem que o limite 3 não pega foto honesta. Por exemplo: fotos diárias do mesmo carro na mesma garagem, ou cupons térmicos do mesmo posto.

### Schema (migration nova)

- **Tabela de prova de mídia, colunas novas:**
  - origem "galeria/arquivo" na choice de origem;
  - tipo "pdf" na choice de tipo;
  - data gravada no arquivo e fuso (offset);
  - marca e modelo do aparelho e software;
  - número de páginas;
  - os dois dHash, cada um com suas 4 faixas indexáveis;
  - lookups opcionais para manutenção e colisão, preenchidos pelo plugin a partir da tabela e do id de origem, para os subgrids nativos.
- **Selos novos na multi-choice:** fora da janela, sem data, repetida, parecida.
- **Variável de ambiente:** a do modo da repetida, com valor `observar`.
- **Formulários de manutenção e de colisão:** ganham o subgrid "Provas de mídia", pela mesma via de migration usada para os forms do push redirect.

### Sistema (`apps/shell`)

- **Despesas, Recebimentos e Checklists**, as páginas que já mostram anexos, mostram ao lado de cada anexo:
  - um selo de origem;
  - os selos da prova, ligada pelo link do arquivo;
  - ao passar o mouse ou tocar, os detalhes: data gravada, aparelho, horários do servidor e atraso.
- **Prova não encontrada:** quando o anexo não tem prova (é anterior à fase 1, ou a prova ficou pendente), não aparece selo nenhum. Não aparece erro.

## Testing Decisions

- **Bom teste:** fala do comportamento visível. Por exemplo: "foto da galeria com data fora da janela entra com o selo 'fora da janela'" e "a mesma foto em outro registro é recusada com a data do uso anterior". Não fala da ordem interna de chamadas.
- **Ponto de teste 1, módulo de prova de captura do app,** pela interface pública e com o mock. Casos:
  - foto da galeria com EXIF dentro e fora da janela, e sem EXIF;
  - vídeo com `mvhd` válido e com a época errada;
  - PDF acima de 10 MB e acima de 20 páginas;
  - tela sem galeria não oferece o botão;
  - repetida recusada antes do envio;
  - reenvio no mesmo registro liberado.

  As fixtures de arquivos pequenos (JPEG com e sem EXIF, MP4 mínimo, PDF de 21 páginas) ficam em `tests/`. Prior art: os testes de mídia e de câmera da fase 1.
- **Ponto de teste 2, handler da Custom API no plugin,** com o serviço falso. Casos:
  - `conferir` livre, repetida por SHA-256, parecida por dHash nos modos observar e bloquear;
  - mesmo registro liberado;
  - prova de mais de 12 meses ignorada;
  - `registrar` sem `conferir` grava o selo "repetida";
  - janela recalculada no servidor.

  Prior art: os testes da fase 1 e dos plugins de checklist e cobrança.
- **Teste puro da distância de Hamming e das faixas:** com distância até 3, uma faixa é sempre igual. Vale como propriedade.
- **Sistema:** testes de componente das páginas de despesas, recebimentos e checklists, com prova e sem prova. Prior art: os testes que já existem dessas páginas.
- **Não verificável na nuvem:** o seletor real do iPhone e do Android e o que cada um preserva de metadados. Na entrega, a verificação é em aparelho real no DEV, com uma foto recente, uma antiga, uma de print e um PDF. O resultado vai no PR.

## Out of Scope

- **Fase 3:** QR e chave de nota fiscal, conferência da chave, nota repetida, valor e data preenchidos pela leitura rápida com o selo "valor alterado".
- **Fora de todas as fases:**
  - detector de IA (decisão de 16/11/2026);
  - leitura de C2PA;
  - bloqueio por data;
  - selo ou bloqueio por distância do local;
  - fila de revisão;
  - carimbo em foto da galeria ou em vídeo;
  - prova de data de PDF.
- **Repetida de vídeo por conteúdo:** só o SHA-256 vale. Um vídeo recortado ou recomprimido não é pego.
- **Foto recortada:** passa pela regra de parecida, porque o dHash não resiste a recorte.

## Further Notes

- **Por que o modo observar:** o Renan escolheu bloquear, e a repetida exata bloqueia desde o primeiro dia. O modo observar existe porque a regra de parecida pode pegar foto honesta quase idêntica, como o mesmo carro no mesmo lugar ou o cupom do mesmo posto, e esse risco só se mede com fotos reais. O limite 3 e o valor `observar` são o ponto de partida.
- **Galeria no iPhone:** a conversão HEIC→JPEG pode apagar o EXIF. Esse é o motivo de "sem data" ser só selo. O teste em aparelho real deve registrar qual seletor e qual opção preservam a data.
- **Volume:** a busca por faixas devolve poucas candidatas, porque a chance de colisão aleatória de uma faixa de 16 bits é 1 em 65.536. O plugin cabe no limite de tempo mesmo com dezenas de milhares de provas por ano.
- **Ordem de entrega:**
  1. schema, plugin e app num PR, porque o app depende do `conferir`;
  2. Sistema noutro PR.

  Os dois vão ao DEV antes da fase 3.

- **Implementação (16/11/2026), depois da revisão de código:**
  - Registro ainda não criado usa um id de sessão estável por rascunho (`cr40f_sessaoid`), trocado pelo id real no `registrar`; o reenvio na mesma sessão do mesmo motorista não conta como repetida.
  - `cr40f_idcliente` torna o `registrar` idempotente: reenvio após resposta perdida devolve a prova existente.
  - dHash de baixa entropia (popcount fora de 8 a 56, como foto escura) não entra na busca por faixas; vale só o SHA-256. A busca por faixas é paginada (250 linhas, até 4 páginas).
  - Foto da câmera nativa grava também o SHA do original que fica na galeria.
  - Vídeo da galeria sem duração legível é recusado.
  - A migration `20261116-1800-prova-midia-galeria.ps1` falhou no DEV (form principal sem `isdefault`) e foi substituída pela `20261116-1900-prova-midia-galeria-forms.ps1` (`migrations/substituidas.json`).
