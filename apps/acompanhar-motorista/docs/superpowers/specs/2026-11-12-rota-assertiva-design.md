# Rota mais assertiva no link de acompanhamento — design

Aprovado pelo Renan em 12/11/2026 ("pode seguir todos 1 por 1").

## Problema

Em rodovia com pistas separadas (Dutra), o Worker manda ao TomTom/OSRM só a posição crua do carro. Com o erro normal do GPS o roteador encaixa o carro na pista contrária e a rota começa com "segue até o retorno e volta": o desenho faz um laço, o ETA e os km ficam errados. Além disso a rota é recalculada a cada 30/60 s, então uma leitura ruim troca a rota inteira de uma vez.

## O que entra

1. **Rumo ao roteador.** TomTom recebe `vehicleHeading`, OSRM recebe `bearings=<rumo>,45;`. O rumo vem das últimas posições (a API da Infleet não expõe rumo de forma conhecida) e só vai com o carro andando (≥ 10 km/h).
2. **Encaixe da posição pelo caminho recente.** As últimas 3 a 6 leituras vão ao OSRM Match; o último ponto encaixado vira a origem da rota, e o rumo da linha encaixada substitui o rumo cru.
3. **Filtro de leitura ruim.** Leitura sem coordenada, em (0,0), no futuro, fora de ordem ou com salto acima de 200 km/h não entra na trilha. Duas leituras "ruins" coerentes entre si reiniciam a trilha (túnel, GPS religado).
4. **Seguir a rota em vez de recalcular por tempo.** A rota calculada fica guardada (por isolate) e é cortada a partir da projeção do carro; km e minutos caem na proporção do que falta. Recalcula só quando o carro fica a mais de 80 m da rota em 2 leituras seguidas (fixTime diferentes) ou quando a rota passa da idade (2 min a menos de 5 km do alvo, 4 min longe), para atualizar o trânsito.
5. **Rota estranha precisa de confirmação.** Rota nova suspeita (ver 6), com o carro ainda a menos de 150 m da rota anterior, não substitui a anterior na primeira leitura; só na leitura seguinte (outro fixTime) que também a confirme. A mesma leitura nunca pede rota de novo.
6. **Teste de bom senso.** Suspeita = começa contra o rumo do carro (> 120°), ou nos primeiros 5 km se afasta ≥ 500 m do início e volta a ≤ 200 m dele (retorno), ou tem mais de 2,5× a linha reta quando a reta passa de 2 km.
7. **Carro desenhado sobre a rota.** Na página, se o GPS está a até 30 m da rota, o marcador vai para o ponto projetado nela.
8. **Previsão estável.** Na página, variação acima de max(3 min, 25 %) do ETA mostrado só aparece se a leitura seguinte confirmar. Troca de fase ou de etapa zera.
9. **Chegada no terminal certo.** Em aeroportos (GRU T1/T2/T3, CGH, VCP, SJK, SDU, GIG T1/T2), o destino de roteamento é o prédio do terminal (OpenStreetMap, `aeroway=terminal`, consultado em 12/11/2026); sem terminal no texto, o padrão do aeroporto. Só afeta o roteamento: "chegou", "chegando" e marcadores continuam no ponto geocodificado. Links novos guardam `chegada` na etapa (o texto bruto não é guardado); links antigos usam o rótulo.
10. **Registro de rota suspeita.** `console.log` JSON `{ evento: "rota_suspeita", link (6 primeiros caracteres), decisao, motivos, km, fonte }`, sem coordenadas. `observability.enabled` no `wrangler.jsonc` para os logs ficarem consultáveis no painel do Cloudflare.
11. **Modo diagnóstico.** `/r/<id>?debug=1`: a página pede `/dados?debug=1`, que traz `diagnostico` (decisão, motivos, rumo, velocidade, trilha, origem e ponto encaixado). A página desenha a trilha (cinza), a leitura crua (vermelho) e o ponto encaixado (verde) e mostra uma caixinha de texto. Sem `debug=1` o campo não sai.

## Fora do escopo

Guardar a rota no KV (o projeto limita escritas por link; a rota continua por isolate, como hoje). Rumo vindo da Infleet (schema não verificado; dá para trocar depois sem mudar o resto).

## Limites e constantes

| Constante | Valor |
|---|---|
| Fora da rota | > 80 m em 2 leituras |
| Idade da rota | 2 min (< 5 km do alvo) / 4 min |
| Anterior ainda serve | ≤ 150 m da rota anterior |
| Rumo | janela 3 min, ≥ 40 m, ≥ 10 km/h |
| Salto impossível | > 300 m e > 200 km/h |
| Carro na rota (página) | ≤ 30 m |
| ETA estável | max(3 min, 25 %) |
