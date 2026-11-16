using System;
using Xunit;

namespace Cr40f.GerarPagantes.Plugin.Tests;

public sealed class PaymentEmailRendererTests
{
    [Fact]
    public void Saudacao_e_do_pagante_mesmo_com_destinatario_cadastrado()
    {
        var payer = new PaganteRequest
        {
            Name = "Fernanda Pedrosa Runha",
            RecipientId = Guid.NewGuid(),
            RecipientName = "Erika Tamezava",
            RecipientEmail = "erika@exemplo.com",
            AmountCents = 95296,
        };

        var email = new PaymentEmailRenderer().Render(new GerarPagantesRequest(), payer, "https://exemplo.com/pagar");

        Assert.Contains("Fernanda Pedrosa Runha", email.HtmlBody);
        Assert.DoesNotContain("Erika", email.HtmlBody);
    }
}
