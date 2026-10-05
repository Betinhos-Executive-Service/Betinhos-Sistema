/* Botão "Escala FDS" da grade de Reservas de Veículos: abre a escala de fim de semana em painel lateral. */
var Betinhos = window.Betinhos || {};
Betinhos.EscalaFds = {
  open: function () {
    return Xrm.Navigation.navigateTo(
      { pageType: "webresource", webresourceName: "cr40f_EscalaFDS.html" },
      { target: 2, position: 2, width: { value: 520, unit: "px" }, title: "Escala fim de semana" }
    );
  }
};
window.Betinhos = Betinhos;
