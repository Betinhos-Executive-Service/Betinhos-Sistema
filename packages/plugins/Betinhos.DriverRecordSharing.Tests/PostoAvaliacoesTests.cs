using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class PostoAvaliacoesTests
    {
        private static readonly Guid Eu = Guid.NewGuid();
        private static readonly Guid Posto = Guid.NewGuid();

        private static string Json(object valor) => new JavaScriptSerializer().Serialize(valor);

        private static string Envio(Guid posto, bool recomenda, string[] motivos = null, string comentario = "") =>
            Json(new { postoId = posto.ToString(), recomenda, motivos = motivos ?? new string[0], comentario });

        private static PostoAvaliacoes.Avaliacao Avaliacao(bool recomenda, string comentario = "", bool oculta = false, Guid? motorista = null, int dia = 1, params string[] motivos) =>
            new PostoAvaliacoes.Avaliacao { PostoId = Posto, MotoristaId = motorista ?? Guid.NewGuid(), Autor = "Autor", Recomenda = recomenda, Comentario = comentario, Oculta = oculta, Motivos = motivos, DataUtc = new DateTime(2026, 11, dia, 12, 0, 0, DateTimeKind.Utc) };

        private static Dictionary<string, object> Ler(string json) => new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);

        private static (FuelFakeService service, Guid posto, Guid motorista) Cenario()
        {
            var service = new FuelFakeService();
            var motorista = service.Driver("Motorista Um");
            return (service, service.Posto("11222333000181", "Posto A", -23, -45), motorista);
        }

        [Fact]
        public void Validar_AceitaEnvioCompletoELimpaEspacos()
        {
            var envio = PostoAvaliacoes.Validar(Envio(Posto, true, new[] { "sem_fila", "sem_fila" }, "  Boa  "));
            Assert.Equal(Posto, envio.PostoId);
            Assert.True(envio.Recomenda);
            Assert.Equal(new[] { "sem_fila" }, envio.Motivos);
            Assert.Equal("Boa", envio.Comentario);
        }

        [Theory]
        [InlineData("")]
        [InlineData("nao e json")]
        [InlineData("{\"recomenda\":true}")]
        [InlineData("{\"postoId\":\"11111111-1111-1111-1111-111111111111\"}")]
        public void Validar_RecusaEnvioIncompleto(string json) =>
            Assert.Throws<InvalidPluginExecutionException>(() => PostoAvaliacoes.Validar(json));

        [Fact]
        public void Validar_RecusaMotivoDoSentidoContrario() =>
            Assert.Throws<InvalidPluginExecutionException>(() => PostoAvaliacoes.Validar(Envio(Posto, true, new[] { "fila_grande" })));

        [Fact]
        public void Validar_RecusaComentarioLongo() =>
            Assert.Throws<InvalidPluginExecutionException>(() => PostoAvaliacoes.Validar(Envio(Posto, false, comentario: new string('a', PostoAvaliacoes.MaxComentario + 1))));

        [Fact]
        public void Resumir_ContaVotoOcultoMasEscondeOComentario()
        {
            var resumo = PostoAvaliacoes.Resumir(new[] { Avaliacao(true, "Visível"), Avaliacao(false, "Ofensa", oculta: true) }, Eu);
            Assert.Equal(2, resumo["total"]);
            Assert.Equal(1, resumo["recomendam"]);
            var comentarios = (IEnumerable<Dictionary<string, object>>)resumo["comentarios"];
            Assert.Equal(new[] { "Visível" }, comentarios.Select(c => c["texto"]));
        }

        [Fact]
        public void Resumir_OrdenaMotivosPelaFrequenciaEMostraSoTres()
        {
            var resumo = PostoAvaliacoes.Resumir(new[]
            {
                Avaliacao(true, motivos: new[] { "sem_fila", "local_seguro" }),
                Avaliacao(true, motivos: new[] { "sem_fila", "banheiro_limpo", "bom_atendimento" })
            }, Eu);
            var motivos = (IList<string>)resumo["motivos"];
            Assert.Equal(3, motivos.Count);
            Assert.Equal("sem_fila", motivos[0]);
            Assert.Equal(2, ((Dictionary<string, int>)resumo["contagemMotivos"])["sem_fila"]);
        }

        [Fact]
        public void Resumir_DevolveSoAAvaliacaoDoProprioMotorista()
        {
            Assert.Null(PostoAvaliacoes.Resumir(new[] { Avaliacao(true) }, Eu)["minha"]);
            var minha = (Dictionary<string, object>)PostoAvaliacoes.Resumir(new[] { Avaliacao(true), Avaliacao(false, "Minha", motorista: Eu) }, Eu)["minha"];
            Assert.Equal(false, minha["recomenda"]);
            Assert.Equal("Minha", minha["comentario"]);
        }

        [Fact]
        public void Salvar_GravaOAutorEDevolveOResumo()
        {
            var (service, posto, motorista) = Cenario();
            var resposta = Ler(PostoAvaliacaoPlugin.Salvar(service, motorista, Envio(posto, true, new[] { "sem_fila" }, "Boa"), DateTime.UtcNow));

            var linha = service.Rows(FuelSchema.Avaliacao).Single();
            Assert.Equal("Motorista Um", linha["new_autor"]);
            Assert.Equal("sem_fila", linha["new_motivos"]);
            Assert.Equal(true, resposta["ok"]);
            var avaliacoes = (Dictionary<string, object>)resposta["avaliacoes"];
            Assert.Equal(1, avaliacoes["total"]);
            Assert.NotNull(avaliacoes["minha"]);
        }

        [Fact]
        public void Salvar_AvaliarDeNovoSubstituiEPreservaAOcultacao()
        {
            var (service, posto, motorista) = Cenario();
            PostoAvaliacaoPlugin.Salvar(service, motorista, Envio(posto, true, comentario: "Primeira"), DateTime.UtcNow);
            service.Rows(FuelSchema.Avaliacao).Single()["new_oculta"] = true;

            PostoAvaliacaoPlugin.Salvar(service, motorista, Envio(posto, false, comentario: "Segunda"), DateTime.UtcNow);

            var linha = service.Rows(FuelSchema.Avaliacao).Single();
            Assert.Equal(false, linha["new_recomenda"]);
            Assert.Equal("Segunda", linha["new_comentario"]);
            Assert.Equal(true, linha["new_oculta"]);
        }

        [Fact]
        public void Salvar_MotoristasDiferentesContamSeparado()
        {
            var (service, posto, motorista) = Cenario();
            var outro = service.Driver("Motorista Dois");
            PostoAvaliacaoPlugin.Salvar(service, motorista, Envio(posto, true), DateTime.UtcNow);
            var resposta = Ler(PostoAvaliacaoPlugin.Salvar(service, outro, Envio(posto, false), DateTime.UtcNow));
            Assert.Equal(2, ((Dictionary<string, object>)resposta["avaliacoes"])["total"]);
        }

        [Fact]
        public void Salvar_RecusaPostoInexistente()
        {
            var (service, _, motorista) = Cenario();
            Assert.Throws<InvalidPluginExecutionException>(() => PostoAvaliacaoPlugin.Salvar(service, motorista, Envio(Guid.NewGuid(), true), DateTime.UtcNow));
            Assert.Empty(service.Rows(FuelSchema.Avaliacao));
        }

        [Fact]
        public void Salvar_OcultarNaoMudaADataDaAvaliacao()
        {
            var (service, posto, motorista) = Cenario();
            var quando = new DateTime(2026, 1, 10, 12, 0, 0, DateTimeKind.Utc);
            PostoAvaliacaoPlugin.Salvar(service, motorista, Envio(posto, true), quando);
            var linha = service.Rows(FuelSchema.Avaliacao).Single();
            service.Update(new Entity(FuelSchema.Avaliacao, linha.Id) { ["new_oculta"] = true });

            Assert.Equal(quando, linha["new_avaliadoem"]);
            Assert.Empty(new FuelRepository(service).LoadAvaliacoes(new[] { posto }, quando.AddDays(1)));
        }

        [Fact]
        public void TemTabelaAvaliacoes_RespondeSemConsultarATabela()
        {
            var service = new FuelFakeService { TemTabelaAvaliacoes = false };
            Assert.False(new FuelRepository(service).TemTabelaAvaliacoes());
            service.TemTabelaAvaliacoes = true;
            Assert.True(new FuelRepository(service).TemTabelaAvaliacoes());
        }

        [Fact]
        public void BuildJson_SemAvaliacoesDisponiveisNaoLevaIdParaOAppEsconderOFormulario()
        {
            var entidade = new Entity(FuelSchema.Posto, Posto);
            entidade["new_statusgeo"] = new OptionSetValue(FuelSchema.StatusGeoManual);
            entidade["new_latitude"] = -23m;
            entidade["new_longitude"] = -45m;
            var abastecimento = new FuelRanking.Abastecimento { Cnpj = "11222333000181", Valor = 60m, Litros = 10m, Nome = "Posto", DataUtc = new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc) };

            var json = Ler(FuelRankingPlugin.BuildJson(new[] { abastecimento }, new Dictionary<string, Entity> { ["11222333000181"] = entidade }));

            var posto = (Dictionary<string, object>)((System.Collections.ArrayList)json["postos"])[0];
            Assert.Null(posto["postoId"]);
            Assert.Null(posto["avaliacoes"]);
        }

        private const string CnpjConvite = "11222333000181";
        private static readonly DateTime Agora = new DateTime(2026, 11, 6, 12, 0, 0, DateTimeKind.Utc);
        private static readonly Dictionary<string, Guid> PostosConvite = new Dictionary<string, Guid> { [CnpjConvite] = Posto };

        private static FuelRanking.Abastecimento DoMotorista(Guid motorista, int diasAtras) =>
            new FuelRanking.Abastecimento { Cnpj = CnpjConvite, Valor = 60m, Litros = 10m, Nome = "Posto A", MotoristaId = motorista, DataUtc = Agora.AddDays(-diasAtras) };

        [Fact]
        public void Convite_TrazOPostoDoAbastecimentoRecente()
        {
            var convite = FuelRanking.Convite(new[] { DoMotorista(Eu, 2), DoMotorista(Eu, 5) }, PostosConvite, new Guid[0], Eu, Agora);
            Assert.Equal(Posto.ToString(), convite["postoId"]);
            Assert.Equal("Posto A", convite["nome"]);
            Assert.Equal(FuelRepository.LocalDay(Agora.AddDays(-2)), convite["data"]);
        }

        [Fact]
        public void Convite_IgnoraOutroMotoristaAbastecimentoAntigoEPostoJaAvaliado()
        {
            Assert.Null(FuelRanking.Convite(new[] { DoMotorista(Guid.NewGuid(), 1) }, PostosConvite, new Guid[0], Eu, Agora));
            Assert.Null(FuelRanking.Convite(new[] { DoMotorista(Eu, 8) }, PostosConvite, new Guid[0], Eu, Agora));
            Assert.Null(FuelRanking.Convite(new[] { DoMotorista(Eu, 1) }, PostosConvite, new[] { Posto }, Eu, Agora));
            Assert.Null(FuelRanking.Convite(new[] { DoMotorista(Eu, 1) }, new Dictionary<string, Guid>(), new Guid[0], Eu, Agora));
        }

        [Fact]
        public void BuildJson_SemAvaliacoesNaoConvida()
        {
            var entidade = new Entity(FuelSchema.Posto, Posto);
            var json = Ler(FuelRankingPlugin.BuildJson(new[] { DoMotorista(Eu, 1) }, new Dictionary<string, Entity> { [CnpjConvite] = entidade }, null, Eu, Agora));
            Assert.Null(json["convite"]);
        }

        [Fact]
        public void BuildJson_LevaIdEAvaliacoesDoPosto()
        {
            var entidade = new Entity(FuelSchema.Posto, Posto);
            entidade["new_statusgeo"] = new OptionSetValue(FuelSchema.StatusGeoManual);
            entidade["new_latitude"] = -23m;
            entidade["new_longitude"] = -45m;
            var abastecimento = new FuelRanking.Abastecimento { Cnpj = "11222333000181", Valor = 60m, Litros = 10m, Nome = "Posto", DataUtc = new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc) };

            var json = Ler(FuelRankingPlugin.BuildJson(new[] { abastecimento }, new Dictionary<string, Entity> { ["11222333000181"] = entidade }, new[] { Avaliacao(true) }, Eu));

            var posto = (Dictionary<string, object>)((System.Collections.ArrayList)json["postos"])[0];
            Assert.Equal(Posto.ToString(), posto["postoId"]);
            Assert.Equal(1, ((Dictionary<string, object>)posto["avaliacoes"])["total"]);
        }
    }
}
