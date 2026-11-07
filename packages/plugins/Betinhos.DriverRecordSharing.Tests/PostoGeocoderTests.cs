using System;
using System.Net;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class PostoGeocoderTests
    {
        private const string Brasil = "{\"razao_social\":\"AUTO POSTO X LTDA\",\"nome_fantasia\":\"Posto X\",\"descricao_tipo_de_logradouro\":\"AVENIDA\",\"logradouro\":\"PAULISTA\",\"numero\":\"1000\",\"bairro\":\"BELA VISTA\",\"municipio\":\"SAO PAULO\",\"uf\":\"SP\",\"cep\":\"01310100\"}";
        private const string Nominatim = "[{\"lat\":\"-23.5614\",\"lon\":\"-46.6559\",\"place_rank\":30}]";

        [Fact]
        public void Resolve_FullSuccess()
        {
            string nominatimUrl = null;
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) =>
            {
                if (url.StartsWith("https://brasilapi.com.br/api/cnpj/v1/07108241000106")) return Brasil;
                nominatimUrl = url;
                return Nominatim;
            });

            Assert.Equal("geocodificado", posto.Status);
            Assert.Equal("Posto X", posto.Nome);
            Assert.Equal("AVENIDA PAULISTA", posto.Logradouro);
            Assert.Equal("BELA VISTA", posto.Bairro);
            Assert.Equal(-23.5614, posto.Lat);
            Assert.Equal("rua", posto.Precisao);
            Assert.Contains("street=1000%20AVENIDA%20PAULISTA", nominatimUrl);
            Assert.Contains("countrycodes=br", nominatimUrl);
        }

        [Fact]
        public void Resolve_UsaCoordenadaDaAnpSemChamarNominatim()
        {
            var nominatim = 0;
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) =>
            {
                if (url.Contains("brasilapi")) return Brasil;
                if (url.Contains("nominatim")) { nominatim++; return "[]"; }
                return "{\"data\":[{\"latitude\":\"-23.2318869\",\"longitude\":\"-45.9011208\"}]}";
            });

            Assert.Equal(-23.2318869, posto.Lat);
            Assert.Equal(-45.9011208, posto.Lon);
            Assert.Equal(PostoGeocoder.PrecisaoAnp, posto.Precisao);
            Assert.Equal("geocodificado", posto.Status);
            Assert.Equal(0, nominatim);
        }

        [Theory]
        [InlineData("{\"data\":[{\"latitude\":\"\",\"longitude\":\"\"}]}")] // posto sem coordenada na ANP
        [InlineData("{\"data\":[]}")]
        [InlineData("<html>429</html>")] // limite de chamadas
        [InlineData("{\"data\":[{\"latitude\":\"23.2318869\",\"longitude\":\"45.9011208\"}]}")] // sinal errado no cadastro
        [InlineData("{\"data\":[{\"latitude\":\"-232318869\",\"longitude\":\"-459011208\"}]}")] // sem separador decimal
        public void Resolve_SemCoordenadaDaAnpUsaNominatim(string respostaAnp)
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) =>
                url.Contains("brasilapi") ? Brasil : url.Contains("anp.gov.br") ? respostaAnp : "[{\"lat\":\"-23.5\",\"lon\":\"-46.6\",\"place_rank\":26}]");

            Assert.Equal(-23.5, posto.Lat);
            Assert.Equal("rua", posto.Precisao);
        }

        [Theory]
        [InlineData("<html>429</html>", true)]
        [InlineData("{\"data\":[]}", false)]
        public void Resolve_SoFalhaDeChamadaDaAnpEhTemporaria(string respostaAnp, bool temporaria)
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) =>
                url.Contains("brasilapi") ? Brasil : url.Contains("anp.gov.br") ? respostaAnp : "[]");

            Assert.Equal(temporaria, posto.FalhaTemporaria);
        }

        [Fact]
        public void Resolve_FalhaDaBrasilApiOuDoNominatimEhTemporaria()
        {
            Assert.True(PostoGeocoder.Resolve("07108241000106", (url, ms) => throw new WebException("429")).FalhaTemporaria);
            Assert.True(PostoGeocoder.Resolve("07108241000106", (url, ms) =>
            {
                if (url.Contains("brasilapi")) return Brasil;
                if (url.Contains("nominatim")) throw new WebException("timeout");
                return "{\"data\":[]}";
            }).FalhaTemporaria);
        }

        [Fact]
        public void Resolve_AdiandoNaoChamaNominatimQuandoAnpFalha()
        {
            var nominatim = 0;
            PostoGeocoder.Resolve("07108241000106", (url, ms) =>
            {
                if (url.Contains("brasilapi")) return Brasil;
                if (url.Contains("nominatim")) { nominatim++; return "[]"; }
                return "<html>429</html>";
            }, adiarSeFalhar: true);
            Assert.Equal(0, nominatim);
        }

        [Fact]
        public void Resolve_BrasilApiFails_IsPending()
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) => throw new WebException("404"));
            Assert.Equal("pendente", posto.Status);
            Assert.Null(posto.Lat);
        }

        [Fact]
        public void Resolve_NominatimEmpty_KeepsAddressPending()
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) => url.Contains("brasilapi") ? Brasil : "[]");
            Assert.Equal("pendente", posto.Status);
            Assert.Equal("Posto X", posto.Nome);
        }

        [Fact]
        public void Resolve_CityLevel_IsPending()
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) => url.Contains("brasilapi") ? Brasil : "[{\"lat\":\"-23.5\",\"lon\":\"-46.6\",\"place_rank\":12}]");
            Assert.Equal("pendente", posto.Status);
            Assert.Equal("cidade", posto.Precisao);
        }
    }
}
