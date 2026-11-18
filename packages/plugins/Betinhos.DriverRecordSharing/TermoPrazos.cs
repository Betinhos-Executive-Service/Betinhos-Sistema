using System;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>Prazos do termo de multa e do lembrete do aceite (spec fase 3, secoes 5.2 e 5.4). Puro: sem servico.</summary>
    public static class TermoPrazos
    {
        public const int DiasParaAssinar = 7, MargemAntesDoPrazo = 3, MaxLembretesAceite = 3;

        public static DateTime ExpiraEm(DateTime enviadoEmUtc, DateTime? dataParaIndicar)
        {
            var seteDias = enviadoEmUtc.AddDays(DiasParaAssinar);
            if (dataParaIndicar == null) return seteDias;
            var limiteLocal = DateTime.SpecifyKind(dataParaIndicar.Value.Date.AddDays(-MargemAntesDoPrazo), DateTimeKind.Unspecified);
            var limite = TimeZoneInfo.ConvertTimeToUtc(limiteLocal, TermoMultaCommandPlugin.SaoPaulo());
            return limite < seteDias ? limite : seteDias;
        }

        public static bool Expirou(DateTime enviadoEmUtc, DateTime? dataParaIndicar, DateTime agoraUtc) => agoraUtc >= ExpiraEm(enviadoEmUtc, dataParaIndicar);

        public static bool PrazoCurtoParaEnviar(DateTime? dataParaIndicar, DateTime hoje) =>
            dataParaIndicar != null && (dataParaIndicar.Value.Date - hoje.Date).TotalDays < MargemAntesDoPrazo;

        public static bool LembrarTermo(DateTime enviadoEmUtc, DateTime? ultimoLembreteUtc, DateTime? dataParaIndicar, DateTime agoraUtc)
        {
            if (ultimoLembreteUtc == null) return agoraUtc >= enviadoEmUtc.AddDays(2);
            var vespera = ExpiraEm(enviadoEmUtc, dataParaIndicar).AddDays(-1);
            return agoraUtc >= vespera && agoraUtc - ultimoLembreteUtc.Value >= TimeSpan.FromHours(20);
        }

        public static bool LembrarAceite(DateTime indicacao, DateTime? ultimoLembrete, DateTime hoje)
        {
            var k = ultimoLembrete == null ? 0 : Math.Min(MaxLembretesAceite, (int)Math.Floor((ultimoLembrete.Value.Date - indicacao.Date).TotalDays / 2));
            return k < MaxLembretesAceite && (hoje.Date - indicacao.Date).TotalDays >= 2 * (k + 1);
        }
    }
}
