/**
 * SillyTavern 兼容层（宿主半边）。
 *
 * 支持三种 SillyTavern 产出的 JSON：
 *   1. 预设（chat completion preset）：`{ prompts: [...], prompt_order: [{ order: [...] }] }`
 *   2. 世界书（world info）：`{ entries: { uid: {...} } }` 或 `{ entries: [...] }`
 *   3. 角色卡：V2 `{ spec: "chara_card_v2", data: {...} }` 或 V1 扁平对象
 *
 * 装配方式尽量贴近 SillyTavern：按 `prompt_order` 的顺序输出提示块，遇到 ST 的定位符
 * （worldInfoBefore / charDescription / charPersonality / scenario / worldInfoAfter /
 * dialogueExamples）时把对应内容填进去；空块与纯定位符不输出。
 *
 * 已知限制（如实标注）：SillyTavern 的「关键词触发」需要扫描最近几轮对话原文，而宿主
 * 没有把对话文本交给提示词节，因此世界书用两种模式代替：
 *   all      —— 全部启用的条目都注入（等于把关键词条目常驻化）
 *   constant —— 只注入 constant=true 的条目
 *
 * @module dsh-persona-studio/sillytavern
 */

/** ST 预设里只在装配时占位的定位符。 */
const PLACEHOLDER_IDS = new Set([
	"worldInfoBefore",
	"worldInfoAfter",
	"charDescription",
	"charPersonality",
	"scenario",
	"dialogueExamples",
	"chatHistory",
	"personaDescription",
	"groupNudge"
]);

/**
 * 把「字符串或对象」统一成对象；JSON 坏了就返回 undefined，不抛错。
 * @param {unknown} value - 原始值。
 * @returns {any|undefined} 解析结果。
 */
function asObject(value) {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "string") {
		const text = value.trim();
		if (text === "") return undefined;
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	}
	return typeof value === "object" ? value : undefined;
}

/**
 * 文本归一：CRLF → LF、去首尾空白。
 * @param {unknown} value - 任意值。
 * @returns {string} 归一后的文本。
 */
function text(value) {
	return String(value ?? "")
		.replace(/\r\n/g, "\n")
		.trim();
}

/**
 * 解析 SillyTavern 预设。
 * @param {unknown} raw - 预设 JSON（字符串或对象）。
 * @returns {{name:string, blocks:Array<{id:string,name:string,role:string,content:string}>}|undefined} 解析结果。
 */
function parsePreset(raw) {
	const src = asObject(raw);
	if (!src) return undefined;
	const prompts = Array.isArray(src.prompts) ? src.prompts : [];
	if (prompts.length === 0) return { name: "预设", blocks: [] };
	const byId = new Map();
	for (const prompt of prompts) {
		const id = String(prompt?.identifier ?? prompt?.name ?? "");
		if (id === "") continue;
		byId.set(id, prompt);
	}
	const order = Array.isArray(src.prompt_order?.[0]?.order) ? src.prompt_order[0].order : [];
	const sequence = [];
	const enabled = order.filter((row) => row?.enabled !== false).map((row) => String(row?.identifier ?? ""));
	for (const id of enabled.length > 0 ? enabled : prompts.map((p) => String(p?.identifier ?? p?.name ?? ""))) {
		const prompt = byId.get(id);
		if (!prompt) continue;
		sequence.push({
			id,
			name: String(prompt.name ?? id),
			role: String(prompt.role ?? "system"),
			content: text(prompt.content)
		});
	}
	return { name: typeof src.name === "string" ? src.name : "预设", blocks: sequence };
}

/**
 * 解析 SillyTavern 世界书。
 * @param {unknown} raw - 世界书 JSON（字符串或对象）。
 * @returns {{name:string, entries:Array<{id:string,name:string,content:string,constant:boolean,order:number,keys:string[]}>}|undefined} 解析结果。
 */
function parseWorldbook(raw) {
	const src = asObject(raw);
	if (!src) return undefined;
	const source = src.entries ?? src;
	const rows = Array.isArray(source)
		? source.map((entry, index) => [String(index), entry])
		: source !== null && typeof source === "object"
			? Object.entries(source)
			: [];
	const entries = [];
	for (const [key, entry] of rows) {
		if (entry === null || typeof entry !== "object") continue;
		const content = text(entry.content ?? entry.entry ?? "");
		if (content === "") continue;
		const keys = entry.keys ?? entry.key ?? [];
		entries.push({
			id: String(entry.uid ?? entry.id ?? key),
			name: text(entry.comment ?? entry.name ?? "") || "条目 " + String(entry.uid ?? entry.id ?? key),
			content,
			constant: entry.constant === true,
			order: Number.isFinite(entry.order) ? Number(entry.order) : 100,
			keys: (Array.isArray(keys) ? keys : [keys]).map((item) => text(item)).filter((item) => item !== ""),
			secondary: (Array.isArray(entry.keysecondary ?? entry.keySecondary) ? entry.keysecondary ?? entry.keySecondary : [entry.keysecondary ?? entry.keySecondary])
				.map((item) => text(item))
				.filter((item) => item !== ""),
			selective: entry.selective !== false,
			caseSensitive: entry.case_sensitive === true || entry.caseSensitive === true,
			wholeWords: entry.match_whole_words === true || entry.matchWholeWords === true
		});
	}
	entries.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
	return { name: typeof src.name === "string" ? src.name : "世界书", entries };
}

/**
 * 解析角色卡（V2 / V1）。
 * @param {unknown} raw - 角色卡 JSON（字符串或对象）。
 * @returns {{name:string, description:string, personality:string, scenario:string, example:string, systemPrompt:string, postHistory:string, book:any}|undefined} 解析结果。
 */
function parseCard(raw) {
	const src = asObject(raw);
	if (!src) return undefined;
	const data = src.data && typeof src.data === "object" ? src.data : src;
	const name = text(data.name ?? data.char_name ?? "");
	if (name === "" && !data.description && !data.personality && !data.scenario) return undefined;
	return {
		name: name || "角色",
		description: text(data.description ?? data.char_persona ?? ""),
		personality: text(data.personality ?? ""),
		scenario: text(data.scenario ?? data.world_scenario ?? ""),
		example: text(data.mes_example ?? data.example_dialogue ?? ""),
		systemPrompt: text(data.system_prompt ?? ""),
		postHistory: text(data.post_history_instructions ?? ""),
		book: data.character_book
	};
}

/** 上一次解析的缓存：JSON 字符串没变就直接复用解析结果。 */
const cache = { presetRaw: "", preset: undefined, worldRaw: "", world: undefined, cardRaw: "", card: undefined };

/**
 * 带缓存的解析入口，避免每次组装都重新解析大 JSON。
 * @param {"preset"|"worldbook"|"card"} kind - 类型。
 * @param {unknown} raw - 原始 JSON。
 * @returns {any} 解析结果。
 */
function cached(kind, raw) {
	const key = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
	const rawKey = kind === "preset" ? "presetRaw" : kind === "worldbook" ? "worldRaw" : "cardRaw";
	const valueKey = kind === "preset" ? "preset" : kind === "worldbook" ? "world" : "card";
	if (cache[rawKey] === key) return cache[valueKey];
	const parsed = kind === "preset" ? parsePreset(raw) : kind === "worldbook" ? parseWorldbook(raw) : parseCard(raw);
	cache[rawKey] = key;
	cache[valueKey] = parsed;
	return parsed;
}

/**
 * 把世界书条目渲染成一段文本。
 * @param {{entries:Array<{content:string,constant:boolean}>}|undefined} worldbook - 解析后的世界书。
 * @param {"all"|"constant"} mode - 注入模式。
 * @returns {string} 条目正文，空则空串。
 */
function renderWorldbook(worldbook, mode) {
	if (!worldbook || worldbook.entries.length === 0) return "";
	const rows = worldbook.entries.filter((entry) => (mode === "constant" ? entry.constant : true));
	return rows.map((entry) => entry.content).join("\n\n");
}

/**
 * 从对话消息里抽出纯文本（容忍字符串内容与分段内容两种形态）。
 * @param {Array<any>} messages - 消息数组。
 * @param {number} depth - 只取最近多少条。
 * @returns {string} 拼好的文本。
 */
function extractText(messages, depth) {
	if (!Array.isArray(messages) || messages.length === 0) return "";
	const limit = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 4;
	const rows = messages.slice(-limit);
	const parts = [];
	for (const message of rows) {
		const content = message?.content;
		if (typeof content === "string") {
			parts.push(content);
			continue;
		}
		if (Array.isArray(content)) {
			for (const piece of content) {
				if (typeof piece === "string") parts.push(piece);
				else if (piece && typeof piece.text === "string") parts.push(piece.text);
			}
		}
	}
	return parts.join("\n").trim();
}

/**
 * 判断一条世界书条目是否被关键词命中（SillyTavern 语义的简化版）。
 * @param {object} entry - 解析后的条目。
 * @param {string} haystack - 已抽好的对话文本。
 * @returns {boolean} 是否命中。
 */
function matchesEntry(entry, haystack) {
	if (entry.constant === true) return true;
	if (entry.keys.length === 0) return false;
	const hay = entry.caseSensitive === true ? haystack : haystack.toLowerCase();
	const test = (key) => {
		const needle = entry.caseSensitive === true ? key : key.toLowerCase();
		if (needle === "") return false;
		if (entry.wholeWords !== true) return hay.includes(needle);
		const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp("(^|[^\\p{L}\\p{N}_])" + escaped + "($|[^\\p{L}\\p{N}_])", "u").test(hay);
	};
	if (!entry.keys.some(test)) return false;
	if (entry.selective !== false && entry.secondary.length > 0) return entry.secondary.some(test);
	return true;
}

/**
 * 关键词触发：按对话文本筛出命中的条目并拼成注入文本。
 * @param {{entries:Array<object>}|undefined} worldbook - 解析后的世界书。
 * @param {string} haystack - 对话文本。
 * @returns {string} 命中条目的正文；无命中为空串。
 */
function matchWorldbook(worldbook, haystack) {
	if (!worldbook || worldbook.entries.length === 0 || haystack === "") return "";
	const hit = worldbook.entries.filter((entry) => matchesEntry(entry, haystack));
	return hit.map((entry) => entry.content).join("\n\n");
}

/**
 * 从 SillyTavern 预设里取出 DSH 支持的采样参数。
 * DSH 的请求配置只有 temperature / maxTokens（外加 reasoningEffort、stop），
 * top_p / top_k / frequency_penalty / presence_penalty / repetition_penalty 不接管。
 * @param {unknown} raw - 预设 JSON（字符串或对象）。
 * @returns {{temperature?:number, maxTokens?:number, unsupported:string[]}} 可映射的参数。
 */
function presetParams(raw) {
	const src = asObject(raw);
	if (!src) return { unsupported: [] };
	const params = { unsupported: [] };
	if (typeof src.temperature === "number" && Number.isFinite(src.temperature)) params.temperature = src.temperature;
	const maxTokens = src.openai_max_tokens ?? src.max_tokens ?? src.maxTokens;
	if (typeof maxTokens === "number" && Number.isSafeInteger(maxTokens) && maxTokens > 0) params.maxTokens = maxTokens;
	for (const key of ["top_p", "top_k", "frequency_penalty", "presence_penalty", "repetition_penalty", "min_p", "top_a"]) {
		if (src[key] !== undefined) params.unsupported.push(key);
	}
	return params;
}

/**
 * 装配 SillyTavern 风格提示词文本。
 * @param {{enabled:boolean, presetEnabled:boolean, presetRaw:unknown, worldbookEnabled:boolean, worldbookRaw:unknown, worldbookMode:"all"|"constant", cardEnabled:boolean, cardRaw:unknown}} state - 当前状态。
 * @returns {string} 注入文本；未启用或没有内容时为空字符串。
 */
function composeSt(state) {
	if (state.enabled !== true) return "";
	const preset = state.presetEnabled ? cached("preset", state.presetRaw) : undefined;
	const worldbook = state.worldbookEnabled ? cached("worldbook", state.worldbookRaw) : undefined;
	const card = state.cardEnabled ? cached("card", state.cardRaw) : undefined;
	const worldText = state.worldbookMode === "keyword" ? "" : renderWorldbook(worldbook, state.worldbookMode === "constant" ? "constant" : "all");
	const parts = [];
	let worldEmitted = false;

	/** 每个 ST 定位符对应的内容。 */
	const markerText = (id) => {
		if (id === "worldInfoBefore" || id === "worldInfoAfter") {
			if (worldEmitted || worldText === "") return "";
			worldEmitted = true;
			return worldText;
		}
		if (id === "charDescription") return card?.description ?? "";
		if (id === "charPersonality") return card?.personality ?? "";
		if (id === "scenario") return card?.scenario ?? "";
		if (id === "dialogueExamples") return card?.example ?? "";
		return "";
	};

	if (card?.systemPrompt) parts.push(card.systemPrompt);

	const blocks = preset?.blocks ?? [];
	if (blocks.length === 0) {
		// 没有预设：世界书放最前，再接角色卡正文。
		if (worldText !== "") {
			parts.push(worldText);
			worldEmitted = true;
		}
		if (card) {
			const head = [card.name !== "" ? "角色：" + card.name : "", card.description, card.personality && "性格：" + card.personality, card.scenario && "场景：" + card.scenario]
				.filter((item) => item !== "")
				.join("\n");
			if (head !== "") parts.push(head);
			if (card.example !== "") parts.push(card.example);
		}
	} else {
		for (const block of blocks) {
			if (PLACEHOLDER_IDS.has(block.id)) {
				const filled = markerText(block.id);
				if (filled !== "") parts.push(filled);
				continue;
			}
			if (block.content === "") continue;
			parts.push(block.content);
		}
		// 定位符没出现（预设被改动过）时兜底，避免内容整段丢失。
		if (!worldEmitted && worldText !== "") parts.push(worldText);
		if (card) {
			const missing = [card.description, card.personality && "性格：" + card.personality, card.scenario && "场景：" + card.scenario]
				.filter((item) => item !== "" && !parts.includes(item))
				.join("\n");
			if (missing !== "") parts.push(missing);
		}
	}

	if (card?.postHistory) parts.push(card.postHistory);

	const body = parts.map((part) => part.trim()).filter((part) => part !== "").join("\n\n");
	if (body === "") return "";
	return ["# SillyTavern 兼容设定", "以下内容按 SillyTavern 预设 / 世界书 / 角色卡装配，优先于通用风格描述。", "", body].join("\n");
}

/**
 * 带缓存的解析入口（世界书）：宿主每步都要用同一条 JSON 做关键词匹配，
 * 缓存命中时不会再解析一遍。
 * @param {unknown} raw - 原始 JSON。
 * @returns {any} 解析后的世界书。
 */
function cachedWorldbook(raw) {
	return cached("worldbook", raw);
}

/**
 * 带缓存的解析入口（预设）：采样参数要按回合读取，避免每次重新解析。
 * @param {unknown} raw - 原始 JSON。
 * @returns {any} 解析后的预设。
 */
function cachedPreset(raw) {
	return cached("preset", raw);
}

export {
	PLACEHOLDER_IDS,
	cachedPreset,
	cachedWorldbook,
	composeSt,
	extractText,
	matchesEntry,
	matchWorldbook,
	parseCard,
	parsePreset,
	parseWorldbook,
	presetParams,
	renderWorldbook
};
