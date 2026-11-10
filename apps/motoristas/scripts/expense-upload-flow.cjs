// No credentials or callback URLs in this definition. DEV provisioner resolves references.
function connector(connection, operationId, parameters, runAfter = {}) {
  return { type: "OpenApiConnection", runAfter, inputs: {
    host: { apiId: `/providers/Microsoft.PowerApps/apis/${connection}`, connectionName: connection, operationId },
    parameters, authentication: "@parameters('$authentication')"
  }, runtimeConfiguration: { secureData: { properties: ["inputs", "outputs"] } } };
}
function command(action, extra = {}) {
  return { action, attachmentId: "@triggerBody()?['attachmentId']", attemptId: "@triggerBody()?['attemptId']", runId: "@workflow().run.name", ...extra };
}
function api(compose, runAfter) {
  const attempt = `${compose}Attempt`;
  const call = connector("shared_commondataserviceforapps", "PerformUnboundAction", {
    actionName: "new_ExpenseUploadTransition", "item/new_Command": `@string(outputs('${compose}'))`
  });
  return { type: "Until", operationOptions: "FailWhenLimitsReached", runAfter, expression: `@equals(actions('${attempt}').status, 'Succeeded')`, limit: { count: 5, timeout: "PT1M" }, actions: {
    [attempt]: call,
    [`${compose}Wait`]: { type: "If", runAfter: { [attempt]: ["Succeeded", "Failed", "TimedOut"] }, expression: { not: { equals: [`@actions('${attempt}').status`, "Succeeded"] } },
      actions: { [`${compose}Delay`]: { type: "Wait", inputs: { interval: { count: 5, unit: "Second" } } } }, else: { actions: {} } }
  } };
}

module.exports = function expenseUploadFlow() {
  const secured = { secureData: { properties: ["inputs", "outputs"] } };
  return {
    "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
    contentVersion: "1.0.0.0",
    parameters: { "$authentication": { type: "SecureObject", defaultValue: {} }, "$connections": { type: "Object", defaultValue: {} } },
    triggers: { manual: { type: "Request", kind: "Http", runtimeConfiguration: secured, inputs: {
      triggerAuthenticationType: "All",
      schema: { type: "object", additionalProperties: false, required: ["attachmentId", "attemptId", "conteudoBase64"], properties: {
        attachmentId: { type: "string", format: "uuid" }, attemptId: { type: "string", format: "uuid" }, conteudoBase64: { type: "string", minLength: 1 }
      } }
    } } },
    actions: {
      ClaimCommand: { type: "Compose", inputs: command("claim") },
      Claim: api("ClaimCommand", { ClaimCommand: ["Succeeded"] }),
      Accepted: { type: "Response", kind: "Http", runAfter: { Claim: ["Succeeded"] }, inputs: {
        statusCode: 202, headers: { "Content-Type": "application/json" }, body: { accepted: true, attachmentId: "@triggerBody()?['attachmentId']", attemptId: "@triggerBody()?['attemptId']" }
      } },
      Process: { type: "If", runAfter: { Accepted: ["Succeeded", "Failed", "TimedOut"] },
        expression: { equals: ["@json(body('ClaimCommandAttempt')?['new_Result'])?['applied']", true] },
        actions: {
          Upload: { type: "Scope", actions: {
            CreateFile: connector("shared_onedriveforbusiness", "CreateFile", {
              folderPath: "@concat('/Despesas/DEV/', json(body('ClaimCommandAttempt')?['new_Result'])?['expenseId'])",
              // Attachment ID prevents two receipts with the same name from colliding.
              name: "@concat(triggerBody()?['attachmentId'], '-', json(body('ClaimCommandAttempt')?['new_Result'])?['fileName'])",
              body: "@base64ToBinary(triggerBody()?['conteudoBase64'])"
            }),
            ShareLink: connector("shared_onedriveforbusiness", "CreateShareLinkV2", {
              id: "@body('CreateFile')?['Id']", type: "View", scope: "Organization"
            }, { CreateFile: ["Succeeded"] }),
            CompleteCommand: { type: "Compose", runAfter: { ShareLink: ["Succeeded"] }, runtimeConfiguration: { secureData: { properties: ["inputs"] } },
              inputs: command("complete", { shareLink: "@body('ShareLink')?['WebUrl']", fileId: "@body('CreateFile')?['Id']" }) },
            Complete: api("CompleteCommand", { CompleteCommand: ["Succeeded"] })
          } },
          FailureCommand: { type: "Compose", runtimeConfiguration: { secureData: { properties: ["inputs"] } }, runAfter: { Upload: ["Failed", "TimedOut"] }, inputs: command("fail", {
            error: "@concat('Run ', workflow().run.name, '; etapa ', if(not(equals(actions('CreateFile').status, 'Succeeded')), 'CreateFile', if(not(equals(actions('ShareLink').status, 'Succeeded')), 'ShareLink', 'Complete')), '; codigo ', if(not(equals(actions('CreateFile').status, 'Succeeded')), coalesce(actions('CreateFile')?['code'], 'ActionFailed'), if(not(equals(actions('ShareLink').status, 'Succeeded')), coalesce(actions('ShareLink')?['code'], 'ActionFailed'), coalesce(actions('CompleteCommandAttempt')?['code'], 'ActionFailed'))), '; erro ', if(not(equals(actions('CreateFile').status, 'Succeeded')), string(outputs('CreateFile')?['body']), if(not(equals(actions('ShareLink').status, 'Succeeded')), string(outputs('ShareLink')?['body']), string(outputs('CompleteCommandAttempt')?['body']))))"
          }) },
          PersistFailure: api("FailureCommand", { FailureCommand: ["Succeeded"] })
        }, else: { actions: {} }
      },
      Rejected: { type: "Response", kind: "Http", runAfter: { Claim: ["Failed", "TimedOut"] }, inputs: {
        statusCode: 400, body: { accepted: false, message: "Comprovante não aceito. Consulte o registro antes de tentar novamente." }
      } }
    }, outputs: {}
  };
};
if (require.main === module) process.stdout.write(JSON.stringify(module.exports()));
