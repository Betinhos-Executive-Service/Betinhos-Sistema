using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    // Gerador de PDF 1.4 mínimo e determinístico (sem data interna nem ID), para o termo de multa.
    // A4, margem 40pt, Helvetica/Helvetica-Bold com WinAnsiEncoding; caractere fora do WinAnsi vira "?".
    public sealed class MiniPdf
    {
        private const float PageWidth = 595.28f;
        private const float PageHeight = 841.89f;
        private const float Margin = 40f;
        private const float ContentWidth = PageWidth - 2 * Margin;
        private const float ContentHeight = PageHeight - 2 * Margin;

        private readonly List<Page> pages = new List<Page>();
        private readonly List<Image> images = new List<Image>();
        private Page page;
        private float y;

        public MiniPdf()
        {
            NewPage();
        }

        public void Heading(string text)
        {
            WriteLines("F2", 14f, Wrap(text, 14f, true, ContentWidth, ContentWidth), 4f);
        }

        public void Paragraph(string text, float size = 10)
        {
            WriteLines("F1", size, Wrap(text, size, false, ContentWidth, ContentWidth), size * 0.5f);
        }

        public void KeyValue(string key, string value)
        {
            const float size = 10f;
            var label = (key ?? "") + ": ";
            var labelWidth = Measure(label, size, true);
            var lines = Wrap(value, size, false, Math.Max(ContentWidth - labelWidth, 50f), ContentWidth);
            var lineHeight = size * 1.3f;
            for (var i = 0; i < lines.Count; i++)
            {
                EnsureSpace(lineHeight);
                y -= lineHeight;
                if (i == 0)
                {
                    DrawText("F2", size, Margin, y, label);
                    DrawText("F1", size, Margin + labelWidth, y, lines[0]);
                }
                else
                {
                    DrawText("F1", size, Margin, y, lines[i]);
                }
            }
            y -= 3f;
        }

        public void Jpeg(byte[] jpeg, float maxWidth, float maxHeight)
        {
            if (jpeg == null || jpeg.Length < 4) throw new ArgumentException("JPEG vazio.", nameof(jpeg));
            int width, height, components;
            ReadSof(jpeg, out width, out height, out components);
            var scale = Math.Min(Math.Min(maxWidth, ContentWidth) / width, Math.Min(maxHeight, ContentHeight) / height);
            var w = width * scale;
            var h = height * scale;
            EnsureSpace(h);
            y -= h;
            var image = new Image { Name = "Im" + (images.Count + 1), Data = jpeg, Width = width, Height = height, Components = components };
            images.Add(image);
            page.Images.Add(image);
            page.Content.Append("q ").Append(Num(w)).Append(" 0 0 ").Append(Num(h)).Append(' ')
                .Append(Num(Margin)).Append(' ').Append(Num(y)).Append(" cm /").Append(image.Name).Append(" Do Q\n");
            y -= 6f;
        }

        // Assinatura vetorial: cada traço é uma lista de pontos [x, y] em 0..1 (origem no canto superior esquerdo).
        public void Strokes(IReadOnlyList<IReadOnlyList<double[]>> strokes, float width, float height)
        {
            ValidateStrokes(strokes);
            width = Math.Min(width, ContentWidth);
            height = Math.Min(height, ContentHeight);
            EnsureSpace(height);
            var top = y;
            y -= height;
            var c = page.Content;
            c.Append("q 0 0 0 RG 1.2 w 1 J 1 j\n");
            foreach (var stroke in strokes ?? new List<IReadOnlyList<double[]>>())
            {
                if (stroke == null || stroke.Count == 0) continue;
                for (var i = 0; i < stroke.Count; i++)
                {
                    var p = stroke[i];
                    var px = Margin + (float)Clamp(p[0]) * width;
                    var py = top - (float)Clamp(p[1]) * height;
                    c.Append(Num(px)).Append(' ').Append(Num(py)).Append(i == 0 ? " m\n" : " l\n");
                }
                if (stroke.Count == 1)
                {
                    var p = stroke[0];
                    c.Append(Num(Margin + (float)Clamp(p[0]) * width + 0.5f)).Append(' ')
                        .Append(Num(top - (float)Clamp(p[1]) * height)).Append(" l\n");
                }
                c.Append("S\n");
            }
            c.Append("0.6 G 0.5 w ").Append(Num(Margin)).Append(' ').Append(Num(y)).Append(" m ")
                .Append(Num(Margin + width)).Append(' ').Append(Num(y)).Append(" l S Q\n");
            y -= 6f;
        }

        private static void ValidateStrokes(IReadOnlyList<IReadOnlyList<double[]>> strokes)
        {
            if (strokes == null) return;
            for (var s = 0; s < strokes.Count; s++)
            {
                if (strokes[s] == null) continue;
                for (var i = 0; i < strokes[s].Count; i++)
                {
                    var p = strokes[s][i];
                    if (p == null || p.Length < 2)
                        throw new ArgumentException("Assinatura inválida: o ponto " + i + " do traço " + s + " precisa de 2 coordenadas.", nameof(strokes));
                    if (double.IsNaN(p[0]) || double.IsInfinity(p[0]) || double.IsNaN(p[1]) || double.IsInfinity(p[1]))
                        throw new ArgumentException("Assinatura inválida: o ponto " + i + " do traço " + s + " tem coordenada NaN ou infinita.", nameof(strokes));
                }
            }
        }

        public byte[] ToBytes()
        {
            // Numeração: 1 Catalog, 2 Pages, 3 Helvetica, 4 Helvetica-Bold, imagens, depois página + conteúdo.
            var imageIds = new Dictionary<Image, int>();
            var next = 5;
            foreach (var image in images) imageIds[image] = next++;
            var pageIds = new List<int>();
            foreach (var _ in pages) { pageIds.Add(next); next += 2; }

            var objects = new SortedDictionary<int, byte[]>();
            var kids = new StringBuilder();
            foreach (var id in pageIds) kids.Append(id).Append(" 0 R ");
            objects[1] = Ascii("<< /Type /Catalog /Pages 2 0 R >>");
            objects[2] = Ascii("<< /Type /Pages /Kids [" + kids.ToString().TrimEnd() + "] /Count " + pages.Count + " >>");
            objects[3] = Ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
            objects[4] = Ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

            foreach (var image in images)
            {
                var space = image.Components == 1 ? "/DeviceGray" : image.Components == 4 ? "/DeviceCMYK" : "/DeviceRGB";
                var decode = image.Components == 4 ? " /Decode [1 0 1 0 1 0 1 0]" : "";
                objects[imageIds[image]] = Stream(
                    "<< /Type /XObject /Subtype /Image /Width " + image.Width + " /Height " + image.Height +
                    " /ColorSpace " + space + " /BitsPerComponent 8" + decode + " /Filter /DCTDecode /Length " + image.Data.Length + " >>",
                    image.Data);
            }

            for (var i = 0; i < pages.Count; i++)
            {
                var id = pageIds[i];
                var xobjects = new StringBuilder();
                foreach (var image in pages[i].Images) xobjects.Append('/').Append(image.Name).Append(' ').Append(imageIds[image]).Append(" 0 R ");
                var resources = "/Font << /F1 3 0 R /F2 4 0 R >>" + (xobjects.Length > 0 ? " /XObject << " + xobjects + ">>" : "");
                objects[id] = Ascii("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + Num(PageWidth) + " " + Num(PageHeight) +
                                    "] /Resources << " + resources + " >> /Contents " + (id + 1) + " 0 R >>");
                var content = Latin1.GetBytes(pages[i].Content.ToString());
                objects[id + 1] = Stream("<< /Length " + content.Length + " >>", content);
            }

            using (var ms = new MemoryStream())
            {
                Write(ms, Ascii("%PDF-1.4\n"));
                Write(ms, new byte[] { (byte)'%', 0xE2, 0xE3, 0xCF, 0xD3, (byte)'\n' });
                var offsets = new long[next];
                foreach (var pair in objects)
                {
                    offsets[pair.Key] = ms.Position;
                    Write(ms, Ascii(pair.Key + " 0 obj\n"));
                    Write(ms, pair.Value);
                    Write(ms, Ascii("\nendobj\n"));
                }
                var xref = ms.Position;
                var sb = new StringBuilder();
                sb.Append("xref\n0 ").Append(next).Append('\n').Append("0000000000 65535 f\r\n");
                for (var i = 1; i < next; i++) sb.Append(offsets[i].ToString("D10", CultureInfo.InvariantCulture)).Append(" 00000 n\r\n");
                sb.Append("trailer\n<< /Size ").Append(next).Append(" /Root 1 0 R >>\nstartxref\n").Append(xref).Append("\n%%EOF\n");
                Write(ms, Ascii(sb.ToString()));
                return ms.ToArray();
            }
        }

        private void WriteLines(string font, float size, List<string> lines, float after)
        {
            var lineHeight = size * 1.3f;
            foreach (var line in lines)
            {
                EnsureSpace(lineHeight);
                y -= lineHeight;
                DrawText(font, size, Margin, y, line);
            }
            y -= after;
        }

        private void DrawText(string font, float size, float x, float baseline, string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            page.Content.Append("BT /").Append(font).Append(' ').Append(Num(size)).Append(" Tf ")
                .Append(Num(x)).Append(' ').Append(Num(baseline + size * 0.25f)).Append(" Td (")
                .Append(Escape(text)).Append(") Tj ET\n");
        }

        private void EnsureSpace(float height)
        {
            if (y - height < Margin && y < PageHeight - Margin) NewPage();
        }

        private void NewPage()
        {
            page = new Page();
            pages.Add(page);
            y = PageHeight - Margin;
        }

        private static List<string> Wrap(string text, float size, bool bold, float firstWidth, float width)
        {
            var lines = new List<string>();
            foreach (var raw in (text ?? "").Replace("\r\n", "\n").Split('\n'))
            {
                var current = "";
                foreach (var word in raw.Split(' '))
                {
                    var limit = lines.Count == 0 ? firstWidth : width;
                    var candidate = current.Length == 0 ? word : current + " " + word;
                    if (current.Length > 0 && Measure(candidate, size, bold) > limit)
                    {
                        lines.Add(current);
                        current = word;
                    }
                    else
                    {
                        current = candidate;
                    }
                    // Palavra maior que a linha: corta por caractere.
                    while (Measure(current, size, bold) > (lines.Count == 0 ? firstWidth : width) && current.Length > 1)
                    {
                        var cut = current.Length - 1;
                        while (cut > 1 && Measure(current.Substring(0, cut), size, bold) > (lines.Count == 0 ? firstWidth : width)) cut--;
                        lines.Add(current.Substring(0, cut));
                        current = current.Substring(cut);
                    }
                }
                lines.Add(current);
            }
            return lines;
        }

        private static float Measure(string text, float size, bool bold)
        {
            float units = 0;
            foreach (var ch in text ?? "") units += GlyphWidth(ch);
            return units * size / 1000f * (bold ? 1.06f : 1f);
        }

        // Larguras AFM da Helvetica (32..126); acentuados usam a largura da letra base.
        private static readonly short[] AsciiWidths =
        {
            278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
            556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
            1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
            667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
            333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
            556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
        };

        private static int GlyphWidth(char ch)
        {
            if (ch >= 32 && ch <= 126) return AsciiWidths[ch - 32];
            var decomposed = ch.ToString().Normalize(NormalizationForm.FormD);
            if (decomposed.Length > 0 && decomposed[0] >= 32 && decomposed[0] <= 126) return AsciiWidths[decomposed[0] - 32];
            return ch == '—' ? 1000 : 556;
        }

        // cp1252 nas posições 0x80..0x9F; o resto (0x20..0x7E, 0xA0..0xFF) coincide com Latin-1.
        private static readonly Dictionary<char, byte> WinAnsiExtras = new Dictionary<char, byte>
        {
            ['€'] = 0x80, ['‚'] = 0x82, ['ƒ'] = 0x83, ['„'] = 0x84, ['…'] = 0x85,
            ['†'] = 0x86, ['‡'] = 0x87, ['ˆ'] = 0x88, ['‰'] = 0x89, ['Š'] = 0x8A,
            ['‹'] = 0x8B, ['Œ'] = 0x8C, ['Ž'] = 0x8E, ['‘'] = 0x91, ['’'] = 0x92,
            ['“'] = 0x93, ['”'] = 0x94, ['•'] = 0x95, ['–'] = 0x96, ['—'] = 0x97,
            ['˜'] = 0x98, ['™'] = 0x99, ['š'] = 0x9A, ['›'] = 0x9B, ['œ'] = 0x9C,
            ['ž'] = 0x9E, ['Ÿ'] = 0x9F
        };

        private static string Escape(string text)
        {
            var sb = new StringBuilder(text.Length);
            foreach (var ch in text)
            {
                byte b;
                if (ch == '(' || ch == ')' || ch == '\\') { sb.Append('\\').Append(ch); continue; }
                if ((ch >= 32 && ch <= 126) || (ch >= 0xA0 && ch <= 0xFF)) b = (byte)ch;
                else if (ch == '\t') b = (byte)' ';
                else if (!WinAnsiExtras.TryGetValue(ch, out b)) b = (byte)'?';
                sb.Append((char)b);
            }
            return sb.ToString();
        }

        private static void ReadSof(byte[] jpeg, out int width, out int height, out int components)
        {
            if (jpeg[0] != 0xFF || jpeg[1] != 0xD8) throw new ArgumentException("Arquivo não é JPEG.");
            var i = 2;
            while (i + 9 < jpeg.Length)
            {
                if (jpeg[i] != 0xFF) { i++; continue; }
                var marker = jpeg[i + 1];
                if (marker == 0xFF) { i++; continue; }
                if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
                var length = (jpeg[i + 2] << 8) | jpeg[i + 3];
                var isSof = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
                if (isSof)
                {
                    if (marker == 0xC3 || marker == 0xC7 || marker == 0xCB || marker == 0xCF)
                        throw new ArgumentException("JPEG sem perdas (lossless, SOF" + (marker - 0xC0) + ") não é suportado; envie JPEG baseline ou progressivo.");
                    if (marker >= 0xC9)
                        throw new ArgumentException("JPEG com codificação aritmética (SOF" + (marker - 0xC0) + ") não é suportado; envie JPEG baseline ou progressivo.");
                    height = (jpeg[i + 5] << 8) | jpeg[i + 6];
                    width = (jpeg[i + 7] << 8) | jpeg[i + 8];
                    components = jpeg[i + 9];
                    if (width <= 0 || height <= 0) break;
                    return;
                }
                i += 2 + length;
            }
            throw new ArgumentException("JPEG sem cabeçalho SOF válido.");
        }

        private static double Clamp(double v) => v < 0 ? 0 : v > 1 ? 1 : v;

        private static string Num(float v) => Math.Round(v, 2).ToString("0.##", CultureInfo.InvariantCulture);

        private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

        private static byte[] Ascii(string s) => Encoding.ASCII.GetBytes(s);

        private static byte[] Stream(string dict, byte[] data)
        {
            var head = Ascii(dict + "\nstream\n");
            var tail = Ascii("\nendstream");
            var all = new byte[head.Length + data.Length + tail.Length];
            Buffer.BlockCopy(head, 0, all, 0, head.Length);
            Buffer.BlockCopy(data, 0, all, head.Length, data.Length);
            Buffer.BlockCopy(tail, 0, all, head.Length + data.Length, tail.Length);
            return all;
        }

        private static void Write(Stream s, byte[] b) => s.Write(b, 0, b.Length);

        private sealed class Page
        {
            public readonly StringBuilder Content = new StringBuilder();
            public readonly List<Image> Images = new List<Image>();
        }

        private sealed class Image
        {
            public string Name;
            public byte[] Data;
            public int Width;
            public int Height;
            public int Components;
        }
    }

    public static class Sha256Hex
    {
        public static string Of(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(data ?? new byte[0]);
                var sb = new StringBuilder(64);
                foreach (var b in hash) sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
                return sb.ToString();
            }
        }
    }
}
