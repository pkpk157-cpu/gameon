const GOENV = require("../lib/env.js");
// Load config.js + compute.js in node with a minimal window/GO_STORE shim.
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = GOENV.APP;
function loadCompute() {
  const ds = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8")).dataset;
  const sandbox = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, TypeError };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox, { filename: "config.js" });
  const cfg = sandbox.window.GO_DEFAULT_CONFIG;
  sandbox.window.GO_STORE = {
    config: () => cfg,
    overrides: () => ({}),
    dataset: () => ds,
  };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), sandbox, { filename: "compute.js" });
  return { C: sandbox.window.GO_COMPUTE, ds, cfg, sandbox };
}
module.exports = { loadCompute, ROOT };
