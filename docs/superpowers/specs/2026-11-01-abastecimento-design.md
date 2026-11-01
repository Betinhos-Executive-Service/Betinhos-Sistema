# Abastecimento: gestão de combustível (01/11/2026)

## Objetivo
Gestor vê consumo, custo e anomalias de combustível por veículo e motorista a partir dos extratos CTF, Ticket Log e cartão de crédito importados e das despesas de combustível do App Motoristas; o sistema gera dicas ao motorista e alertas ao gestor por regra fixa, no formato das propostas dos agentes, e o Assistente da Frota redige a partir do mesmo contexto.

## Decisões
- Tela React `#/abastecimento` em Frota (ícone `Fuel`), abas: Por veículo, Abastecimentos (lista no padrão `useListView`), Anomalias, Dicas e alertas, Pendências. Filtros de mês, motorista e veículo na URL.
- Importação por upload CSV/XLSX num drawer de três passos: operadora e arquivo → mapeamento de colunas (sugerido pelos cabeçalhos, salvo por operadora no navegador) com prévia e contagem → gravação com progresso e resumo. Fechar com arquivo lido pergunta "Descartar importação?"; gravando, não fecha.
- Tabela `cr40f_abastecimento` (`provision-abastecimento.ps1`): data, veículo e motorista (lookups RemoveLink), litros, valor, preço/litro, posto, combustível, origem (CTF, Ticket Log, App Motoristas, Crédito), odômetro, chave de deduplicação (texto + chave alternativa), placa e motorista como vieram no extrato, arquivo. Coluna `cr40f_capacidadetanque` em `cr40f_veiculos`.
- Deduplicação pela chave `origem|minuto|placa|litros|valor`, no shell (contra a base carregada e dentro do arquivo) e no Dataverse (chave alternativa).
- Despesas de combustível do App não são copiadas: entram na tela com origem App; as cobertas pelo extrato (mesmo veículo, dia e valor ±R$ 0,50) saem do total.
- Placa sem veículo cadastrado entra sem vínculo e fica na aba Pendências, onde o gestor escolhe o veículo.
- km/l = km entre abastecimentos seguidos do mesmo veículo com odômetro ÷ litros do segundo; sem odômetro, vazio. Anomalias: litros acima da capacidade do tanque; km/l fora de 2 desvios dos demais trechos do veículo (mínimo 4 trechos, desvio mínimo 10% da média); dois abastecimentos em menos de 1 h.
- Dicas e alertas: `FrotaConsumo` (um alerta por veículo com anomalia) e `FrotaDicaCombustivel` (por motorista: consumo ≥10% pior que o do veículo que mais usa, preço ≥5% acima da frota, odômetro em branco na maioria). Tipos acrescentados ao fim de `TIPOS_POR_AGENTE.frota` e ao choice `cr40f_tipo`. `SYSTEM_ABASTECIMENTO` em `packages/agentes-ia` recebe o contexto que a tela monta (`montarContextoIA`).

## Fora do alcance
Schema e privilégios no DEV (scripts no PR, execução pela main), flow agendado que envia o contexto ao Agente Frota, Custom API para calcular no servidor.
