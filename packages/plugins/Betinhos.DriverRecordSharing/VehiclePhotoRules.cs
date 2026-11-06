using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Betinhos.DriverRecordSharing
{
    // Mesmas regras da Frota (apps/shell/src/pages/frota/data/sharepoint.ts): pasta por veículo
    // e foto principal = imagem modificada mais recentemente.
    public static class VehiclePhotoRules
    {
        private static readonly Regex Image = new Regex(@"\.(png|jpe?g|webp)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        public sealed class SpFile
        {
            public string Id { get; set; }
            public string Name { get; set; }
            public string Path { get; set; }
            public string ModifiedAt { get; set; }
        }

        public static string Folder(Guid vehicleId, bool isDev)
        {
            return "Veiculos/" + (isDev ? "DEV/" : "") + vehicleId.ToString("D").ToLowerInvariant() + "/Foto";
        }

        public sealed class Found
        {
            public SpFile File { get; set; }
            public string Folder { get; set; }
        }

        // Lista primeiro a pasta do ambiente detectado; sem imagem, tenta a outra (com/sem "DEV/"). Os GUIDs de
        // veículo são únicos por ambiente, então não há risco de pegar foto de outro ambiente. A segunda
        // tentativa só ocorre se ainda houver tempo.
        public static Found FindPrincipal(Guid vehicleId, bool isDev, Func<string, IEnumerable<SpFile>> list, Func<bool> hasTime)
        {
            foreach (var dev in new[] { isDev, !isDev })
            {
                if (dev != isDev && !hasTime()) return null;
                var folder = Folder(vehicleId, dev);
                var principal = ChoosePrincipal(list(folder) ?? Enumerable.Empty<SpFile>());
                if (principal != null) return new Found { File = principal, Folder = folder };
            }
            return null;
        }

        public static SpFile ChoosePrincipal(IEnumerable<SpFile> files)
        {
            return files
                .Where(f => f != null && f.Name != null && Image.IsMatch(f.Name))
                .OrderByDescending(f => f.ModifiedAt ?? "", StringComparer.Ordinal)
                .FirstOrDefault();
        }
    }
}
