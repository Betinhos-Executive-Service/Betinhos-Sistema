using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class AssinaturaGovBrTests
    {
        private static readonly DateTime Agora = new DateTime(2026, 10, 22, 15, 0, 0, DateTimeKind.Utc);
        private static readonly byte[] Gerado = Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

        private sealed class Mundo
        {
            public GovBrFalso.Par Ac = GovBrFalso.NovaAc("AC DE TESTE", new DateTime(2020, 6, 17), new DateTime(2033, 6, 9));
            public GovBrFalso.Par Signatario;
            public Mundo(string cpf = GovBrFalso.CpfFicticio, DateTime? de = null, DateTime? ate = null) =>
                Signatario = GovBrFalso.NovoSignatario(Ac, cpf, de ?? new DateTime(2026, 1, 1), ate ?? new DateTime(2027, 1, 1));
            public IList<byte[]> Acs => new List<byte[]> { Ac.Der };
            public byte[] Pdf(GovBrFalso.Opcoes o = null) => GovBrFalso.AssinarPdf(Gerado, Ac, Signatario, o);
        }

        [Fact]
        public void AssinaturaValidaDevolveOCpfSoComDigitos()
        {
            var m = new Mundo();
            var r = AssinaturaGovBr.Verificar(m.Pdf(), Gerado.Length, m.Acs, Agora);
            Assert.Null(r.Erro);
            Assert.Equal(GovBrFalso.CpfFicticio, r.Cpf);
            Assert.Equal(new DateTime(2026, 10, 22, 14, 0, 0, DateTimeKind.Utc), r.AssinadoEmUtc);
        }

        [Fact]
        public void CmsEmDerComComprimentoDefinidoTambemValeNoMesmoCaminho()
        {
            var m = new Mundo();
            Assert.Null(AssinaturaGovBr.Verificar(m.Pdf(new GovBrFalso.Opcoes { ComprimentoDefinido = true }), Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void AcQueNaoEConfiavelRecusa()
        {
            var m = new Mundo();
            var outra = new List<byte[]> { GovBrFalso.NovaAc("AC DE TESTE", new DateTime(2020, 6, 17), new DateTime(2033, 6, 9)).Der };
            Assert.Equal(AssinaturaGovBr.ErroNaoGovBr, AssinaturaGovBr.Verificar(m.Pdf(), Gerado.Length, outra, Agora).Erro);
        }

        [Fact]
        public void AcFinalDoGovBrEmbutidaLeEntraNaListaPadrao()
        {
            var m = new Mundo();
            var acs = AssinaturaGovBr.AcsGovBr();
            Assert.Single(acs);
            // Cert.Ler da AC real não pode falhar: o certificado de teste não foi emitido por ela, então o resultado é "não é do gov.br", não "ilegível".
            Assert.Equal(AssinaturaGovBr.ErroNaoGovBr, AssinaturaGovBr.Verificar(m.Pdf(), Gerado.Length, acs, Agora).Erro);
        }

        [Fact]
        public void AcFinalEmbutidaTemAImpressaoDigitalPublicadaPeloIti()
        {
            using (var sha = System.Security.Cryptography.SHA256.Create())
                Assert.Equal("96BB5C41859FC51D88F305517BE641D9EF4A5D601B1BB2352E7161E97FF8B852",
                    BitConverter.ToString(sha.ComputeHash(AssinaturaGovBr.AcsGovBr()[0])).Replace("-", ""));
        }

        [Fact]
        public void PdfAlteradoDepoisDeAssinarRecusa()
        {
            var m = new Mundo();
            var pdf = m.Pdf();
            pdf[10] ^= 0x01; // byte coberto pelo ByteRange
            Assert.Equal(AssinaturaGovBr.ErroAlterado, AssinaturaGovBr.Verificar(pdf, Gerado.Length, m.Acs, Agora).Erro);
            var maisBytes = m.Pdf().Concat(Encoding.ASCII.GetBytes("\n% extra\n")).ToArray(); // revisão acrescentada depois
            Assert.Equal(AssinaturaGovBr.ErroAlterado, AssinaturaGovBr.Verificar(maisBytes, Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void MessageDigestErradoRecusa()
        {
            var m = new Mundo();
            Assert.Equal(AssinaturaGovBr.ErroAlterado, AssinaturaGovBr.Verificar(m.Pdf(new GovBrFalso.Opcoes { MessageDigestErrado = true }), Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void PdfSemAssinaturaRecusa()
        {
            var m = new Mundo();
            Assert.Equal(AssinaturaGovBr.ErroSemAssinatura, AssinaturaGovBr.Verificar(Gerado.Concat(Encoding.ASCII.GetBytes("\n%%EOF\n")).ToArray(), Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void CertificadoForaDaValidadeNaDataDaAssinaturaRecusa()
        {
            var m = new Mundo(de: new DateTime(2026, 11, 1), ate: new DateTime(2027, 1, 1));
            Assert.Equal(AssinaturaGovBr.ErroValidade, AssinaturaGovBr.Verificar(m.Pdf(), Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void DataDeAssinaturaNoFuturoRecusa()
        {
            var m = new Mundo();
            var pdf = m.Pdf(new GovBrFalso.Opcoes { SigningTime = Agora.AddHours(2) });
            Assert.Equal(AssinaturaGovBr.ErroFuturo, AssinaturaGovBr.Verificar(pdf, Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void ValidadeVaiContraORelogioDoServidorENaoContraOSigningTime()
        {
            // signingTime anterior ao início do certificado: antes recusava; agora só o relógio do servidor conta
            var m = new Mundo();
            var antigo = m.Pdf(new GovBrFalso.Opcoes { SigningTime = new DateTime(2025, 6, 1, 12, 0, 0, DateTimeKind.Utc) });
            Assert.Null(AssinaturaGovBr.Verificar(antigo, Gerado.Length, m.Acs, Agora).Erro);
            // certificado vencido hoje, mesmo com signingTime dentro da validade
            var vencido = new Mundo(de: new DateTime(2026, 1, 1), ate: new DateTime(2026, 10, 1));
            var pdf = vencido.Pdf(new GovBrFalso.Opcoes { SigningTime = new DateTime(2026, 9, 1, 12, 0, 0, DateTimeKind.Utc) });
            Assert.Equal(AssinaturaGovBr.ErroValidade, AssinaturaGovBr.Verificar(pdf, Gerado.Length, vencido.Acs, Agora).Erro);
        }

        [Fact]
        public void CadeiaEConferidaAntesDaContaRsaDosAtributos()
        {
            var m = new Mundo();
            var outraAc = GovBrFalso.NovaAc("OUTRA AC", new DateTime(2020, 6, 17), new DateTime(2033, 6, 9));
            var estranho = GovBrFalso.NovoSignatario(outraAc, GovBrFalso.CpfFicticio, new DateTime(2026, 1, 1), new DateTime(2027, 1, 1));
            var pdf = GovBrFalso.AssinarPdf(Gerado, outraAc, estranho, new GovBrFalso.Opcoes { ChaveDosAtributos = GovBrFalso.NovaChave() });
            // fora da AC fixada recusa pela cadeia, sem chegar à assinatura dos atributos (que está errada)
            Assert.Equal(AssinaturaGovBr.ErroNaoGovBr, AssinaturaGovBr.Verificar(pdf, Gerado.Length, m.Acs, Agora).Erro);
            // na cadeia certa, a assinatura errada dos atributos continua sendo "alterado"
            var certo = m.Pdf(new GovBrFalso.Opcoes { ChaveDosAtributos = GovBrFalso.NovaChave() });
            Assert.Equal(AssinaturaGovBr.ErroAlterado, AssinaturaGovBr.Verificar(certo, Gerado.Length, m.Acs, Agora).Erro);
        }

        [Fact]
        public void ModuloAcimaDe4096BitsOuExpoenteAcimaDe32BitsRecusa()
        {
            var m = new Mundo();
            var grande = new byte[513]; grande[0] = 0x80; grande[512] = 1;
            var modulo = GovBrFalso.NovoSignatario(m.Ac, GovBrFalso.CpfFicticio, new DateTime(2026, 1, 1), new DateTime(2027, 1, 1), 78,
                new RSAParameters { Modulus = grande, Exponent = new byte[] { 1, 0, 1 } });
            Assert.Equal(AssinaturaGovBr.ErroIlegivel, AssinaturaGovBr.Verificar(GovBrFalso.AssinarPdf(Gerado, m.Ac, modulo), Gerado.Length, m.Acs, Agora).Erro);

            var normal = new byte[256]; normal[0] = 0x80; normal[255] = 1;
            var expoente = GovBrFalso.NovoSignatario(m.Ac, GovBrFalso.CpfFicticio, new DateTime(2026, 1, 1), new DateTime(2027, 1, 1), 79,
                new RSAParameters { Modulus = normal, Exponent = new byte[] { 1, 0, 0, 0, 1 } });
            Assert.Equal(AssinaturaGovBr.ErroIlegivel, AssinaturaGovBr.Verificar(GovBrFalso.AssinarPdf(Gerado, m.Ac, expoente), Gerado.Length, m.Acs, Agora).Erro);
        }

        private sealed class Rastro : ITracingService
        {
            public readonly List<string> Linhas = new List<string>();
            public void Trace(string format, params object[] args) => Linhas.Add(args == null || args.Length == 0 ? format : string.Format(format, args));
        }

        [Fact]
        public void NoCatchGenericoOTraceLevaSoOTipoDaExcecao()
        {
            var m = new Mundo();
            var pdf = m.Pdf();
            var texto = Encoding.ASCII.GetString(pdf);
            var ini = texto.IndexOf("/Contents <", StringComparison.Ordinal) + "/Contents <".Length;
            for (var i = 0; i < 40; i++) pdf[ini + i * 3] = (byte)'f';
            var rastro = new Rastro();
            var r = AssinaturaGovBr.Verificar(pdf, Gerado.Length, m.Acs, Agora, rastro);
            Assert.Equal(AssinaturaGovBr.ErroIlegivel, r.Erro);
            var linha = Assert.Single(rastro.Linhas);
            Assert.Contains("Exception", linha);
            Assert.DoesNotContain(GovBrFalso.CpfFicticio, linha);
            Assert.DoesNotContain(new string('f', 6), linha);
        }

        [Fact]
        public void EstruturaMalformadaNuncaLancaEDaMensagemSemDetalhe()
        {
            var m = new Mundo();
            var pdf = m.Pdf();
            var texto = Encoding.ASCII.GetString(pdf);
            var ini = texto.IndexOf("/Contents <", StringComparison.Ordinal) + "/Contents <".Length;
            for (var i = 0; i < 40; i++) pdf[ini + i * 3] = (byte)'f'; // CMS corrompido dentro do /Contents
            var r = AssinaturaGovBr.Verificar(pdf, Gerado.Length, m.Acs, Agora);
            Assert.NotNull(r.Erro);
            Assert.Null(r.Cpf);
            Assert.DoesNotContain(GovBrFalso.CpfFicticio, r.Erro);
            Assert.NotNull(AssinaturaGovBr.Verificar(new byte[] { 1, 2, 3 }, 0, m.Acs, Agora).Erro);
            Assert.NotNull(AssinaturaGovBr.Verificar(null, 0, m.Acs, Agora).Erro);
        }

        // Opcional: PDF real assinado no gov.br. ADITIVO_REAL_PDF aponta para o arquivo (nunca no repositório); ADITIVO_REAL_CPF, se definido, é conferido.
        [Fact]
        public void PdfRealDoGovBrSeAVariavelApontarParaUm()
        {
            var caminho = Environment.GetEnvironmentVariable("ADITIVO_REAL_PDF");
            if (string.IsNullOrEmpty(caminho) || !File.Exists(caminho)) return; // pula sem a variável
            var pdf = File.ReadAllBytes(caminho);
            var r = AssinaturaGovBr.Verificar(pdf, 0, AssinaturaGovBr.AcsGovBr(), DateTime.UtcNow);
            Assert.Null(r.Erro);
            Assert.Equal(11, r.Cpf.Length);
            var esperado = AssinaturaGovBr.Digitos(Environment.GetEnvironmentVariable("ADITIVO_REAL_CPF"));
            if (esperado.Length == 11) Assert.Equal(esperado, r.Cpf);
        }
    }
}
