/**
 * dsh-persona-studio —— 宿主半边。
 *
 * 职责：
 *   1. 在 DSH 设置文档里提供「人设」这一组可编辑字段（全部 `.volatile()`，
 *      因此设置页保存后会原地更新引用的值，不重挂插件、不重载 DSH）。
 *   2. 把所有字段合成一段人设文本，注册成系统提示词节 `dsh:persona-studio`，
 *      插在官方 `deployment:persona-prefix`（order 0）之后。
 *
 * 关键点：`systemPrompt.section()` 的 `text` 允许传函数，注册表在**每次组装**
 * 系统提示词时调用它。于是人设文本由 `config.*.get()` 实时求值 —— 打开/关闭、
 * 改写人设都会在下一次模型请求（同一个会话也算）立刻生效，无需重启或新建会话。
 *
 * 未启用或人设为空时返回空字符串，空节在渲染阶段被丢弃，等于不注入任何内容。
 *
 * @module dsh-persona-studio
 */
import z from "@deepseek-ai/schemastery";

/** Cordis 插件名。 */
const name = "dsh-persona-studio";
/** 需要的服务：系统提示词注册表。 */
const inject = ["systemPrompt"];

/** 提示词节名称：不复用官方 persona 节名，就不会与官方/预设注册撞名。 */
const SECTION_NAME = "dsh:persona-studio";
/** 排序位置：`DEPLOYMENT_PERSONA_PREFIX` 是 0，紧跟其后。 */
const SECTION_ORDER = 1;

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
	presets: z.array(PresetConfig).default([]).volatile()
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

	// 自带页面：告诉设置服务不要为这条插件自动生成表单，页面由 lib/client.js 提供。
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), "dsh-persona-studio: own settings page");
	});
}

export { Config, SECTION_NAME, SECTION_ORDER, apply, composeSection, inject, name, readPersona };
