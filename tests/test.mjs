// Host-side unit test: mount @deepseek-ai/dsh-system-prompt for real, then verify the persona section.
// Run from a staging directory inside the DSH runtime (see run-tests.ps1) so that bare
// @deepseek-ai/* imports resolve; the plugin under test is staged beside this file as ./plugin.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { SystemPrompt, renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import * as plugin from "./plugin/lib/index.js";
import * as st from "./plugin/lib/st.js";

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
	// 新版宿主在最前面多一层 harness:identity，这里只校验相对顺序。
	names.indexOf("dsh:persona-studio") === names.indexOf("deployment:persona-prefix") + 1 &&
		names.indexOf("dsh:persona-studio-extra") === names.indexOf("dsh:persona-studio") + 1 &&
		names.indexOf("dsh:persona-studio-st") === names.indexOf("dsh:persona-studio-extra") + 1 &&
		names[names.length - 1] === "deployment:persona-suffix" &&
		(names[0] === "deployment:persona-prefix" || names[0] === "harness:identity"),
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

// ---- SillyTavern compatibility layer ------------------------------------
const stPreset = {
	prompts: [
		{ identifier: "main", name: "system", role: "system", content: "MAIN BLOCK" },
		{ identifier: "worldInfoBefore", name: "World Info (before)", content: "" },
		{ identifier: "charDescription", name: "Char Description", content: "" },
		{ identifier: "scenario", name: "Scenario", content: "" },
		{ identifier: "jailbreak", name: "Word limit", role: "user", content: "WORD LIMIT" }
	],
	prompt_order: [
		{
			order: [
				{ identifier: "main", enabled: true },
				{ identifier: "worldInfoBefore", enabled: true },
				{ identifier: "charDescription", enabled: true },
				{ identifier: "scenario", enabled: true },
				{ identifier: "jailbreak", enabled: true }
			]
		}
	]
};
const stWorld = {
	entries: {
		0: { uid: 0, comment: "always", content: "CONSTANT LORE", constant: true, order: 1, keys: [] },
		1: { uid: 1, comment: "trigger", content: "KEYWORD LORE", constant: false, order: 2, keys: ["dragon"] }
	}
};
const stCard = {
	spec: "chara_card_v2",
	data: {
		name: "Rin",
		description: "CARD DESC",
		personality: "CARD PERSONA",
		scenario: "CARD SCENE",
		mes_example: "CARD EXAMPLE",
		system_prompt: "CARD SYS",
		post_history_instructions: "CARD POST"
	}
};

const parsedPreset = st.parsePreset(stPreset);
check(
	"preset blocks follow prompt_order",
	parsedPreset.blocks.map((block) => block.id).join(",") === "main,worldInfoBefore,charDescription,scenario,jailbreak",
	JSON.stringify(parsedPreset.blocks.map((block) => block.id))
);
const parsedWorld = st.parseWorldbook(stWorld);
check(
	"worldbook entries parsed and sorted",
	parsedWorld.entries.map((entry) => entry.content).join("|") === "CONSTANT LORE|KEYWORD LORE" &&
		parsedWorld.entries[0].constant === true,
	JSON.stringify(parsedWorld.entries.map((entry) => [entry.content, entry.constant, entry.order]))
);
const parsedCard = st.parseCard(stCard);
check("character card parsed", parsedCard.name === "Rin" && parsedCard.description === "CARD DESC" && parsedCard.postHistory === "CARD POST", JSON.stringify(parsedCard));

const stOff = st.composeSt({ enabled: false, presetEnabled: true, presetRaw: stPreset, worldbookEnabled: true, worldbookRaw: stWorld, worldbookMode: "all", cardEnabled: true, cardRaw: stCard });
check("sillytavern layer is off by default", stOff === "", stOff.slice(0, 120));

const stAll = st.composeSt({ enabled: true, presetEnabled: true, presetRaw: stPreset, worldbookEnabled: true, worldbookRaw: stWorld, worldbookMode: "all", cardEnabled: true, cardRaw: stCard });
check("preset main block injected", stAll.includes("MAIN BLOCK"), stAll.slice(0, 300));
check("word-limit block injected", stAll.includes("WORD LIMIT"));
check(
	"world info sits between main and char description",
	stAll.indexOf("MAIN BLOCK") < stAll.indexOf("CONSTANT LORE") && stAll.indexOf("CONSTANT LORE") < stAll.indexOf("CARD DESC"),
	JSON.stringify([stAll.indexOf("MAIN BLOCK"), stAll.indexOf("CONSTANT LORE"), stAll.indexOf("CARD DESC")])
);
check("card fields reach their markers", stAll.includes("CARD DESC") && stAll.includes("CARD SCENE") && stAll.includes("CARD SYS") && stAll.includes("CARD POST"));
check("section header present", stAll.includes("SillyTavern \u517c\u5bb9\u8bbe\u5b9a"), stAll.slice(0, 120));

const stConstant = st.composeSt({ enabled: true, presetEnabled: true, presetRaw: stPreset, worldbookEnabled: true, worldbookRaw: stWorld, worldbookMode: "constant", cardEnabled: true, cardRaw: stCard });
check(
	"constant mode keeps only constant entries",
	stConstant.includes("CONSTANT LORE") && !stConstant.includes("KEYWORD LORE"),
	stConstant.slice(0, 400)
);

// ---- keyword triggering + preset params --------------------------------
const deepWorld = {
	entries: {
		0: { uid: 0, comment: "always", content: "CONSTANT LORE", constant: true, order: 1 },
		1: { uid: 1, comment: "dragon", content: "DRAGON LORE", constant: false, order: 2, keys: ["dragon"], keysecondary: ["sword"], selective: true },
		2: { uid: 2, comment: "city", content: "CITY LORE", constant: false, order: 3, keys: ["Harbor"], case_sensitive: true }
	}
};
check(
	"keyword mode emits nothing into the prompt section",
	st.composeSt({ enabled: true, presetEnabled: false, presetRaw: "", worldbookEnabled: true, worldbookRaw: deepWorld, worldbookMode: "keyword", cardEnabled: false, cardRaw: "" }) === "",
	"section should stay empty in keyword mode"
);

const titleWorld = st.parseWorldbook(deepWorld);
const textOf = st.extractText([
	{ role: "user", content: "hello" },
	{ role: "assistant", content: [{ type: "text", text: "the dragon sleeps" }] },
	{ role: "user", content: "a sword by the door" }
], 4);
check("extractText joins recent message text", textOf.includes("dragon") && textOf.includes("sword"), textOf);

const loreHit = st.matchWorldbook(titleWorld, textOf);
check("keyword + secondary both present -> entry matched", loreHit.includes("DRAGON LORE"), loreHit);
check("constant entries always matched in keyword mode", loreHit.includes("CONSTANT LORE"), loreHit);
check("case-sensitive entry ignores wrong case", !loreHit.includes("CITY LORE"), loreHit);
check("deep entries excluded without damage", st.matchWorldbook(titleWorld, "just chatting") === "CONSTANT LORE", st.matchWorldbook(titleWorld, "just chatting"));
check(
	"secondary keyword gates the entry",
	!st.matchWorldbook(titleWorld, "the dragon sleeps").includes("DRAGON LORE"),
	st.matchWorldbook(titleWorld, "the dragon sleeps")
);
check("scan depth limits the window", !st.extractText([{ role: "user", content: "dragon" }, { role: "user", content: "later" }], 1).includes("dragon"));

const params = st.presetParams(stPreset);
check("preset params map temperature and max tokens", params.temperature === undefined && params.maxTokens === undefined, JSON.stringify(params));
const withParams = st.presetParams({ temperature: 0.85, openai_max_tokens: 4096, top_p: 0.9 });
check(
	"sampling params extracted, unsupported ones reported",
	withParams.temperature === 0.85 && withParams.maxTokens === 4096 && withParams.unsupported.includes("top_p"),
	JSON.stringify(withParams)
);

// ---- 多分支 prompt_order / 预设内关闭 / 强制开启 -----------------------
const twoBranch = {
	prompts: [
		{ identifier: "main", name: "系统", role: "system", content: "MAIN BODY" },
		{ identifier: "jailbreak", name: "3000字数", role: "user", content: "WORD LIMIT" },
		{ identifier: "scenario", name: "Scenario", role: "system", marker: true, content: "" },
		{ identifier: "deep", name: "深度注入块", role: "system", content: "DEPTH BODY", injection_position: 1 },
		{ identifier: "custom-uuid", name: "色情特化", role: "user", content: "CUSTOM BODY" }
	],
	prompt_order: [
		{ character_id: 100000, order: [
			{ identifier: "main", enabled: true },
			{ identifier: "jailbreak", enabled: false },
			{ identifier: "scenario", enabled: true }
		] },
		{ character_id: 100001, order: [
			{ identifier: "main", enabled: true },
			{ identifier: "scenario", enabled: true },
			{ identifier: "deep", enabled: true },
			{ identifier: "custom-uuid", enabled: false }
		] }
	]
};
const twoBlocks = st.parsePreset(twoBranch).blocks;
check(
	"prompt_order 的所有分支都并入（不只看第一个）",
	twoBlocks.length === 5 && twoBlocks.some((b) => b.id === "custom-uuid"),
	twoBlocks.map((b) => b.id).join(",")
);
check(
	"预设里关掉的块仍然列出并标记为关闭",
	twoBlocks.find((b) => b.id === "jailbreak")?.enabled === false &&
		twoBlocks.find((b) => b.id === "main")?.enabled === true,
	JSON.stringify(twoBlocks.map((b) => [b.id, b.enabled]))
);
check(
	"marker 字段与固定 id 都能识别成占位符",
	twoBlocks.find((b) => b.id === "scenario")?.marker === true && twoBlocks.find((b) => b.id === "main")?.marker === false,
	JSON.stringify(twoBlocks.map((b) => [b.id, b.marker]))
);
check("深度注入标记被记录", twoBlocks.find((b) => b.id === "deep")?.depthInjection === true);

const baseState = { enabled: true, presetEnabled: true, presetRaw: twoBranch, worldbookEnabled: false, worldbookRaw: "", worldbookMode: "all", cardEnabled: false, cardRaw: "" };
check(
	"预设内关闭的块默认不注入",
	!st.composeSt({ ...baseState }).includes("WORD LIMIT"),
	st.composeSt({ ...baseState }).slice(0, 200)
);
check(
	"stForced 能把预设内关闭的块强行接回",
	st.composeSt({ ...baseState, forced: ["preset:jailbreak"] }).includes("WORD LIMIT"),
	st.composeSt({ ...baseState, forced: ["preset:jailbreak"] }).slice(0, 200)
);
check(
	"只出现在第二个分支里的条目也能注入",
	st.composeSt({ ...baseState, forced: ["preset:custom-uuid"] }).includes("CUSTOM BODY"),
	st.composeSt({ ...baseState, forced: ["preset:custom-uuid"] }).slice(0, 200)
);
check(
	"prompt_order 为对象形态时同样能读",
	st.parsePreset({ prompts: twoBranch.prompts, prompt_order: { 100000: twoBranch.prompt_order[0], 100001: twoBranch.prompt_order[1] } }).blocks.length === 5
);

// ---- per-entry switches (stDisabled) -----------------------------------
const disabledOnce = st.composeSt({
	enabled: true,
	presetEnabled: true,
	presetRaw: stPreset,
	worldbookEnabled: true,
	worldbookRaw: stWorld,
	worldbookMode: "all",
	cardEnabled: true,
	cardRaw: stCard,
	disabled: ["preset:jailbreak"]
});
check("disabled preset block is skipped", !disabledOnce.includes("WORD LIMIT") && disabledOnce.includes("MAIN BLOCK"), disabledOnce.slice(0, 300));
check(
	"disabled worldbook entry is skipped",
	(() => {
		const once = st.composeSt({
			enabled: true,
			presetEnabled: true,
			presetRaw: stPreset,
			worldbookEnabled: true,
			worldbookRaw: stWorld,
			worldbookMode: "all",
			cardEnabled: true,
			cardRaw: stCard,
			disabled: ["worldbook:1"]
		});
		return once.includes("CONSTANT LORE") && !once.includes("KEYWORD LORE");
	})(),
	"worldbook:1 should be filtered"
);
check(
	"disabled keys also gate keyword matching",
	st.matchWorldbook(st.filterWorldbook(st.parseWorldbook(deepWorld), st.disabledSet(["worldbook:0"])), textOf).includes("DRAGON LORE") &&
		!st.matchWorldbook(st.filterWorldbook(st.parseWorldbook(deepWorld), st.disabledSet(["worldbook:0"])), textOf).includes("CONSTANT LORE"),
	"constant entry should be filtered out"
);
check(
	"disabledSet accepts json and comma forms",
	st.disabledSet('["preset:a"]').has("preset:a") && st.disabledSet("worldbook:1,worldbook:2").has("worldbook:2") && st.disabledSet("").size === 0,
	"parse failed"
);

// Live wiring: the section appears in the real assembly once enabled.
config.stEnabled[WRITE](true);
config.stPresetEnabled[WRITE](true);
config.stPresetJson[WRITE](JSON.stringify(stPreset));
config.stCardEnabled[WRITE](true);
config.stCardJson[WRITE](JSON.stringify(stCard));
out = await assemble();
const stSection = out.assembly.sections.find((section) => section.name === "dsh:persona-studio-st");
check("sillytavern section registered in assembly", stSection !== undefined && String(stSection.text).includes("MAIN BLOCK"), JSON.stringify(names));
check("rendered prompt carries the st block", out.text.includes("MAIN BLOCK") && out.text.includes("CARD DESC"), out.text.slice(-400));
config.stEnabled[WRITE](false);
out = await assemble();
check("st master switch removes the block", !out.text.includes("MAIN BLOCK"), out.text.slice(-200));

// ---- complete override (stComplete) ------------------------------------
config.stEnabled[WRITE](true);
config.stComplete[WRITE](true);
out = await assemble();
const completeNames = out.assembly.sections.map((section) => section.name);
check("complete override keeps exactly one prompt section", completeNames.length === 1 && completeNames[0] === "dsh:persona-studio-st", JSON.stringify(completeNames));
check(
	"complete override keeps the persona block inside the single section",
	out.text.includes("\u6309\u4eba\u8bbe\u8bf4\u8bdd"),
	out.text.slice(0, 400)
);
const liveRulesDir = mkdtempSync(join(tmpdir(), "persona-rules-live-"));
const liveRulesPath = join(liveRulesDir, "extra-rules.md");
writeFileSync(liveRulesPath, "# LIVE RULE\n\nLIVE RULE BODY\n", "utf8");
config.nsfwRulesPath[WRITE](liveRulesPath);
config.nsfwEnabled[WRITE](true);
const withRules = await assemble();
check(
	"complete override keeps the extra rules block",
	withRules.assembly.sections.length === 1 && withRules.text.includes("LIVE RULE BODY"),
	JSON.stringify(withRules.assembly.sections.map((section) => section.name))
);
config.nsfwEnabled[WRITE](false);
rmSync(liveRulesDir, { recursive: true, force: true });
check(
	"complete override drops the official prompt text",
	!out.text.includes("OFFICIAL PERSONA SENTENCE") && out.text.includes("MAIN BLOCK"),
	out.text.slice(0, 300)
);

// an empty payload must never wipe the system prompt
config.stPresetJson[WRITE]("");
config.stCardJson[WRITE]("");
const emptyOut = await assemble();
check(
	"complete override refuses to fire on an empty payload",
	emptyOut.assembly.sections.length > 1 && emptyOut.text.includes("OFFICIAL PERSONA SENTENCE"),
	JSON.stringify(emptyOut.assembly.sections.map((section) => section.name))
);

config.stComplete[WRITE](false);
config.stPresetJson[WRITE](JSON.stringify(stPreset));
out = await assemble();
check(
	"turning complete override off restores the official prompt",
	out.text.includes("OFFICIAL PERSONA SENTENCE") && out.assembly.sections.length > 1,
	JSON.stringify(out.assembly.sections.map((section) => section.name))
);

console.log("\nsection names: " + JSON.stringify(names));
console.log("\n--- rendered prompt (excerpt) ---\n" + out.text.slice(0, 500));
console.log("\nfailures: " + failures);
process.exit(failures === 0 ? 0 : 1);
