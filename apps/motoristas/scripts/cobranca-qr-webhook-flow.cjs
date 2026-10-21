// Flow do webhook do Stripe da cobrança por QR. Sem credenciais nem URLs; o provisionador resolve as referências.
// Usa só o id da sessão do evento e pede ao plugin para espelhar o Stripe: o Power Automate não valida a
// assinatura HMAC, então um evento forjado não marca pagamento.
const secured = { secureData: { properties: ["inputs", "outputs"] } };

function connector(operationId, parameters, runAfter = {}) {
  return { type: "OpenApiConnection", runAfter, inputs: {
    host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", connectionName: "shared_commondataserviceforapps", operationId },
    parameters, authentication: "@parameters('$authentication')"
  } };
}

function reply(statusCode, runAfter) {
  return { type: "Response", kind: "Http", runAfter, inputs: { statusCode, headers: { "Content-Type": "application/json" }, body: { recebido: statusCode === 200 } } };
}

module.exports = function cobrancaQrWebhookFlow() {
  return {
    "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
    contentVersion: "1.0.0.0",
    parameters: { "$authentication": { type: "SecureObject", defaultValue: {} }, "$connections": { type: "Object", defaultValue: {} } },
    triggers: { manual: { type: "Request", kind: "Http", runtimeConfiguration: secured, inputs: {
      triggerAuthenticationType: "All",
      schema: { type: "object", properties: { type: { type: "string" }, data: { type: "object" } } }
    } } },
    actions: {
      SessionId: { type: "Compose", inputs: "@coalesce(triggerBody()?['data']?['object']?['id'], '')" },
      // Outros eventos (ou sem sessão do Checkout) só recebem 200 para o Stripe não reenviar.
      EhSessaoCheckout: { type: "If", runAfter: { SessionId: ["Succeeded"] },
        expression: { startsWith: ["@outputs('SessionId')", "cs_"] },
        actions: {
          // Compose monta o JSON com escape; concatenar texto deixaria o id do evento injetar campos.
          Comando: { type: "Compose", inputs: { acao: "sincronizar", sessionId: "@outputs('SessionId')" } },
          Sincronizar: { ...connector("PerformUnboundAction", {
            actionName: "new_CobrancaQR",
            "item/new_Command": "@{string(outputs('Comando'))}"
          }, { Comando: ["Succeeded"] }), runtimeConfiguration: secured }
        },
        else: { actions: {} }
      },
      Ok: reply(200, { EhSessaoCheckout: ["Succeeded"] }),
      // Falha ao gravar: 500 faz o Stripe tentar de novo mais tarde.
      Falhou: reply(500, { EhSessaoCheckout: ["Failed", "TimedOut"] })
    },
    outputs: {}
  };
};
if (require.main === module) process.stdout.write(JSON.stringify(module.exports()));
