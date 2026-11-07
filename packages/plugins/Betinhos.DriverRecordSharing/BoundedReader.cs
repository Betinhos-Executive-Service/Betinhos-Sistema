using System;
using System.IO;

namespace Betinhos.DriverRecordSharing
{
    // Lê um stream em buffer limitado: devolve null se passar do máximo de bytes ou se o prazo estourar.
    public static class BoundedReader
    {
        public static byte[] ReadAll(Stream stream, int maxBytes, Func<bool> expired)
        {
            var buffer = new byte[8192];
            using (var output = new MemoryStream())
            {
                int read;
                while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    if (expired() || output.Length + read > maxBytes) return null;
                    output.Write(buffer, 0, read);
                }
                return expired() ? null : output.ToArray();
            }
        }
    }
}
