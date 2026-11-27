# Spec: acessos por papel, encerrar e reativar administrativo, ver como

## Objetivo
Quem administra acessos vê numa tela só quem tem cada perfil. Consegue encerrar e reativar o acesso de um administrativo pela ficha e ver o sistema como a pessoa o veria antes de salvar.

## Fora de escopo
- Revisão periódica de uso (decisão de 27/11/2026).
- Licença e conta Microsoft 365 do administrativo: ficam com a TI.
- Encerrar de motorista: continua no `cr40f_EncerrarAcessoMotorista`, que não muda.
- "Ver como" com os dados da pessoa (impersonação): é só simulação no shell.

## Partes e PRs
1. **PR 1: matriz e encerrar/reativar.**
2. **PR 2: ver como.** Fica empilhado sobre o PR 1.

## Cenários de aceite
Matriz (`#/acessos?visao=papel`, aberta pelo botão "Acessos por papel" em Funcionários, só para o perfil `acessos`):
1. Abrir a tela → uma linha por pessoa ativa com conta. As colunas são Operacional, Financeiro, Frota e RH, com "Operador", "Gestor" ou "—", mais "Admin acessos" e "Amplo" ("Tem" ou "—").
2. Chips "Todos", "Ainda com o amplo", "Só o Base" e "Encerrados", cada um com a contagem. A busca procura por nome ou e-mail.
3. Clicar numa linha com ficha → abre a ficha do funcionário na aba Acesso. Linha sem ficha → abre a gaveta de `#/acessos`.
4. "Encerrados" lista quem tem um encerramento no histórico e a conta bloqueada, com a data. Clicar leva à ficha.
5. Sem o perfil `acessos`, o botão não aparece. Pela URL direta, aparece "Sem acesso a este módulo".

Encerrar (ficha, bloco "Acesso ao sistema", botão "Encerrar acesso…"):

6. Clicar → diálogo com o que a pessoa perde (perfis, amplo e equipes) e o campo do primeiro nome. O botão só libera com o nome certo.
7. Confirmar → a Custom API `cr40f_AcessoEncerrar` faz, numa transação: tira todos os papéis diretos (Base incluído) e os perfis de coluna, tira a pessoa das equipes que dão papel e bloqueia o `systemuser` (`SetState`). Grava em `cr40f_acessohistorico` o antes, o depois vazio e, em `cr40f_amplo`, o JSON `{acao:"encerrar", papeis, equipes}`. O bloco passa a mostrar "Acesso encerrado em <data> por <quem>" e "Reativar com os perfis anteriores".
8. Recusas, sem nada mudar:
   - `PROPRIO_ACESSO`: a pessoa tenta encerrar o próprio acesso.
   - `ULTIMO_ADMIN`: sobrariam menos de 2 pessoas com Administrador do Sistema direto.
   - `SEM_PERMISSAO`: quem chama não tem o perfil Administrador de acessos, ou a pessoa tem o amplo (direto ou por equipe) e quem chama não é Administrador do Sistema. Nesse caso a tela já mostra o botão travado, com o motivo.
   - `CONFIRMACAO_INVALIDA`: o primeiro nome digitado não confere.
   - `JA_ENCERRADO`.
9. Conferência depois de encerrar: o plugin relê. Se sobrou algum papel direto, equipe ou o usuário habilitado, a etapa "conferencia" sai em erro com a lista (mesmo padrão do `EncerrarAcessoHandler`).

Reativar:

10. Clicar → a Custom API `cr40f_AcessoReativar` desbloqueia a pessoa e repõe os papéis, os perfis de coluna e as equipes do último encerramento. Ela usa só linhas de histórico gravadas pelo próprio plugin (`createdby` = conta do plugin, como o `Devolver`) e pula o que não existe mais, avisando. Grava o histórico com `acao:"reativar"`.
11. A mesma regra do amplo vale no reativar: se o encerramento tirou um papel amplo, só o Administrador do Sistema reativa. Sem encerramento a reativar → `NADA_A_REATIVAR`.

Ver como (PR 2):

12. Na ficha, o botão "Ver como esta pessoa" troca o menu e as guardas de rota pelos perfis do editor (rascunho incluído) e mostra o banner "Vendo como <nome> · Sair" em todas as telas. Os dados continuam os de quem vê; nada é gravado.
13. "Sair", Esc no banner ou recarregar a página → volta aos próprios acessos. A simulação não passa para outra aba.
14. Pessoa com o amplo → "Ver como" mostra tudo, com a nota "tem acesso amplo".

## Dados (nomes confirmados no código)
- `cr40f_acessohistorico`: `cr40f_usuario`, `cr40f_alteradopor`, `cr40f_perfisantes`, `cr40f_perfisdepois`, `cr40f_amplo` (memo 4000). Sem schema novo: o `cr40f_amplo` ganha as ações `encerrar` e `reativar`, com o campo `equipes`.
- `systemuser.isdisabled`; papéis em `systemuserroles_association`, perfis de coluna em `systemuserprofiles_association`, equipes em `teammembership_association`.
- Custom APIs novas, `cr40f_AcessoEncerrar` (Usuario, Confirmacao) e `cr40f_AcessoReativar` (Usuario), com resposta `Etapas` em JSON. O registrador do `Cr40f.Acesso.Plugin` cria as duas; o Deploy aplica no DEV.

## Quem depende do que muda
- `HistoricoLista` e `montar()` (`pages/acessos/data/source.ts`) leem o `cr40f_amplo`. As ações novas precisam aparecer como "Encerrado" e "Reativado", sem quebrar o "Devolver".
- `Devolver` do `DefinirPerfisHandler` lê o último `cr40f_amplo`. Ele passa a ignorar `encerrar` e `reativar`.
- A query `PESSOAS` filtra `isdisabled eq false`. Os encerrados vêm do histórico, numa leitura separada, e não entram na lista sem ficha.
- O `corte.mjs`/`relatorio-corte.mjs` do #777 contam pessoas ativas. Encerrado sai da contagem, o que é o esperado.

## Riscos e o que é irreversível
- **O bloqueio pode voltar sozinho** (confiança média, não testado): a sincronização com o Entra tende a reabilitar quem continua com conta ativa e licenciada. Por isso a barreira de verdade é tirar todos os papéis e equipes; o bloqueio é uma camada a mais. A tela avisa: "Peça à TI para desativar a conta Microsoft".
- A checagem de `ULTIMO_ADMIN` não é atômica (achado aceito do #777). Continua igual.
- Reversível pelo Reativar, menos papel ou equipe apagados depois do encerramento.
