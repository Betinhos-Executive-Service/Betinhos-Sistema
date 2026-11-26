using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;
using Scenario = Betinhos.DriverRecordSharing.Tests.TermoMultaCommandPluginTests.Scenario;

namespace Betinhos.DriverRecordSharing.Tests
{
    /// <summary>O motorista gera o próprio aditivo e devolve assinado no gov.br; o servidor certifica sozinho.</summary>
    public sealed class AditivoMotoristaTests
    {
        private static readonly Dictionary<string, object> SemEntradas = new Dictionary<string, object>();

        private sealed class Mundo
        {
            public readonly Scenario S = TermoMultaCommandPluginTests.Cenario();
            public readonly GovBrFalso.Par Ac = GovBrFalso.NovaAc("AC DE TESTE", new DateTime(2020, 6, 17), new DateTime(2033, 6, 9));
            public GovBrFalso.Par Signatario;
            public IList<byte[]> Acs;

            public Mundo(string cpfDoAssinante = GovBrFalso.CpfFicticio)
            {
                S.Motorista.Attributes.Remove("new_aditivoassinaturaem");
                S.Motorista.Attributes.Remove("new_aditivoassinatura");
                Signatario = GovBrFalso.NovoSignatario(Ac, cpfDoAssinante, new DateTime(2026, 1, 1), new DateTime(2027, 1, 1));
                Acs = new List<byte[]> { Ac.Der };
            }

            public byte[] Gerar(Guid? user = null, Dictionary<string, object> entradas = null) =>
                Convert.FromBase64String((string)TermoMultaCommandPluginTests.Run(S, "new_GerarMeuAditivo", user ?? S.MotoristaUser.Id, entradas ?? SemEntradas, Acs).OutputParameters["new_PdfBase64"]);

            public byte[] Assinado(byte[] gerado, GovBrFalso.Opcoes o = null) => GovBrFalso.AssinarPdf(gerado, Ac, Signatario, o);

            public void Registrar(byte[] pdf, Guid? user = null, Dictionary<string, object> entradas = null, IList<byte[]> acs = null)
            {
                var inputs = new Dictionary<string, object>(entradas ?? SemEntradas) { ["new_PdfBase64"] = Convert.ToBase64String(pdf) };
                TermoMultaCommandPluginTests.Run(S, "new_RegistrarMeuAditivo", user ?? S.MotoristaUser.Id, inputs, acs ?? Acs);
            }

            public string Recusa(byte[] pdf, Guid? user = null, IList<byte[]> acs = null) =>
                Assert.Throws<InvalidPluginExecutionException>(() => Registrar(pdf, user, null, acs)).Message;
        }

        [Fact]
        public void GerarMeuAditivoDevolveOPdfDoProprioMotoristaSemAceitarFuncionarioId()
        {
            var m = new Mundo();
            var outro = m.S.Add(new Entity("cr40f_funcionarios") { ["cr40f_nomecompleto"] = "Maria Outra", ["cr40f_numerodocpf"] = "111.444.777-35", ["cr40f_emailmicrosoft"] = "maria@empresa.test", ["statecode"] = new OptionSetValue(0) });
            m.S.Add(new Entity("systemuser") { ["internalemailaddress"] = "maria@empresa.test", ["isdisabled"] = false });

            var meu = m.Gerar();
            var comIdDoOutro = m.Gerar(entradas: new Dictionary<string, object> { ["new_FuncionarioId"] = outro.Id });
            var ctx = TermoMultaCommandPluginTests.Run(m.S, "new_GerarMeuAditivo", m.S.MotoristaUser.Id, SemEntradas, m.Acs);

            Assert.Equal(meu, comIdDoOutro); // FuncionarioId é ignorado
            Assert.Equal("aditivo-joao-motorista-a1.pdf", ctx.OutputParameters["new_NomeArquivo"]);
            // o aditivo da outra pessoa é outro arquivo
            m.S.Privilegiados.Add(m.S.Gestor);
            var dela = Convert.FromBase64String((string)TermoMultaCommandPluginTests.Run(m.S, "new_GerarAditivoMotorista", m.S.Gestor, new Dictionary<string, object> { ["new_FuncionarioId"] = outro.Id }).OutputParameters["new_PdfBase64"]);
            Assert.NotEqual(meu, dela);
        }

        [Fact]
        public void RegistrarComPdfValidoLiberaGravaOArquivoEADataDeSaoPaulo()
        {
            var m = new Mundo();
            var pdf = m.Assinado(m.Gerar());

            m.Registrar(pdf);

            Assert.Equal("new_aditivoassinatura", m.S.ColunaDoUpload);
            Assert.Equal(pdf, m.S.UploadedPdf);
            Assert.Equal(new DateTime(2026, 10, 22, 12, 0, 0, DateTimeKind.Utc), m.S.Motorista.GetAttributeValue<DateTime>("new_aditivoassinaturaem"));
        }

        [Fact]
        public void ConsultarAditivoViraVerdadeiroDepoisDoRegistro()
        {
            var m = new Mundo();
            Assert.False((bool)TermoMultaCommandPluginTests.Run(m.S, "new_ConsultarAditivoMotorista", m.S.MotoristaUser.Id, SemEntradas, m.Acs).OutputParameters["new_TemAditivo"]);
            m.Registrar(m.Assinado(m.Gerar()));
            m.S.Motorista["new_aditivoassinatura"] = Guid.NewGuid(); // o upload real preenche a coluna de arquivo
            Assert.True((bool)TermoMultaCommandPluginTests.Run(m.S, "new_ConsultarAditivoMotorista", m.S.MotoristaUser.Id, SemEntradas, m.Acs).OutputParameters["new_TemAditivo"]);
        }

        [Fact]
        public void RegistrarComAditivoJaExistenteRespondeSucessoSemRegravar()
        {
            var m = new Mundo();
            m.S.Motorista["new_aditivoassinaturaem"] = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);
            m.S.Motorista["new_aditivoassinatura"] = Guid.NewGuid();

            m.Registrar(new byte[] { 1, 2, 3 }); // nem sequer é conferido: já está registrado

            Assert.Null(m.S.UploadedPdf);
            Assert.Equal(new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc), m.S.Motorista.GetAttributeValue<DateTime>("new_aditivoassinaturaem"));
        }

        [Fact]
        public void CpfDiferenteDoCadastroRecusaSemRevelarCpf()
        {
            var m = new Mundo("11144477735");
            var erro = m.Recusa(m.Assinado(m.Gerar()));
            Assert.Equal("O CPF de quem assinou não é o do seu cadastro. Assine com a sua própria conta gov.br.", erro);
            SemDadoPessoal(m, erro);
            Assert.Null(m.S.UploadedPdf);
            Assert.False(m.S.Motorista.Contains("new_aditivoassinaturaem"));
        }

        [Fact]
        public void AcNaoConfiavelRecusa()
        {
            var m = new Mundo();
            var erro = m.Recusa(m.Assinado(m.Gerar()), acs: new List<byte[]> { GovBrFalso.NovaAc("OUTRA AC", new DateTime(2020, 1, 1), new DateTime(2033, 1, 1)).Der });
            Assert.Equal(AssinaturaGovBr.ErroNaoGovBr, erro);
            Assert.Null(m.S.UploadedPdf);
        }

        [Fact]
        public void PdfAlteradoDepoisDeAssinarRecusa()
        {
            var m = new Mundo();
            var pdf = m.Assinado(m.Gerar());
            pdf[pdf.Length - 3] ^= 0x01; // depois da lacuna do /Contents, dentro do ByteRange
            Assert.Equal(AssinaturaGovBr.ErroAlterado, m.Recusa(pdf));
            Assert.Null(m.S.UploadedPdf);
        }

        [Fact]
        public void MessageDigestErradoRecusa()
        {
            var m = new Mundo();
            Assert.Equal(AssinaturaGovBr.ErroAlterado, m.Recusa(m.Assinado(m.Gerar(), new GovBrFalso.Opcoes { MessageDigestErrado = true })));
        }

        [Fact]
        public void PdfSemAssinaturaRecusa()
        {
            var m = new Mundo();
            var gerado = m.Gerar();
            Assert.Equal(AssinaturaGovBr.ErroSemAssinatura, m.Recusa(gerado.Concat(System.Text.Encoding.ASCII.GetBytes("\n%%EOF\n")).ToArray()));
        }

        [Fact]
        public void CmsEmBerComComprimentoIndefinidoValeEDerDefinidoTambem()
        {
            var m = new Mundo();
            m.Registrar(m.Assinado(m.Gerar(), new GovBrFalso.Opcoes { ComprimentoDefinido = false }));
            Assert.NotNull(m.S.UploadedPdf);

            var m2 = new Mundo();
            m2.Registrar(m2.Assinado(m2.Gerar(), new GovBrFalso.Opcoes { ComprimentoDefinido = true }));
            Assert.NotNull(m2.S.UploadedPdf);
        }

        [Fact]
        public void MotoristaANuncaRegistraOAditivoDeB()
        {
            var m = new Mundo();
            var b = m.S.Add(new Entity("cr40f_funcionarios") { ["cr40f_nomecompleto"] = "Maria Outra", ["cr40f_numerodocpf"] = "111.444.777-35", ["cr40f_emailmicrosoft"] = "maria@empresa.test", ["statecode"] = new OptionSetValue(0) });
            var userB = m.S.Add(new Entity("systemuser") { ["internalemailaddress"] = "maria@empresa.test", ["isdisabled"] = false });
            m.S.Privilegiados.Add(m.S.Gestor);
            var deB = Convert.FromBase64String((string)TermoMultaCommandPluginTests.Run(m.S, "new_GerarAditivoMotorista", m.S.Gestor, new Dictionary<string, object> { ["new_FuncionarioId"] = b.Id }).OutputParameters["new_PdfBase64"]);
            var assinadoDeB = m.Assinado(deB); // até com o CPF "certo" para o signatário de teste, o arquivo é do B

            var erro = m.Recusa(assinadoDeB); // quem chama é o motorista A

            Assert.Equal("Este PDF não é o seu aditivo. Baixe o aditivo no App, assine no gov.br e envie o arquivo devolvido.", erro);
            Assert.Null(m.S.UploadedPdf);
            Assert.False(m.S.Motorista.Contains("new_aditivoassinaturaem"));
            Assert.False(b.Contains("new_aditivoassinaturaem"));
            // e A, mesmo mandando o FuncionarioId de B, só mexe no próprio registro
            m.Registrar(m.Assinado(m.Gerar()), entradas: new Dictionary<string, object> { ["new_FuncionarioId"] = b.Id });
            Assert.True(m.S.Motorista.Contains("new_aditivoassinaturaem"));
            Assert.False(b.Contains("new_aditivoassinaturaem"));
            Assert.NotEqual(userB.Id, m.S.MotoristaUser.Id);
        }

        [Fact]
        public void QuemNaoEMotoristaNaoGeraNemRegistra()
        {
            var m = new Mundo();
            Assert.Equal("Não encontramos o seu cadastro de motorista. Procure o escritório.", Assert.Throws<InvalidPluginExecutionException>(() => m.Gerar(m.S.Gestor)).Message);
        }

        [Fact]
        public void TextoProvisorioRecusa()
        {
            var m = new Mundo();
            m.S.Rows("new_textotermomulta").First(r => r.GetAttributeValue<string>("new_versao") == "a1")["new_versao"] = "v0-placeholder";
            Assert.Equal("O texto do aditivo ainda é provisório.",
                Assert.Throws<InvalidPluginExecutionException>(() => m.Gerar()).Message);
        }

        [Fact]
        public void MultasDesligadoRecusaGerarERegistrar()
        {
            var m = new Mundo();
            var gerado = m.Gerar();
            TermoMultaCommandPluginTests.DesligarMultas(m.S);
            Assert.Equal("Multas não está disponível no seu App no momento. Procure o escritório.", Assert.Throws<InvalidPluginExecutionException>(() => m.Gerar()).Message);
            Assert.Equal("Multas não está disponível no seu App no momento. Procure o escritório.", m.Recusa(m.Assinado(gerado)));
        }

        [Fact]
        public void CadastroSemCpfRecusaJaAoGerarEAoRegistrar()
        {
            var m = new Mundo();
            var gerado = m.Gerar();
            m.S.Motorista.Attributes.Remove("cr40f_numerodocpf");
            const string msg = "Seu cadastro está sem CPF válido. Procure o escritório.";
            Assert.Equal(msg, Assert.Throws<InvalidPluginExecutionException>(() => m.Gerar()).Message);
            Assert.Equal(msg, m.Recusa(m.Assinado(gerado)));
        }

        [Fact]
        public void RevisaoNoFormatoDoAssinadorPassaPelaConferenciaDoAcrescimo()
        {
            var m = new Mundo();
            var gerado = m.Gerar();
            Assert.Null(AcrescimoPdf.Conferir(m.Assinado(gerado), gerado));
        }

        [Theory]
        [InlineData((int)GovBrFalso.Defeito.ConteudoTrocado)]
        [InlineData((int)GovBrFalso.Defeito.RecursosTrocados)]
        [InlineData((int)GovBrFalso.Defeito.PagesReescrito)]
        [InlineData((int)GovBrFalso.Defeito.FonteReescrita)]
        [InlineData((int)GovBrFalso.Defeito.ObjStm)]
        [InlineData((int)GovBrFalso.Defeito.XRefStream)]
        [InlineData((int)GovBrFalso.Defeito.Grande)]
        [InlineData((int)GovBrFalso.Defeito.RootDiferente)]
        [InlineData((int)GovBrFalso.Defeito.EntradaLivre)]
        [InlineData((int)GovBrFalso.Defeito.SemPrev)]
        [InlineData((int)GovBrFalso.Defeito.PrevErrado)]
        [InlineData((int)GovBrFalso.Defeito.CatalogoOutroPages)]
        [InlineData((int)GovBrFalso.Defeito.XRefStm)]
        public void RevisaoQueMexeNoTextoOuForaDoFormatoRecusa(int defeitoNumero)
        {
            var m = new Mundo();
            var gerado = m.Gerar();
            var assinado = m.Assinado(gerado, new GovBrFalso.Opcoes { Defeito = (GovBrFalso.Defeito)defeitoNumero });
            Assert.Equal(AcrescimoPdf.Erro, m.Recusa(assinado)); // assinatura e CPF são válidos: só a integridade recusa
            Assert.Null(m.S.UploadedPdf);
        }

        [Fact]
        public void LimiteDe5MbEVerificadoAntesDeDecodificar()
        {
            var m = new Mundo();
            Assert.Equal("O PDF passa de 5 MB.", m.Recusa(new byte[AditivoPdf.MaxBytes + 1]));
        }

        [Fact]
        public void FluxoDaGestaoContinuaIgual_SemExigirCadeiaGovBr()
        {
            var m = new Mundo();
            m.S.Privilegiados.Add(m.S.Gestor);
            var entradas = new Dictionary<string, object> { ["new_FuncionarioId"] = m.S.Motorista.Id };
            var gerado = Convert.FromBase64String((string)TermoMultaCommandPluginTests.Run(m.S, "new_GerarAditivoMotorista", m.S.Gestor, entradas).OutputParameters["new_PdfBase64"]);
            var falso = gerado.Concat(System.Text.Encoding.ASCII.GetBytes("\n<< /Type /Sig /ByteRange [0 10 20 30] >>\n%%EOF\n")).ToArray();
            entradas["new_PdfBase64"] = Convert.ToBase64String(falso);
            entradas["new_AssinadoEm"] = new DateTime(2026, 10, 21);

            TermoMultaCommandPluginTests.Run(m.S, "new_RegistrarAditivoMotorista", m.S.Gestor, entradas);

            Assert.Equal(falso, m.S.UploadedPdf);
        }

        private static void SemDadoPessoal(Mundo m, string mensagem)
        {
            foreach (var proibido in new[] { GovBrFalso.CpfFicticio, "123.456.789-00", "FULANO", "João", "joao@empresa.test" })
            {
                Assert.DoesNotContain(proibido, mensagem);
                Assert.DoesNotContain(m.S.Traces, t => t.Contains(proibido));
            }
        }
    }
}
