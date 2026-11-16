// Tela cheia quando o Dataverse recusa a sessão (401/403). Recarregar não apaga nada: a fila de envios
// (IndexedDB `app-motoristas-envio-pendente`) e os rascunhos ficam no aparelho e seguem depois do login.
export function SessaoExpiradaTela() {
  return (
    <div className="sessao-expirada" role="alertdialog" aria-modal="true" aria-labelledby="sessao-expirada-title" aria-describedby="sessao-expirada-text">
      <div className="sessao-expirada-conteudo">
        <h1 id="sessao-expirada-title">Sua sessão da Microsoft expirou</h1>
        <p id="sessao-expirada-text">
          Entre de novo para continuar. Os envios pendentes e o trabalho em andamento ficam guardados neste aparelho e seguem normalmente depois do login.
        </p>
        <button type="button" onClick={() => window.location.reload()}>Entrar de novo</button>
      </div>
    </div>
  );
}
