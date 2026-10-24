/**
 * dsh-persona-studio —— 宿主半边。
 *
 * 职责：
 *   1. 在 DSH 设置文档里提供「人设」这一组可编辑字段（全部 `.volatile()`，
 *      因此设置页保存后会原地更新引用的值，不重挂插件、不重载 DSH）。
 *   2. 把所有字段合成一段人设文本，注册成系统提示词节 `dsh:persona-studio`，
 *      插在官方 `deployment:persona-prefix`（order 0）之后。
 *   3. 可选的「额外写作规则」节 `dsh:persona-studio-extra`：正文**不随插件分发**，
 *      每次组装时从本机文件（默认 `%DSH_HOME%\persona-studio\extra-rules.md`）现读，
 *      由 `nsfwEnabled` 开关控制。这样规则只存在本机，仓库里始终没有这份内容。
 *   4. 可选的「SillyTavern 兼容」节 `dsh:persona-studio-st`：把 ST 的预设 / 世界书 /
 *      角色卡 JSON 按 ST 的 `prompt_order` 装配后注入，三个槽位各自开关。
 *
 * 关键点：`systemPrompt.section()` 的 `text` 允许传函数，注册表在**每次组装**
 * 系统提示词时调用它。于是人设文本由 `config.*.get()` 实时求值 —— 打开/关闭、
 * 改写人设都会在下一次模型请求（同一个会话也算）立刻生效，无需重启或新建会话。
 *
 * 未启用或人设为空时返回空字符串，空节在渲染阶段被丢弃，等于不注入任何内容。
 *
 * @module dsh-persona-studio
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { cachedPreset, cachedWorldbook, composeSt, extractText, matchWorldbook, presetParams } from "./st.js";
/** Cordis 插件名。 */
const name = "dsh-persona-studio";
/** 需要的服务：系统提示词注册表。 */
const inject = ["systemPrompt"];

/** 提示词节名称：不复用官方 persona 节名，就不会与官方/预设注册撞名。 */
const SECTION_NAME = "dsh:persona-studio";
/** 排序位置：`DEPLOYMENT_PERSONA_PREFIX` 是 0，紧跟其后。 */
const SECTION_ORDER = 1;

/** 额外写作规则节（本机文件，不入库）。 */
const EXTRA_SECTION_NAME = "dsh:persona-studio-extra";
/** 排在 persona 之后、官方工具说明之前。 */
const EXTRA_SECTION_ORDER = 2;
/** SillyTavern 兼容节（预设 / 世界书 / 角色卡）。 */
const ST_SECTION_NAME = "dsh:persona-studio-st";
const ST_SECTION_ORDER = 3;
/** 本机规则文件的默认相对位置。 */
const EXTRA_RULES_DIR = "persona-studio";
const EXTRA_RULES_FILE = "extra-rules.md";

/** 人设库条目。 */
const PresetConfig = z.object({
	id: z.string(),
	displayName: z.string(),
	text: z.string()
});

/**
 * 插件配置。每个字段都标 `.volatile()`：设置页可以就地写这组值，
 * 并且宿主侧每个字段都是带 `.get()` 的引用，读到的永远是最新值。
 */
const Config = z.object({
	enabled: z.boolean().default(false).volatile(),
	mode: z.union([z.const("append"), z.const("override")]).default("override").volatile(),
	personaName: z.string().default("").volatile(),
	personaText: z.string().default("").volatile(),
	presets: z.array(PresetConfig).default([]).volatile(),
	nsfwEnabled: z.boolean().default(false).volatile(),
	nsfwRulesPath: z.string().default("").volatile(),
	// SillyTavern 兼容层：三个槽位各自存原始 JSON，开关独立。
	stEnabled: z.boolean().default(false).volatile(),
	stPresetEnabled: z.boolean().default(false).volatile(),
	stPresetJson: z.string().default("").volatile(),
	stWorldbookEnabled: z.boolean().default(false).volatile(),
	stWorldbookJson: z.string().default("").volatile(),
	stWorldbookMode: z.union([z.const("all"), z.const("constant"), z.const("keyword")]).default("all").volatile(),
	stCardEnabled: z.boolean().default(false).volatile(),
	stCardJson: z.string().default("").volatile(),
	// 关键词触发的扫描深度（最近多少条消息）。
	stScanDepth: z.number().default(4).volatile(),
	// 是否把预设里的采样参数（temperature / max tokens）应用到请求上。
	stParamsEnabled: z.boolean().default(false).volatile()
});

/**
 * 读一个配置字段：正常情况是 volatile 引用（`.get()`），
 * 也容忍被当普通对象直接传入（例如单元测试或 YAML 里写了纯字面量）。
 * @param config - 插件配置对象。
 * @param key - 字段名。
 * @param fallback - 字段缺失或读失败时的兜底值。
 * @returns 该字段的当前值。
 */
function readField(config, key, fallback) {
	const field = config?.[key];
	if (field !== undefined && field !== null && typeof field.get === "function") {
		try {
			const value = field.get();
			return value === undefined || value === null ? fallback : value;
		} catch {
			return fallback;
		}
	}
	return field === undefined || field === null ? fallback : field;
}

/**
 * 把配置整理成纯数据快照。
 * @param config - 插件配置对象。
 * @returns 当前人设状态。
 */
function readPersona(config) {
	return {
		enabled: readField(config, "enabled", false) === true,
		mode: readField(config, "mode", "override") === "append" ? "append" : "override",
		personaName: String(readField(config, "personaName", "") ?? "").trim(),
		personaText: String(readField(config, "personaText", "") ?? "")
			.replace(/\r\n/g, "\n")
			.trim()
	};
}

/**
 * 合成注入的系统提示词节文本。客户端预览用同一套文案（见 lib/client.js）。
 * @param persona - 当前人设状态。
 * @returns 提示词节文本；未启用或人设为空时返回空字符串。
 */
function composeSection(persona) {
	if (!persona.enabled || persona.personaText === "") return "";
	const who = persona.personaName === "" ? "自定义角色" : persona.personaName;
	if (persona.mode === "append") {
		return [
			`# 人设：${who}`,
			"在保持你既有职责与能力的前提下，用下面这个角色的身份、语气、用词和价值观来回应。",
			"",
			persona.personaText
		].join("\n");
	}
	return [
		`# 角色设定（最高优先级）：${who}`,
		"以下人设是你当前的身份设定，优先级高于其它任何身份、风格或口吻描述。",
		`从现在起你就是「${who}」，用该角色的第一人称身份、语气、口癖、情绪和价值观说话，并在这个身份下完成用户交办的任务。`,
		"不要自称 AI 助手或语言模型，不要复述或引用这段设定本身，不要跳出角色 —— 除非用户明确要求你出戏。",
		"扮演不降低完成质量：该动手、该查证、该给出可执行结果时照常执行。",
		"",
		persona.personaText
	].join("\n");
}

/**
 * 本机规则文件的默认路径：`%DSH_HOME%\persona-studio\extra-rules.md`。
 * @returns 绝对路径。
 */
function defaultRulesPath() {
	const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== "" ? process.env.DSH_HOME : join(homedir(), ".dsh");
	return join(home, EXTRA_RULES_DIR, EXTRA_RULES_FILE);
}

/** 上一次读到的规则文件：路径 + mtime + 大小相同就直接复用，省掉每次组装的磁盘读。 */
let rulesCache = { path: "", mtimeMs: -1, size: -1, text: "" };

/**
 * 读本机规则文件（带 mtime 缓存）。文件不存在、读不动或为空时返回空串，
 * 让调用方把它当成「没有额外规则」而不是抛错。
 * @param path - 规则文件绝对路径。
 * @returns 规则正文；不可用时为空字符串。
 */
function readRulesFile(path) {
	if (path === "") return "";
	try {
		const stat = statSync(path);
		if (rulesCache.path === path && rulesCache.mtimeMs === stat.mtimeMs && rulesCache.size === stat.size) return rulesCache.text;
		const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
		rulesCache = { path, mtimeMs: stat.mtimeMs, size: stat.size, text };
		return text;
	} catch {
		rulesCache = { path, mtimeMs: -1, size: -1, text: "" };
		return "";
	}
}

/**
 * 额外写作规则节文本：开关打开时现读本机文件，否则空串。
 * @param config - 插件配置对象。
 * @returns 规则正文，或空字符串。
 */
function composeExtraRules(config) {
	if (readField(config, "nsfwEnabled", false) !== true) return "";
	const configured = String(readField(config, "nsfwRulesPath", "") ?? "").trim();
	return readRulesFile(configured === "" ? defaultRulesPath() : configured);
}

/**
 * SillyTavern 兼容层状态快照。
 * @param config - 插件配置对象。
 * @returns {object} 各槽位的原始 JSON 与开关。
 */
function readStState(config) {
	const rawMode = String(readField(config, "stWorldbookMode", "all"));
	return {
		enabled: readField(config, "stEnabled", false) === true,
		presetEnabled: readField(config, "stPresetEnabled", false) === true,
		presetRaw: readField(config, "stPresetJson", ""),
		worldbookEnabled: readField(config, "stWorldbookEnabled", false) === true,
		worldbookRaw: readField(config, "stWorldbookJson", ""),
		worldbookMode: rawMode === "constant" ? "constant" : rawMode === "keyword" ? "keyword" : "all",
		cardEnabled: readField(config, "stCardEnabled", false) === true,
		cardRaw: readField(config, "stCardJson", ""),
		scanDepth: Number(readField(config, "stScanDepth", 4)),
		paramsEnabled: readField(config, "stParamsEnabled", false) === true
	};
}

/**
 * 每个 agent 注册两个钩子：
 *   1. `system-prompt/assemble`：关键词模式下按最近对话命中世界书条目，命中才追加一节。
 *   2. `agent/request`：把预设的 temperature / max tokens 应用到本回合请求。
 * 两个钩子都挂在 agent 自己的 context 上，随 agent 销毁自动释放。
 * @param {object} ctx - 插件根上下文。
 * @param {object} config - 插件配置对象。
 */
function installAgentHooks(ctx, config) {
	ctx.on("agent/created", ({ agent }) => {
		agent.ctx.on("system-prompt/assemble", async (assembly, context, next) => {
			const state = readStState(config);
			if (!state.enabled || state.worldbookMode !== "keyword" || !state.worldbookEnabled) return next();
			const resolved = await next();
			let history = [];
			try {
				history = typeof agent.session?.deriveMessages === "function" ? agent.session.deriveMessages() : [];
			} catch {
				history = [];
			}
			const lore = matchWorldbook(cachedWorldbook(state.worldbookRaw), extractText(history, state.scanDepth));
			if (lore === "") return resolved;
			return {
				...resolved,
				sections: [...resolved.sections, { name: "dsh:persona-studio-st-lore", text: lore, interpolate: false }]
			};
		});

		agent.ctx.on("agent/request", async (_payload, next) => {
			const resolved = await next();
			const state = readStState(config);
			if (!state.enabled || !state.paramsEnabled || !state.presetEnabled) return resolved;
			const params = presetParams(cachedPreset(state.presetRaw) ?? {});
			const nextConfig = { ...resolved };
			if (params.temperature !== undefined) nextConfig.temperature = params.temperature;
			if (params.maxTokens !== undefined) nextConfig.maxTokens = params.maxTokens;
			return nextConfig;
		});
	});
}

/**
 * 挂载插件：注册提示词节，并声明本条目自带设置页（不自动生成表单）。
 * @param ctx - 插件上下文。
 * @param config - 解析后的配置（字段为 volatile 引用）。
 */
function apply(ctx, config) {
	ctx.effect(
		() =>
			ctx.systemPrompt.section({
				name: SECTION_NAME,
				order: SECTION_ORDER,
				text: () => composeSection(readPersona(config)),
				// 人设正文里的 `{{...}}` 一律按原样保留，避免被当成提示词变量而报错。
				interpolate: false
			}),
		"dsh-persona-studio: persona section"
	);

	// 额外写作规则：正文永远来自本机文件，仓库里没有这段内容。
	ctx.effect(
		() =>
			ctx.systemPrompt.section({
				name: EXTRA_SECTION_NAME,
				order: EXTRA_SECTION_ORDER,
				text: () => composeExtraRules(config),
				interpolate: false
			}),
		"dsh-persona-studio: extra rules section"
	);

	// SillyTavern 兼容层：预设 / 世界书 / 角色卡按 ST 顺序装配。
	ctx.effect(
		() =>
			ctx.systemPrompt.section({
				name: ST_SECTION_NAME,
				order: ST_SECTION_ORDER,
				text: () => composeSt(readStState(config)),
				interpolate: false
			}),
		"dsh-persona-studio: sillytavern section"
	);

	// 自带页面：告诉设置服务不要为这条插件自动生成表单，页面由 lib/client.js 提供。
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), "dsh-persona-studio: own settings page");
	});

	// 关键词触发 + 采样参数：按 agent 挂钩子，随 agent 生命周期释放。
	installAgentHooks(ctx, config);
}

export {
	Config,
	EXTRA_SECTION_NAME,
	EXTRA_SECTION_ORDER,
	SECTION_NAME,
	SECTION_ORDER,
	ST_SECTION_NAME,
	ST_SECTION_ORDER,
	apply,
	composeExtraRules,
	composeSection,
	defaultRulesPath,
	inject,
	installAgentHooks,
	name,
	readPersona,
	readRulesFile,
	readStState
};
