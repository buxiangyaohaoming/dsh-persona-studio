# Changelog

## 1.6.0

- **条目可直接编辑**：预设提示块与世界书条目每行右侧新增「编辑」，原地展开文本框改正文；「完成」写回草稿、「还原为导入时」拉回原文、「取消」丢弃本轮输入。
- 编辑实现是改 JSON 的 `content` 字段（`prompts[].content` / `entries[].content`），不动 `keys` / `order` / `constant` 等结构字段；整份 JSON 会重新序列化（缩进统一为两空格），自定义排版不保留。
- `listPresetBlocks()` / `listWorldEntries()` 现在同时返回 `content`，编辑时预填当前值。
- 条目行从 `<label>` 改成 `div` + 局部 label，避免点「编辑」时误触开启勾选。
- 测试补到 **109 项**：客户端 +4（有编辑按钮、编辑器预填、提交按钮、改完落进草稿并出现在保存的 JSON 里）。

## 1.5.0

- **SillyTavern 拆成独立设置页**：设置导航里新增「SillyTavern」（`settings.section` id `dsh-persona-studio-st`，order 56），预设 / 世界书 / 角色卡、注入模式、采样参数、粘贴导入全部搬过去；「人设」页回到只管人设与额外写作规则。
- **条目级开关**：新增配置 `stDisabled`（JSON 数组），页面上按 `prompt_order` 列出预设提示块、按 `order` 列出世界书条目，逐条勾选即不注入；`keyword` 模式下同样先生效（被关的条目不参与关键词匹配）。
- 宿主侧新增 `disabledSet()` / `filterWorldbook()`，`composeSt()` 与关键词钩子统一按该集合过滤。
- 测试补到 **105 项**：宿主 +4（关掉预设块、关掉世界书条目、过滤后的关键词匹配、两种字符串写法），客户端 +2（两个 section 独立注册、条目开关写入 `stDisabled`），另把页面上原有的 ST 断言迁到新页。

## 1.4.0

- **世界书关键词触发**（`stWorldbookMode: "keyword"`）：按 `agent` 挂 `system-prompt/assemble` 瀑布，用 `session.deriveMessages()` 取最近 N 条消息（`stScanDepth`，默认 4）做命中判断，命中才把条目作为一节追加进本次组装。支持 `keys` / `keysecondary` + `selective` / `case_sensitive` / `match_whole_words`；`constant` 条目始终命中。
- **采样参数接管**（`stParamsEnabled`）：按 `agent` 挂 `agent/request` 瀑布，把预设的 `temperature` 与 `openai_max_tokens` 写进本回合请求；面板显示「将应用」摘要。`top_p / top_k / min_p / top_a / penalty` 因 DSH 请求配置没有对应字段而不接管，已在 README 里列明。
- 设置页：世界书模式新增 `keyword` 选项、关键词扫描深度输入、采样参数开关与摘要行。
- 新增配置字段 `stScanDepth`、`stParamsEnabled`，并按 agent 生命周期释放钩子（`agent/created` → `agent.ctx.on(...)`）。
- 测试补到 **95 项**：宿主 +8（extractText / 主次关键词 / 大小写 / 全词 / 扫描深度 / 参数映射），客户端 +7（模式下拉含 keyword、深度输入显隐、参数摘要、保存写入三项）。

## 1.3.0

- 新增 **SillyTavern 兼容层**（`lib/st.js` + 提示词节 `dsh:persona-studio-st`，order 3）：
  - 预设：按 `prompt_order` 装配提示块，空块与定位符自动跳过；
  - 世界书：`entries` 对象/数组两种格式都收，按 `order` 排序，两种注入模式（`all` / `constant`）；
  - 角色卡：V2 / V1 都能解析，`description / personality / scenario / mes_example` 填进定位符，`system_prompt` 前置、`post_history_instructions` 后置。
- 设置页新增「SillyTavern 兼容」区块：主开关 + 三个槽位（各自开关、文件导入、清除、已导入摘要）+ 世界书模式 + 粘贴 JSON 导入。导入只在浏览器做语法校验，语义解析在宿主侧。
- 新增 8 个配置字段：`stEnabled / stPresetEnabled / stPresetJson / stWorldbookEnabled / stWorldbookJson / stWorldbookMode / stCardEnabled / stCardJson`，保存只提交差异字段（缺省值参与比较，首次保存不会写一堆空值）。
- 测试补到 **80 项**：宿主新增 11 项（解析 / 排序 / 装配顺序 / 定位符填充 / 常量模式 / 主开关），客户端新增 9 项（区块渲染、三个文件选择器、导入摘要、保存写入、坏 JSON 提示）。
- `install.ps1` / `run-tests.ps1` 改为复制整个 `lib/*.js`，新增的 `st.js` 不会漏装。

## 1.2.0

- 新增「额外写作规则」开关（`nsfwEnabled` + `nsfwRulesPath`）：打开后宿主每次组装提示词都会从**本机文件**（默认 `%DSH_HOME%\persona-studio\extra-rules.md`）现读规则，作为独立节 `dsh:persona-studio-extra` 注入到人设之后。
- 规则正文**不随插件分发**：仓库里只有开关和读取逻辑，文件内容只存本机；文件按 mtime 缓存，改完保存即生效，删掉/清空文件等同未启用。
- 设置页新增该开关与路径输入框（留空走默认位置），保存只提交差异字段。
- 测试补到 **60 项**：新增 6 项宿主（缺文件不注入 / 从文件注入 / 跟随开关 / 默认路径在 DSH_HOME 下 / 改文件后重新读取）与 8 项客户端（开关与路径字段、保存写入两个字段、`lib/` 内不含任何本机规则字样）。

## 1.1.0

- 内置人设「凛」新增**思考语言**规则：推理、试算、自查一律用简短英文（更紧凑、省 token、少绕弯），只有回答才用用户的语言；代码、命令、日志、报错保持原样不翻译。
- 测试补两条断言（思考用英文 / 输出仍用用户语言），合计 48 项。

## 1.0.0

首个公开版本。

- 宿主半边 `lib/index.js`：注册系统提示词节 `dsh:persona-studio`（order 1，紧跟官方 `deployment:persona-prefix`），用函数形式的 `text` 每次组装时现算，因此保存人设后**下一次请求即生效**，含当前会话；`interpolate: false` 保证正文里的 `{{...}}` 原样保留。
- 客户端半边 `lib/client.js`：注册「设置 → 人设」页（`settings.section`，order 55），读写官方设置表单 `ctx.configForms.get("dsh-persona-studio")`，支持启用开关、两种注入方式、角色名与正文、人设库、注入预览、只读提示与状态行。
- 内置人设「天才少女 · 谄媚型『凛』」：谄媚只用在情绪层，事实层由四条硬约束守住（坏结果照原样报 / 不无条件认同 / 夸奖只夸真的 / 自己错了立刻认账），并有一条总纲「判断和数字上一步不让」防止讨好污染事实。
- `install.ps1` / `uninstall.ps1`：不依赖 pnpm 的部署与卸载，改动 profile patch 前自动备份，插入行幂等。
- 测试：宿主 8 项 + 客户端 38 项，合计 46 项断言；`tests/run-tests.ps1` 自动探测 DSH 运行时并把插件 stage 进去跑。
