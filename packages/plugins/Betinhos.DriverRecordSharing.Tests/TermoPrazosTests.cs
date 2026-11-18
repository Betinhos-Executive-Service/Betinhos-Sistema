using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class TermoPrazosTests
    {
        private static DateTime Utc(string s) => DateTime.SpecifyKind(DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture), DateTimeKind.Utc);
        private static DateTime Dia(string s) => DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture);

        [Fact]
        public void Expira_em_7_dias_quando_o_prazo_e_longe()
            => Assert.Equal(Utc("2026-11-17T12:00:00"), TermoPrazos.ExpiraEm(Utc("2026-11-10T12:00:00"), Dia("2026-12-30")));

        [Fact]
        public void Expira_3_dias_antes_do_prazo_de_indicacao()
            // 00:00 de Brasília de 22/11 = 03:00 UTC.
            => Assert.Equal(Utc("2026-11-22T03:00:00"), TermoPrazos.ExpiraEm(Utc("2026-11-18T12:00:00"), Dia("2026-11-25")));

        [Fact]
        public void Sem_prazo_de_indicacao_vale_os_7_dias()
            => Assert.Equal(Utc("2026-11-25T12:00:00"), TermoPrazos.ExpiraEm(Utc("2026-11-18T12:00:00"), null));

        [Theory]
        [InlineData("2026-11-20", true)]
        [InlineData("2026-11-21", false)]
        public void Prazo_curto_para_enviar(string prazo, bool curto)
            => Assert.Equal(curto, TermoPrazos.PrazoCurtoParaEnviar(Dia(prazo), Dia("2026-11-18")));

        [Theory]
        [InlineData("2026-11-12T11:00:00", null, false)]
        [InlineData("2026-11-12T12:00:00", null, true)]
        [InlineData("2026-11-12T12:00:00", "2026-11-12T12:00:00", false)]
        [InlineData("2026-11-16T12:00:00", "2026-11-12T12:00:00", true)]
        public void Lembrete_do_termo(string agora, string? ultimo, bool lembra)
            => Assert.Equal(lembra, TermoPrazos.LembrarTermo(Utc("2026-11-10T12:00:00"), ultimo == null ? (DateTime?)null : Utc(ultimo), Dia("2026-12-30"), Utc(agora)));

        [Theory]
        [InlineData("2026-11-11", null, false)]
        [InlineData("2026-11-12", null, true)]
        [InlineData("2026-11-13", "2026-11-12", false)]
        [InlineData("2026-11-14", "2026-11-12", true)]
        [InlineData("2026-11-16", "2026-11-14", true)]
        [InlineData("2026-11-20", "2026-11-16", false)]
        public void Lembrete_do_aceite_no_maximo_tres(string hoje, string? ultimo, bool lembra)
            => Assert.Equal(lembra, TermoPrazos.LembrarAceite(Dia("2026-11-10"), ultimo == null ? (DateTime?)null : Dia(ultimo), Dia(hoje)));
    }
}
