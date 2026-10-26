using Betinhos.Planner.AutoNumberGuard;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.Planner.AutoNumberGuard.Tests
{
    public class QuoteNumberSanitizerTests
    {
        private static Entity Quote(string title = "Van para Kenvue")
        {
            var entity = new Entity(QuoteNumberSanitizer.EntityName);
            entity[QuoteNumberSanitizer.TitleAttribute] = title;
            return entity;
        }

        [Theory]
        [InlineData("COT-1025")]
        [InlineData("COT-12345678")]
        [InlineData("G")]
        [InlineData("")]
        [InlineData(null)]
        public void Sempre_remove_numero_da_cotacao(string valor)
        {
            var target = Quote();
            target[QuoteNumberSanitizer.NumberAttribute] = valor;

            var removed = QuoteNumberSanitizer.Sanitize(target);

            Assert.False(target.Attributes.Contains(QuoteNumberSanitizer.NumberAttribute));
            Assert.Equal(valor, removed[QuoteNumberSanitizer.NumberAttribute]);
        }

        [Theory]
        [InlineData("G")]
        [InlineData("MB")]
        [InlineData("PY")]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData(null)]
        public void Troca_titulo_vazio_ou_injetado_pelo_mcp(string valor)
        {
            var target = Quote(valor);

            var removed = QuoteNumberSanitizer.Sanitize(target);

            Assert.Equal(QuoteNumberSanitizer.DefaultTitle, target[QuoteNumberSanitizer.TitleAttribute]);
            Assert.Equal(valor, removed[QuoteNumberSanitizer.TitleAttribute]);
        }

        [Theory]
        [InlineData("Van para Luís Riello (Kenvue) - SP / SJC / SP")]
        [InlineData("TESTE")]
        [InlineData("Ab")]
        [InlineData("COT-1030")]
        public void Mantem_titulo_real(string valor)
        {
            var target = Quote(valor);

            var removed = QuoteNumberSanitizer.Sanitize(target);

            Assert.Empty(removed);
            Assert.Equal(valor, target[QuoteNumberSanitizer.TitleAttribute]);
        }

        [Fact]
        public void Ignora_outras_tabelas()
        {
            var target = new Entity("cr40f_reservadeveculos");
            target[QuoteNumberSanitizer.NumberAttribute] = "COT-1";
            target[QuoteNumberSanitizer.TitleAttribute] = "G";

            Assert.Empty(QuoteNumberSanitizer.Sanitize(target));
            Assert.True(target.Attributes.Contains(QuoteNumberSanitizer.NumberAttribute));
        }

        [Fact]
        public void Payload_sem_colunas_de_numeracao_nao_muda()
        {
            var target = new Entity(QuoteNumberSanitizer.EntityName);
            target["cr40f_clienteempresa"] = "Kenvue";

            Assert.Empty(QuoteNumberSanitizer.Sanitize(target));
            Assert.Single(target.Attributes);
        }
    }
}
