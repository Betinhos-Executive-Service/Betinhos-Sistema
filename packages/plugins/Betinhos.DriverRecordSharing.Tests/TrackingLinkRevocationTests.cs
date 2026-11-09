using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TrackingLinkRevocationTests
    {
        private static readonly string Id = new string('a', 64);
        private static readonly string Link = "https://acompanhar.example.workers.dev/r/" + Id;

        [Fact]
        public void Completed_Concludes()
        {
            Assert.Equal(TrackingLinkRevocation.LinkAction.Conclude, TrackingLinkRevocation.Decide(202410008, Link));
        }

        [Theory]
        [InlineData(202410002)]
        [InlineData(202410010)]
        public void Canceled_Revokes(int status)
        {
            Assert.Equal(TrackingLinkRevocation.LinkAction.Revoke, TrackingLinkRevocation.Decide(status, Link));
        }

        [Theory]
        [InlineData(202410000)]
        [InlineData(202410001)]
        [InlineData(202410004)]
        [InlineData(202410005)]
        [InlineData(202410006)]
        [InlineData(100000001)]
        public void OtherStatuses_DoNothing(int status)
        {
            Assert.Equal(TrackingLinkRevocation.LinkAction.None, TrackingLinkRevocation.Decide(status, Link));
        }

        [Fact]
        public void NoLinkOrNoStatus_DoNothing()
        {
            Assert.Equal(TrackingLinkRevocation.LinkAction.None, TrackingLinkRevocation.Decide(202410008, null));
            Assert.Equal(TrackingLinkRevocation.LinkAction.None, TrackingLinkRevocation.Decide(202410002, "  "));
            Assert.Equal(TrackingLinkRevocation.LinkAction.None, TrackingLinkRevocation.Decide(null, Link));
        }

        [Fact]
        public void ShortBase62Id_IsExtractedKeepingCase_AndUsedInUrls()
        {
            Assert.Equal("aB3dE5fG7hJ9", TrackingLinkRevocation.ExtractId("https://x.dev/r/aB3dE5fG7hJ9"));
            Assert.Equal("https://w.dev/api/links/aB3dE5fG7hJ9", TrackingLinkRevocation.BuildLinkUrl("https://w.dev/api/links", "aB3dE5fG7hJ9"));
            Assert.Equal("https://w.dev/api/links/aB3dE5fG7hJ9/concluir", TrackingLinkRevocation.BuildConcludeUrl("https://w.dev/api/links", "aB3dE5fG7hJ9"));
        }

        [Theory]
        [InlineData("aB3dE5fG7hJ")]
        [InlineData("aB3dE5fG7hJ99")]
        [InlineData("aB3dE5fG7h-9")]
        public void OtherLengthsOrChars_AreRejected(string id)
        {
            Assert.Null(TrackingLinkRevocation.ExtractId("https://x.dev/r/" + id));
            Assert.Null(TrackingLinkRevocation.BuildLinkUrl("https://w.dev/api/links", id));
        }

        [Fact]
        public void BuildConcludeUrl_AppendsConcluir()
        {
            Assert.Equal("https://w.dev/api/links/" + Id + "/concluir", TrackingLinkRevocation.BuildConcludeUrl("https://w.dev/api/links/", Id));
            Assert.Null(TrackingLinkRevocation.BuildConcludeUrl("http://w.dev/api/links", Id));
        }

        [Fact]
        public void ExtractId_ReadsLastSegmentAfterR()
        {
            Assert.Equal(Id, TrackingLinkRevocation.ExtractId(Link));
            Assert.Equal(Id, TrackingLinkRevocation.ExtractId(Link + "/"));
            Assert.Equal(Id, TrackingLinkRevocation.ExtractId("https://x.dev/r/" + Id.ToUpperInvariant() + "?a=1"));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("nao e url")]
        [InlineData("https://x.dev/r/curto")]
        [InlineData("https://x.dev/outro/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
        public void ExtractId_RejectsInvalid(string link)
        {
            Assert.Null(TrackingLinkRevocation.ExtractId(link));
        }

        [Fact]
        public void BuildLinkUrl_AppendsIdAndRequiresHttps()
        {
            Assert.Equal("https://w.dev/api/links/" + Id, TrackingLinkRevocation.BuildLinkUrl("https://w.dev/api/links", Id));
            Assert.Equal("https://w.dev/api/links/" + Id, TrackingLinkRevocation.BuildLinkUrl("https://w.dev/api/links/", Id));
            Assert.Null(TrackingLinkRevocation.BuildLinkUrl("http://w.dev/api/links", Id));
            Assert.Null(TrackingLinkRevocation.BuildLinkUrl("https://w.dev/api/links", "abc"));
            Assert.Null(TrackingLinkRevocation.BuildLinkUrl(null, Id));
        }

        [Fact]
        public void WorkerConfig_ParsesAndRejectsHttp()
        {
            Assert.True(TrackingLinkWorkerConfig.Parse("{\"url\":\"https://w.dev/api/links\",\"segredo\":\"s\"}").IsConfigured);
            Assert.False(TrackingLinkWorkerConfig.Parse("{\"url\":\"http://w.dev/api/links\",\"segredo\":\"s\"}").IsConfigured);
            Assert.False(TrackingLinkWorkerConfig.Parse("lixo").IsConfigured);
            Assert.False(TrackingLinkWorkerConfig.Parse(null).IsConfigured);
        }

        [Theory]
        [InlineData(202410000)]
        [InlineData(202410001)]
        [InlineData(202410004)]
        public void ActiveStatuses_Refresh(int status)
        {
            Assert.True(TrackingLinkRevocation.ShouldRefresh(status, Link));
            Assert.True(TrackingLinkRevocation.ShouldRefresh(status, "https://w.example/r/Ab3dEf6hIj9K"));
        }

        [Theory]
        [InlineData(202410008)]
        [InlineData(202410002)]
        [InlineData(202410010)]
        public void ClosedStatuses_DoNotRefresh(int status)
        {
            Assert.False(TrackingLinkRevocation.ShouldRefresh(status, Link));
        }

        [Fact]
        public void NoOrInvalidLink_DoesNotRefresh()
        {
            Assert.False(TrackingLinkRevocation.ShouldRefresh(202410000, null));
            Assert.False(TrackingLinkRevocation.ShouldRefresh(202410000, "https://w.example/r/curto"));
            Assert.True(TrackingLinkRevocation.ShouldRefresh(null, Link));
        }
    }
}
