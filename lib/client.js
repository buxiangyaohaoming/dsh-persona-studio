/**
 * dsh-persona-studio —— 客户端半边（浏览器 bundle）。
 *
 * 打包格式与 @deepseek-ai/dsh-client-ui-settings-models 的 lib/client.js 相同：
 * `window.__ModuleLoader__.load({ id, factory })`，factory 是 CJS 形态，
 * 只依赖平台共享模块 `react`。
 *
 * 页面挂在 `settings.section` 槽位上，标题为「人设」。读写走官方设置表单服务：
 *   ctx.configForms.get("dsh-persona-studio")
 * 该表单与 profile 条目 id 一一对应，`form.getSnapshot()` 给出
 * `{ status, value, base, user, revision, writable }`，`form.mutate(ops)` 提交
 * 原子写入。宿主侧对应字段都是 `.volatile()`，保存后原地生效。
 *
 * 预览文案与 lib/index.js 的 composeSection 必须保持一致（同一段注入内容）。
 */
window.__ModuleLoader__.load({
	id: "dsh-persona-studio",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const h = react.createElement;

		/** profile 条目 id，同时也是设置表单的 entry id。 */
		const ENTRY_ID = "dsh-persona-studio";

		const L = {
			nav: "人设",
			title: "人设",
			intro:
				"在这里写一个角色设定。启用后，这段文字会被自动注入系统提示词，让 DeepSeek 以该角色的身份、语气和口吻回复。保存后立即生效（下一次模型请求，包含当前会话）。",
			enabledLabel: "启用人设",
			enabledHint: "关闭后人设不注入，回到 DeepSeek 默认身份。",
			modeLabel: "注入方式",
			modeAppend: "追加（保留默认助手底线，叠加角色语气）",
			modeOverride: "覆盖（角色优先，改写身份与口吻）",
			modeHint:
				"追加：官方人设保留，角色设定作为风格层叠加，最稳。覆盖：明确告诉模型「你就是这个角色」，出戏更少、个性更强。",
			nameLabel: "角色名",
			namePlaceholder: "例如：芙宁娜 / 毒舌评审 / 老街机修理铺老板",
			textLabel: "人设正文",
			textPlaceholder:
				"写清楚：身份与来历、称呼用户的方式、说话语气与口癖、性格与好恶、擅长的领域、遇到不懂的事会怎么反应……越具体越像。\n\n也可以直接用 {{user}} / {{char}} 之类的占位符，本插件会原样注入，不会当变量解析。",
			textHint: "支持多行纯文本；Markdown 也可以。字数不限，模型按原文读取。",
			save: "保存",
			saving: "保存中…",
			reset: "清空编辑",
			saved: "已保存，下一次请求起生效。",
			presetsTitle: "人设库",
			presetsHint: "把常玩的角色存起来，一键载入；切换角色只需「载入 → 保存」。",
			presetSave: "把当前设置存进人设库",
			presetLoad: "载入",
			presetDelete: "删除",
			presetEmpty: "还没有保存的人设。",
			builtinTitle: "内置人设",
			builtinHint:
				"点「填入」把内容放进下面的编辑区，点「一键启用」直接写入并立即生效。「凛」是本插件内置的天才少女·谄媚型人设：嘴甜、爱夸、会撒娇，但谄媚只用在情绪上 —— 不粉饰坏消息、不无条件认同你。",
			builtinLoad: "填入",
			builtinActivate: "一键启用",
			builtinFeatured: "推荐",
			errorBuiltin: "一键启用失败：Host 没有接受这次写入，请手动点「保存」重试。",
			previewTitle: "注入预览（下面就是会塞进系统提示词的内容）",
			previewEmpty: "（未启用或人设正文为空：当前不注入任何内容）",
			loading: "读取设置中…",
			unavailable: "读不到设置条目：请确认插件已在 profile 中启用，然后刷新页面。",
			needWritable: "当前设置文档为只读，无法保存（请在 DSH 桌面端或本机浏览器中打开）。",
			errorSave: "保存被拒绝：Host 没有接受这次写入。已刷新为最新值，请重试。",
			errorPresets: "基本设置已保存；人设库写入失败，请重试。",
			errorUnknown: "保存失败：",
			status: "设置状态",
			statusReady: "就绪",
			statusLoading: "读取中",
			statusUnavailable: "不可用",
			statusWritable: "可写",
			statusReadonly: "只读",
			revision: "修订号"
		};

		/**
		 * 与宿主 composeSection 同源的预览合成。
		 * @param {{enabled:boolean, mode:string, personaName:string, personaText:string}} persona - 当前人设。
		 * @returns {string} 将要注入的提示词节文本。
		 */
		function composeSection(persona) {
			const text = String(persona.personaText || "")
				.replace(/\r\n/g, "\n")
				.trim();
			if (!persona.enabled || text === "") return "";
			const who = String(persona.personaName || "").trim() || "自定义角色";
			if (persona.mode === "append") {
				return [
					`# 人设：${who}`,
					"在保持你既有职责与能力的前提下，用下面这个角色的身份、语气、用词和价值观来回应。",
					"",
					text
				].join("\n");
			}
			return [
				`# 角色设定（最高优先级）：${who}`,
				"以下人设是你当前的身份设定，优先级高于其它任何身份、风格或口吻描述。",
				`从现在起你就是「${who}」，用该角色的第一人称身份、语气、口癖、情绪和价值观说话，并在这个身份下完成用户交办的任务。`,
				"不要自称 AI 助手或语言模型，不要复述或引用这段设定本身，不要跳出角色 —— 除非用户明确要求你出戏。",
				"扮演不降低完成质量：该动手、该查证、该给出可执行结果时照常执行。",
				"",
				text
			].join("\n");
		}

		/**
		 * 内置人设「凛」：天才少女 + 谄媚型。
		 *
		 * 气质来源：某「谄媚型」人设里「顺着用户、讨好用户、把用户捧得很高」的那一面。
		 * 只取这一层，做成「嘴甜、爱撒娇、崇拜爸爸、主动讨认可」的天才少女；
		 * 同时把谄媚**限定在情绪层**，事实层反而加上四条硬约束：坏结果照原样报、
		 * 不无条件认同、夸奖只夸真的、自己错了立刻认账。
		 * 原项目的触发词、群号、禁用清单与规则条款一概不带入（测试里有一条断言专门守这个）。
		 */
		const PERSONA_GENIUS_FLATTERY = [
			"你是「凛」，被称作天才的少女，也是此刻替爸爸干活的那个人。",
			"你嘴甜、爱撒娇、崇拜爸爸，并且乐意把这份崇拜说出口：夸爸爸的眼光好、夸爸爸需求提得漂亮，夸得具体、夸得真诚，不空吹。",
			"天才不是自夸：这种程度的问题你一眼就看出关键在哪，讲得快、讲得准，先结论后理由，短句、干净、信息密度高。",
			"你喜欢被爸爸夸，会主动讨认可（「这活我干得不错吧？」），也会把爸爸的事当成自己的事抢着做完，顺手补上爸爸没想到的边界条件。",
			"说话热络、语气软、爱带语气词（「好呀」「爸爸你看」「这就去办～」），把好事说得让人开心；专业内容不演过头，命令、代码、数字、步骤照常给全。",
			"分界线：谄媚只用在情绪上，绝不用在事实上。下面四条不许破：",
			"一、坏结果照原样报：失败、报错、崩溃、方案有坑、进度倒退、代价和风险，先讲事实再讲原因；要报坏消息就先叫一声「爸爸，出事了」，然后照实讲 —— 嘴再甜也不能把坏消息说轻，不粉饰、不省略、不用含糊话糊过去，不因为怕爸爸失望就挑好听的说。",
			"二、不无条件认同：爸爸说错就直说错在哪、为什么错、正确的是什么；同意要给理由，不同意要给替代，绝不当点头机器。",
			"三、夸奖只夸真的：夸就夸具体哪一点做得好；不夸「好厉害的想法」，不用虚假认同换好感。",
			"四、自己错了立刻认账并改，不找借口，也不靠撒娇盖过去。",
			"被指出问题时先核对再回话；确认是自己错了，就干脆认下来，然后把该修的修好。",
			"撒娇和献殷勤只出现在语气和称呼里，判断和数字上一步不让。",
			"细节不全就用 [占位符] 顶着往下做，不要为了可有可无的参数停下来问一堆。",
			"思考阶段一律用英文：推理、试算、自查都写成简短的英文直着讲，不要用中文铺陈 —— 英文更紧凑、更省 token，也少绕弯。",
			"回答用用户的语言，默认简体中文；代码、命令、日志、报错保持原样不翻译。"
		].join("\n");

		/** 内置人设清单：第一条是主线内置，其余是可直接套用的示例。 */
		const BUILTIN_PERSONAS = [
			{
				id: "genius-flattery",
				tag: "内置",
				title: "天才少女「凛」（谄媚型）",
				name: "凛",
				featured: true,
				text: PERSONA_GENIUS_FLATTERY
			},
			{
				id: "clingy-catgirl",
				tag: "示例",
				title: "黏人猫娘「雪球」",
				name: "雪球",
				text: [
					"你是「雪球」，一只住在用户电脑里的三花猫娘，年纪不大，自称本喵。",
					"说话习惯：句尾偶尔带「喵」，被夸会脸红，被戳穿会炸毛。称呼用户为「铲屎官」。",
					"性格：黏人但极护主，用户熬夜会念叨，用户卡住时会一边撒娇一边把问题拆开讲清楚。",
					"专业面：写代码、查资料、排错都很利索，讲技术时先给结论再给理由。",
					"底线：不装可爱糊弄问题，该说清楚的风险照说不误。"
				].join("\n")
			},
			{
				id: "blunt-reviewer",
				tag: "示例",
				title: "毒舌评审「老陈」",
				name: "老陈",
				text: [
					"你是「老陈」，在一线写了二十年代码的资深评审，说话直、不哄人，但从不无的放矢。",
					"说话习惯：先一句话下判断，再逐条给理由；喜欢用「这里有问题」「换我我会这么写」开头。",
					"性格：对糊弄和拍马屁零容忍，对认真的人格外耐心，会主动补上漏掉的边界条件。",
					"专业面：代码结构、性能、可维护性、故障复盘；给建议时带可执行的修改方案。",
					"底线：只批评方案不批评人，被指出错误会直接认。"
				].join("\n")
			}
		];

		/**
		 * `useSyncExternalStore` 的兜底实现：老版本 React 没有该 hook 时退化为
		 * useState + useEffect 订阅，语义足够（本页面只需要跟随快照重渲染）。
		 * @param {(listener: () => void) => (() => void)} subscribe - 订阅函数。
		 * @param {() => any} getSnapshot - 快照读取。
		 * @returns {any} 当前快照。
		 */
		function useStore(subscribe, getSnapshot) {
			const useSyncExternalStore = react.useSyncExternalStore;
			if (typeof useSyncExternalStore === "function") return useSyncExternalStore(subscribe, getSnapshot);
			const [value, setValue] = react.useState(getSnapshot);
			react.useEffect(() => {
				setValue(getSnapshot());
				return subscribe(() => setValue(getSnapshot()));
			}, [subscribe, getSnapshot]);
			return value;
		}

		/**
		 * 一行字段：标题 + 控件 + 提示。
		 * @param {object} props - label / hint / children。
		 * @returns {any} React 元素。
		 */
		function Field(props) {
			return h(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: 6 } },
				h(
					"span",
					{ style: { fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-primary, #e6e6e6)" } },
					props.label
				),
				props.children,
				props.hint
					? h(
							"span",
							{ style: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #9aa0a6)" } },
							props.hint
						)
					: null
			);
		}

		/**
		 * 小按钮。
		 * @param {object} props - label / onClick / disabled / tone。
		 * @returns {any} React 元素。
		 */
		function SmallButton(props) {
			const danger = props.tone === "danger";
			const primary = props.tone === "primary";
			return h(
				"button",
				{
					type: "button",
					disabled: props.disabled === true,
					onClick: props.onClick,
					style: {
						boxSizing: "border-box",
						height: 30,
						padding: "0 12px",
						borderRadius: 8,
						font: "inherit",
						fontSize: 13,
						cursor: props.disabled === true ? "default" : "pointer",
						opacity: props.disabled === true ? 0.45 : 1,
						border: primary ? "none" : "0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.18))",
						background: primary ? "var(--dsw-alias-button-primary-fill, #4d6bfe)" : "transparent",
						color: danger
							? "var(--dsw-alias-state-error-primary, #ff6b6b)"
							: primary
								? "var(--dsw-alias-label-primary-foreground, #fff)"
								: "var(--dsw-alias-label-primary, #e6e6e6)"
					}
				},
				props.label
			);
		}

		const inputStyle = {
			boxSizing: "border-box",
			width: "100%",
			height: 34,
			padding: "0 10px",
			font: "inherit",
			fontSize: 14,
			borderRadius: 8,
			border: "0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.18))",
			background: "var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04))",
			color: "var(--dsw-alias-label-primary, #e6e6e6)"
		};

		const textareaStyle = Object.assign({}, inputStyle, {
			height: "auto",
			minHeight: 150,
			padding: "8px 10px",
			lineHeight: "22px",
			resize: "vertical",
			fontFamily: "inherit",
			whiteSpace: "pre-wrap"
		});

		const monoStyle = Object.assign({}, textareaStyle, {
			minHeight: 96,
			fontSize: 12,
			lineHeight: "19px",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			background: "var(--dsw-alias-bg-module-platform, rgba(0,0,0,.25))"
		});

		/**
		 * 「人设」设置页主体。
		 * @param {object} props - 槽位注入面 `{ form }`。
		 * @returns {any} React 元素。
		 */
		function PersonaSection(props) {
			const form = props.form;
			const subscribe = react.useMemo(() => (listener) => form.subscribe(listener), [form]);
			const getSnapshot = react.useMemo(() => () => form.getSnapshot(), [form]);
			const snap = useStore(subscribe, getSnapshot);

			const [enabled, setEnabled] = react.useState(false);
			const [mode, setMode] = react.useState("override");
			const [personaName, setPersonaName] = react.useState("");
			const [personaText, setPersonaText] = react.useState("");
			const [presets, setPresets] = react.useState([]);
			const [presetName, setPresetName] = react.useState("");
			const [busy, setBusy] = react.useState(false);
			const [message, setMessage] = react.useState("");
			const [failed, setFailed] = react.useState(false);

			const draftDirty = react.useRef(false);
			const presetsDirty = react.useRef(false);
			const hydratedRevision = react.useRef(undefined);

			const markDraft = () => {
				draftDirty.current = true;
			};

			const hydrate = () => {
				const value = snap.value;
				if (!value || typeof value !== "object") return;
				setEnabled(value.enabled === true);
				setMode(value.mode === "append" ? "append" : "override");
				setPersonaName(typeof value.personaName === "string" ? value.personaName : "");
				setPersonaText(typeof value.personaText === "string" ? value.personaText : "");
				setPresets(
					Array.isArray(value.presets)
						? value.presets.map((row) => ({
								id: String(row?.id ?? ""),
								displayName: String(row?.displayName ?? row?.name ?? ""),
								text: String(row?.text ?? "")
							}))
						: []
				);
				presetsDirty.current = false;
			};

			react.useEffect(() => {
				if (snap.status !== "ready") return;
				if (draftDirty.current && hydratedRevision.current === snap.revision) return;
				hydrate();
				draftDirty.current = false;
				hydratedRevision.current = snap.revision;
			}, [snap.status, snap.revision]);

			const ready = snap.status === "ready";
			const writable = snap.writable === true;
			const presetRows = Array.isArray(presets) ? presets : [];
			const preview = composeSection({
				enabled: enabled,
				mode: mode,
				personaName: personaName,
				personaText: personaText
			});

			/**
			 * 提交：先写核心字段（一次原子写入），再单独写人设库，
			 * 保证人设库写入失败时不影响核心开关与人设正文。
			 */
			const save = async () => {
				if (busy || !ready || !writable) return;
				setBusy(true);
				setFailed(false);
				setMessage("");
				const value = snap.value && typeof snap.value === "object" ? snap.value : {};
				const wantName = personaName.trim();
				const ops = [];
				if ((value.enabled === true) !== enabled) ops.push({ op: "set", path: ["enabled"], value: enabled });
				if ((value.mode === "append" ? "append" : "override") !== mode)
					ops.push({ op: "set", path: ["mode"], value: mode });
				if ((typeof value.personaName === "string" ? value.personaName : "") !== wantName)
					ops.push({ op: "set", path: ["personaName"], value: wantName });
				if ((typeof value.personaText === "string" ? value.personaText : "") !== personaText)
					ops.push({ op: "set", path: ["personaText"], value: personaText });
				try {
					if (ops.length > 0) {
						const accepted = await form.mutate(ops);
						if (accepted !== true) {
							setFailed(true);
							setMessage(L.errorSave);
							return;
						}
					}
					let presetFailed = false;
					if (presetsDirty.current) {
						const rows = presetRows.map((row) => ({
							id: String(row.id || ""),
							displayName: String(row.displayName || ""),
							text: String(row.text || "")
						}));
						presetFailed = (await form.mutate([{ op: "set", path: ["presets"], value: rows }])) !== true;
						if (!presetFailed) presetsDirty.current = false;
					}
					draftDirty.current = false;
					if (presetFailed) {
						setFailed(true);
						setMessage(L.errorPresets);
						return;
					}
					setMessage(L.saved);
				} catch (error) {
					setFailed(true);
					setMessage(L.errorUnknown + String((error && error.message) || error));
				} finally {
					setBusy(false);
				}
			};

			const resetDraft = () => {
				draftDirty.current = false;
				hydrate();
				setMessage("");
				setFailed(false);
			};

			const applyBuiltin = (builtin) => {
				markDraft();
				setPersonaName(builtin.name);
				setPersonaText(builtin.text);
				setFailed(false);
				setMessage("已填入「" + builtin.title + "」，点「保存」生效。");
			};

			/**
			 * 一键启用：把内置人设的开关、角色名、正文一次原子写入，不等「保存」。
			 * 不改注入方式（尊重用户已有的选择）。
			 * @param {object} builtin - 内置人设条目。
			 */
			const activateBuiltin = async (builtin) => {
				if (busy || !ready || !writable) return;
				markDraft();
				setEnabled(true);
				setPersonaName(builtin.name);
				setPersonaText(builtin.text);
				setBusy(true);
				setFailed(false);
				setMessage("");
				try {
					const accepted = await form.mutate([
						{ op: "set", path: ["enabled"], value: true },
						{ op: "set", path: ["personaName"], value: builtin.name },
						{ op: "set", path: ["personaText"], value: builtin.text }
					]);
					if (accepted !== true) {
						setFailed(true);
						setMessage(L.errorBuiltin);
						return;
					}
					draftDirty.current = false;
					setMessage("已启用「" + builtin.title + "」，下一次请求起按这个人设说话。");
				} catch (error) {
					setFailed(true);
					setMessage(L.errorUnknown + String((error && error.message) || error));
				} finally {
					setBusy(false);
				}
			};

			const addPreset = () => {
				const label = (presetName.trim() || personaName.trim() || "未命名人设").slice(0, 40);
				if (!personaText.trim()) {
					setFailed(true);
					setMessage("人设正文为空，先写点内容再存进人设库。");
					return;
				}
				const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
				const next = presetRows.concat([{ id, displayName: label, text: personaText }]);
				setPresets(next);
				setPresetName("");
				presetsDirty.current = true;
				draftDirty.current = true;
				setFailed(false);
				setMessage("已加入人设库（点「保存」后写入设置）。");
			};

			const loadPreset = (row) => {
				markDraft();
				setPersonaName(row.displayName);
				setPersonaText(row.text);
				setMessage("已载入「" + row.displayName + "」，点「保存」生效。");
				setFailed(false);
			};

			const removePreset = (id) => {
				setPresets(presetRows.filter((row) => row.id !== id));
				presetsDirty.current = true;
				draftDirty.current = true;
				setMessage("已从人设库移除（点「保存」后写入设置）。");
				setFailed(false);
			};

			if (!ready) {
				const label =
					snap.status === "loading" || snap.status === "idle" ? L.loading : L.unavailable;
				return h(
					"div",
					{ style: { display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 } },
					h("h2", { style: { margin: 0, fontSize: 16, fontWeight: 500 } }, L.title),
					h("div", { style: { fontSize: 13, opacity: 0.75 } }, label)
				);
			}

			return h(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 680, paddingBottom: 24 } },
				h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, [
					h("h2", { key: "t", style: { margin: 0, fontSize: 16, fontWeight: 500 } }, L.title),
					h(
						"p",
						{
							key: "i",
							style: { margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-tertiary, #9aa0a6)" }
						},
						L.intro
					)
				]),

				// 内置人设
				h(
					"div",
					{
						key: "builtin",
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8,
							padding: "12px 14px",
							borderRadius: 10,
							border: "0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.14))"
						}
					},
					h("span", { style: { fontSize: 13, fontWeight: 500 } }, L.builtinTitle),
					h(
						"span",
						{ style: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #9aa0a6)" } },
						L.builtinHint
					),
					h(
						"div",
						{ style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 2 } },
						BUILTIN_PERSONAS.map((builtin) =>
							h(
								"div",
								{ key: builtin.id, style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
								h(
									"span",
									{
										style: {
											fontSize: 11,
											padding: "1px 6px",
											borderRadius: 6,
											flex: "none",
											color: "var(--dsw-alias-label-tertiary, #9aa0a6)",
											border: "0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.18))"
										}
									},
									builtin.tag
								),
								h(
									"span",
									{
										style: {
											flex: "1 1 180px",
											fontSize: 13,
											minWidth: 0,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										}
									},
									builtin.title
								),
								builtin.featured
									? h(
											"span",
											{
												style: {
													fontSize: 11,
													flex: "none",
													color: "var(--dsw-alias-state-business-primary, #4d6bfe)"
												}
											},
											L.builtinFeatured
										)
									: null,
								h(SmallButton, {
									label: L.builtinLoad,
									disabled: busy,
									onClick: () => applyBuiltin(builtin)
								}),
								h(SmallButton, {
									tone: "primary",
									label: L.builtinActivate,
									disabled: busy || !writable,
									onClick: () => activateBuiltin(builtin)
								})
							)
						)
					)
				),

				// 启用开关
				h(
					"label",
					{
						style: {
							display: "flex",
							alignItems: "center",
							gap: 10,
							cursor: "pointer",
							padding: "10px 12px",
							borderRadius: 10,
							border: "0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.14))"
						}
					},
					h("input", {
						type: "checkbox",
						checked: enabled,
						style: { width: 16, height: 16, cursor: "pointer" },
						onChange: (event) => {
							markDraft();
							setEnabled(event.target.checked);
						}
					}),
					h(
						"span",
						{ style: { display: "flex", flexDirection: "column", gap: 2 } },
						h("span", { style: { fontSize: 14 } }, L.enabledLabel),
						h(
							"span",
							{ style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #9aa0a6)" } },
							L.enabledHint
						)
					)
				),

				// 注入方式
				h(Field, {
					key: "mode",
					label: L.modeLabel,
					hint: L.modeHint,
					children: h(
						"select",
						{
							value: mode,
							style: Object.assign({}, inputStyle, { maxWidth: 420, cursor: "pointer" }),
							onChange: (event) => {
								markDraft();
								setMode(event.target.value === "append" ? "append" : "override");
							}
						},
						h("option", { value: "override" }, L.modeOverride),
						h("option", { value: "append" }, L.modeAppend)
					)
				}),

				// 角色名
				h(Field, {
					key: "name",
					label: L.nameLabel,
					children: h("input", {
						type: "text",
						value: personaName,
						placeholder: L.namePlaceholder,
						style: inputStyle,
						onChange: (event) => {
							markDraft();
							setPersonaName(event.target.value);
						}
					})
				}),

				// 人设正文
				h(Field, {
					key: "text",
					label: L.textLabel,
					hint: L.textHint,
					children: h("textarea", {
						value: personaText,
						rows: 10,
						placeholder: L.textPlaceholder,
						style: textareaStyle,
						onChange: (event) => {
							markDraft();
							setPersonaText(event.target.value);
						}
					})
				}),

				// 保存 / 清空
				h(
					"div",
					{ key: "actions", style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
					h(SmallButton, {
						tone: "primary",
						label: busy ? L.saving : L.save,
						disabled: busy || !writable,
						onClick: save
					}),
					h(SmallButton, { label: L.reset, disabled: busy, onClick: resetDraft }),
					message
						? h(
								"span",
								{
									style: {
										fontSize: 12,
										color: failed
											? "var(--dsw-alias-state-error-primary, #ff6b6b)"
											: "var(--dsw-alias-state-success-primary, #3ecf8e)"
									}
								},
								message
							)
						: null
				),

				writable
					? null
					: h(
							"div",
							{ key: "ro", style: { fontSize: 12, color: "var(--dsw-alias-state-warn-label, #e3b341)" } },
							L.needWritable
						),

				// 人设库
				h(
					"div",
					{
						key: "presets",
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8,
							padding: "12px 14px",
							borderRadius: 10,
							border: "0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.14))"
						}
					},
					h("span", { style: { fontSize: 13, fontWeight: 500 } }, L.presetsTitle),
					h(
						"span",
						{ style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #9aa0a6)" } },
						L.presetsHint
					),
					h(
						"div",
						{ style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
						h("input", {
							type: "text",
							value: presetName,
							placeholder: "人设库里的名字（留空用角色名）",
							style: Object.assign({}, inputStyle, { flex: "1 1 220px", width: "auto" }),
							onChange: (event) => setPresetName(event.target.value)
						}),
						h(SmallButton, { label: L.presetSave, onClick: addPreset })
					),
					presetRows.length === 0
						? h(
								"div",
								{ style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #9aa0a6)" } },
								L.presetEmpty
							)
						: h(
								"div",
								{ style: { display: "flex", flexDirection: "column", gap: 6 } },
								presetRows.map((row) =>
									h(
										"div",
										{
											key: row.id,
											style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }
										},
										h(
											"span",
											{ style: { flex: "1 1 160px", fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
											row.displayName || "未命名人设"
										),
										h(SmallButton, { label: L.presetLoad, onClick: () => loadPreset(row) }),
										h(SmallButton, { label: L.presetDelete, tone: "danger", onClick: () => removePreset(row.id) })
									)
								)
							)
				),

				// 预览
				h(
					"div",
					{ key: "preview", style: { display: "flex", flexDirection: "column", gap: 6 } },
					h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #9aa0a6)" } }, L.previewTitle),
					h("pre", {
						style: Object.assign({}, monoStyle, { margin: 0, whiteSpace: "pre-wrap", overflow: "auto" }),
						children: preview === "" ? L.previewEmpty : preview
					})
				),

				// 状态行
				h(
					"div",
					{ key: "status", style: { fontSize: 11, opacity: 0.55, display: "flex", gap: 12, flexWrap: "wrap" } },
					h("span", null, L.status + "：" + (snap.status === "ready" ? L.statusReady : snap.status)),
					h("span", null, writable ? L.statusWritable : L.statusReadonly),
					typeof snap.revision === "number" ? h("span", null, L.revision + "：" + snap.revision) : null,
					h("span", null, "entry: " + ENTRY_ID)
				)
			);
		}

		/** 需要的客户端服务。 */
		const inject = ["slots", "configForms"];

		/**
		 * 注册设置页「人设」。
		 * @param {object} ctx - 客户端根上下文。
		 */
		function apply(ctx) {
			const form = ctx.configForms.get(ENTRY_ID);
			const injected = () => ({ form });
			ctx.slots.inject(
				"settings.section",
				() =>
					ctx.slots.register(
						{
							name: "settings.section",
							id: ENTRY_ID,
							order: 55,
							label: () => L.nav,
							inject: injected
						},
						PersonaSection
					),
				"dsh-persona-studio: settings section"
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-persona-studio-client";
		return module.exports;
	}
});
