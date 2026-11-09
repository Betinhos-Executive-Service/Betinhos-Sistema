import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const flows = await readFile(new URL("./provision-ai-schedule-flows.ps1", import.meta.url), "utf8");
const connector = await readFile(new URL("./provision-deepseek-connector.ps1", import.meta.url), "utf8");
const interpretFlow = await readFile(new URL("../power-platform/flows/ai_schedule_interpret.json", import.meta.url), "utf8");
const schema = await readFile(new URL("./provision-ai-schedule-schema.ps1", import.meta.url), "utf8");

assert.match(flows, /Ensure-ConnectionReference/);
assert.match(flows, /connectionreferences\?/);
assert.match(connector, /pacOutput/);
assert.match(connector, /connector download/);
assert.match(connector, /connector Betinhos DeepSeek já está atualizado no DEV/);
assert.match(interpretFlow, /"connectionName": "__DEEPSEEK_API_NAME__"/);
assert.doesNotMatch(flows, /shared_betinhosdeepseek/);
assert.doesNotMatch(connector, /"--environment", \$EnvironmentUrl, "--settings-file"/);
assert.match(connector, /"--connector-id", \$ConnectorId, "--api-definition-file"/);
assert.doesNotMatch(connector, /"--connector-id", \$ConnectorId, "--settings-file"/);
assert.match(schema, /DateTimeBehavior = @\{ Value = "UserLocal" \}/);

console.log("provision_contract.test: ok");
