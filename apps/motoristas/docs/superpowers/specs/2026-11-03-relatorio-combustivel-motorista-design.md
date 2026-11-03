# Relatório de combustível do motorista — design

Decidido com Renan em 03/11/2026 (sessão de grilling). Este documento é a fonte das regras; o plano `docs/superpowers/plans/2026-11-03-relatorio-combustivel-motorista.md` implementa.

## Escopo v1

- Só a categoria **Combustível** (nome no PROD; chave do app `local-abastecimento`, `exigeLitros=true`). Referências do comparativo excluem o mesmo posto e o mesmo motorista. Sempre gasolina comum: não há tipo de combustível.
- Quem vê: o **próprio motorista**, no módulo Despesas do App Motoristas. Colegas aparecem anônimos; o **nome do posto** aparece.
- Nota de performance é **orientação**, sem efeito em repasse, bônus ou advertência.
- Liberado para **todos os motoristas** de uma vez (sem piloto).

## Dados

- O app passa a salvar o **CNPJ** lido no cupom (leitura rápida já devolve `cnpj`) em `new_cnpjposto` da despesa.
- O preço por litro é calculado no servidor: `valor / litros`, arredondado a 3 casas. Fora de [3,00; 12,00] é descartado como inválido.
- Cadastro de postos `new_postocombustivel` (chave alternativa: CNPJ). Preenchido automaticamente pelo plugin: endereço via **BrasilAPI** (`/api/cnpj/v1/{cnpj}`), coordenadas via **Nominatim** (OpenStreetMap). Falhou → posto `pendente`, corrigido pelo gestor no model-driven.
- Histórico: reprocessar os **últimos 6 meses** de cupons de abastecimento (CNPJ por leitura do cupom).
- Sem CNPJ: fora da comparação de preço. Sem km: fora do consumo. Ambos perdem pontos de registro e o app mostra um aviso.

## Fase 0 (gate)

Antes de qualquer schema: teste de cobertura e precisão BrasilAPI + Nominatim com os CNPJs reais dos cupons dos últimos 6 meses (leitura somente, dados fora do repo).
- Métricas: % de CNPJ encontrado na BrasilAPI; % geocodificado em nível de rua; erro em metros numa amostra de 20 postos conferida por Renan no mapa.
- **Aprovado:** ≥ 85% dos postos da amostra com erro < 300 m. Reprovado → Google Geocoding só para os postos que falharem (nova decisão de chave/custo com Renan).

## Comparação de preço (por abastecimento)

- Referências: outros abastecimentos com preço por litro válido, posto geocodificado, a **≤ 3.000 m** (haversine), com `datagasto` entre **7 dias antes** e o mesmo dia. Mínimo de **2 referências**.
- `menorPreco` = menor preço por litro das referências (com posto e distância). `mediana` = mediana das referências.
- **Economia perdida** = `max(0, pago − menorPreco) × litros`, em R$, 2 casas.
- Sem referências suficientes → status `sem_referencia` (não pontua preço).

## Nota mensal (0–100)

Só aparece com **≥ 4 abastecimentos no mês**; antes disso: "nota em formação".

- **Preço (50):** por abastecimento comparado, `d = (pago − mediana) / mediana`. `d ≤ −2%` → 50; `d ≥ +5%` → 0; linear entre os dois. No mês: média ponderada por litros.
- **Consumo (30):** por veículo no mês, `km/l = (kmMax − kmMin) / litros dos abastecimentos depois do primeiro` (precisa de ≥ 2 abastecimentos com km). Referência = mediana do km/l do mês dos outros veículos do mesmo `cr40f_modelo` (≥ 2 veículos). `r = kml / ref`: `r ≥ 1,05` → 30; `r ≤ 0,85` → 0; linear.
- **Registro (20):** por abastecimento: CNPJ (8) + km informado (8) + lançado em até 2 dias após `datagasto` (4). No mês: média.
- Componente sem dado fica fora e a nota é normalizada: `round(soma obtida × 100 / soma dos pesos disponíveis)`. Sem nenhum componente → sem nota.

## Cálculo e IA

- Plugin assíncrono (DriverRecordSharing) no Create/Update da despesa calcula a comparação, grava na despesa e recalcula o resumo mensal `new_resumocombustivelmensal` (motorista + mês).
- Custom API `new_ObterRelatorioCombustivel` devolve ao motorista logado os últimos 6 meses (resumos + abastecimentos do mês). O app só lê.
- **IA só narra números já calculados**: Claude `claude-haiku-5-5` escreve de 2 a 4 insights em pt-BR a partir dos fatos do resumo. Toda quantia citada precisa existir nos fatos; insight com número estranho é descartado. Nunca cita colega.
- Gerado por **Flow noturno** (02:00 America/Sao_Paulo), só para os resumos marcados `new_precisainsight = true`.
- Chave da Anthropic em **Azure Key Vault** via variável de ambiente tipo **Secret**; migrar também `new_AnthropicKeyObservacaoMotorista`.

## Tela

- Ao entrar em Despesas: **painel primeiro**, botão "Lançar despesa" fixo no topo (abre o formulário atual).
- Blocos: nota do mês + evolução 6 meses; preço por litro pago vs faixa da mediana; gasto mensal + economia perdida (barras); lista de abastecimentos com selo ("bom preço" / "acima", R$ a mais, posto mais barato e distância); insights da IA.
