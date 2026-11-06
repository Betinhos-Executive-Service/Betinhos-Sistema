using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Reduz a foto para no máximo 1024 px no maior lado e 400 KB (JPEG). Devolve null se a imagem for inválida
    // ou não couber no limite.
    public static class PhotoShrinker
    {
        public const int MaxSide = 1024;
        public const long MaxPixels = 40L * 1000 * 1000;

        public static bool ExceedsPixelLimit(int width, int height)
        {
            return (long)width * height > MaxPixels;
        }

        // Foto até o limite segue com os bytes originais (sem tocar no System.Drawing, que pode ser
        // bloqueado no sandbox); acima do limite é reduzida. Falha na redução: trace só com o tipo da exceção e null.
        public static byte[] Prepare(byte[] source, Action<string> trace)
        {
            return Prepare(source, trace, ShrinkOrThrow);
        }

        public static byte[] Prepare(byte[] source, Action<string> trace, Func<byte[], byte[]> shrink)
        {
            if (source == null || source.Length == 0) return null;
            if (source.Length <= TrackingLinkPayload.MaxPhotoBytes)
            {
                if (trace != null) trace("seguiu original (" + source.Length + " bytes)");
                return source;
            }
            try
            {
                var reduced = shrink(source);
                if (trace != null) trace(reduced == null ? "redução sem resultado" : "reduzida (" + reduced.Length + " bytes)");
                return reduced;
            }
            catch (Exception error)
            {
                if (trace != null) trace("Shrink falhou: " + error.GetType().Name);
                return null;
            }
        }

        public static byte[] Shrink(byte[] source)
        {
            try
            {
                return ShrinkOrThrow(source);
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static byte[] ShrinkOrThrow(byte[] source)
        {
            if (source == null || source.Length == 0) return null;
            {
                using (var input = new MemoryStream(source))
                using (var original = Image.FromStream(input, false, false))
                {
                    if (ExceedsPixelLimit(original.Width, original.Height)) return null;
                    var scale = Math.Min(1.0, (double)MaxSide / Math.Max(original.Width, original.Height));
                    var width = Math.Max(1, (int)Math.Round(original.Width * scale));
                    var height = Math.Max(1, (int)Math.Round(original.Height * scale));
                    using (var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb))
                    {
                        using (var g = Graphics.FromImage(bitmap))
                        {
                            g.Clear(Color.White);
                            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            g.DrawImage(original, 0, 0, width, height);
                        }
                        var codec = ImageCodecInfo.GetImageEncoders().First(e => e.FormatID == ImageFormat.Jpeg.Guid);
                        foreach (var quality in new long[] { 90, 82, 72, 60, 45 })
                        {
                            using (var parameters = new EncoderParameters(1))
                            using (var output = new MemoryStream())
                            {
                                parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                                bitmap.Save(output, codec, parameters);
                                if (output.Length <= TrackingLinkPayload.MaxPhotoBytes) return output.ToArray();
                            }
                        }
                        return null;
                    }
                }
            }
        }
    }
}
