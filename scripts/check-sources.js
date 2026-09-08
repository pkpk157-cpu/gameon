// Every source file parses, and every workflow is valid YAML.
//
// worker.js sat in this repository for weeks as a syntax error nobody could
// see: a cron expression in its header comment closed the comment block early,
// because a star followed by a slash ends one. Nothing ever parsed that file —
// it is pasted into Cloudflare by hand rather than built here — so it was only
// ever read by people, and people read comments as comments.
//
// Writing this very explanation inside a block comment reproduced the bug on
// the first try, which is the best argument for the check there is.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let bad = 0;
const fail = (f, why) => { bad++; console.log("  FAIL " + f + " — " + why); };

// Browser sources are classic scripts; the worker is a module.
const SCRIPTS = ["app.js", "compute.js", "data.js", "api.js", "config.js", "sw.js"];
const MODULES = ["worker.js"];
const NODE = ["scripts/fetch-data.js", "scripts/verify-data.js", "scripts/bonus.js"];

SCRIPTS.concat(NODE).forEach((f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  try { new vm.Script(fs.readFileSync(p, "utf8"), { filename: f }); }
  catch (e) { fail(f, e.message); }
});
MODULES.forEach((f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  try { new vm.SourceTextModule(fs.readFileSync(p, "utf8"), { identifier: f }); }
  catch (e) {
    // SourceTextModule needs a flag; fall back to the shape of the failure
    if (/SourceTextModule is not a constructor/.test(e.message)) {
      const src = fs.readFileSync(p, "utf8");
      // A block comment that closes early is exactly what bit us, so look for
      // it directly rather than skipping the file altogether.
      const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "");
      if (/^\s*(?:\/\/[^\n]*\n)*\s*(?:- |\d\. )/m.test(stripped)) {
        fail(f, "prose is being parsed as code — a block comment closed early");
      }
      try { new vm.Script("(async()=>{" + src.replace(/^export default/m, "0,") + "})", { filename: f }); }
      catch (e2) { fail(f, e2.message); }
    } else fail(f, e.message);
  }
});

// Workflows: valid YAML, and each names a job.
const wfDir = path.join(ROOT, ".github/workflows");
if (fs.existsSync(wfDir)) {
  let yaml = null;
  try { yaml = require("js-yaml"); } catch (e) { /* checked crudely below */ }
  fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).forEach((f) => {
    const src = fs.readFileSync(path.join(wfDir, f), "utf8");
    if (yaml) {
      try {
        const d = yaml.load(src);
        if (!d || !d.jobs || !Object.keys(d.jobs).length) fail(".github/workflows/" + f, "no jobs");
      } catch (e) { fail(".github/workflows/" + f, e.message); }
    } else if (!/^jobs:/m.test(src)) {
      fail(".github/workflows/" + f, "no jobs: block");
    }
    if (/\t/.test(src)) fail(".github/workflows/" + f, "contains a tab — YAML forbids it");
  });
}

console.log(bad ? bad + " source problem(s)" : "every source parses and every workflow is valid");
process.exit(bad ? 1 : 0);
