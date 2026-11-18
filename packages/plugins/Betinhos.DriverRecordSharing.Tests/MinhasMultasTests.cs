using System;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class MinhasMultasTests
    {
        private static readonly DateTime Hoje = new DateTime(2026, 11, 18);
        private static LinhaMinhaMulta Linha(int status, Action<LinhaMinhaMulta>? ajuste = null)
        {
            var l = new LinhaMinhaMulta { Id = Guid.NewGuid(), Auto = "A000000001", Placa = "TST1A23", Status = status, Responsavel = 100000000, DataHora = new DateTime(2026, 11, 5, 17, 30, 0, DateTimeKind.Utc) };
            ajuste?.Invoke(l);
            return l;
        }

        [Fact]
        public void Etapa1_sem_contestacao_nao_aparece()
            => Assert.Empty(MinhasMultas.Montar(new[] { Linha(202410000) }, Hoje));

        [Fact]
        public void Termo_pendente_precisa_de_voce()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410004, l => { l.TermoVigenteId = Guid.NewGuid(); l.TermoVigenteStatus = 100000000; }) }, Hoje));
            Assert.Equal(("precisa", "assinar", "Assine o termo da multa"), (m.Grupo, m.Acao, m.Situacao));
        }

        [Fact]
        public void Aceite_pendente_precisa_de_voce_com_prazo()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410004, l => { l.Canal = 100000000; l.DataIndicacao = new DateTime(2026, 11, 12); l.DataParaIndicar = new DateTime(2026, 11, 28); }) }, Hoje));
            Assert.Equal(("precisa", "aceite", "2026-11-28"), (m.Grupo, m.Acao, m.PrazoAceite));
        }

        [Fact]
        public void Aceite_declarado_vai_para_andamento()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410004, l => { l.Canal = 100000000; l.DataIndicacao = new DateTime(2026, 11, 12); l.AceiteDeclaradoEm = new DateTime(2026, 11, 14); }) }, Hoje));
            Assert.Equal(("andamento", "Aceite em conferência"), (m.Grupo, m.Situacao));
        }

        [Fact]
        public void Contestada_aparece_em_analise()
            => Assert.Equal("Contestação em análise", Assert.Single(MinhasMultas.Montar(new[] { Linha(202410000, l => l.ContestadaEm = new DateTime(2026, 11, 16)) }, Hoje)).Situacao);

        [Fact]
        public void Descontando_conta_as_parcelas()
        {
            var m = Assert.Single(MinhasMultas.Montar(new[] { Linha(202410005, l => { l.EncerradaEm = new DateTime(2026, 11, 10); l.Parcelas.Add(new MinhaParcela { Numero = 1, Competencia = "2026-11-01", Valor = 65.08m, Status = "descontada" }); l.Parcelas.Add(new MinhaParcela { Numero = 2, Competencia = "2026-12-01", Valor = 65.08m, Status = "prevista" }); }) }, Hoje));
            Assert.Equal(("andamento", "Descontando 1 de 2"), (m.Grupo, m.Situacao));
        }

        [Fact]
        public void Encerrada_ha_mais_de_12_meses_some()
            => Assert.Empty(MinhasMultas.Montar(new[] { Linha(202410005, l => l.EncerradaEm = new DateTime(2025, 11, 17)) }, Hoje));

        [Fact]
        public void Empresa_assumiu_so_no_historico()
        {
            var r = MinhasMultas.Montar(new[] {
                Linha(202410001, l => l.Responsavel = 100000001),
                Linha(202410005, l => { l.Responsavel = 100000001; l.DataAviso = new DateTime(2026, 11, 1); l.EncerradaEm = new DateTime(2026, 11, 15); }) }, Hoje);
            var m = Assert.Single(r);
            Assert.Equal(("encerrada", "Empresa assumiu"), (m.Grupo, m.Situacao));
        }

        [Fact]
        public void Ordem_dos_grupos()
        {
            var r = MinhasMultas.Montar(new[] {
                Linha(202410005, l => l.EncerradaEm = new DateTime(2026, 11, 1)),
                Linha(202410001),
                Linha(202410004, l => { l.TermoVigenteId = Guid.NewGuid(); l.TermoVigenteStatus = 100000000; }) }, Hoje);
            Assert.Equal(new[] { "precisa", "andamento", "encerrada" }, r.Select(m => m.Grupo));
        }
    }
}
