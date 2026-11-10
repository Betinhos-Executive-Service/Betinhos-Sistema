# Checklist de vistoria — itens "OK / Não OK" (entrega 1 de 3)

Data: 20/10/2026 · Contexto: checklist de vistoria já em DEV (`docs/superpowers/plans/2026-10-19-checklist-vistoria-veiculo.md`).
Sequência: **1. OK / Não OK** → 2. checklist na troca detectada pela Infleet (`2026-10-20-checklist-troca-infleet-design.md`) → 3. padrões na Gestão (`2026-10-20-checklist-padroes-gestao-design.md`).

## Objetivo

Deixar o checklist rápido para o motorista: cada item é um toque em **OK** ou **Não OK**. Só no **Não OK** ele tira a foto (obrigatória) e escolhe o problema numa lista curta. As 4 fotos de volta do carro continuam obrigatórias, para registrar o estado do carro. Os problemas ficam estruturados, para servir de base para a entrega 3 (padrões).

## Fora do escopo

- KM e nível de combustível digitados: o KM vem da Infleet (`new_odometroinfleet`, já gravado pelo plugin). Combustível vira item OK / Não OK ("Combustível acima de 1/4").
- Desenho do carro com toque por região (tipo ficha de locadora): fica para depois, se fizer falta. A região da lataria fica implícita nas 4 fotos de volta e nos itens separados.
- Botão "marcar tudo OK": não terá, para não ensinar o motorista a marcar sem olhar.
- Avisos por push ou e-mail ao gestor e abertura automática de manutenção.

## Decisões

| Tema | Decisão |
|---|---|
| Tipo novo | `new_tipo` ganha a opção **100000003 "OK / Não OK"**; no código, `tipo = "okNok"`. Os tipos Foto, Número e Texto continuam. |
| Resposta OK | `valor = "ok"`; sem foto nem problema. |
| Resposta Não OK | `valor = "nok"`, **≥ 1 foto** (até o limite atual por item), **≥ 1 problema** da lista do item e observação opcional (até 500 caracteres). |
| Lista de problemas | Por item: coluna nova `new_opcoesproblema` (texto, uma opção por linha) em `new_checklistmodeloitem`. Vazia → lista padrão: Arranhado, Amassado, Trincado, Quebrado, Faltando, Sujo, Outro. |
| Obrigatório | Item OK / Não OK obrigatório exige escolha. Opcional sem resposta é aceito. |
| Resumo no checklist | Colunas novas em `new_checklistveiculo`: `new_temproblema` (Sim/Não) e `new_qtdproblemas` (inteiro), gravadas pelo plugin ao concluir. A Gestão e a entrega 3 filtram por elas sem ler o JSON. |
| Compatibilidade | Checklists já criados guardam os itens em JSON e não mudam. Uma resposta antiga sem `problemas`/`observacao` continua válida. |

## Contrato da resposta (`new_respostasjson`)

```json
{ "chave": "…", "rotulo": "Pneus", "tipo": "okNok", "valor": "nok",
  "problemas": ["Murcho"], "observacao": "dianteiro direito",
  "fotos": [{ "link": "https://…", "caminho": "…", "nomeArquivo": "…" }] }
```

Item no snapshot do checklist (`new_itensjson`) ganha `opcoesProblema: string[]`, sempre preenchido pelo plugin (lista do item ou a padrão). O app nunca decide a lista sozinho.

## App Motoristas

- Componente novo `ChecklistOkNokField` (`src/components/checklists/`): dois botões grandes ("OK" verde, "Não OK" vermelho, alvo ≥ 48 px, `aria-pressed`). Ao tocar em "Não OK", abre logo abaixo: chips de problema (múltipla escolha), botão de foto (mesma câmera dos itens Foto) e campo de observação opcional. Voltar para "OK" limpa problemas, foto e observação, com confirmação se já houver foto.
- Topo do formulário: barra de progresso "N de M itens".
- Rascunho no aparelho e fila de fotos: mesma lógica atual. Fotos de item Não OK entram na fila só quando o item estiver em "nok".
- Validação local (`validateChecklistDraft`) com as mesmas regras do plugin e mensagens iguais ("Tire a foto do problema: Pneus.", "Escolha o problema: Pneus.").
- Checklist enviado mostra os itens Não OK primeiro, em destaque, com problemas e fotos.

## Plugin (`ChecklistAnswers.cs` / `ChecklistCommandPlugin.cs`)

- `TipoFromChoice(100000003) = "okNok"`; o snapshot leva `opcoesProblema` (lido de `new_opcoesproblema` ou padrão).
- Validação OK / Não OK: `valor ∈ {ok, nok}`; nok exige foto e problema; cada problema precisa estar em `opcoesProblema` do item; no máximo 10 problemas; observação ≤ 500.
- Ao concluir, grava `new_temproblema` e `new_qtdproblemas` (quantidade de itens em nok).

## Gestão de Checklists

- Editor de modelo: tipo "OK / Não OK" e campo "Problemas possíveis" (um por linha, com a lista padrão como sugestão).
- Lista por veículo: um checklist concluído com problema faz o veículo aparecer em **"Precisam de atenção"**, com o selo "Não estava OK (N)". Isso vale até o próximo checklist concluído sem problema.
- Detalhe do checklist: itens Não OK no topo, com problemas, observação e fotos.

## Modelo de teste (seed DEV)

4 fotos de volta (Frente, Traseira, Lateral esquerda, Lateral direita) e os itens OK / Não OK: Pneus (Murcho, Careca, Furado, Outro); Faróis e lanternas (Queimado, Quebrado, Outro); Para-brisa e vidros (Trincado, Riscado, Outro); Luzes de alerta no painel (Injeção, Freio, Óleo, Bateria, Outra); Limpeza interna (Sujo, Com lixo, Com cheiro, Outro); Limpeza externa (Sujo, Outro); Combustível acima de 1/4 (Abaixo de 1/4, Na reserva); Estepe, macaco e triângulo (Faltando, Estepe murcho, Outro); Documento do veículo (Faltando, Vencido). Mais a Observação geral (texto, opcional). Sai o KM digitado e a foto do painel.

## Erros e riscos

- Modelo antigo, que ainda tem KM e foto do painel, continua funcionando: os tipos antigos não mudam.
- Lista de problemas editada depois de o checklist ser criado: vale o snapshot do checklist, então não há conflito.
- O app, a Gestão (que copia `src/lib/checklists.ts` via `sync-shared`) e o plugin precisam ir juntos para o DEV. Se só o plugin subir, o app antigo não sabe exibir "okNok". Por isso o seed do modelo novo roda por último.

## Testes

- `tests/checklists.test.ts`: validação local (nok sem foto, nok sem problema, problema fora da lista, ok limpa extras) e montagem do payload.
- `ChecklistCommandPluginTests.cs`: as mesmas regras no servidor, mais `temproblema`/`qtdproblemas`, compatibilidade com resposta antiga e o snapshot com lista padrão.
- DEV: smoke (`smoke-checklists-dev.ps1`) com um checklist Não OK. Navegador: App Motoristas (fluxo completo no celular, 375 px) e Gestão ("Precisam de atenção" + detalhe). `verificar-checklists-app` e `verificar-checklists-backend` atualizados.
