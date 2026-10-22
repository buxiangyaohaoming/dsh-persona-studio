// Host-side unit test: mount @deepseek-ai/dsh-system-prompt for real, then verify the persona section.
// Run from a staging directory inside the DSH runtime (see run-tests.ps1) so that bare
// @deepseek-ai/* imports resolve; the plugin under test is staged beside this file as ./plugin.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { SystemPrompt, renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import * as plugin from "./plugin/lib/index.js";

const WRITE = Symbol.for("cosmokit.volatile.write");
const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
let failures = 0;
function check(name, condition, detail) {
	if (condition) console.log("PASS " + name);
	else {
		failures += 1;
		console.log("FAIL " + name + (detail === undefined ? "" : " :: " + detail));
	}
}

const ctx = new Context();
ctx.plugin(SystemPrompt, { personaPrefix: "OFFICIAL PERSONA SENTENCE", includeRuntimeContext: false });

const config = new plugin.Config({
	enabled: true,
	mode: "override",
	personaName: "\u96ea\u7403",
	personaText: "\u4f60\u662f\u4e09\u82b1\u732b\u5a18\uff0c\u53e5\u5c3e\u5e26\u55b5\uff0c\u7528 {{user}} \u79f0\u547c\u5bf9\u65b9\u3002",
	nsfwEnabled: false,
	nsfwRulesPath: ""
});
ctx.plugin({ name: "dsh-persona-studio", inject: plugin.inject, apply: (c) => plugin.apply(c, config) });
await tick();

async function assemble() {
	const assembly = await ctx.systemPrompt.assemble({});
	return { assembly, text: renderPrompt(assembly) };
}

let out = await assemble();
const names = out.assembly.sections.map((section) => section.name);
check(
	"sections ordered: official prefix, persona, extra rules, official suffix",
	names[0] === "deployment:persona-prefix" &&
		names[1] === "dsh:persona-studio" &&
		names[2] === "dsh:persona-studio-extra" &&
		names[names.length - 1] === "deployment:persona-suffix",
	JSON.stringify(names)
);
check("override body injected", out.text.includes("\u89d2\u8272\u8bbe\u5b9a\uff08\u6700\u9ad8\u4f18\u5148\u7ea7\uff09\uff1a\u96ea\u7403"), out.text);
check("persona text kept literal ({{user}} survived)", out.text.includes("{{user}}"), out.text.slice(0, 400));
check("official persona still present in override mode", out.text.includes("OFFICIAL PERSONA SENTENCE"));

// Live disable: write through the volatile ref in place (what a settings save does).
config.enabled[WRITE](false);
out = await assemble();
check("disable takes effect without re-registration", !out.text.includes("\u89d2\u8272\u8bbe\u5b9a\uff08\u6700\u9ad8\u4f18\u5148\u7ea7\uff09"), out.text.slice(0, 200));

// Live text/mode change.
config.enabled[WRITE](true);
config.mode[WRITE]("append");
config.personaName[WRITE]("\u8001\u9648");
config.personaText[WRITE]("\u4f60\u662f\u6bd2\u820c\u8bc4\u5ba1\u3002");
out = await assemble();
check("append mode wording", out.text.includes("# \u4eba\u8bbe\uff1a\u8001\u9648"), out.text.slice(0, 300));

// Blank text injects nothing.
config.personaText[WRITE]("   ");
out = await assemble();
check("blank text injects nothing", !out.text.includes("# \u4eba\u8bbe\uff1a"), out.text.slice(0, 200));

// Empty name falls back.
config.personaText[WRITE]("\u6309\u4eba\u8bbe\u8bf4\u8bdd");
config.personaName[WRITE]("");
out = await assemble();
check("empty name falls back", out.text.includes("# \u4eba\u8bbe\uff1a\u81ea\u5b9a\u4e49\u89d2\u8272"), out.text.slice(0, 200));

// ---- extra writing rules (local file, toggle-gated) ---------------------
const rulesDir = mkdtempSync(join(tmpdir(), "persona-rules-"));
const rulesPath = join(rulesDir, "extra-rules.md");
writeFileSync(rulesPath, "LOCAL RULE ONE\n# LOCAL RULE TWO\n", "utf8");

// Missing file: toggle on but no content anywhere -> nothing injected.
config.nsfwRulesPath[WRITE](join(rulesDir, "missing.md"));
config.nsfwEnabled[WRITE](true);
out = await assemble();
check("missing rules file injects nothing", !out.text.includes("LOCAL RULE ONE"), out.text.slice(-200));

// Real file + toggle on -> injected verbatim.
config.nsfwRulesPath[WRITE](rulesPath);
out = await assemble();
check("extra rules injected from the local file", out.text.includes("LOCAL RULE ONE") && out.text.includes("# LOCAL RULE TWO"), out.text.slice(-260));

// Toggle off -> disappears without re-registration.
config.nsfwEnabled[WRITE](false);
out = await assemble();
check("extra rules follow the toggle", !out.text.includes("LOCAL RULE ONE"), out.text.slice(-200));

// Default path resolves under DSH_HOME.
const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = rulesDir;
check(
	"default rules path stays under DSH_HOME",
	plugin.defaultRulesPath() === join(rulesDir, "persona-studio", "extra-rules.md"),
	plugin.defaultRulesPath()
);
if (previousHome === undefined) delete process.env.DSH_HOME;
else process.env.DSH_HOME = previousHome;

// Edited file is picked up through the mtime cache.
config.nsfwRulesPath[WRITE](rulesPath);
config.nsfwEnabled[WRITE](true);
out = await assemble();
writeFileSync(rulesPath, "LOCAL RULE EDITED\n", "utf8");
out = await assemble();
check("edited rules file is re-read", out.text.includes("LOCAL RULE EDITED") && !out.text.includes("LOCAL RULE ONE"), out.text.slice(-200));
config.nsfwEnabled[WRITE](false);
rmSync(rulesDir, { recursive: true, force: true });

console.log("\nsection names: " + JSON.stringify(names));
console.log("\n--- rendered prompt (excerpt) ---\n" + out.text.slice(0, 500));
console.log("\nfailures: " + failures);
process.exit(failures === 0 ? 0 : 1);
