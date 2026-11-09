using Betinhos.AutoNumberGuard;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.AutoNumberGuard.Tests
{
    public class ReservaIdSanitizerTests
    {
        private static Entity Reserva(object id)
        {
            var entity = new Entity(ReservaIdSanitizer.EntityName);
            entity[ReservaIdSanitizer.IdAttribute] = id;
            return entity;
        }

        [Theory]
        [InlineData("U")]
        [InlineData("QY")]
        [InlineData("")]
        [InlineData(" OS-1887")]
        [InlineData("OS-")]
        [InlineData("a7f718ff-dbb8-f111-aaae-7ced8da8c473-1")]
        public void Remove_valores_fora_do_formato_OS(string valor)
        {
            var target = Reserva(valor);

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Equal(valor, removido);
            Assert.False(target.Attributes.Contains(ReservaIdSanitizer.IdAttribute));
        }

        [Fact]
        public void Remove_valor_nulo()
        {
            var target = Reserva(null);

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Null(removido);
            Assert.False(target.Attributes.Contains(ReservaIdSanitizer.IdAttribute));
        }

        [Theory]
        [InlineData("OS-1")]
        [InlineData("OS-9689")]
        public void Remove_numero_OS_deduzido_pelo_cliente(string valor)
        {
            var target = Reserva(valor);

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Equal(valor, removido);
            Assert.False(target.Attributes.Contains(ReservaIdSanitizer.IdAttribute));
        }

        [Theory]
        [InlineData("Y")]
        [InlineData("")]
        [InlineData("OS-12")]
        [InlineData("37791a")]
        public void Servico_por_passageiro_remove_valores_nao_numericos(string valor)
        {
            var target = new Entity(ReservaIdSanitizer.ServicePassengerEntityName);
            target[ReservaIdSanitizer.IdAttribute] = valor;

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Equal(valor, removido);
            Assert.False(target.Attributes.Contains(ReservaIdSanitizer.IdAttribute));
        }

        [Fact]
        public void Servico_por_passageiro_remove_numero_deduzido()
        {
            var target = new Entity(ReservaIdSanitizer.ServicePassengerEntityName);
            target[ReservaIdSanitizer.IdAttribute] = "37791";

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Equal("37791", removido);
            Assert.False(target.Attributes.Contains(ReservaIdSanitizer.IdAttribute));
        }

        [Fact]
        public void Ignora_quando_campo_nao_foi_enviado()
        {
            var target = new Entity(ReservaIdSanitizer.EntityName);

            Assert.False(ReservaIdSanitizer.Sanitize(target, out _));
        }

        [Theory]
        [InlineData("N")]
        [InlineData("OL")]
        [InlineData("PZ")]
        [InlineData("OM-1280")]
        public void Manutencao_remove_qualquer_valor_enviado(string valor)
        {
            var target = new Entity(ReservaIdSanitizer.MaintenanceEntityName);
            target[ReservaIdSanitizer.IdAttribute] = valor;

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Equal(valor, removido);
            Assert.False(target.Attributes.Contains(ReservaIdSanitizer.IdAttribute));
        }

        [Theory]
        [InlineData("cr40f_composicaodeprecos", "cr40f_id")]
        [InlineData("cr40f_financeiro", "cr40f_idfinanceiro")]
        [InlineData("cr40f_pagantes", "cr40f_id")]
        [InlineData("cr40f_trocasdecarro", "cr40f_id")]
        [InlineData("new_possedeveiculo", "new_id")]
        [InlineData("new_marketing", "new_id")]
        [InlineData("new_centraldenotificacoes", "new_id")]
        public void Remove_valor_da_coluna_de_cada_tabela(string tabela, string coluna)
        {
            var target = new Entity(tabela);
            target[coluna] = "MB";
            target["outra"] = "fica";

            Assert.True(ReservaIdSanitizer.Sanitize(target, out var removido));
            Assert.Equal("MB", removido);
            Assert.False(target.Attributes.Contains(coluna));
            Assert.Equal("fica", target["outra"]);
        }

        [Fact]
        public void Financeiro_ignora_cr40f_id_que_nao_e_a_coluna_numerada()
        {
            var target = new Entity("cr40f_financeiro");
            target["cr40f_id"] = "X";

            Assert.False(ReservaIdSanitizer.Sanitize(target, out _));
            Assert.Equal("X", target["cr40f_id"]);
        }

        [Fact]
        public void Ignora_outras_tabelas()
        {
            var target = new Entity("cr40f_multas");
            target[ReservaIdSanitizer.IdAttribute] = "X";

            Assert.False(ReservaIdSanitizer.Sanitize(target, out _));
            Assert.Equal("X", target[ReservaIdSanitizer.IdAttribute]);
        }
    }
}
