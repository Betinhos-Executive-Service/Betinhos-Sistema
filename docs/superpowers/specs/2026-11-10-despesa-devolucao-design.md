# Despesa devolvida: motivo, justificativa e gestor (design)

10/11/2026. Decisões do Renan na sessão de conferência das despesas do App.

## Por que existe

No PROD, de 210 despesas do App em 14 dias, a IA devolveu 64 ("Precisa corrigir") e **nenhuma voltou**. O App não mostra a devolução, não diz o motivo e não deixa corrigir; o gestor também não tem onde agir. A despesa já aconteceu (o dinheiro saiu), então o objetivo não é barrar o motorista, é **fechar cada despesa com um comprovante válido ou uma explicação registrada**.

## Quem usa e em que condição

- **Motorista** (App, celular): entre corridas, uma mão, sinal ruim, pouco tempo. Precisa entender em uma frase o que está errado e resolver em um passo.
- **Gestor** (shell `#/despesas`, desktop): revisa em lote no escritório. Precisa decidir rápido com o comprovante, a leitura da IA e a explicação do motorista lado a lado.

## Ciclo de vida

```
Enviado ──IA valida──────────────────────────────▶ Validado
   │
   └─IA em dúvida─▶ Precisa corrigir (motivo obrigatório, push ao motorista)
                       │
        motorista troca o comprovante ou justifica
                       ▼
                IA reanalisa com a justificativa
                  │                    │
               valida            continua em dúvida
                  ▼                    ▼
              Validado        Aguardando gestor (não volta ao motorista)
                                       │
                                       ▼
              gestor: Validar · Devolver (motivo) · Cancelar (motivo)

Sem resposta do motorista em 3 dias ─▶ Aguardando gestor
```

Regras:
- Toda devolução tem **motivo obrigatório** (`new_motivodevolucao`), seja da IA, seja do gestor. Sem motivo, não devolve.
- **Uma rodada só com o motorista por devolução da IA.** A segunda dúvida vai ao gestor (`new_aguardandogestor = Sim`), para não virar pingue-pongue.
- O gestor **pode devolver de novo**, com motivo próprio: é uma decisão humana, não automática.
- **Não existe "Recusar"**: a despesa ocorreu. "Cancelar" é o fim para lançamento indevido (duplicado, pessoal) e exige motivo. Cancelar despesa do cartão leva a compra para Divergência na conciliação; o diálogo avisa isso.
- O valor fica **travado** para o motorista na correção: ele troca o comprovante ou explica, não muda o valor (evita ajuste pós-fato sem rastro).

## Campos (cr40f_despesaoperacional, entrega A)

| Campo | Tipo | Quem grava |
| --- | --- | --- |
| `new_motivodevolucao` | Memo | IA (texto dos motivos) ou gestor ao devolver/cancelar |
| `new_justificativamotorista` | Memo | App, quando o motorista justifica |
| `new_aguardandogestor` | Sim/Não | IA na 2ª dúvida, escalada de 3 dias; o gestor zera ao decidir |

## Telas

### Gestor, `#/despesas`

- Filtro/visão **"Esperando gestor"** (primeira da lista quando houver itens) e contador no topo.
- No drawer da despesa, um bloco **"Decisão"** acima da ficha, com o motivo da devolução, a justificativa do motorista (citação) e o resumo da IA. Ações: **Validar** (primária), **Devolver**, **Cancelar** (perigo, à direita, separada).
- Devolver/Cancelar abrem um campo de motivo inline (não modal sobre drawer); o botão de confirmação fica desabilitado até haver motivo (mínimo 10 caracteres). Texto do botão diz o efeito: "Devolver ao motorista", "Cancelar despesa".
- Depois de decidir: toast curto ("Despesa validada"), drawer avança para a próxima da visão "Esperando gestor", se houver (revisão em lote sem voltar à lista).
- Drawer: clique fora, X e Esc fecham; com motivo digitado e não enviado, abre "Descartar alterações?" (Continuar editando / Descartar); durante o envio não fecha (padrão de `CadastroAcessoDrawer`).

### Motorista, App (entrega D, repo app-motoristas-v2)

- Lista: a despesa devolvida aparece no topo com selo "Precisa da sua ação" e o motivo em uma linha.
- Ao abrir: motivo em destaque, comprovante atual e duas ações de mesmo peso: **Trocar comprovante** e **Explicar**. Explicar exige texto (mínimo 10 caracteres) e pode vir junto com a troca.
- Ao enviar: "Enviado para nova conferência". O selo vira "Em conferência"; se for ao gestor, "Com o gestor".
- Push na devolução: "Uma despesa precisa da sua ação: <motivo curto>". Um push por devolução, sem lembretes repetidos (a escalada de 3 dias substitui o lembrete).

## Copy (pt-BR, tom Betinhos: claro, sem culpa)

- Motivo da IA vem dos `cr40f_iamotivos`, reescrito para o motorista em frase direta ("O valor do comprovante (R$ 82,00) é diferente do informado (R$ 92,00)."). Nada de "Erro" ou "Inválido". Formato: no máximo 2 frases curtas (~140 caracteres; o Flow corta em 200): 1ª o problema, 2ª o que fazer. Sem mediana, km, comparação com outros lançamentos, contagem de despesas ou nomes de regras antifraude; esses detalhes ficam em `cr40f_iamotivos`, só para o gestor.
- Placeholder de Explicar: "Ex.: o posto emitiu o cupom com o valor errado e corrigiu à mão."
- Gestor ao devolver: placeholder "O que o motorista precisa fazer?".

## Movimento (emil-design-eng)

- Drawer e toast: os do `@betinhos/ui`, sem animação nova.
- Campo de motivo inline: entra com opacity + translateY(4px), 180ms `cubic-bezier(0.23, 1, 0.32, 1)`; sai em 120ms. Sem animar altura.
- Botões: `:active` `scale(0.97)`, 140ms ease-out.
- Avançar para a próxima despesa: troca de conteúdo sem slide (o gestor faz isso dezenas de vezes por dia), só crossfade de 120ms.
- `prefers-reduced-motion`: só opacidade.

## Fora do escopo

- Lembretes repetidos ao motorista.
- Editar valor pelo motorista.
- Cancelar pelo motorista.

## Entregas

- A: schema (este PR).
- B: flow da IA grava o motivo, lê a justificativa, 2ª dúvida → `aguardandogestor`.
- C: shell `#/despesas` (ações e visão "Esperando gestor").
- D: App (tela da devolvida + push).
- E: flow agendado de escalada em 3 dias (flow novo, à mão).
