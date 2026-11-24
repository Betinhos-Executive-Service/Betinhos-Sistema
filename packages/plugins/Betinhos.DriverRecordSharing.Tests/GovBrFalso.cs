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
        public static Par NovoSignatario(Par ac, string cpf, DateTime de, DateTime ate, int serial = 77)
        {
            var chave = NovaChave();
            var nome = Nome("FULANO DE TESTE");
            var valor = ("01011980" + cpf + "00000000000").PadRight(45, '0');
            var san = Seq(Oid("2.5.29.17"), Octets(Seq(Tlv(0xA0, Oid("2.16.76.1.3.1"), Tlv(0xA0, Octets(Encoding.ASCII.GetBytes(valor)))))));
            var tbs = Seq(Tlv(0xA0, Inteiro(2)), Inteiro(serial), AlgSha256Rsa(), ac.Nome, Seq(Utc(de), Utc(ate)), nome, ChavePublica(chave), Tlv(0xA3, Seq(san)));
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
        }

        /// <summary>Acrescenta ao PDF gerado a revisão assinada, como o assinador do ITI faz.</summary>
        public static byte[] AssinarPdf(byte[] gerado, Par ac, Par signatario, Opcoes o = null)
        {
            o = o ?? new Opcoes();
            const int Reservado = 8192; // caracteres hex de /Contents
            var cab = Encoding.ASCII.GetBytes("\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <");
            var cauda = Encoding.ASCII.GetBytes(">\n>>\nendobj\n%%EOF\n");
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
            var assinatura = Assinar(signatario.Chave, attrs, "SHA256");
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

        private static byte[] Sha256(byte[] v) { using (var s = SHA256.Create()) return s.ComputeHash(v); }
    }
}
