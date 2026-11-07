using System;
using System.Collections.Generic;
using System.Linq;
using Betinhos.DriverRecordSharing;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TrackingLinkPayloadTests
    {
        private static Dictionary<string, object> Basic() => new Dictionary<string, object> { ["placa"] = "RUH7G45", ["embarque"] = "Av. Paulista" };

        private static byte[] Jpeg(int size)
        {
            var bytes = new byte[size];
            bytes[0] = 0xFF; bytes[1] = 0xD8; bytes[2] = 0xFF;
            return bytes;
        }

        [Fact]
        public void WithoutNewData_PayloadStaysEqualToLegacy()
        {
            var result = TrackingLinkPayload.Build(Basic(), new TrackingLinkPayload.Extras());

            Assert.Equal(new[] { "embarque", "placa" }, result.Payload.Keys.OrderBy(k => k).ToArray());
            Assert.Empty(result.Warnings);
        }

        [Fact]
        public void Stops_DropEmptyAndLimitToEight()
        {
            var extras = new TrackingLinkPayload.Extras { Stops = new[] { " Rua A ", "", null, "  ", "B", "C", "D", "E", "F", "G", "H", "I" } };

            var stops = (string[])TrackingLinkPayload.Build(Basic(), extras).Payload["paradas"];

            Assert.Equal(new[] { "Rua A", "B", "C", "D", "E", "F", "G", "H" }, stops);
        }

        [Fact]
        public void OnlyEmptyStops_OmitsKey()
        {
            var extras = new TrackingLinkPayload.Extras { Stops = new[] { "", " " } };

            Assert.False(TrackingLinkPayload.Build(Basic(), extras).Payload.ContainsKey("paradas"));
        }

        [Fact]
        public void Driver_NameAndPhoneGoUnderMotorista()
        {
            var extras = new TrackingLinkPayload.Extras { DriverName = "João", DriverPhone = " +5511900000004 " };

            var driver = (Dictionary<string, object>)TrackingLinkPayload.Build(Basic(), extras).Payload["motorista"];

            Assert.Equal("João", driver["nome"]);
            Assert.Equal("+5511900000004", driver["telefone"]);
            Assert.False(driver.ContainsKey("fotoBase64"));
        }

        [Fact]
        public void DriverPhoto_WithinLimit_IsSentAsDataUri()
        {
            var extras = new TrackingLinkPayload.Extras { DriverName = "João", DriverPhoto = Jpeg(1000) };

            var driver = (Dictionary<string, object>)TrackingLinkPayload.Build(Basic(), extras).Payload["motorista"];

            Assert.StartsWith("data:image/jpeg;base64,", (string)driver["fotoBase64"]);
        }

        [Fact]
        public void DriverPhoto_AboveLimit_IsOmittedWithWarning()
        {
            var extras = new TrackingLinkPayload.Extras { DriverName = "João", DriverPhoto = Jpeg(TrackingLinkPayload.MaxPhotoBytes + 1) };

            var result = TrackingLinkPayload.Build(Basic(), extras);

            Assert.False(((Dictionary<string, object>)result.Payload["motorista"]).ContainsKey("fotoBase64"));
            Assert.Contains("foto do motorista acima do limite", result.Warnings);
        }

        [Fact]
        public void VehiclePhoto_AtExactLimit_IsSent_AndPngAndWebpAreRecognized()
        {
            var png = new byte[TrackingLinkPayload.MaxPhotoBytes];
            png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
            var result = TrackingLinkPayload.Build(Basic(), new TrackingLinkPayload.Extras { VehiclePhoto = png });
            Assert.StartsWith("data:image/png;base64,", (string)((Dictionary<string, object>)result.Payload["veiculo"])["fotoBase64"]);

            var webp = new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50 };
            result = TrackingLinkPayload.Build(Basic(), new TrackingLinkPayload.Extras { VehiclePhoto = webp });
            Assert.StartsWith("data:image/webp;base64,", (string)((Dictionary<string, object>)result.Payload["veiculo"])["fotoBase64"]);
        }

        [Fact]
        public void UnknownImageFormat_IsOmittedWithWarning()
        {
            var result = TrackingLinkPayload.Build(Basic(), new TrackingLinkPayload.Extras { VehiclePhoto = new byte[] { 1, 2, 3, 4 } });

            Assert.False(result.Payload.ContainsKey("veiculo"));
            Assert.Contains("foto do veículo em formato não suportado", result.Warnings);
        }

        [Fact]
        public void Build_DoesNotMutateTheBasePayload()
        {
            var basic = Basic();
            TrackingLinkPayload.Build(basic, new TrackingLinkPayload.Extras { Stops = new[] { "x" } });

            Assert.False(basic.ContainsKey("paradas"));
        }
    }

    public sealed class VehiclePhotoRulesTests
    {
        [Fact]
        public void Folder_FollowsFrotaRule_DevHasExtraSegment()
        {
            var id = Guid.Parse("ABCDEF01-2345-6789-ABCD-EF0123456789");

            Assert.Equal("Veiculos/DEV/abcdef01-2345-6789-abcd-ef0123456789/Foto", VehiclePhotoRules.Folder(id, true));
            Assert.Equal("Veiculos/abcdef01-2345-6789-abcd-ef0123456789/Foto", VehiclePhotoRules.Folder(id, false));
        }

        private static readonly Guid VehicleId = Guid.Parse("abcdef01-2345-6789-abcd-ef0123456789");

        [Fact]
        public void FindPrincipal_FallsBackToTheOtherFolder_WhenFirstHasNoImage()
        {
            var asked = new List<string>();
            Func<string, IEnumerable<VehiclePhotoRules.SpFile>> list = folder =>
            {
                asked.Add(folder);
                return folder.Contains("/DEV/") ? new List<VehiclePhotoRules.SpFile>() : new List<VehiclePhotoRules.SpFile> { new VehiclePhotoRules.SpFile { Name = "a.png", ModifiedAt = "1" } };
            };

            var found = VehiclePhotoRules.FindPrincipal(VehicleId, true, list, () => true);

            Assert.Equal("a.png", found.File.Name);
            Assert.Equal(VehiclePhotoRules.Folder(VehicleId, false), found.Folder);
            Assert.Equal(new[] { VehiclePhotoRules.Folder(VehicleId, true), VehiclePhotoRules.Folder(VehicleId, false) }, asked.ToArray());
        }

        [Fact]
        public void FindPrincipal_StopsAtFirstFolderWithImage_AndSkipsSecondWithoutTime()
        {
            var asked = 0;
            Func<string, IEnumerable<VehiclePhotoRules.SpFile>> list = folder => { asked++; return new List<VehiclePhotoRules.SpFile>(); };

            Assert.Null(VehiclePhotoRules.FindPrincipal(VehicleId, false, list, () => false));
            Assert.Equal(1, asked);

            asked = 0;
            Func<string, IEnumerable<VehiclePhotoRules.SpFile>> hit = folder => { asked++; return new[] { new VehiclePhotoRules.SpFile { Name = "x.jpg" } }; };
            Assert.Equal(VehiclePhotoRules.Folder(VehicleId, false), VehiclePhotoRules.FindPrincipal(VehicleId, false, hit, () => true).Folder);
            Assert.Equal(1, asked);
        }

        [Fact]
        public void ChoosePrincipal_IsNewestImage_IgnoringOtherFiles()
        {
            var files = new List<VehiclePhotoRules.SpFile>
            {
                new VehiclePhotoRules.SpFile { Name = "a.png", ModifiedAt = "2026-10-01T10:00:00Z" },
                new VehiclePhotoRules.SpFile { Name = "doc.pdf", ModifiedAt = "2026-10-20T10:00:00Z" },
                new VehiclePhotoRules.SpFile { Name = "b.JPG", ModifiedAt = "2026-10-10T10:00:00Z" }
            };

            Assert.Equal("b.JPG", VehiclePhotoRules.ChoosePrincipal(files).Name);
            Assert.Null(VehiclePhotoRules.ChoosePrincipal(new List<VehiclePhotoRules.SpFile>()));
        }

        [Fact]
        public void Shrink_ReducesTo1024pxAnd400Kb_AndRejectsGarbage()
        {
            byte[] source;
            using (var bmp = new System.Drawing.Bitmap(2000, 1500))
            {
                var rnd = new Random(1);
                for (var x = 0; x < 2000; x += 3)
                    for (var y = 0; y < 1500; y += 3)
                        bmp.SetPixel(x, y, System.Drawing.Color.FromArgb(rnd.Next(256), rnd.Next(256), rnd.Next(256)));
                using (var ms = new System.IO.MemoryStream())
                {
                    bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                    source = ms.ToArray();
                }
            }

            var small = PhotoShrinker.Shrink(source);

            Assert.NotNull(small);
            Assert.True(small.Length <= TrackingLinkPayload.MaxPhotoBytes);
            using (var img = System.Drawing.Image.FromStream(new System.IO.MemoryStream(small)))
                Assert.True(Math.Max(img.Width, img.Height) <= 1024);
            Assert.Null(PhotoShrinker.Shrink(new byte[] { 1, 2, 3 }));
        }

        [Fact]
        public void Prepare_SmallPhoto_SkipsShrinkAndKeepsOriginalType()
        {
            var png = new byte[83 * 1024];
            png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
            var called = false;

            var result = PhotoShrinker.Prepare(png, null, b => { called = true; return null; });

            Assert.False(called);
            Assert.Same(png, result);
            var payload = TrackingLinkPayload.Build(new System.Collections.Generic.Dictionary<string, object>(), new TrackingLinkPayload.Extras { VehiclePhoto = result }).Payload;
            Assert.StartsWith("data:image/png;base64,", (string)((System.Collections.Generic.Dictionary<string, object>)payload["veiculo"])["fotoBase64"]);
        }

        [Fact]
        public void Prepare_ShrinkThatThrows_ReturnsNullAndTracesOnlyTheTypeName()
        {
            var big = new byte[TrackingLinkPayload.MaxPhotoBytes + 1];
            string traced = null;

            var result = PhotoShrinker.Prepare(big, m => traced = m, b => throw new System.Security.SecurityException("segredo/URL"));

            Assert.Null(result);
            Assert.Equal("Shrink falhou: SecurityException", traced);
        }

        [Fact]
        public void Shrink_RejectsAbove40Megapixels()
        {
            Assert.True(PhotoShrinker.ExceedsPixelLimit(7000, 6000));
            Assert.False(PhotoShrinker.ExceedsPixelLimit(6000, 6000));
        }

        [Fact]
        public void BoundedReader_ReadsAll_AndStopsAtLimitOrDeadline()
        {
            var data = new byte[1000];
            Assert.Equal(1000, BoundedReader.ReadAll(new System.IO.MemoryStream(data), 1000, () => false).Length);
            Assert.Null(BoundedReader.ReadAll(new System.IO.MemoryStream(data), 999, () => false));
            Assert.Null(BoundedReader.ReadAll(new System.IO.MemoryStream(data), 1000, () => true));
        }
    }
}
