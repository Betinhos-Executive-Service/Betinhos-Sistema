using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>Resultado da conferência da assinatura gov.br de um PDF. Erro (pt-BR, sem dado pessoal) null = assinatura válida.</summary>
    public sealed class AssinaturaConferida
    {
        public string Erro;
        /// <summary>CPF de quem assinou, só dígitos. Nunca vai para trace, log ou mensagem.</summary>
        public string Cpf;
        public DateTime? AssinadoEmUtc;
    }

    /// <summary>
    /// Confere a assinatura PAdES/adbe.pkcs7.detached que o assinador do ITI (gov.br) acrescenta ao PDF: ByteRange cobre o arquivo,
    /// messageDigest bate, a assinatura RSA do signatário vale e o certificado foi emitido pela AC Final do Governo Federal do Brasil v1.
    /// Leitor BER/DER próprio (aceita comprimento indefinido) e só mscorlib: sem SignedCms/System.Security.dll, por causa do sandbox do Dataverse.
    /// A validade do certificado é conferida contra o relógio do servidor (o signingTime é informado por quem assina: só serve para recusar data futura).
    /// Sem CRL/OCSP: não consulta revogação; o CPF e a cadeia é que amarram o aditivo ao motorista.
    /// A integridade do texto (nada reescrito na parte acrescentada) é conferida por <see cref="AcrescimoPdf"/>.
    /// </summary>
    public static class AssinaturaGovBr
    {
        public const string ErroSemAssinatura = "Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.";
        public const string ErroAlterado = "O arquivo foi alterado depois de assinado ou a assinatura não é válida. Assine de novo no gov.br e envie o arquivo sem mexer nele.";
        public const string ErroNaoGovBr = "Esta assinatura não é do gov.br. Assine em assinador.iti.br com a sua conta gov.br e envie o arquivo devolvido.";
        public const string ErroIlegivel = "Não foi possível ler a assinatura deste PDF. Assine de novo no gov.br e envie o arquivo que ele devolveu.";
        public const string ErroValidade = "O certificado de quem assinou não está dentro da validade. Assine de novo no gov.br.";
        public const string ErroSemCpf = "A assinatura não traz o CPF de quem assinou. Assine de novo com a sua conta gov.br.";
        public const string ErroFuturo = "A data da assinatura está no futuro. Confira o relógio do aparelho e assine de novo.";

        // AC Final do Governo Federal do Brasil v1 (repo.iti.br/docs/Cadeia_GovBr-der.p7b; válida até 09/06/2033). Certificado público.
        private const string AcFinalGovBrBase64 =
            "MIIHcDCCBVigAwIBAgIHKNnOaHkk+jANBgkqhkiG9w0BAQ0FADCBoTELMAkGA1UEBhMCQlIxDzAN" +
            "BgNVBAoMBkdvdi1CcjFGMEQGA1UECww9QXV0b3JpZGFkZSBDZXJ0aWZpY2Fkb3JhIFJhaXogZG8g" +
            "R292ZXJubyBGZWRlcmFsIGRvIEJyYXNpbCB2MTE5MDcGA1UEAwwwQUMgSW50ZXJtZWRpYXJpYSBk" +
            "byBHb3Zlcm5vIEZlZGVyYWwgZG8gQnJhc2lsIHYxMB4XDTIwMDYxNzIwNTAyN1oXDTMzMDYwOTEy" +
            "MDA0N1owgYwxCzAJBgNVBAYTAkJSMQ8wDQYDVQQKDAZHb3YtQnIxOTA3BgNVBAsMMEFDIEludGVy" +
            "bWVkaWFyaWEgZG8gR292ZXJubyBGZWRlcmFsIGRvIEJyYXNpbCB2MTExMC8GA1UEAwwoQUMgRmlu" +
            "YWwgZG8gR292ZXJubyBGZWRlcmFsIGRvIEJyYXNpbCB2MTCCAiIwDQYJKoZIhvcNAQEBBQADggIP" +
            "ADCCAgoCggIBAN9NUSO+TdYEt6inU8GEbzfdvjEq5sBGT+UZxLUJWG64qS3fdyTa9vQyBhGCJmyo" +
            "rTwOgimcwq5NR5a/mnRSKSx6fU9O0vfQgZExYiuovu14EJP5hJh5MNJI79mc+BbrDFm9KbSMZBUs" +
            "UY0qoxoCIgSgMINFy8fFH8Q4Zw1uNvtSLks9ZzsR1SWkCwtXpxONAP8qPJ8CBM5FBwnymu3tuyLv" +
            "jKIeqfKAQXc0Np8IVfc0atnUdk+RNpCfjMvXagRGU0yfwksjY9Ad3Hv2KzZfsvzqFqoJVg+Jom6J" +
            "h7PhsmG8Gavu5FZ1XA1OTKhQ7iH2+24k3lu8mYmeKTfpfAJJ6pJD3Qx/dLcxQQ7/z4zKn5POp+AJ" +
            "/pI4I/A2smnDFF1Lgrg+sxr0SnKE9L6rWf8iq4yVNrg8g59CPvFczsGgyULhN9rov+hvwiznNWJe" +
            "EF9sHu5b5LHnQq9OpkJdyNwY/jOZPolw0ljjEpVHeiJ/yUQt2wJGaOfQSJCzYh9rEtvSN+aOg31L" +
            "Xk3DX4au/Wa6lTGlVlq2jhkKD3UjGK2DlsrrkVXnNhdkx/itk3RbwgJ/DqOY8y+Rf+uI8T16LLO2" +
            "OFBJdbsXY+x9q1X2L8CCPd3OWfSGPPXdCs0DBWpc7MKSHoIvtj80MXE8hH59pVSltmPGQkTU3RD4" +
            "XXLOUTZE7mUVAgMBAAGjggG+MIIBujAdBgNVHQ4EFgQUPCpoXJmEe1BQtz5BGqCtSDdhtScwDwYD" +
            "VR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwggERBgNVHSAEggEIMIIBBDA/BgZgTAMCAQEw" +
            "NTAzBggrBgEFBQcCARYnaHR0cDovL3JlcG8uaXRpLmJyL2RvY3MvRFBDYWNpR292QnIucGRmMD8G" +
            "BmBMAwICATA1MDMGCCsGAQUFBwIBFidodHRwOi8vcmVwby5pdGkuYnIvZG9jcy9EUENhY2lHb3ZC" +
            "ci5wZGYwPwYGYEwDAgMBMDUwMwYIKwYBBQUHAgEWJ2h0dHA6Ly9yZXBvLml0aS5ici9kb2NzL0RQ" +
            "Q2FjaUdvdkJyLnBkZjA/BgZgTAMCBAEwNTAzBggrBgEFBQcCARYnaHR0cDovL3JlcG8uaXRpLmJy" +
            "L2RvY3MvRFBDYWNpR292QnIucGRmMEIGA1UdHwQ7MDkwN6A1oDOGMWh0dHA6Ly9yZXBvLml0aS5i" +
            "ci9sY3IvcHVibGljL2FjaS9MQ1JhY2lHb3ZCci5jcmwwHwYDVR0jBBgwFoAUiL9dAn28Wa3bWniV" +
            "GwC9dzqE6u0wDQYJKoZIhvcNAQENBQADggIBACMN+/N5BhuPcz+2hcZrNijrw7PQLNf7yT8EJRO+" +
            "czsYL63uip5Eb42J8kKLebXUpwdtKE96S+gKz9wMVHiS9lid+4iVag1q5QtsRwAOQlE4Nio/ah8W" +
            "5wMkWCiI6bfPNasgrQW3AXV6kkavOHaOwRtZpyCRTxyP95PSP31njynZs9dOx/VLP4KCSCc+Ob9n" +
            "N/jf8e7qkkL0vLVOML3kvsfIzIw/RPtNwrEIuUq15E9hyLhlwyZ+1oV56FXJjEUnWKBWuY81a2px" +
            "zoCEW5Du4ToWsvRyiq78ZG7MB+Nf1dA1DymXz+5jj8XvjZymuCOBPwbPFqV2wCS+VIlR1bK7jLmV" +
            "dqJZVs41xY2w2o1bqVlEKCYW8WeEtywZrPE7xjTTgCOxEgpijUXi6ePRIOVSjKX+C53BLAq/graG" +
            "zrSqo1iq2JbeqnMRRmyg+yUI30ZVP2XQAKIZXRRCHrfcp5cMwr6L7vGCi8vjxO0mBRxXJY2SN23S" +
            "a9Ehkdc7WGLkXSSzPGLx/YnEXyE2do7LM7lPqHkm2QfBZfc3HiJ9SKHkcTcp3Em3UBScjdvYZMbg" +
            "r6pfuWLYo7MB7TfvvqcLnhwwHtaEUBJxvowKZh3JesSfmmKpzdpm0oKB1aEsfGwLAB5uj/oRhYYI" +
            "EjUPRiyP36PU9nU8OgIvbQf8NiK4YrorQrsS";

        private const string OidSha256 = "2.16.840.1.101.3.4.2.1";
        private const string OidRsa = "1.2.840.113549.1.1.1";
        private const string OidSignedData = "1.2.840.113549.1.7.2";
        private const string OidMessageDigest = "1.2.840.113549.1.9.4";
        private const string OidSigningTime = "1.2.840.113549.1.9.5";
        private const string OidSan = "2.5.29.17";
        private const string OidCpfIcp = "2.16.76.1.3.1";

        public static IList<byte[]> AcsGovBr() => new List<byte[]> { Convert.FromBase64String(AcFinalGovBrBase64) };

        /// <summary>Só dígitos; null/vazio dão "".</summary>
        public static string Digitos(string valor)
        {
            var sb = new StringBuilder();
            foreach (var c in valor ?? "") if (c >= '0' && c <= '9') sb.Append(c);
            return sb.ToString();
        }

        /// <param name="inicio">Onde começa a parte acrescentada (tamanho do PDF gerado); 0 para olhar o arquivo todo.</param>
        /// <param name="tracing">Opcional. No catch genérico só o tipo da exceção vai para o trace (nunca mensagem nem dado do PDF).</param>
        public static AssinaturaConferida Verificar(byte[] pdf, int inicio, IList<byte[]> acsConfiaveis, DateTime agoraUtc, Microsoft.Xrm.Sdk.ITracingService tracing = null)
        {
            try { return Conferir(pdf, inicio, acsConfiaveis, agoraUtc); }
            catch (Exception ex)
            {
                try { tracing?.Trace("AssinaturaGovBr: estrutura ilegível (" + ex.GetType().Name + ")."); } catch (Exception) { }
                return new AssinaturaConferida { Erro = ErroIlegivel }; // estrutura malformada: nunca vaza detalhe
            }
        }

        private static AssinaturaConferida Falha(string erro) => new AssinaturaConferida { Erro = erro };

        private static AssinaturaConferida Conferir(byte[] pdf, int inicio, IList<byte[]> acs, DateTime agora)
        {
            if (pdf == null || inicio < 0 || inicio >= pdf.Length) return Falha(ErroSemAssinatura);
            var texto = new char[pdf.Length - inicio];
            for (var i = 0; i < texto.Length; i++) texto[i] = (char)pdf[inicio + i];
            var t = new string(texto);
            var pos = t.LastIndexOf("/ByteRange", StringComparison.Ordinal);
            if (pos < 0) return Falha(ErroSemAssinatura);
            var range = LerByteRange(t, pos + "/ByteRange".Length);
            if (range == null) return Falha(ErroIlegivel);
            long r0 = range[0], a = range[1], b = range[2], c = range[3];
            if (r0 != 0 || a <= inicio || b <= a + 2 || c <= 0 || a > pdf.Length || b > pdf.Length) return Falha(ErroIlegivel);
            if (b + c != pdf.Length) return Falha(ErroAlterado); // acrescentaram bytes depois da assinatura
            var ia = (int)a; var ib = (int)b;
            if (pdf[ia] != (byte)'<' || pdf[ib - 1] != (byte)'>') return Falha(ErroIlegivel);
            if (!t.Substring(0, ia - inicio).TrimEnd(' ', '\t', '\r', '\n', '\f', '\0').EndsWith("/Contents", StringComparison.Ordinal)) return Falha(ErroIlegivel);
            var cms = DecodeHex(t, ia - inicio + 1, ib - 1 - inicio);
            if (cms == null) return Falha(ErroIlegivel);

            byte[] digest;
            using (var sha = SHA256.Create())
            {
                sha.TransformBlock(pdf, 0, ia, null, 0);
                sha.TransformFinalBlock(pdf, ib, (int)c);
                digest = sha.Hash;
            }

            var raiz = Node.Ler(cms, 0, cms.Length, 0);
            for (var i = raiz.End; i < cms.Length; i++) if (cms[i] != 0) return Falha(ErroIlegivel); // só preenchimento de zeros depois do CMS
            if (raiz.Tag != 0x30 || raiz.Kids.Count < 2 || Oid(raiz.Kids[0]) != OidSignedData || raiz.Kids[1].Tag != 0xA0 || raiz.Kids[1].Kids.Count != 1) return Falha(ErroIlegivel);
            var sd = raiz.Kids[1].Kids[0].Kids;
            if (sd.Count < 4) return Falha(ErroIlegivel);
            var certs = new List<Cert>();
            var k = 3;
            for (; k < sd.Count - 1; k++)
            {
                if (sd[k].Tag == 0xA0) foreach (var cn in sd[k].Kids) certs.Add(Cert.Ler(cn));
                else if (sd[k].Tag != 0xA1) return Falha(ErroIlegivel);
            }
            var signers = sd[sd.Count - 1];
            if (signers.Tag != 0x31 || signers.Kids.Count != 1) return Falha(ErroIlegivel);
            var si = signers.Kids[0].Kids;
            if (si.Count < 6) return Falha(ErroIlegivel);
            var sid = si[1];
            if (Oid(si[2].Kids[0]) != OidSha256) return Falha(ErroIlegivel);
            if (si[3].Tag != 0xA0) return Falha(ErroIlegivel);
            var attrsNode = si[3];
            var algAssinatura = Oid(si[4].Kids[0]);
            var assinatura = si[5].Conteudo();

            byte[] mdAttr = null; DateTime? signingTime = null;
            foreach (var attr in attrsNode.Kids)
            {
                var oid = Oid(attr.Kids[0]);
                var valor = attr.Kids[1].Kids[0];
                if (oid == OidMessageDigest) mdAttr = valor.Conteudo();
                else if (oid == OidSigningTime) signingTime = Cert.Tempo(valor);
            }
            if (mdAttr == null) return Falha(ErroIlegivel);
            if (!Igual(mdAttr, digest)) return Falha(ErroAlterado);

            var hash = HashDe(algAssinatura);
            if (hash == null) return Falha(ErroIlegivel);
            Cert signer = null;
            if (sid.Tag == 0x30 && sid.Kids.Count == 2)
            {
                var emissor = sid.Kids[0].Bruto(); var serial = SemZeros(sid.Kids[1].Conteudo());
                foreach (var cc in certs) if (Igual(cc.EmissorBruto, emissor) && Igual(SemZeros(cc.Serial), serial)) signer = cc;
            }
            else if (certs.Count == 1) signer = certs[0];
            if (signer == null) return Falha(ErroIlegivel);

            // Cadeia primeiro: só o certificado emitido pela AC fixada chega à conta RSA dos atributos assinados (sem custo para quem manda lixo).
            Cert ac = null;
            foreach (var der in acs ?? new List<byte[]>())
            {
                var cand = Cert.Ler(Node.Ler(der, 0, der.Length, 0));
                var h = HashDe(signer.AlgAssinatura);
                if (h != null && Igual(cand.AssuntoBruto, signer.EmissorBruto) && RsaOk(cand.Modulo, cand.Expoente, signer.TbsBruto, signer.Assinatura, h)) { ac = cand; break; }
            }
            if (ac == null) return Falha(ErroNaoGovBr);

            var attrsDer = attrsNode.Bruto();
            attrsDer[0] = 0x31; // a assinatura é sobre o SET, não sobre o [0] IMPLICIT
            if (!RsaOk(signer.Modulo, signer.Expoente, attrsDer, assinatura, hash)) return Falha(ErroAlterado);

            if (signingTime.HasValue && signingTime.Value > agora.AddMinutes(10)) return Falha(ErroFuturo);
            if (agora < signer.NaoAntes || agora > signer.NaoDepois || agora < ac.NaoAntes || agora > ac.NaoDepois) return Falha(ErroValidade);
            if (signer.Cpf == null) return Falha(ErroSemCpf);
            return new AssinaturaConferida { Cpf = signer.Cpf, AssinadoEmUtc = signingTime };
        }

        // ---------------- PDF ----------------

        private static long[] LerByteRange(string t, int pos)
        {
            while (pos < t.Length && char.IsWhiteSpace(t[pos])) pos++;
            if (pos >= t.Length || t[pos] != '[') return null;
            pos++;
            var r = new long[4];
            for (var n = 0; n < 4; n++)
            {
                while (pos < t.Length && char.IsWhiteSpace(t[pos])) pos++;
                var ini = pos;
                while (pos < t.Length && t[pos] >= '0' && t[pos] <= '9') pos++;
                if (pos == ini || pos - ini > 10 || !long.TryParse(t.Substring(ini, pos - ini), out r[n])) return null;
            }
            while (pos < t.Length && char.IsWhiteSpace(t[pos])) pos++;
            return pos < t.Length && t[pos] == ']' ? r : null;
        }

        private static byte[] DecodeHex(string t, int de, int ate)
        {
            var n = ate - de;
            if (n <= 0 || n % 2 != 0) return null;
            var r = new byte[n / 2];
            for (var i = 0; i < r.Length; i++)
            {
                var hi = Nibble(t[de + 2 * i]); var lo = Nibble(t[de + 2 * i + 1]);
                if (hi < 0 || lo < 0) return null;
                r[i] = (byte)(hi * 16 + lo);
            }
            return r;
        }

        private static int Nibble(char c) => c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;

        // ---------------- Cripto ----------------

        private static string HashDe(string oidAlgoritmo)
        {
            switch (oidAlgoritmo)
            {
                case OidRsa: return "SHA256"; // rsaEncryption puro: o digestAlgorithm do SignerInfo é SHA-256
                case "1.2.840.113549.1.1.11": return "SHA256";
                case "1.2.840.113549.1.1.12": return "SHA384";
                case "1.2.840.113549.1.1.13": return "SHA512";
                default: return null;
            }
        }

        private static bool RsaOk(byte[] modulo, byte[] expoente, byte[] dados, byte[] assinatura, string hash)
        {
            try
            {
                using (var rsa = new RSACryptoServiceProvider())
                {
                    rsa.ImportParameters(new RSAParameters { Modulus = modulo, Exponent = expoente });
                    return rsa.VerifyData(dados, hash, assinatura);
                }
            }
            catch (CryptographicException) { return false; }
        }

        private static bool Igual(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            var d = 0;
            for (var i = 0; i < a.Length; i++) d |= a[i] ^ b[i];
            return d == 0;
        }

        private static byte[] SemZeros(byte[] v)
        {
            var i = 0;
            while (i < v.Length - 1 && v[i] == 0) i++;
            var r = new byte[v.Length - i];
            Buffer.BlockCopy(v, i, r, 0, r.Length);
            return r;
        }

        private static string Oid(Node n)
        {
            if (n.Tag != 0x06 || n.ContentEnd <= n.Content) throw new FormatException();
            var sb = new StringBuilder();
            long v = 0;
            var primeiro = true;
            for (var i = n.Content; i < n.ContentEnd; i++)
            {
                v = (v << 7) | (uint)(n.B[i] & 0x7F);
                if (v > int.MaxValue) throw new FormatException();
                if ((n.B[i] & 0x80) != 0) continue;
                if (primeiro) { sb.Append(v < 40 ? 0 : v < 80 ? 1 : 2).Append('.').Append(v < 40 ? v : v < 80 ? v - 40 : v - 80); primeiro = false; }
                else sb.Append('.').Append(v);
                v = 0;
            }
            return sb.ToString();
        }

        // ---------------- BER/DER ----------------

        private sealed class Node
        {
            public byte[] B;
            public int Tag, Start, Content, ContentEnd, End;
            public readonly List<Node> Kids = new List<Node>();

            public byte[] Bruto() { var r = new byte[End - Start]; Buffer.BlockCopy(B, Start, r, 0, r.Length); return r; }
            public byte[] Conteudo() { var r = new byte[ContentEnd - Content]; Buffer.BlockCopy(B, Content, r, 0, r.Length); return r; }

            public static Node Ler(byte[] b, int pos, int limite, int profundidade)
            {
                if (profundidade > 24 || pos + 2 > limite) throw new FormatException();
                var n = new Node { B = b, Start = pos, Tag = b[pos] };
                if ((n.Tag & 0x1F) == 0x1F) throw new FormatException();
                var constructed = (n.Tag & 0x20) != 0;
                var lb = b[pos + 1];
                if (lb == 0x80)
                {
                    if (!constructed) throw new FormatException();
                    n.Content = pos + 2;
                    var p = n.Content;
                    while (true)
                    {
                        if (p + 2 > limite) throw new FormatException();
                        if (b[p] == 0 && b[p + 1] == 0) { n.ContentEnd = p; n.End = p + 2; break; }
                        var filho = Ler(b, p, limite, profundidade + 1);
                        n.Kids.Add(filho);
                        p = filho.End;
                    }
                    return n;
                }
                long len; int hdr;
                if (lb < 0x80) { len = lb; hdr = 2; }
                else
                {
                    var nb = lb & 0x7F;
                    if (nb < 1 || nb > 4 || pos + 2 + nb > limite) throw new FormatException();
                    len = 0;
                    for (var i = 0; i < nb; i++) len = (len << 8) | b[pos + 2 + i];
                    hdr = 2 + nb;
                }
                if (pos + hdr + len > limite) throw new FormatException();
                n.Content = pos + hdr;
                n.ContentEnd = n.Content + (int)len;
                n.End = n.ContentEnd;
                if (constructed)
                    for (var p = n.Content; p < n.ContentEnd;)
                    {
                        var filho = Ler(b, p, n.ContentEnd, profundidade + 1);
                        n.Kids.Add(filho);
                        p = filho.End;
                    }
                return n;
            }
        }

        private sealed class Cert
        {
            public byte[] TbsBruto, EmissorBruto, AssuntoBruto, Serial, Modulo, Expoente, Assinatura;
            public string AlgAssinatura, Cpf;
            public DateTime NaoAntes, NaoDepois;

            public static Cert Ler(Node cert)
            {
                if (cert.Tag != 0x30 || cert.Kids.Count != 3) throw new FormatException();
                var tbs = cert.Kids[0];
                var k = tbs.Kids;
                var i = k[0].Tag == 0xA0 ? 1 : 0;
                var c = new Cert
                {
                    TbsBruto = tbs.Bruto(),
                    AlgAssinatura = Oid(cert.Kids[1].Kids[0]),
                    Assinatura = SemBitsLivres(cert.Kids[2]),
                    Serial = k[i].Conteudo(),
                    EmissorBruto = k[i + 2].Bruto(),
                    AssuntoBruto = k[i + 4].Bruto(),
                    NaoAntes = Tempo(k[i + 3].Kids[0]),
                    NaoDepois = Tempo(k[i + 3].Kids[1])
                };
                var spki = k[i + 5];
                if (Oid(spki.Kids[0].Kids[0]) != OidRsa) throw new FormatException();
                var chave = SemBitsLivres(spki.Kids[1]);
                var par = Node.Ler(chave, 0, chave.Length, 0);
                c.Modulo = SemZeros(par.Kids[0].Conteudo());
                c.Expoente = SemZeros(par.Kids[1].Conteudo());
                if (c.Modulo.Length > 512 || c.Expoente.Length > 4) throw new FormatException(); // chave acima de 4096 bits ou expoente acima de 32 bits: conta cara, nunca é do gov.br
                for (var j = i + 6; j < k.Count; j++)
                {
                    if (k[j].Tag != 0xA3) continue;
                    foreach (var ext in k[j].Kids[0].Kids)
                    {
                        if (Oid(ext.Kids[0]) != OidSan) continue;
                        var octetos = ext.Kids[ext.Kids.Count - 1].Conteudo();
                        foreach (var nome in Node.Ler(octetos, 0, octetos.Length, 0).Kids)
                        {
                            if (nome.Tag != 0xA0 || nome.Kids.Count < 2 || Oid(nome.Kids[0]) != OidCpfIcp) continue;
                            var valor = nome.Kids[1].Kids[0].Conteudo();
                            // 2.16.76.1.3.1: nascimento DDMMAAAA (8) + CPF (11) + NIS (11) + RG...
                            if (valor.Length < 19) continue;
                            var cpf = Encoding.ASCII.GetString(valor, 8, 11);
                            if (Digitos(cpf).Length == 11) c.Cpf = cpf;
                        }
                    }
                }
                return c;
            }

            private static byte[] SemBitsLivres(Node bitString)
            {
                if (bitString.Tag != 0x03 || bitString.ContentEnd - bitString.Content < 2) throw new FormatException();
                var r = new byte[bitString.ContentEnd - bitString.Content - 1];
                Buffer.BlockCopy(bitString.B, bitString.Content + 1, r, 0, r.Length);
                return r;
            }

            public static DateTime Tempo(Node n)
            {
                var s = Encoding.ASCII.GetString(n.B, n.Content, n.ContentEnd - n.Content);
                int ano, resto;
                if (n.Tag == 0x17) { ano = int.Parse(s.Substring(0, 2)); ano += ano >= 50 ? 1900 : 2000; resto = 2; }
                else if (n.Tag == 0x18) { ano = int.Parse(s.Substring(0, 4)); resto = 4; }
                else throw new FormatException();
                int P(int off) => int.Parse(s.Substring(resto + off, 2));
                return new DateTime(ano, P(0), P(2), P(4), P(6), s.Length >= resto + 10 && char.IsDigit(s[resto + 8]) ? P(8) : 0, DateTimeKind.Utc);
            }
        }
    }
}
