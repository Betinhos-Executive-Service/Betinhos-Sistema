namespace Cr40f.Financeiro.Plugin;

public static class Codigos
{
    public const string Reserva = "cr40f_reservadeveculos";
    public const string Composicao = "cr40f_composicaodeprecos";
    public const string Op = "cr40f_financeiro";
    public const string Pagante = "cr40f_pagantes";
    public const string Log = "cr40f_sincronizacaofinanceira";

    public const string ReservaFatStatus = "cr40f_statusdefaturamento";
    public const string ReservaOpLookup = "cr40f_financeiro";
    public const string ReservaCpLookup = "new_composicaodepreco";
    public const string CpStatus = "new_status";
    public const string CpValor = "new_valortotal";
    public const string CpReservaLookup = "cr40f_servicorelacionadogeral";
    public const string OpStatus = "cr40f_status";
    public const string OpValor = "cr40f_valor";
    public const string PaganteStatus = "cr40f_status";
    public const string PaganteValor = "cr40f_valor";
    public const string PaganteOpLookup = "cr40f_financeiro";

    public const int OpAberta = 202410000, OpPendente = 100000001, OpParcial = 202410006, OpPaga = 202410003, OpCancelada = 202410004;
    public const int PagPendente = 202410001, PagPago = 202410002, PagCancelado = 202410005, PagAutorizado = 202410007;
    public const int ReservaFatPago = 202410010, ReservaFatPagante = 202410006, ReservaFatMensal = 202410008, ReservaConcluida = 202410008;
    /// <summary>Sem OP (OP cancelada/desvinculada): "Pendente". Com OP ainda viva mas sem pagamento: "Pagamento Pendente" (é o que a Geral grava ao criar OP).</summary>
    public const int ReservaFatPendente = 202410005, ReservaFatPagamentoPendente = 202410007;
    public const int CpPendente = 100000000, CpConcluida = 100000001;
}
