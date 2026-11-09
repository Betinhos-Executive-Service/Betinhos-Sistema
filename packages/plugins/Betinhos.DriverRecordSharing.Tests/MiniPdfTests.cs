using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class MiniPdfTests
    {
        private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

        [Fact]
        public void MiniPdfComecaETerminaComMarcadores()
        {
            var text = Latin1.GetString(Sample());
            Assert.StartsWith("%PDF-1.4", text);
            Assert.EndsWith("%%EOF\n", text);
        }

        [Fact]
        public void MiniPdfXrefApontaParaCadaObjeto()
        {
            var bytes = Sample();
            var text = Latin1.GetString(bytes);
            var startXref = int.Parse(Regex.Match(text, @"startxref\n(\d+)\n%%EOF").Groups[1].Value);
            Assert.StartsWith("xref", text.Substring(startXref));
            var header = Regex.Match(text.Substring(startXref), @"xref\n0 (\d+)\n");
            var count = int.Parse(header.Groups[1].Value);
            var entries = text.Substring(startXref + header.Length, count * 20);
            for (var i = 1; i < count; i++)
            {
                var offset = int.Parse(entries.Substring(i * 20, 10));
                Assert.StartsWith(i + " 0 obj", text.Substring(offset));
            }
        }

        [Fact]
        public void MiniPdfCodificaAcentosEmWinAnsi()
        {
            var pdf = new MiniPdf();
            pdf.Paragraph("Ação");
            var bytes = pdf.ToBytes();
            Assert.True(IndexOf(bytes, new byte[] { (byte)'A', 0xE7, 0xE3, (byte)'o' }) >= 0);
            Assert.Contains("/WinAnsiEncoding", Latin1.GetString(bytes));
        }

        [Fact]
        public void MiniPdfTrocaCaractereForaDoWinAnsiPorInterrogacao()
        {
            var pdf = new MiniPdf();
            pdf.Paragraph("x中y");
            Assert.Contains("(x?y)", Latin1.GetString(pdf.ToBytes()));
        }

        [Fact]
        public void MiniPdfEmbuteJpegComDimensoesDoSof()
        {
            var pdf = new MiniPdf();
            pdf.Jpeg(TinyJpeg(2, 2), 100, 100);
            var text = Latin1.GetString(pdf.ToBytes());
            Assert.Contains("/Width 2 /Height 2", text);
            Assert.Contains("/DCTDecode", text);
        }

        [Fact]
        public void MiniPdfQuebraPaginaComMuitosParagrafos()
        {
            var pdf = new MiniPdf();
            for (var i = 0; i < 120; i++) pdf.Paragraph("Parágrafo " + i);
            var text = Latin1.GetString(pdf.ToBytes());
            var count = int.Parse(Regex.Match(text, @"/Type /Pages /Kids \[[^\]]*\] /Count (\d+)").Groups[1].Value);
            Assert.True(count > 1);
        }

        [Fact]
        public void MiniPdfEhDeterministico()
        {
            Assert.Equal(Sample(), Sample());
        }

        [Fact]
        public void MiniPdfSha256HexDeAbc()
        {
            Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Sha256Hex.Of(Encoding.ASCII.GetBytes("abc")));
        }

        // Gera a amostra visual quando MINIPDF_SAMPLE aponta para um caminho.
        [Fact]
        public void MiniPdfGravaAmostraQuandoPedido()
        {
            var path = Environment.GetEnvironmentVariable("MINIPDF_SAMPLE");
            if (string.IsNullOrEmpty(path)) return;
            File.WriteAllBytes(path, Sample());
        }

        [Fact]
        public void MiniPdfEscapaParentesesEBarra()
        {
            var pdf = new MiniPdf();
            pdf.Paragraph(@"a(b)c\d");
            Assert.Contains(@"(a\(b\)c\\d)", Latin1.GetString(pdf.ToBytes()));
        }

        [Fact]
        public void MiniPdfTracoComecaNoTopoEsquerdoDaCaixa()
        {
            var pdf = new MiniPdf();
            pdf.Strokes(new List<IReadOnlyList<double[]>> { new List<double[]> { new[] { 0d, 0d }, new[] { 1d, 1d } } }, 100, 50);
            var text = Latin1.GetString(pdf.ToBytes());
            Assert.Contains("40 801.89 m\n140 751.89 l\n", text);
        }

        [Fact]
        public void MiniPdfTracoRejeitaPontoInvalido()
        {
            var pdf = new MiniPdf();
            Assert.Throws<ArgumentException>(() => pdf.Strokes(new List<IReadOnlyList<double[]>> { new List<double[]> { new[] { double.NaN, 0.5 } } }, 100, 50));
            Assert.Throws<ArgumentException>(() => pdf.Strokes(new List<IReadOnlyList<double[]>> { new List<double[]> { new[] { 0.5 } } }, 100, 50));
            Assert.Throws<ArgumentException>(() => pdf.Strokes(new List<IReadOnlyList<double[]>> { new List<double[]> { new[] { double.PositiveInfinity, 0.5 } } }, 100, 50));
        }

        [Fact]
        public void MiniPdfImagemAltaNaoPassaDaMargem()
        {
            var pdf = new MiniPdf();
            pdf.Paragraph("Antes");
            pdf.Jpeg(TinyJpeg(2, 20), 5000, 5000);
            var text = Latin1.GetString(pdf.ToBytes());
            var m = Regex.Match(text, @"q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm /Im1");
            Assert.True(m.Success);
            var h = double.Parse(m.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture);
            var y = double.Parse(m.Groups[4].Value, System.Globalization.CultureInfo.InvariantCulture);
            Assert.True(y >= 40 - 0.01, "y=" + y);
            Assert.True(y + h <= 801.89 + 0.01, "topo=" + (y + h));
        }

        [Fact]
        public void MiniPdfAceitaJpegProgressivoSof2()
        {
            var pdf = new MiniPdf();
            pdf.Jpeg(HandJpeg(0xC2), 100, 100);
            Assert.Contains("/Width 4 /Height 3", Latin1.GetString(pdf.ToBytes()));
        }

        [Fact]
        public void MiniPdfRejeitaJpegSof3ESof9()
        {
            Assert.Throws<ArgumentException>(() => new MiniPdf().Jpeg(HandJpeg(0xC3), 100, 100));
            Assert.Throws<ArgumentException>(() => new MiniPdf().Jpeg(HandJpeg(0xC9), 100, 100));
        }

        // APP0 + DQT + SOFn mínimos (4x3, 3 componentes) + EOI.
        private static byte[] HandJpeg(byte sof)
        {
            var b = new List<byte> { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, (byte)'J', (byte)'F', (byte)'I', (byte)'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0 };
            b.AddRange(new byte[] { 0xFF, 0xDB, 0x00, 0x43, 0x00 });
            b.AddRange(Enumerable.Repeat((byte)1, 64));
            b.AddRange(new byte[] { 0xFF, sof, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x04, 0x03, 1, 0x22, 0, 2, 0x11, 0, 3, 0x11, 0 });
            b.AddRange(new byte[] { 0xFF, 0xD9 });
            return b.ToArray();
        }

        private static byte[] Sample()
        {
            var pdf = new MiniPdf();
            pdf.Heading("Termo de ciência de multa");
            pdf.KeyValue("Condutor", "João Conceição Araújo");
            pdf.KeyValue("Infração", "Avanço de sinal — ÁÉÍÓÚ ÂÊÔ ÃÕ Ç à");
            pdf.Paragraph("Declaro ciência da autuação e autorizo o desconto em até três parcelas, conforme acordo. " +
                          "Este parágrafo é longo para testar a quebra automática de linha dentro da largura útil da página A4.");
            pdf.Jpeg(TinyJpeg(8, 6), 120, 90);
            pdf.Strokes(new List<IReadOnlyList<double[]>>
            {
                new List<double[]> { new[] { 0.05, 0.6 }, new[] { 0.2, 0.2 }, new[] { 0.35, 0.8 }, new[] { 0.5, 0.3 } },
                new List<double[]> { new[] { 0.55, 0.5 }, new[] { 0.95, 0.45 } },
            }, 200, 60);
            pdf.Paragraph("Assinado eletronicamente em 22/10/2026 14:30 (horário do servidor).", 8);
            return pdf.ToBytes();
        }

        private static byte[] TinyJpeg(int w, int h)
        {
            using (var bmp = new Bitmap(w, h))
            {
                for (var x = 0; x < w; x++)
                    for (var y = 0; y < h; y++)
                        bmp.SetPixel(x, y, Color.FromArgb(30 * x % 255, 40 * y % 255, 160));
                using (var ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Jpeg);
                    return ms.ToArray();
                }
            }
        }

        private static int IndexOf(byte[] hay, byte[] needle)
        {
            for (var i = 0; i <= hay.Length - needle.Length; i++)
                if (!needle.Where((b, j) => hay[i + j] != b).Any()) return i;
            return -1;
        }
    }
}
