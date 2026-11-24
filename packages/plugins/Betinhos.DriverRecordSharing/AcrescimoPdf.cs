using System;
using System.Collections.Generic;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Integridade do texto do aditivo assinado pelo próprio motorista. A assinatura do gov.br só prova que o arquivo não mudou depois de assinado;
    /// quem assina é o motorista, então ele poderia acrescentar uma atualização incremental que troca o conteúdo da página e assinar o resultado.
    /// Aqui o PDF devolvido tem de ser o gerado (bytes intactos, conferido por <see cref="AditivoPdf.Conferir"/>) mais uma revisão no formato do assinador:
    /// seção xref clássica + trailer com /Prev e o mesmo /Root, que reescreve só o Catalog (mesmo /Pages, ganha /AcroForm) e a Page (mesmo /Contents
    /// e mesmo /Resources, ganha /Annots) e cria objetos novos (campo de assinatura, /Type /Sig, aparência). Qualquer outro objeto já existente reescrito,
    /// /Type /Pages, /ObjStm ou /XRef na parte acrescentada, entrada livre no xref, /XRefStm ou parte acrescentada acima de 512 KB: recusa.
    /// Resíduo não tratado: o carimbo visual da assinatura (o widget) pode ser posicionado por cima do texto e escondê-lo; a conferência é estrutural,
    /// não visual. Só o fluxo do motorista usa esta conferência; o da gestão segue só com <see cref="AditivoPdf.Conferir"/>.
    /// </summary>
    public static class AcrescimoPdf
    {
        public const string Erro = "O aditivo foi alterado depois de gerado. Baixe o aditivo no App, assine no gov.br e envie o arquivo devolvido, sem mexer nele.";
        public const int LimiteBytes = 512 * 1024;

        private sealed class Entrada { public long Off; public int Gen; public string Flag; }

        /// <summary>Devolve null quando a parte acrescentada é só a assinatura; senão a mensagem de recusa.</summary>
        public static string Conferir(byte[] assinado, byte[] original)
        {
            try { return Estrutura(assinado, original) ? null : Erro; }
            catch (Exception) { return Erro; } // qualquer estrutura que não dá para ler é recusada
        }

        private static bool Estrutura(byte[] assinado, byte[] original)
        {
            if (assinado == null || original == null || assinado.Length <= original.Length) return false;
            if (assinado.Length - original.Length > LimiteBytes) return false;
            for (var i = 0; i < original.Length; i++) if (assinado[i] != original[i]) return false;
            var L = original.Length;
            var chars = new char[assinado.Length];
            for (var i = 0; i < chars.Length; i++) chars[i] = (char)assinado[i];
            var t = new string(chars);

            var acrescimo = t.Substring(L);
            if (acrescimo.IndexOf("/ObjStm", StringComparison.Ordinal) >= 0 || acrescimo.IndexOf("/XRef", StringComparison.Ordinal) >= 0) return false;

            // Original: xref clássica e trailer.
            var sxOrig = t.LastIndexOf("startxref", L - 1, StringComparison.Ordinal);
            if (sxOrig < 0) return false;
            var p = sxOrig + "startxref".Length;
            var offXrefOrig = Inteiro(t, ref p);
            Dictionary<string, string> trailerOrig;
            var xrefOrig = LerXref(t, (int)offXrefOrig, out trailerOrig);

            // Acrescentado: um único xref clássico com /Prev para o original.
            var sx = t.LastIndexOf("startxref", StringComparison.Ordinal);
            if (sx < L) return false;
            p = sx + "startxref".Length;
            var offXref = Inteiro(t, ref p);
            if (offXref < L || offXref >= t.Length) return false;
            Dictionary<string, string> trailer;
            var xref = LerXref(t, (int)offXref, out trailer);
            if (trailer.ContainsKey("XRefStm") || !trailer.ContainsKey("Prev") || !trailer.ContainsKey("Root")) return false;
            if (trailer["Prev"] != offXrefOrig.ToString() || trailer["Root"] != Valor(trailerOrig, "Root")) return false;

            foreach (var par in xref)
            {
                var n = par.Key; var e = par.Value;
                if (e.Flag == "f") { if (n == 0) continue; return false; }
                if (e.Flag != "n" || e.Off < L || e.Off >= offXref) return false;
                int fim; int numero;
                var dict = LerObjeto(t, (int)e.Off, out numero, out fim);
                if (numero != n) return false;
                string tipo; if (dict == null || !dict.TryGetValue("Type", out tipo)) tipo = null;
                if (tipo == "/Pages" || tipo == "/ObjStm" || tipo == "/XRef") return false;
                Entrada orig;
                if (xrefOrig.TryGetValue(n, out orig) && orig.Flag == "n")
                {
                    if (dict == null) return false;
                    int numOrig, fimOrig;
                    var antes = LerObjeto(t, (int)orig.Off, out numOrig, out fimOrig);
                    if (antes == null || numOrig != n) return false;
                    if (tipo == "/Catalog")
                    {
                        if (Valor(antes, "Type") != "/Catalog" || Valor(dict, "Pages") == null || Valor(dict, "Pages") != Valor(antes, "Pages")) return false;
                    }
                    else if (tipo == "/Page")
                    {
                        if (Valor(antes, "Type") != "/Page" || Valor(dict, "Contents") != Valor(antes, "Contents") || Valor(dict, "Resources") != Valor(antes, "Resources")) return false;
                    }
                    else return false;
                }
            }
            return true;
        }

        private static string Valor(Dictionary<string, string> d, string chave)
        {
            string v; return d != null && d.TryGetValue(chave, out v) ? v : null;
        }

        // ---------------- Leitura ----------------

        private static Dictionary<int, Entrada> LerXref(string t, int p, out Dictionary<string, string> trailer)
        {
            var mapa = new Dictionary<int, Entrada>();
            p = Ws(t, p);
            if (string.CompareOrdinal(t, p, "xref", 0, 4) != 0) throw new FormatException();
            p += 4;
            while (true)
            {
                p = Ws(t, p);
                if (string.CompareOrdinal(t, p, "trailer", 0, 7) == 0) { p += 7; break; }
                var inicio = Inteiro(t, ref p); var qtd = Inteiro(t, ref p);
                if (qtd < 0 || qtd > 10000) throw new FormatException();
                for (var i = 0; i < qtd; i++)
                {
                    var off = Inteiro(t, ref p); var gen = (int)Inteiro(t, ref p); var flag = Token(t, ref p);
                    var n = (int)(inicio + i);
                    if (mapa.ContainsKey(n)) throw new FormatException();
                    mapa[n] = new Entrada { Off = off, Gen = gen, Flag = flag };
                }
            }
            int fim;
            p = Ws(t, p);
            trailer = Dicionario(t, p, out fim);
            return mapa;
        }

        private static Dictionary<string, string> LerObjeto(string t, int p, out int numero, out int fim)
        {
            numero = (int)Inteiro(t, ref p);
            Inteiro(t, ref p);
            if (Token(t, ref p) != "obj") throw new FormatException();
            p = Ws(t, p);
            fim = p;
            if (p + 1 < t.Length && t[p] == '<' && t[p + 1] == '<') return Dicionario(t, p, out fim);
            return null;
        }

        private static Dictionary<string, string> Dicionario(string t, int p, out int fim)
        {
            if (p + 1 >= t.Length || t[p] != '<' || t[p + 1] != '<') throw new FormatException();
            var d = new Dictionary<string, string>();
            p += 2;
            while (true)
            {
                p = Ws(t, p);
                if (p + 1 < t.Length && t[p] == '>' && t[p + 1] == '>') { fim = p + 2; return d; }
                if (p >= t.Length || t[p] != '/') throw new FormatException();
                var k0 = ++p;
                while (p < t.Length && !Delim(t[p])) p++;
                var chave = t.Substring(k0, p - k0);
                p = Ws(t, p);
                var v0 = p;
                p = FimValor(t, p);
                if (d.ContainsKey(chave)) throw new FormatException(); // chave repetida: ambíguo, recusa
                d[chave] = Canonico(t.Substring(v0, p - v0));
            }
        }

        private static int FimValor(string t, int p)
        {
            if (p >= t.Length) throw new FormatException();
            var c = t[p];
            if (c == '/') { p++; while (p < t.Length && !Delim(t[p])) p++; return p; }
            if (c == '<' && p + 1 < t.Length && t[p + 1] == '<') { int fim; Dicionario(t, p, out fim); return fim; }
            if (c == '<') { var e = t.IndexOf('>', p); if (e < 0) throw new FormatException(); return e + 1; }
            if (c == '(') return FimString(t, p);
            if (c == '[')
            {
                p++;
                while (true)
                {
                    p = Ws(t, p);
                    if (p >= t.Length) throw new FormatException();
                    if (t[p] == ']') return p + 1;
                    p = FimValor(t, p);
                }
            }
            var q = p;
            while (q < t.Length && !Delim(t[q])) q++;
            if (q == p) throw new FormatException();
            // referência indireta "n g R"
            var guarda = q;
            var a = Ws(t, q);
            var b = a; while (b < t.Length && char.IsDigit(t[b])) b++;
            if (b > a && IsDigits(t, p, q))
            {
                var c2 = Ws(t, b);
                if (c2 < t.Length && t[c2] == 'R' && (c2 + 1 >= t.Length || Delim(t[c2 + 1]))) return c2 + 1;
            }
            return guarda;
        }

        private static bool IsDigits(string t, int a, int b)
        {
            if (b <= a) return false;
            for (var i = a; i < b; i++) if (!char.IsDigit(t[i])) return false;
            return true;
        }

        private static int FimString(string t, int p)
        {
            var nivel = 0;
            for (; p < t.Length; p++)
            {
                if (t[p] == '\\') { p++; continue; }
                if (t[p] == '(') nivel++;
                else if (t[p] == ')' && --nivel == 0) return p + 1;
            }
            throw new FormatException();
        }

        /// <summary>Normaliza espaçamento para comparar dois valores que o assinador pode ter reformatado.</summary>
        private static string Canonico(string s)
        {
            var tok = new List<string>();
            var i = 0;
            while (i < s.Length)
            {
                var c = s[i];
                if (Espaco(c)) { i++; continue; }
                if (c == '<' && i + 1 < s.Length && s[i + 1] == '<') { tok.Add("<<"); i += 2; continue; }
                if (c == '>' && i + 1 < s.Length && s[i + 1] == '>') { tok.Add(">>"); i += 2; continue; }
                if (c == '[' || c == ']') { tok.Add(c.ToString()); i++; continue; }
                if (c == '(') { var e = FimString(s, i); tok.Add(s.Substring(i, e - i)); i = e; continue; }
                if (c == '<') { var e = s.IndexOf('>', i); if (e < 0) throw new FormatException(); tok.Add(s.Substring(i, e - i + 1)); i = e + 1; continue; }
                var j = i + 1;
                while (j < s.Length && !Delim(s[j])) j++;
                tok.Add(s.Substring(i, j - i));
                i = j;
            }
            return string.Join(" ", tok);
        }

        private static bool Espaco(char c) => c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\0';
        private static bool Delim(char c) => Espaco(c) || "()<>[]{}/%".IndexOf(c) >= 0;

        private static int Ws(string t, int p)
        {
            while (p < t.Length && Espaco(t[p])) p++;
            return p;
        }

        private static string Token(string t, ref int p)
        {
            p = Ws(t, p);
            var i = p;
            while (p < t.Length && !Espaco(t[p])) p++;
            if (p == i) throw new FormatException();
            return t.Substring(i, p - i);
        }

        private static long Inteiro(string t, ref int p)
        {
            var tok = Token(t, ref p);
            if (tok.Length > 12) throw new FormatException();
            foreach (var c in tok) if (c < '0' || c > '9') throw new FormatException();
            return long.Parse(tok);
        }
    }
}
