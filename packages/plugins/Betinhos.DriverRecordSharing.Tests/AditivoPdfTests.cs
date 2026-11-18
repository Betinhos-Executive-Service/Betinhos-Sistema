using System;
using System.Text;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class AditivoPdfTests
    {
        private static readonly Guid Id = new Guid("00000000-0000-0000-0000-000000000001");
        private const string Texto = "Eu, Motorista Teste (fictício), CPF 000.000.000-00, concordo com o aditivo (texto fictício).";
        private static byte[] Gerado() => AditivoPdf.Gerar(Texto, "v1", Id);
        private static byte[] Assinado(byte[] baseBytes, string sufixo = "\n% assinatura\n<< /Type /Sig /ByteRange [0 10 20 30] >>\n%%EOF\n")
        {
            var extra = Encoding.ASCII.GetBytes(sufixo);
            var r = new byte[baseBytes.Length + extra.Length];
            Buffer.BlockCopy(baseBytes, 0, r, 0, baseBytes.Length);
            Buffer.BlockCopy(extra, 0, r, baseBytes.Length, extra.Length);
            return r;
        }

        [Fact] public void Gerar_e_deterministico() => Assert.Equal(Gerado(), Gerado());
        [Fact] public void Gerar_comeca_com_pdf() => Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(Gerado(), 0, 5));
        [Fact] public void Assinado_incremental_passa() => Assert.Null(AditivoPdf.Conferir(Assinado(Gerado()), Gerado()));

        [Fact]
        public void Sem_assinatura_recusa()
            => Assert.Equal("Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.",
                AditivoPdf.Conferir(Assinado(Gerado(), "\n%%EOF\n"), Gerado()));

        [Fact]
        public void Outro_pdf_recusa()
        {
            var outro = AditivoPdf.Gerar(Texto + " Outro.", "v1", Id);
            Assert.Equal("Este PDF não é o aditivo gerado para este funcionário com o texto vigente. Gere o aditivo de novo e peça a assinatura.",
                AditivoPdf.Conferir(Assinado(outro), Gerado()));
        }

        [Fact]
        public void Assinatura_so_no_prefixo_recusa()
        {
            var comSig = Assinado(Gerado());
            Assert.Equal("Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.",
                AditivoPdf.Conferir(Assinado(comSig, "\n%%EOF\n"), comSig));
        }

        [Fact] public void Nao_pdf_recusa() => Assert.Equal("Envie o PDF assinado.", AditivoPdf.Conferir(Encoding.ASCII.GetBytes("oi"), Gerado()));
        [Fact] public void Grande_demais_recusa() => Assert.Equal("O PDF passa de 5 MB.", AditivoPdf.Conferir(new byte[AditivoPdf.MaxBytes + 1], Gerado()));
    }
}
