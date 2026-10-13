# Carro atual do motorista e link de acompanhamento — design

Data: 13/10/2026 · Autor: Renan (com Claude) · Status: aguardando revisão

## Contexto

A finalização do serviço já define o carro usado pela Infleet (entregue em DEV na v2.1.708):

- um carro com 85% ou mais do tempo de ignição na janela do serviço é gravado automaticamente;
- abaixo disso, o motorista escolhe entre os carros cadastrados que a Infleet viu na janela;
- sem decisão da Infleet, o motorista escolhe na frota ativa;
- a posse (`new_possedeveiculo`) não é usada na finalização.

O carro usado fica em `cr40f_reservadeveculos.cr40f_veiculo` e é a base do faturamento: com a placa, quem fatura consulta estacionamento, Sem Parar e Rodoanel.

**Problema:** o carro só é conhecido quando o motorista finaliza. Antes disso, a operação não sabe responder ao cliente "qual carro está vindo". Motoristas terceiros andam com carros próprios, sem rastreador, às vezes trocando de carro.

**Objetivo:** a operação saber, no dia do serviço, qual carro está com cada motorista (próprio ou terceiro) e passar isso ao cliente pela Tela Operacional, por uma mensagem pronta, pelo link de acompanhamento e pelo Assistente Betinhos.

## Decisões

| Tema | Decisão |
| --- | --- |
| Quando o cliente precisa saber | No dia, perto da saída. Não há previsão na confirmação/voucher. |
| Fonte única | Carro atual no funcionário: `cr40f_funcionarios.cr40f_veiculoatual` (já existe). |
| Motorista próprio | Flow a cada 5 min grava o carro atual vindo da Infleet. |
| Motorista terceiro | Carros dele cadastrados (categoria Terceiro) e carro atual escolhido por ele no App Motoristas. |
| Carro da reserva antes de finalizar | `cr40f_veiculo` não recebe previsão. A previsão é sempre o carro atual do motorista. |
| Campo do carro usado | `cr40f_veiculo`. `new_veiculoreal` fica obsoleto (nunca foi preenchido). |
| Placa da Infleet sem cadastro | Cadastra o veículo automaticamente com os dados da Infleet. |
| Exibição na Operacional | Só modelo, cor e placa. Sem "desde", sem origem, sem alerta de antiguidade. |

## Modelo de dados

### `cr40f_funcionarios` (existente)

| Campo | Tipo | Uso |
| --- | --- | --- |
| `cr40f_veiculoatual` | Lookup `cr40f_veiculos` (existe) | Carro com o motorista agora. |
| `new_veiculoatualdesde` | Data e hora (novo) | Quando o carro atual mudou pela última vez. Uso técnico e auditoria; não aparece na Operacional. |
| `new_origemveiculoatual` | Choice (novo): Infleet 100000000 · Motorista 100000001 · Operação 100000002 | Quem informou o carro atual. |
| `cr40f_tipodevinculo` | Choice (existe): Colaborador 0 · Terceiro 1 | Define se o carro vem da Infleet ou do motorista. |
| `new_infleetdriverid` | Texto (existe) | Liga o funcionário ao motorista da Infleet. |

### `cr40f_veiculos` (existente)

| Campo | Uso |
| --- | --- |
| `new_categoriadoveiculo` (Próprio · Terceiro · Aluguel) | Carros de terceiro usam Terceiro. 24 carros ativos no DEV estão sem categoria: preencher antes de ligar. |
| `cr40f_motoristaatual` (lookup funcionário) | Para carro **Terceiro**, passa a significar o dono/motorista terceiro do carro. Para os demais, não é usado. |
| `new_infleetvehicleid`, `new_placanormalizada`, `new_ultimasincronizacaoinfleet` | Já mantidos pelo flow diário "Infleet - Sincronizar telemetria diária e eventos"; reaproveitados no cruzamento por placa. |

### `cr40f_reservadeveculos` (existente)

| Campo | Uso |
| --- | --- |
| `new_linkacompanhamento` | Texto (novo). URL do último link gerado para o serviço. |
| `new_linkacompanhamentoexpiraem` | Data e hora (novo). Validade do link. |

## Componentes

### 1. Sincronização do carro atual (motoristas próprios)

- **Custom API** `new_SincronizarVeiculoAtual` no plugin `DriverRecordSharing`, sem parâmetros, devolve um resumo em JSON (atualizados, cadastrados, ignorados, erros).
- **Flow** recorrente a cada 5 min no DEV/PROD que só chama a Custom API. Sem lógica no flow.
- **Lógica (classe `CurrentVehicleSynchronizer`, testável):**
  1. Uma consulta à Infleet: `listDriversPaginated { id vehicle { id plate brand model year modelYear ownershipType uf } }` (reaproveita o `InfleetGraphQlGateway` e o token da configuração segura).
  2. Funcionários ativos com `new_infleetdriverid` e `cr40f_tipodevinculo` ≠ Terceiro.
  3. Para cada motorista com veículo na Infleet: acha o carro pela placa normalizada; se não existir, cadastra (seção 3).
  4. Grava `cr40f_veiculoatual`, `new_veiculoatualdesde` = agora e `new_origemveiculoatual` = Infleet **só quando o carro mudou**.
  5. Nunca altera funcionário Terceiro.
- O carro da Infleet é o do último bipe: se o motorista não bipar, o carro anterior permanece. Aceito.

### 2. Carro atual do terceiro (App Motoristas)

- Nova opção no menu inicial: **"Meu carro"**, visível só para `cr40f_tipodevinculo` = Terceiro.
- Lista os carros ativos com categoria Terceiro e `cr40f_motoristaatual` = o próprio motorista, com o visual do diálogo "Qual carro você usou?" (modelo e cor, placa ao lado).
- Tocar grava `cr40f_veiculoatual`, `new_veiculoatualdesde` e `new_origemveiculoatual` = Motorista.
- Cadastrar carro novo do terceiro continua com a operação (fora do escopo do app).
- **Finalização do terceiro:** não chama a Infleet. Usa o carro atual com origem "Escolhido pelo motorista"; sem carro atual, abre o diálogo listando só os carros dele.

### 3. Cadastro automático de veículo vindo da Infleet

Quando a placa da Infleet não existe em `cr40f_veiculos` (comparando `new_placanormalizada` e `cr40f_placa` normalizada), o plugin cria:

| Dataverse | Infleet |
| --- | --- |
| `cr40f_placa`, `new_placanormalizada` | `plate` |
| `cr40f_marca` | `brand` |
| `cr40f_modelo` | `model` |
| `cr40f_anodefabricacao` | `year` (inteiro) |
| `cr40f_anodemodelo` | `modelYear` (inteiro) |
| `new_propriedade` / `new_categoriadoveiculo` | `ownershipType`: OWNED → Próprio/Próprio; RENTED → Alugado/Aluguel; vazio → não preenche |
| `new_infleetvehicleid`, `new_ultimasincronizacaoinfleet` | `id`, agora |
| `cr40f_statusdoveiculo` | Ativo |
| `cr40f_comentariosextras` | "Cadastrado pela Infleet em dd/mm/aaaa; falta cor" |

- **Não gravar:** chassi (vem mascarado), Renavam (vem vazio), cor (a Infleet não tem).
- A cor vazia aparece na Operacional como "cor não cadastrada" e a operação completa o cadastro.
- `cr40f_id` é obrigatório: confirmar na implementação se é autonumeração; se não for, usar a placa.
- A mesma rotina é usada pela finalização (Custom API `new_ResolverVeiculoDoServico`), que hoje marca o candidato como "não cadastrado": passa a cadastrar e seguir com a decisão normal.

### 4. Tela Operacional (Sistema Betinhos)

- **Detalhe do serviço:** linha "Carro" com modelo, cor e placa.
  - Antes de finalizar: carro atual do motorista do serviço.
  - Depois de finalizar: `cr40f_veiculo` da reserva.
  - Sem carro: "Carro não informado".
- **"Copiar para o cliente":** texto pronto para WhatsApp:
  ```
  *Seu motorista:* João
  • *Carro:* Corolla Prata
  • *Placa:* RUH7G45
  • *Acompanhe:* https://acompanhar-motorista…/r/…
  ```
  A linha do link só aparece quando há link válido; a do carro some quando não há carro.
- **"Gerar link de acompanhamento":** chama a Custom API da seção 5; desativado para terceiro com o texto "Motorista terceiro sem rastreador".

### 5. Link de acompanhamento integrado

- **Custom API** `new_GerarLinkAcompanhamento` (`new_ReservaId` → `new_LinkJson`) no plugin.
  - Lê a reserva: embarque (`cr40f_endereodesada`), destino (`cr40f_destino`), horário (`cr40f_dataehorriodesada`), motorista.
  - Lê o carro atual do motorista: placa, modelo, cor.
  - Valida: motorista não é terceiro, há carro atual, o carro tem `new_infleetvehicleid` ou placa existente na Infleet.
  - Chama `POST /api/links` do Worker com o segredo da configuração segura.
  - Grava `new_linkacompanhamento` e `new_linkacompanhamentoexpiraem` na reserva e devolve a URL.
  - Validade: do momento da geração até 4 h após o horário agendado, limitada a 24 h (regra do Worker).
- **Worker `Link Acompanhamento de Motorista`** (repositório com git):
  - Nova rota `POST /api/links` com `Authorization: Bearer <segredo>` (segredo novo `LINK_API_SECRET`, comparação em tempo constante).
  - Recebe placa, endereços, horário, título, cor e modelo; geocodifica os endereços (mesma lógica do `resolverLocal` do conector), acha o `vehicleId` na Infleet pela placa e grava `track:<id>` no KV com o contrato atual.
  - O conector `Skill Agendamento\infleet-mcp` não muda.
- A página pública do link não muda (já mostra modelo, cor e placa).

### 6. Assistente Betinhos

- `references/campos.md`: `new_veiculoreal` vira obsoleto; "carro que está indo" = `cr40f_veiculoatual` do motorista da reserva; carro usado = `cr40f_veiculo` após a finalização.
- Fluxo para gerar o link pela Custom API, em vez de montar placa à mão.

## Erros

| Situação | Comportamento |
| --- | --- |
| Infleet fora do ar no flow | Mantém o carro atual gravado; resumo com erro na execução do flow. |
| Placa da Infleet sem cadastro | Cadastra o veículo (seção 3) e segue. |
| Falha ao cadastrar veículo ou atualizar funcionário | Tudo ou nada: o step roda na transação da Custom API, então a execução falha (InvalidPluginExecutionException com a placa ou o id do funcionário) e a próxima rodada do flow tenta de novo. "erros" fica sempre vazio no resumo, só por estabilidade de contrato. |
| Bipe de motorista Terceiro | Ignorado. |
| Motorista sem carro atual | Operacional mostra "Carro não informado"; mensagem omite a linha. |
| Gerar link sem carro, terceiro ou sem rastreador | Mensagem com o motivo; nada é gravado. |
| Worker fora do ar ou segredo inválido | "Não foi possível gerar o link agora"; reserva sem link. |

## Testes

- **Plugin (xUnit):** cruzamento por placa; grava só quando muda; ignora terceiro; mapeamento do cadastro automático (inclui ownershipType e anos inválidos); payload do link e validações.
- **App Motoristas (node:test):** "Meu carro" só para terceiro e só com os carros dele; finalização do terceiro com e sem carro atual.
- **Operacional (vitest):** linha "Carro" antes/depois de finalizar e sem carro; texto copiado com e sem link; botão do link para terceiro.
- **Worker:** `POST /api/links` com segredo certo, errado e ausente; payload inválido.
- **DEV com dados reais:** rodar a sincronização e conferir o carro atual de quem bipou no dia; forçar uma placa nova e ver o cadastro automático; trocar o carro de um terceiro pelo app e ver na Operacional; gerar um link pela Operacional e abrir a página.

## Fora do escopo

- Previsão do carro na confirmação/voucher.
- Link com mapa ao vivo para terceiros.
- Cadastro de carro novo de terceiro pelo próprio motorista.
- API do Sem Parar.
- Fase 2 do plano anterior: tirar o veículo da programação e desligar trocas/posse (inclui o `ServiceVehicleSynchronizer`, que ainda preenche reservas programadas pela posse).

## Pré-requisitos antes de ligar em PROD

- Preencher a categoria dos 24 carros ativos sem categoria e vincular os carros de terceiros aos motoristas.
- Vincular `new_infleetdriverid` dos motoristas próprios que faltam e os crachás sem motorista na Infleet.
- Colocar `Skill Agendamento\infleet-mcp` sob git (recomendado, não bloqueia).
