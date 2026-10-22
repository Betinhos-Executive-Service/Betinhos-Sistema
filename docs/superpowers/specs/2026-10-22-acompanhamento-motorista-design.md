# Link de acompanhamento do motorista — design

Data: 22/10/2026 · Dono: Renan · Status: aguardando revisão

## Objetivo

O cliente abre o link e vê, sem ambiguidade:

- o carro na posição real (Infleet), em cima do trajeto certo;
- as etapas do serviço (saída → paradas → destino), como no Google Maps, com a etapa atual destacada;
- o status certo: **A caminho**, **No local**, **Em viagem**, **Concluído**;
- o tempo de chegada quando ele for confiável;
- quem vai buscá-lo: foto capa e nome do motorista, telefone corporativo, foto capa, modelo, cor e placa do veículo.

## Estado atual (o que já existe)

Worker `acompanhar-motorista` (repo `Link Acompanhamento de Motorista`, v0.0.15):

- `POST /api/links` (Custom API `new_GerarLinkAcompanhamento` → Worker, Bearer `LINK_API_SECRET`) recebe placa, embarque, destinoFinal, horário, título, cor e modelo; grava em `TRACK_KV` (`track:<id>`, TTL = validade).
- Geocodificação: `geocodeTolerante` + Nominatim, com apelidos de aeroporto (GRU, CGH, VCP).
- Fases por GPS em `worker.mjs:96-114` (chegou no embarque, saiu, chegou no destino final).
- ETA: TomTom Routing com trânsito (30 s perto, 60 s longe), OSRM de reserva.
- Motorista: primeiro nome e foto da Infleet. Sem telefone, sem foto do veículo, sem paradas.
- `DELETE /api/links/<id>` revoga o link.

**Causa principal dos erros hoje:** o texto da operação ("Aerop. GRU AA 963 / passar no hotel antes") vai cru ao Nominatim. Pino errado → trajeto, status e ETA errados.

## Decisões do Renan (22/10/2026)

1. Endereço sem confiança: o mapa mostra só a posição do carro e as informações de carro e motorista, **sem status e sem etapas**. O link fecha quando o serviço for concluído.
2. Paradas: todas, em etapas no mapa.
3. Concluído: o GPS marca, mas **o Dataverse manda**. Serviço concluído no Dataverse fecha o link na hora.
4. ETA: depende da confiabilidade (regra abaixo).
5. Geocodificação continua no **Nominatim** (Google Geocoding não deu certo).
6. Chave do Claude separada, modelo Haiku.

## Desenho

### 1. Normalização dos endereços (Haiku, uma vez por link)

- Novo secret no Worker: `ANTHROPIC_API_KEY_ACOMPANHAMENTO` (padrão de uma chave por caso de uso, PR #135). Modelo `claude-haiku-5-5`.
- Na criação do link, o Worker manda ao Haiku os textos de saída, destino, paradas e observações da reserva e pede JSON estrito (tool use / saída estruturada):
  `{ etapas: [{ tipo: "saida"|"parada"|"destino", consulta: "<endereço limpo para geocodificar>", rotulo: "<texto curto para o cliente>" }], confianca: "alta"|"baixa", motivo?: string }`
- Regras do prompt: tirar voo, nome de passageiro, telefone e instruções; manter número, bairro e cidade; aeroporto vira o nome oficial (substitui a tabela `LUGARES` fixa, que fica como reserva); não inventar endereço.
- Cada `consulta` passa por `geocodeTolerante` (Nominatim). Resultado guardado no KV junto do link; o Haiku nunca roda de novo nas consultas de posição.
- Falha do Haiku (timeout de 8 s, erro, JSON inválido) → caminho atual (texto cru + `geocodeTolerante`). O link é criado mesmo assim.

### 2. Confiança do trajeto

O link fica em **modo completo** (status + etapas + ETA) só quando:

- todas as etapas geocodificaram;
- o Haiku devolveu `confianca: "alta"` (ou não rodou e o geocode da saída e do destino achou o lugar);
- nenhuma etapa ficou a mais de 150 km da anterior (pega Nominatim achando a rua homônima em outro estado).

Fora disso, **modo simples**: só o carro no mapa e o cartão de motorista e veículo, sem status, sem etapas e sem ETA (decisão 1).

### 3. Etapas e status (regra fixa, sem IA)

- A etapa atual é a primeira etapa ainda não visitada. Uma etapa conta como visitada quando o carro fica no raio dela (área do lugar ou 150 m) por 60 s e depois sai.
- Status:
  - **A caminho:** antes de chegar na saída.
  - **No local:** dentro do raio da saída.
  - **Em viagem:** depois de sair da saída; a linha mostra a próxima parada ou o destino.
  - **Concluído:** chegou no destino (GPS) ou o Dataverse concluiu (prevalece).
- Generaliza `chegouEmbarqueEm / saiuEmbarqueEm / concluidoEm` para `etapas[i].chegouEm / saiuEm`. Links antigos (sem `etapas`) continuam no formato atual.

### 4. ETA

- Mostrar "Chega em ~N min" só em modo completo, com rota TomTom (não OSRM) e posição da Infleet com menos de 3 min.
- Com OSRM ou posição velha: só o status, sem minutos.
- Na etapa "No local" e depois de "Concluído": sem ETA.

### 5. Dataverse manda no "Concluído"

- Novo endpoint `POST /api/links/<id>/concluir` (mesmo Bearer). Marca `concluidoEm` e `concluidoPor: "dataverse"` no KV e encurta o TTL para 2 h. A página mostra "Serviço concluído" e para de pedir posição.
- Quem chama: Flow no Dataverse DEV disparado quando o status da reserva (`cr40f_reservadeveculos`) vira Concluído e a reserva tem link ativo. O id do link sai do link gravado na reserva (`linkAcompanhamento`).
- Cancelado no Dataverse: chama o `DELETE` já existente.

### 6. Motorista e veículo no link

A Custom API `new_GerarLinkAcompanhamento` passa a enviar no `POST /api/links`:

| Campo | Fonte |
|---|---|
| `motorista.nome` | `cr40f_funcionarios` (motorista da reserva), primeiro nome |
| `motorista.telefone` | `cr40f_telefonecorporativo` |
| `motorista.foto` | `cr40f_foto` (imagem, versão reduzida) |
| `veiculo.foto` | foto principal da pasta do veículo no SharePoint (mesma regra de `escolherPrincipal` da Frota) |
| `paradas[]` | paradas da reserva (colunas a confirmar na metadata) |

- O Worker guarda as fotos reduzidas (até 200 KB cada) no KV, em `foto:<id>:motorista` e `foto:<id>:veiculo`, com o mesmo TTL do link, e serve por `/r/<id>/foto/<qual>`. A página pública nunca acessa Dataverse nem SharePoint.
- Sem foto: iniciais do motorista; ícone do carro.
- Telefone corporativo: botão "Ligar" (`tel:`) e "WhatsApp". Sem telefone corporativo, ficam os contatos da central (`CENTRAL_TELEFONE`).
- A Infleet continua como reserva para nome e foto do motorista.

### 7. Interface (`pagina.mjs`)

- Mapa com a linha do trajeto e marcadores numerados por etapa; etapa atual em destaque, visitadas apagadas.
- Painel inferior: status + ETA (modo completo) → lista de etapas → cartão do motorista (foto, nome, telefone) → cartão do veículo (foto, modelo, cor, placa).
- Versão do build no rodapé, sutil (`v0.0.N · dd/mm/aaaa HH:mm`), como hoje.
- Preserva o layout atual do painel (correções v0.0.15/posição do painel).

## Fora do escopo

- Google Geocoding.
- IA decidindo status ou ETA.
- Notificações push ao cliente.
- Mudanças na tela Operacional além do que a Custom API precisa.

## Erros e casos de borda

- Haiku fora: link criado pelo caminho atual; log com o motivo.
- Nominatim fora na criação: `completarDestino` já tenta de novo uma vez; continua.
- Infleet sem posição: mapa sem carro e o aviso "Aguardando posição do veículo".
- Concluir de um link inexistente ou já expirado: 404, e o Flow ignora.
- Link criado antes desta versão: formato antigo continua funcionando até expirar.
- Endereço em aeroporto com terminal (GRU T2/T3): raio da área do aeroporto (`areaDoLugar`), não 150 m.

## Verificação

- Testes Node (`tests/*.test.mjs`): normalização com Haiku mockado (aeroporto + voo, endereço com observação, JSON inválido, timeout), confiança (etapa a 150 km+, etapa sem geocode), máquina de etapas (posições simuladas saída → parada → destino, saída e volta ao raio), ETA escondido com OSRM ou posição velha, `/concluir` (auth, 404, TTL).
- Prova com a OS-10525: gerar o link no DEV e conferir pinos, linha do trajeto e etapas contra o endereço da reserva.
- Concluir a reserva no DEV → link mostra "Serviço concluído" em até 1 atualização.
- UI: página em 375 px e desktop no navegador interno; modo simples e modo completo; sem fotos e sem telefone.
- Custom API/plugin: testes do plugin e chamada real no DEV com o payload novo (fotos e telefone mascarados nos logs).

## Pendências para o plano

- A Custom API `new_GerarLinkAcompanhamento` fica no repo `App Motoristas` (`plugins/DriverRecordSharing/GenerateTrackingLinkPlugin.cs`, publicação por `scripts/push-dev.ps1`). Ou seja, a mudança envolve 3 repos: Worker, App Motoristas (plugin) e Sistema Betinhos (Flow do "Concluído").
- Colunas de paradas da reserva: confirmar na metadata do DEV (o MCP Dataverse_DEV não conectou nesta sessão).
- Limite de tamanho do payload da Custom API com duas fotos (alternativa: o Worker baixa as fotos por um endpoint autenticado).
