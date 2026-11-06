using Betinhos.DriverRecordSharing;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class ObservationApiKeyTests
    {
        [Fact]
        public void ConfiguracaoSeguraVenceEnaoLeAVariavelDeAmbiente()
        {
            var leu = false;
            var key = ObservationApiKey.Resolve("chave-segura", () => { leu = true; return "chave-env"; });
            Assert.Equal("chave-segura", key);
            Assert.False(leu);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void SemConfiguracaoSeguraUsaAVariavelDeAmbiente(string secure)
        {
            Assert.Equal("chave-env", ObservationApiKey.Resolve(secure, () => "chave-env"));
        }

        [Fact]
        public void SemNenhumaDasDuasDevolveNulo()
        {
            Assert.Null(ObservationApiKey.Resolve(null, () => null));
        }
    }
}
