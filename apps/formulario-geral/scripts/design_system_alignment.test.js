const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const designSystem = fs.readFileSync(path.join(root, "DESIGN_SYSTEM.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

function assertContains(source, needle, message) {
  assert(source.includes(needle), message || `Missing: ${needle}`);
}

function assertNotContains(source, needle, message) {
  assert(!source.includes(needle), message || `Unexpected: ${needle}`);
}

assertContains(styles, "font-size: 14px;", "styles.css final control override must stay documented.");
assertContains(
  designSystem,
  "<tr><td>Campo/select</td><td>14px</td><td>400</td></tr>",
  "Design system must document the live 14px control typography."
);

assertContains(index, "class=\"status-select\"", "Live topbar has a status select.");
assertContains(
  designSystem,
  "class=\"status-select\"",
  "Design system shell preview must include the live status-select pattern."
);

assertContains(index, "class=\"field span-2 passenger-photo-field\"", "Live passenger cadastro has photo upload.");
assertContains(
  designSystem,
  "class=\"field span-2 passenger-photo-field\"",
  "Design system must render the passenger photo upload component, not only mention it."
);

assertContains(styles, ".passenger-toolbar-action.success", "Success action is scoped to passenger toolbar.");
assertNotContains(
  designSystem,
  "class=\"secondary-action success\"",
  "Design system must not document a generic secondary-action success variant that is not in live CSS."
);
assertNotContains(
  designSystem,
  "class=\"secondary-action danger\"",
  "Design system must not document a generic secondary-action danger variant outside its scoped modal pattern."
);

assertContains(styles, ".toast-stack", "Live app has toast feedback.");
assertContains(
  designSystem,
  "id=\"feedback\"",
  "Design system must document toast/feedback surfaces."
);

assertContains(
  designSystem,
  "Design System - Tela Formulário Geral",
  "Design system should use the real accented product name in visible text."
);

console.log("design_system_alignment.test.js passed");
