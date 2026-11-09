const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").replace(/\r\n/g, "\n");
const start = app.indexOf("function passengerPhotoSharePointLibraryPath(");
assert.ok(start >= 0, "passengerPhotoSharePointLibraryPath nao encontrada");
const end = app.indexOf("\n  }\n", start);
const fn = new Function(`${app.slice(start, end + 4)}; return passengerPhotoSharePointLibraryPath;`)();

assert.equal(
  fn("https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/DEV/x.jpg"),
  "/Documentos Compartilhados/Passageiros/Fotos/DEV/x.jpg"
);
assert.equal(
  fn("https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/PROD/Jo%C3%A3o%20S.png?csf=1&web=1"),
  "/Documentos Compartilhados/Passageiros/Fotos/PROD/João S.png"
);
assert.equal(fn("https://outro.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/x.jpg"), "");
assert.equal(fn("https://betinhos.sharepoint.com/:i:/r/sites/OutroSite/Documentos%20Compartilhados/x.jpg"), "");
assert.equal(fn("https://betinhos.sharepoint.com/:i:/g/personal/x"), "");
assert.equal(fn("data:image/png;base64,AAAA"), "");
assert.equal(fn(""), "");
console.log("passenger_photo_flow_path ok");
