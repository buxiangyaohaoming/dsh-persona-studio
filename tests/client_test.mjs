// Client-bundle smoke test: load the real lib/client.js with a fake module loader,
// run apply() against a fake client context, then render the section with a
// minimal React-compatible hook runtime and exercise the save path.
// Run from a staging directory inside the DSH runtime (see run-tests.ps1).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let failures = 0;
function check(name, condition, detail) {
	if (condition) console.log("PASS " + name);
	else {
		failures += 1;
		console.log("FAIL " + name + (detail === undefined ? "" : " :: " + detail));
	}
}

// ---- fake module loader -------------------------------------------------
let registration;
globalThis.window = {
	__ModuleLoader__: {
		load(reg) {
			registration = reg;
		}
	}
};

await import(new URL("./plugin/lib/client.js", import.meta.url).href);
check("bundle registers itself", registration && registration.id === "dsh-persona-studio", registration && registration.id);

// ---- minimal hook runtime ----------------------------------------------
function createRuntime() {
	const slots = [];
	const effects = [];
	let cursor = 0;
	let scheduled = false;
	let root;
	let instance;

	const api = {
		createElement(type, props, ...children) {
			const given = props || {};
			const fromProps = given.children === undefined ? [] : [].concat(given.children);
			const kids = [...children, ...fromProps]
				.flat(Infinity)
				.filter((child) => child !== null && child !== undefined && child !== false && child !== true);
			return { type, props: given, children: kids };
		},
		useState(initial) {
			const index = cursor++;
			if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
			const set = (next) => {
				const value = typeof next === "function" ? next(slots[index]) : next;
				if (Object.is(value, slots[index])) return;
				slots[index] = value;
				scheduled = true;
			};
			return [slots[index], set];
		},
		useMemo(factory) {
			cursor += 1;
			return factory();
		},
		useRef(initial) {
			const index = cursor++;
			if (!(index in slots)) slots[index] = { current: initial };
			return slots[index];
		},
		useEffect(effect, deps) {
			const index = cursor++;
			const slot = slots[index];
			const same =
				slot !== undefined && slot.deps !== undefined && deps !== undefined && slot.deps.length === deps.length && slot.deps.every((dep, i) => Object.is(dep, deps[i]));
			slots[index] = { deps: deps === undefined ? undefined : [...deps] };
			if (!same) effects.push(effect);
		},
		useSyncExternalStore(subscribe, getSnapshot) {
			cursor += 1;
			return getSnapshot();
		}
	};

	function renderOnce() {
		cursor = 0;
		return instance();
	}

	function flush() {
		let guard = 0;
		while (scheduled && guard < 50) {
			scheduled = false;
			effects.length = 0;
			root = renderOnce();
			for (const effect of effects) effect();
			guard += 1;
		}
		if (guard >= 50) throw new Error("render loop did not settle");
	}

	return Object.assign(api, {
		render(Component, props) {
			instance = () => Component(props);
			root = renderOnce();
			for (const effect of effects) effect();
			flush();
			return {
				get tree() {
					return root;
				},
				flush
			};
		}
	});
}

/** Expand hook-free function components into plain elements. */
function expand(node) {
	if (node === null || node === undefined || typeof node !== "object") return node;
	if (Array.isArray(node)) return node.map(expand);
	if (typeof node.type === "function") return expand(node.type(node.props));
	return { type: node.type, props: node.props, children: node.children.map(expand) };
}

function walk(node, visit) {
	if (node === null || node === undefined) return;
	if (typeof node === "string" || typeof node === "number") {
		visit(node);
		return;
	}
	visit(node);
	for (const child of node.children) walk(child, visit);
}

function texts(tree) {
	const out = [];
	walk(expand(tree), (item) => {
		if (typeof item === "string" || typeof item === "number") out.push(String(item));
	});
	return out;
}

function find(tree, predicate) {
	let hit;
	walk(expand(tree), (item) => {
		if (hit === undefined && item && typeof item === "object" && predicate(item)) hit = item;
	});
	return hit;
}

function findAll(tree, predicate) {
	const hits = [];
	walk(expand(tree), (item) => {
		if (item && typeof item === "object" && predicate(item)) hits.push(item);
	});
	return hits;
}

// ---- fake settings transport -------------------------------------------
function makeForm(state) {
	const calls = [];
	const form = {
		calls,
		getSnapshot() {
			return state;
		},
		subscribe() {
			return () => {};
		},
		mutate(ops) {
			calls.push(ops);
			return Promise.resolve(true);
		}
	};
	return form;
}

function mount(fakeReact, form, entryId) {
	const ctx = {
		requested: [],
		registrations: [],
		configForms: {
			get(id) {
				ctx.requested.push(id);
				return form;
			}
		},
		slots: {
			inject(_name, factory) {
				return factory();
			},
			register(entry, Component) {
				ctx.registrations.push({ entry, Component });
				if (ctx.registered === undefined) ctx.registered = { entry, Component };
				return () => {};
			}
		}
	};
	const exports = registration.factory((specifier) => {
		if (specifier === "react") return fakeReact;
		throw new Error("unexpected client module request: " + specifier);
	});
	exports.apply(ctx);
	return { exports, ctx };
}

const live = {
	status: "ready",
	revision: 7,
	writable: true,
	value: {
		enabled: false,
		mode: "override",
		personaName: "\u96ea\u7403",
		personaText: "\u4f60\u662f\u4e09\u82b1\u732b\u5a18\uff0c\u53e5\u5c3e\u5e26\u55b5\u3002",
		presets: []
	}
};
const form = makeForm(live);
const runtime = createRuntime();
const { exports, ctx } = mount(runtime, form);
const registered = ctx.registered;

check("exports apply/inject/name", typeof exports.apply === "function" && Array.isArray(exports.inject) && typeof exports.name === "string");
check("declares slots + configForms", exports.inject.join(",") === "slots,configForms", exports.inject.join(","));
check("configForms requested with the entry id", ctx.requested[0] === "dsh-persona-studio", ctx.requested.join(","));
check("settings.section registered", registered.entry.name === "settings.section" && registered.entry.id === "dsh-persona-studio");
check("nav label is 人设", registered.entry.label() === "\u4eba\u8bbe", registered.entry.label());

const injected = registered.entry.inject({});
check("inject exposes the form", injected.form === form);

// ---- render -------------------------------------------------------------
const view = runtime.render(registered.Component, injected);
const body = texts(view.tree).join(" | ");
check("renders the 人设 title", body.includes("\u4eba\u8bbe"), body.slice(0, 160));
check("renders the library section", body.includes("\u4eba\u8bbe\u5e93"), body.slice(0, 160));

const nameInput = find(view.tree, (node) => node.type === "input" && node.props.type === "text");
check("hydrates persona name", nameInput && nameInput.props.value === "\u96ea\u7403", nameInput && JSON.stringify(nameInput.props.value));
const editor = find(view.tree, (node) => node.type === "textarea");
check(
	"hydrates persona text",
	editor && String(editor.props.value).includes("\u53e5\u5c3e\u5e26\u55b5"),
	editor && JSON.stringify(editor.props.value)
);
const preview = find(view.tree, (node) => node.type === "pre");
check(
	"preview explains the disabled state",
	preview && texts(preview).join("").includes("\u5f53\u524d\u4e0d\u6ce8\u5165\u4efb\u4f55\u5185\u5bb9"),
	preview && texts(preview).join("").slice(0, 200)
);

const toggle = find(view.tree, (node) => node.type === "input" && node.props.type === "checkbox");
check("has the enable checkbox", toggle !== undefined && toggle.props.checked === false, toggle && JSON.stringify(toggle.props));

// enable then save
toggle.props.onChange({ target: { checked: true } });
view.flush();
const enabledPreview = find(view.tree, (node) => node.type === "pre");
check(
	"preview shows the composed override block once enabled",
	enabledPreview && texts(enabledPreview).join("").includes("\u89d2\u8272\u8bbe\u5b9a\uff08\u6700\u9ad8\u4f18\u5148\u7ea7\uff09\uff1a\u96ea\u7403"),
	enabledPreview && texts(enabledPreview).join("").slice(0, 260)
);
const saveButton = find(view.tree, (node) => node.type === "button" && texts(node).join("") === "\u4fdd\u5b58");
check("has the save button", saveButton !== undefined);
await saveButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 10));
check(
	"save wrote enabled=true only",
	form.calls.length === 1 && JSON.stringify(form.calls[0]) === JSON.stringify([{ op: "set", path: ["enabled"], value: true }]),
	JSON.stringify(form.calls)
);
view.flush();
check("reports saved state", texts(view.tree).join(" | ").includes("\u5df2\u4fdd\u5b58"), texts(view.tree).slice(-6).join(" | "));

// preset add path (draft only until save)
const presetButton = find(
	view.tree,
	(node) => node.type === "button" && texts(node).join("") === "\u628a\u5f53\u524d\u8bbe\u7f6e\u5b58\u8fdb\u4eba\u8bbe\u5e93"
);
check("has the preset save button", presetButton !== undefined);
presetButton.props.onClick();
view.flush();
const presetSave = find(view.tree, (node) => node.type === "button" && texts(node).join("") === "\u4fdd\u5b58");
await presetSave.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 10));
check(
	"preset write issues a presets op",
	form.calls.some((ops) => ops.some((op) => op.path[0] === "presets" && op.value.length === 1)),
	JSON.stringify(form.calls)
);

// ---- read-only snapshot ------------------------------------------------
const readOnlyState = JSON.parse(JSON.stringify(live));
readOnlyState.writable = false;
const roForm = makeForm(readOnlyState);
const roRuntime = createRuntime();
const ro = mount(roRuntime, roForm);
const roInjected = ro.ctx.registered.entry.inject({});
const roView = roRuntime.render(ro.ctx.registered.Component, roInjected);
const roText = texts(roView.tree).join(" | ");
check("read-only notice shown", roText.includes("\u53ea\u8bfb"), roText.slice(-260));
check("status line shows entry id", roText.includes("entry: dsh-persona-studio"), roText.slice(-120));
const roSave = find(roView.tree, (node) => node.type === "button" && texts(node).join("") === "\u4fdd\u5b58");
check("save disabled when not writable", roSave !== undefined && roSave.props.disabled === true, roSave && JSON.stringify(roSave.props.disabled));

// ---- built-in persona ---------------------------------------------------
const builtinState = JSON.parse(JSON.stringify(live));
builtinState.value = { enabled: false, mode: "override", personaName: "", personaText: "", presets: [] };
const builtinForm = makeForm(builtinState);
const builtinRuntime = createRuntime();
const builtinMount = mount(builtinRuntime, builtinForm);
const builtinView = builtinRuntime.render(builtinMount.ctx.registered.Component, builtinMount.ctx.registered.entry.inject({}));
const builtinText = texts(builtinView.tree).join(" | ");
check("shows the built-in persona block", builtinText.includes("\u5185\u7f6e\u4eba\u8bbe"), builtinText.slice(0, 240));
check(
	"lists the genius flattery persona",
	builtinText.includes("\u5929\u624d\u5c11\u5973\u300c\u51db\u300d") && builtinText.includes("\u8c04\u5a9a\u578b"),
	builtinText.slice(0, 320)
);
check("drops the tsundere framing", !builtinText.includes("\u50b2\u5a07"), builtinText.slice(0, 320));
check("marks it as recommended", builtinText.includes("\u63a8\u8350"));

// one-click activate writes enabled + name + text in a single mutation
const activateButton = find(
	builtinView.tree,
	(node) => node.type === "button" && texts(node).join("") === "\u4e00\u952e\u542f\u7528"
);
check("has the one-click activate button", activateButton !== undefined);
await activateButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 10));
const activation = builtinForm.calls[0] || [];
const activationOps = Object.fromEntries(activation.map((op) => [op.path.join("."), op.value]));
check(
	"activation enables and fills the persona",
	activationOps.enabled === true && activationOps.personaName === "\u51db" && typeof activationOps.personaText === "string",
	JSON.stringify(activationOps).slice(0, 200)
);
const personaText = String(activationOps.personaText || "");
check("persona text carries the honesty contract", personaText.includes("\u574f\u7ed3\u679c\u7167\u539f\u6837\u62a5"), personaText.slice(0, 200));
check("persona text forbids blanket agreement", personaText.includes("\u4e0d\u65e0\u6761\u4ef6\u8ba4\u540c"));
check("persona text keeps praise honest", personaText.includes("\u5938\u5956\u53ea\u5938\u771f\u7684"));
check(
	"persona text sounds sweet instead of prickly",
	personaText.includes("\u5634\u751c") && personaText.includes("\u8c04\u5a9a"),
	personaText.slice(0, 200)
);
check(
	"potentially tsundere lines are gone",
	!personaText.includes("\u50b2\u5a07") && !personaText.includes("\u8c01\u3001\u8c01\u8981\u4f60\u5938\u4e86") && !personaText.includes("\u5634\u786c"),
	"found tsundere leftovers"
);
check("persona text addresses the user as 爸爸", personaText.includes("\u7238\u7238"), personaText.slice(0, 200));
check(
	"flattery is confined to tone, not facts",
	personaText.includes("\u5224\u65ad\u548c\u6570\u5b57\u4e0a\u4e00\u6b65\u4e0d\u8ba9") && personaText.includes("\u8c04\u5a9a\u53ea\u7528\u5728\u60c5\u7eea\u4e0a"),
	personaText.slice(0, 300)
);
check("bad news is announced to 爸爸 plainly", personaText.includes("\u7238\u7238\uff0c\u51fa\u4e8b\u4e86"), personaText.slice(0, 300));
check(
	"thinking is told to run in English",
	personaText.includes("\u601d\u8003\u9636\u6bb5\u4e00\u5f8b\u7528\u82f1\u6587") && personaText.includes("\u7701 token"),
	personaText.slice(-260)
);
check(
	"output language stays the user's",
	personaText.includes("\u9ed8\u8ba4\u7b80\u4f53\u4e2d\u6587"),
	personaText.slice(-200)
);
builtinView.flush();
const activatedPreview = find(builtinView.tree, (node) => node.type === "pre");
check(
	"preview renders the built-in persona after activation",
	activatedPreview && texts(activatedPreview).join("").includes("\u8c04\u5a9a\u53ea\u7528\u5728\u60c5\u7eea\u4e0a"),
	activatedPreview && texts(activatedPreview).join("").slice(0, 240)
);
const forbidden = ["TG\u4ea4\u6d41\u7fa4", "Blacklist", "blacklist", "\u6fc0\u6d3b", "FJNB22", "dp\u7834\u7532"];
const leaked = forbidden.filter((needle) => personaText.includes(needle));
check("no foreign rules leaked into the persona", leaked.length === 0, JSON.stringify(leaked));

// ---- extra writing rules toggle -----------------------------------------
const extraState = JSON.parse(JSON.stringify(live));
extraState.value = {
	enabled: true,
	mode: "override",
	personaName: "\u51db",
	personaText: "\u6309\u4eba\u8bbe\u8bf4\u8bdd",
	presets: [],
	nsfwEnabled: false,
	nsfwRulesPath: ""
};
const extraForm = makeForm(extraState);
const extraRuntime = createRuntime();
const extraMount = mount(extraRuntime, extraForm);
const extraView = extraRuntime.render(extraMount.ctx.registered.Component, extraMount.ctx.registered.entry.inject({}));
const extraText = texts(extraView.tree).join(" | ");
check("shows the extra-rules block", extraText.includes("\u989d\u5916\u5199\u4f5c\u89c4\u5219"), extraText.slice(0, 240));
check("states that the rules stay local", extraText.includes("\u4e0d\u5165\u5e93"), extraText.slice(0, 300));

const checkboxes = findAll(extraView.tree, (node) => node.type === "input" && node.props.type === "checkbox");
check("persona page keeps only the two toggles", checkboxes.length === 2, String(checkboxes.length));
check(
	"persona page no longer hosts the SillyTavern block",
	!extraText.includes("SillyTavern \u517c\u5bb9") && !extraText.includes("stEnabled"),
	extraText.slice(0, 200)
);
const extraToggle = checkboxes[1];
check("extra-rules toggle starts off", extraToggle.props.checked === false, JSON.stringify(extraToggle.props));

const pathField = findAll(extraView.tree, (node) => node.type === "input" && node.props.type === "text")[1];
check(
	"has a rules path field with the default hint",
	pathField !== undefined && String(pathField.props.placeholder).includes("extra-rules.md"),
	pathField && JSON.stringify(pathField.props.placeholder)
);
pathField.props.onChange({ target: { value: "C:/local/rules.md" } });
extraToggle.props.onChange({ target: { checked: true } });
extraView.flush();
const extraSave = find(extraView.tree, (node) => node.type === "button" && texts(node).join("") === "\u4fdd\u5b58");
await extraSave.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 10));
const extraOps = Object.fromEntries((extraForm.calls[0] || []).map((op) => [op.path.join("."), op.value]));
check(
	"save writes nsfwEnabled + nsfwRulesPath",
	extraOps.nsfwEnabled === true && extraOps.nsfwRulesPath === "C:/local/rules.md",
	JSON.stringify(extraOps)
);

// ---- SillyTavern import UI ---------------------------------------------
const stState = JSON.parse(JSON.stringify(live));
stState.value = {
	enabled: true,
	mode: "override",
	personaName: "Rin",
	personaText: "stay in character",
	presets: [],
	nsfwEnabled: false,
	nsfwRulesPath: "",
	stEnabled: false,
	stPresetEnabled: false,
	stPresetJson: "",
	stWorldbookEnabled: false,
	stWorldbookJson: "",
	stWorldbookMode: "all",
	stCardEnabled: false,
	stCardJson: "",
	stScanDepth: 4,
	stParamsEnabled: false,
	stDisabled: ""
};
const stForm = makeForm(stState);
const stRuntime = createRuntime();
const stMount = mount(stRuntime, stForm);
check("registers two settings sections", stMount.ctx.registrations.length === 2, String(stMount.ctx.registrations.length));
const stEntry = stMount.ctx.registrations[1];
check(
	"the second section is its own SillyTavern page",
	stEntry.entry.id === "dsh-persona-studio-st" && stEntry.entry.label() === "SillyTavern",
	JSON.stringify([stEntry.entry.id, stEntry.entry.label()])
);
check("persona section stays first", stMount.ctx.registrations[0].entry.id === "dsh-persona-studio");
const stView = stRuntime.render(stEntry.Component, stEntry.entry.inject({}));
const stText = texts(stView.tree).join(" | ");
check("shows the SillyTavern page", stText.includes("SillyTavern"), stText.slice(0, 240));
check("lists all three slots", stText.includes("\u9884\u8bbe") && stText.includes("\u4e16\u754c\u4e66") && stText.includes("\u89d2\u8272\u5361"), stText.slice(0, 400));

const fileInputs = findAll(stView.tree, (node) => node.type === "input" && node.props.type === "file");
check("one file picker per slot", fileInputs.length === 3, String(fileInputs.length));
check("file pickers accept json", fileInputs.every((node) => String(node.props.accept).includes("json")));

const fakePreset = JSON.stringify({ prompts: [{ identifier: "main", content: "MAIN" }], prompt_order: [{ order: [{ identifier: "main", enabled: true }] }] });
await fileInputs[0].props.onChange({ target: { files: [{ name: "preset.json", text: async () => fakePreset }] } });
stView.flush();
check(
	"importing a preset shows its summary",
	texts(stView.tree).join(" | ").includes("1 \u4e2a\u63d0\u793a\u5757"),
	texts(stView.tree).join(" | ").slice(0, 400)
);

const stSave = find(stView.tree, (node) => node.type === "button" && texts(node).join("") === "\u4fdd\u5b58");
await stSave.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 10));
const stOps = Object.fromEntries((stForm.calls[0] || []).map((op) => [op.path.join("."), op.value]));
check(
	"import turns on the master switch and the slot",
	stOps.stEnabled === true && stOps.stPresetEnabled === true && stOps.stPresetJson === fakePreset,
	JSON.stringify(stOps).slice(0, 300)
);
check(
	"bad json is rejected with a message",
	await (async () => {
		const second = findAll(stView.tree, (node) => node.type === "input" && node.props.type === "file")[1];
		await second.props.onChange({ target: { files: [{ name: "bad.json", text: async () => "{not json" }] } });
		stView.flush();
		return texts(stView.tree).join(" | ").includes("JSON \u89e3\u6790\u5931\u8d25");
	})(),
	texts(stView.tree).join(" | ").slice(-300)
);

// keyword mode + sampling params
const modeSelect = findAll(stView.tree, (node) => node.type === "select").find((node) =>
	(node.children || []).some((child) => child?.props?.value === "keyword")
);
check(
	"mode select offers keyword triggering",
	modeSelect !== undefined,
	JSON.stringify(findAll(stView.tree, (node) => node.type === "select").map((node) => (node.children || []).map((child) => child?.props?.value)))
);
check("scan depth hidden until keyword mode", find(stView.tree, (node) => node.type === "input" && node.props.type === "number") === undefined);
modeSelect.props.onChange({ target: { value: "keyword" } });
stView.flush();
const depthInput = find(stView.tree, (node) => node.type === "input" && node.props.type === "number");
check("scan depth appears in keyword mode", depthInput !== undefined && Number(depthInput.props.value) === 4, depthInput && JSON.stringify(depthInput.props.value));
depthInput.props.onChange({ target: { value: "6" } });
stView.flush();

const paramsToggle = findAll(stView.tree, (node) => node.type === "input" && node.props.type === "checkbox")[1];
paramsToggle.props.onChange({ target: { checked: true } });
stView.flush();
const stTextAfter = texts(stView.tree).join(" | ");
check("params summary shows what will be applied", stTextAfter.includes("temperature"), stTextAfter.slice(-400));

// per-entry toggles: the imported preset has one block ("main")
check("preset blocks are listed for toggling", stTextAfter.includes("main"), stTextAfter.slice(-400));
const entryToggles = findAll(stView.tree, (node) => node.type === "input" && node.props.type === "checkbox");
const lastToggle = entryToggles[entryToggles.length - 1];
lastToggle.props.onChange({ target: { checked: false } });
stView.flush();

const stSave2 = find(stView.tree, (node) => node.type === "button" && texts(node).join("") === "\u4fdd\u5b58");
await stSave2.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 10));
const lastOps = Object.fromEntries((stForm.calls[stForm.calls.length - 1] || []).map((op) => [op.path.join("."), op.value]));
check(
	"save writes keyword mode, scan depth and params toggle",
	lastOps.stWorldbookMode === "keyword" && lastOps.stScanDepth === 6 && lastOps.stParamsEnabled === true,
	JSON.stringify(lastOps).slice(0, 300)
);
check(
	"turning a block off writes stDisabled",
	String(lastOps.stDisabled || "").includes("preset:main"),
	JSON.stringify(lastOps.stDisabled)
);

// The shipped bundle must not carry any of the local rules content. The probe is
// taken from the user's own rules file (never from this repository), so the check
// proves a real leak without putting any rule text into the project.
const bundleSource = readFileSync(new URL("./plugin/lib/client.js", import.meta.url), "utf8");
const hostSource = readFileSync(new URL("./plugin/lib/index.js", import.meta.url), "utf8");
const stSource = readFileSync(new URL("./plugin/lib/st.js", import.meta.url), "utf8");
const localRulesPath = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "persona-studio", "extra-rules.md");
let localSample = "";
try {
	localSample = readFileSync(localRulesPath, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 40) ?? "";
} catch {
	localSample = "";
}
const shipped = localSample === ""
	? []
	: [localSample.slice(0, 40)].filter((needle) => bundleSource.includes(needle) || hostSource.includes(needle) || stSource.includes(needle));
check(
	"shipped lib/ carries none of the local rules file",
	shipped.length === 0,
	localSample === "" ? "(local rules file absent, nothing to compare)" : JSON.stringify(shipped)
);

console.log("\nfailures: " + failures);
process.exit(failures === 0 ? 0 : 1);
