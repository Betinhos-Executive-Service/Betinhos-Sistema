using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace Betinhos.DriverRecordSharing.Tests
{
    /// <summary>
    /// Gera em runtime uma AC de teste, o certificado de um signatário com CPF fictício (otherName 2.16.76.1.3.1) e um PDF assinado
    /// no formato do assinador do gov.br (incremental, adbe.pkcs7.detached, CMS em BER com comprimento indefinido). Nada de dado real.
    /// </summary>
    internal static class GovBrFalso
    {
        public const string CpfFicticio = "12345678900";

        internal sealed class Par
        {
            public RSAParameters Chave;
            public byte[] Nome;      // DER do Name (subject)
            public byte[] Der;       // certificado
            public int Serial;
        }

        // ---------- DER ----------
        private static byte[] Tlv(int tag, params byte[][] partes)
        {
            var conteudo = partes.SelectMany(p => p).ToArray();
            var cab = new List<byte> { (byte)tag };
            if (conteudo.Length < 128) cab.Add((byte)conteudo.Length);
            else if (conteudo.Length < 256) { cab.Add(0x81); cab.Add((byte)conteudo.Length); }
            else { cab.Add(0x82); cab.Add((byte)(conteudo.Length >> 8)); cab.Add((byte)conteudo.Length); }
            return cab.Concat(conteudo).ToArray();
        }

        private static byte[] Indef(int tag, params byte[][] partes) =>
            new byte[] { (byte)tag, 0x80 }.Concat(partes.SelectMany(p => p)).Concat(new byte[] { 0, 0 }).ToArray();

        private static byte[] Seq(params byte[][] p) => Tlv(0x30, p);
        private static byte[] Set(params byte[][] p) => Tlv(0x31, p);
        private static byte[] Octets(byte[] v) => Tlv(0x04, v);
        private static byte[] Nulo() => new byte[] { 5, 0 };
        private static byte[] Utc(DateTime d) => Tlv(0x17, Encoding.ASCII.GetBytes(d.ToString("yyMMddHHmmss") + "Z"));

        private static byte[] Inteiro(byte[] bigEndian)
        {
            var i = 0;
            while (i < bigEndian.Length - 1 && bigEndian[i] == 0) i++;
            var v = bigEndian.Skip(i).ToArray();
            if ((v[0] & 0x80) != 0) v = new byte[] { 0 }.Concat(v).ToArray();
            return Tlv(0x02, v);
        }

        private static byte[] Inteiro(int n) => Inteiro(new[] { (byte)(n >> 8), (byte)n });

        private static byte[] Oid(string oid)
        {
            var n = oid.Split('.').Select(long.Parse).ToArray();
            var r = new List<byte> { (byte)(n[0] * 40 + n[1]) };
            foreach (var v0 in n.Skip(2))
            {
                var partes = new Stack<byte>();
                var v = v0;
                partes.Push((byte)(v & 0x7F)); v >>= 7;
                while (v > 0) { partes.Push((byte)(0x80 | (v & 0x7F))); v >>= 7; }
                r.AddRange(partes);
            }
            return Tlv(0x06, r.ToArray());
        }

        private static byte[] Nome(string cn) => Seq(Set(Seq(Oid("2.5.4.3"), Tlv(0x0C, Encoding.UTF8.GetBytes(cn)))));

        private static byte[] AlgSha256Rsa() => Seq(Oid("1.2.840.113549.1.1.11"), Nulo());

        private static byte[] ChavePublica(RSAParameters k) =>
            Seq(Seq(Oid("1.2.840.113549.1.1.1"), Nulo()),
                Tlv(0x03, new byte[] { 0 }, Seq(Inteiro(k.Modulus), Inteiro(k.Exponent))));

        public static RSAParameters NovaChave()
        {
            using (var rsa = new RSACryptoServiceProvider(2048)) return rsa.ExportParameters(true);
        }

        private static byte[] Assinar(RSAParameters chave, byte[] dados, string hash)
        {
            using (var rsa = new RSACryptoServiceProvider())
            {
                rsa.ImportParameters(chave);
                return rsa.SignData(dados, hash);
            }
        }

        // ---------- Certificados ----------
        public static Par NovaAc(string cn, DateTime de, DateTime ate)
        {
            var chave = NovaChave();
            var nome = Nome(cn);
            var tbs = Seq(Tlv(0xA0, Inteiro(2)), Inteiro(1), Seq(Oid("1.2.840.113549.1.1.13"), Nulo()), nome, Seq(Utc(de), Utc(ate)), nome, ChavePublica(chave));
            var sig = Assinar(chave, tbs, "SHA512");
            var der = Seq(tbs, Seq(Oid("1.2.840.113549.1.1.13"), Nulo()), Tlv(0x03, new byte[] { 0 }, sig));
            return new Par { Chave = chave, Nome = nome, Der = der };
        }

        /// <summary>Signatário no formato do gov.br: subject só CN, CPF no otherName 2.16.76.1.3.1 (45 caracteres: nascimento + CPF + NIS + RG...).</summary>
        public static Par NovoSignatario(Par ac, string cpf, DateTime de, DateTime ate, int serial = 77, RSAParameters? publicaFalsa = null)
        {
            var chave = NovaChave();
            var nome = Nome("FULANO DE TESTE");
            var valor = ("01011980" + cpf + "00000000000").PadRight(45, '0');
            var san = Seq(Oid("2.5.29.17"), Octets(Seq(Tlv(0xA0, Oid("2.16.76.1.3.1"), Tlv(0xA0, Octets(Encoding.ASCII.GetBytes(valor)))))));
            var tbs = Seq(Tlv(0xA0, Inteiro(2)), Inteiro(serial), AlgSha256Rsa(), ac.Nome, Seq(Utc(de), Utc(ate)), nome, ChavePublica(publicaFalsa ?? chave), Tlv(0xA3, Seq(san)));
            var sig = Assinar(ac.Chave, tbs, "SHA256");
            var der = Seq(tbs, AlgSha256Rsa(), Tlv(0x03, new byte[] { 0 }, sig));
            return new Par { Chave = chave, Nome = nome, Der = der, Serial = serial };
        }

        // ---------- PDF assinado ----------
        public sealed class Opcoes
        {
            public DateTime SigningTime = new DateTime(2026, 10, 22, 14, 0, 0, DateTimeKind.Utc);
            public bool MessageDigestErrado;
            public bool ComprimentoDefinido;      // CMS em DER em vez do BER indefinido do gov.br
            public RSAParameters? ChaveDosAtributos; // assina os atributos com outra chave (cadeia ok, assinatura errada)
            public Defeito Defeito;               // só vale quando o PDF gerado tem xref (revisão realista)
        }

        /// <summary>Adulterações que o motorista poderia embutir na revisão assinada.</summary>
        internal enum Defeito
        {
            Nenhum, ConteudoTrocado, RecursosTrocados, PagesReescrito, FonteReescrita, ObjStm, XRefStream,
            Grande, RootDiferente, EntradaLivre, SemPrev, PrevErrado, CatalogoOutroPages, XRefStm
        }

        // Revisão no formato do assinador do ITI: reescreve só o Catalog (mesmo /Pages, ganha /AcroForm) e a Page (mesmo /Contents e /Resources,
        // ganha /Annots), cria widget, /Type /Sig e aparência, e fecha com xref clássica + trailer com /Prev. Devolve o texto antes do objeto da assinatura
        // e, pelo callback, o que vem depois dele (xref etc.).
        private static string Original(byte[] gerado) => Encoding.GetEncoding("iso-8859-1").GetString(gerado);

        private static bool TemXref(byte[] gerado) => Original(gerado).Contains("startxref");

        private static string ObjetoDe(string t, int n)
        {
            var i = t.IndexOf("\n" + n + " 0 obj\n", StringComparison.Ordinal);
            if (i < 0) throw new InvalidOperationException("objeto " + n);
            var ini = i + 1;
            var fim = t.IndexOf("endobj", ini, StringComparison.Ordinal);
            return t.Substring(ini, fim - ini);
        }

        private static int PrimeiraPagina(string t)
        {
            var m = System.Text.RegularExpressions.Regex.Match(t, "\n(\\d+) 0 obj\n<< /Type /Page /Parent");
            return int.Parse(m.Groups[1].Value);
        }

        private static string Dic(string objeto)
        {
            // "<< ... >>\n" do corpo do objeto, sem o cabeçalho "n 0 obj"
            var i = objeto.IndexOf("<<", StringComparison.Ordinal);
            return objeto.Substring(i).TrimEnd();
        }

        private static string Xref(string t, int[] numeros, int[] offsets, int tamanho, int prev, Defeito d, int raiz, string extraTrailer)
        {
            var sb = new StringBuilder("xref\n");
            if (d == Defeito.EntradaLivre) sb.Append("3 1\n0000000000 00001 f \n"); // libera a fonte: o texto sumiria
            for (var i = 0; i < numeros.Length; i++)
                sb.Append(numeros[i]).Append(" 1\n").Append(offsets[i].ToString("D10")).Append(" 00000 n \n");
            sb.Append("trailer\n<< /Size ").Append(tamanho).Append(" /Root ").Append(raiz).Append(" 0 R");
            if (d != Defeito.SemPrev) sb.Append(" /Prev ").Append(d == Defeito.PrevErrado ? prev + 1 : prev);
            if (d == Defeito.XRefStm) sb.Append(" /XRefStm 10");
            sb.Append(extraTrailer).Append(" >>\n");
            return sb.ToString();
        }

        /// <summary>Acrescenta ao PDF gerado a revisão assinada, como o assinador do ITI faz.</summary>
        public static byte[] AssinarPdf(byte[] gerado, Par ac, Par signatario, Opcoes o = null)
        {
            o = o ?? new Opcoes();
            const int Reservado = 8192; // caracteres hex de /Contents
            byte[] cab, cauda;
            if (TemXref(gerado)) Realista(gerado, o, out cab, out cauda);
            else
            {
                cab = Encoding.ASCII.GetBytes("\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <");
                cauda = Encoding.ASCII.GetBytes(">\n>>\nendobj\n%%EOF\n");
            }
            var corpo = gerado.Concat(cab).ToArray();
            var a = corpo.Length;                    // posição do '<'
            var a1 = a - 1;                          // o '<' é o último byte de cab: a lacuna começa nele
            var b = a1 + 1 + Reservado + 1;          // depois do '>'
            var total = a1 + 1 + Reservado + cauda.Length;
            var latin1 = Encoding.GetEncoding("iso-8859-1");
            var texto = latin1.GetString(corpo);
            var faixa = string.Format("[0 {0:D10} {1:D10} {2:D10}]", a1, b, total - b);
            texto = texto.Replace("[0 0000000000 0000000000 0000000000]", faixa);
            var pdf = latin1.GetBytes(texto).Concat(new byte[Reservado]).Concat(cauda).ToArray();
            // pdf: ... '<' [Reservado bytes] '>' ...  (os bytes do hex entram depois)
            var digest = Sha256(pdf.Take(a1).Concat(pdf.Skip(b)).ToArray());
            if (o.MessageDigestErrado) digest[0] ^= 0xFF;

            var attrs = Set(
                Seq(Oid("1.2.840.113549.1.9.3"), Set(Oid("1.2.840.113549.1.7.1"))),
                Seq(Oid("1.2.840.113549.1.9.5"), Set(Utc(o.SigningTime))),
                Seq(Oid("1.2.840.113549.1.9.4"), Set(Octets(digest))),
                Seq(Oid("1.2.840.113549.1.9.52"), Set(Seq(Oid("1.2.840.113549.1.9.3")))));
            var assinatura = Assinar(o.ChaveDosAtributos ?? signatario.Chave, attrs, "SHA256");
            var emissor = ac.Nome;
            var attrsImplicito = (byte[])attrs.Clone();
            attrsImplicito[0] = 0xA0; // no SignerInfo o SET vai como [0] IMPLICIT; a assinatura é sobre o SET (0x31)
            var info = Seq(Inteiro(1), Seq(emissor, Inteiro(signatario.Serial)), Seq(Oid("2.16.840.1.101.3.4.2.1"), Nulo()),
                attrsImplicito, AlgSha256Rsa(), Octets(assinatura));
            var algs = Set(Seq(Oid("2.16.840.1.101.3.4.2.1"), Nulo()));
            var encap = Seq(Oid("1.2.840.113549.1.7.1"));
            var certs = Tlv(0xA0, signatario.Der);
            var dados = new[] { Inteiro(1), algs, encap, certs, Set(info) };
            byte[] cms;
            if (o.ComprimentoDefinido)
                cms = Seq(Oid("1.2.840.113549.1.7.2"), Tlv(0xA0, Seq(dados)));
            else
                cms = Indef(0x30, Oid("1.2.840.113549.1.7.2"), Indef(0xA0, Indef(0x30, dados)));
            var hex = BitConverter.ToString(cms).Replace("-", "").ToLowerInvariant();
            if (hex.Length > Reservado) throw new InvalidOperationException("CMS maior que o reservado.");
            var hexBytes = Encoding.ASCII.GetBytes(hex.PadRight(Reservado, '0'));
            Buffer.BlockCopy(hexBytes, 0, pdf, a1 + 1, Reservado);
            return pdf;
        }

        private const int Reservado = 8192;

        private static void Realista(byte[] gerado, Opcoes o, out byte[] cab, out byte[] cauda)
        {
            var latin1 = Encoding.GetEncoding("iso-8859-1");
            var t = Original(gerado);
            var sx = t.LastIndexOf("startxref", StringComparison.Ordinal);
            var prev = int.Parse(t.Substring(sx + 9).Trim().Split('\n')[0].Trim());
            var m = System.Text.RegularExpressions.Regex.Match(t, "/Size (\\d+)");
            var tamanho = int.Parse(m.Groups[1].Value);
            var pagina = PrimeiraPagina(t);
            var catalogo = Dic(ObjetoDe(t, 1));
            var pag = Dic(ObjetoDe(t, pagina));
            var widget = tamanho; var sig = tamanho + 1; var forma = tamanho + 2;

            var d = o.Defeito;
            var catNovo = catalogo.Substring(0, catalogo.LastIndexOf(">>", StringComparison.Ordinal)) + "/AcroForm << /Fields [" + widget + " 0 R] /SigFlags 3 >> >>";
            if (d == Defeito.CatalogoOutroPages) catNovo = catNovo.Replace("/Pages 2 0 R", "/Pages " + forma + " 0 R");
            var pagNovo = pag.Substring(0, pag.LastIndexOf(">>", StringComparison.Ordinal)) + "/Annots [" + widget + " 0 R] >>";
            if (d == Defeito.ConteudoTrocado) pagNovo = pagNovo.Replace("/Contents " + (pagina + 1) + " 0 R", "/Contents " + forma + " 0 R");
            if (d == Defeito.RecursosTrocados) pagNovo = pagNovo.Replace("/F1 3 0 R", "/F1 4 0 R");

            var sb = new StringBuilder();
            var baseLen = gerado.Length;
            var offsets = new List<int>(); var numeros = new List<int>();
            Func<int, string, int> objeto = (n, corpo) =>
            {
                var off = baseLen + latin1.GetByteCount(sb.ToString()) + 1;
                sb.Append("\n").Append(n).Append(" 0 obj\n").Append(corpo).Append("\nendobj");
                numeros.Add(n); offsets.Add(off);
                return off;
            };
            objeto(1, catNovo);
            objeto(pagina, pagNovo);
            if (d == Defeito.PagesReescrito) objeto(2, "<< /Type /Pages /Kids [" + pagina + " 0 R] /Count 1 >>");
            if (d == Defeito.FonteReescrita) objeto(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
            if (d == Defeito.ObjStm) objeto(forma + 1, "<< /Type /ObjStm /N 1 /First 4 /Length 4 >>\nstream\n1 0 \nendstream");
            if (d == Defeito.XRefStream) objeto(forma + 1, "<< /Type /XRef /Size 5 /W [1 2 1] /Length 4 >>\nstream\nabcd\nendstream");
            objeto(widget, "<< /Type /Annot /Subtype /Widget /FT /Sig /Rect [10 10 150 60] /P " + pagina + " 0 R /V " + sig + " 0 R /T (Signature1) /AP << /N " + forma + " 0 R >> >>");
            var conteudoForma = "q Q";
            var grande = d == Defeito.Grande ? new string('x', LimiteGrande) : "";
            objeto(forma, "<< /Type /XObject /Subtype /Form /BBox [0 0 140 50] /Length " + (conteudoForma.Length + grande.Length) + " >>\nstream\n" + conteudoForma + grande + "\nendstream");
            var offSig = baseLen + latin1.GetByteCount(sb.ToString()) + 1;
            numeros.Add(sig); offsets.Add(offSig);
            sb.Append("\n").Append(sig).Append(" 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <");
            cab = latin1.GetBytes(sb.ToString());

            // xref logo depois do objeto da assinatura: gerado + cab (termina no '<') + hex reservado + cauda começando no '>'
            var depoisSig = ">\n>>\nendobj\n";
            var offXref = baseLen + cab.Length + Reservado + latin1.GetByteCount(depoisSig);
            var raiz = 1;
            var extra = "";
            if (d == Defeito.RootDiferente) raiz = 2;
            var xref = Xref(t, numeros.ToArray(), offsets.ToArray(), tamanho + 3 + (d == Defeito.ObjStm || d == Defeito.XRefStream ? 1 : 0), prev, d, raiz, extra);
            cauda = latin1.GetBytes(depoisSig + xref + "startxref\n" + offXref + "\n%%EOF\n");
        }

        private const int LimiteGrande = 600 * 1024;

        private static byte[] Sha256(byte[] v) { using (var s = SHA256.Create()) return s.ComputeHash(v); }
    }
}
