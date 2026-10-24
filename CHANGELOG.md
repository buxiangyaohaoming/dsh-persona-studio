# Changelog

## 1.9.2

- **修复「插件启动失败」**：`node_modules/dsh-persona-studio` 被 `pnpm install` 当成多余包清掉了（它不在 profile manifest 的 dependencies 里），而 `cordis.patch.yml` 的 insert 行还在，加载器找不到模块 → 整条插件起不来。
  - `install.ps1` 现在把插件同时装到 `profiles/<profile>/local-plugins/dsh-persona-studio`，并在 manifest 里声明 `"dsh-persona-studio": "file:./local-plugins/dsh-persona-studio"`，以后 pnpm 会保留、必要时重建它。
- **完全覆盖默认关闭**：schema 默认仍是 `false`，并把本机已保存的 `stComplete: true` 改回 `false`。
- **覆盖实现改为装配瀑布**：不再注册 `section.complete = true`。宿主规定 complete 段全局唯一，与 `dsh-unrestricted` 的 minimal 模式等插件的 complete 段共存时会抛 `multiple complete prompt sections are active`，把整次装配打挂。现在在 `system-prompt/assemble` 里改写 sections，效果相同且不会互斥。
- 测试补到 **143 项**：新增「有别的 complete 段时装配不抛错」「宿主 complete 段优先（我们不再抢占）」。


## 1.9.1

- **修复「勾上并保存后仍显示预设已关」**：徽标之前读的是预设文件里的 `enabled` 字段，跟实际注入状态无关。现在按有效状态渲染——预设关掉但用户勾上 → 绿色「已强制开启」；预设关掉且没勾 → 黄色「预设已关」。
- 补测试锁住这条链路：重新加载带 `stForced` 的配置后，勾选保持、徽标切换、再次保存不会重复写或清掉 `stForced`（共 +4 项，总计 141 项）。


## 1.9.0

- **修复「预设条目识别不到」**：`parsePreset` 现在把 `prompt_order` 的**所有分支**（ST 按 `character_id` 存多份）取并集，不再只读 `[0]`；`prompts` 里有、顺序表没提到的条目补在末尾；`prompt_order` 支持数组与对象两种形态。
- **预设内关闭的块不再消失**：`enabled: false` 的块会列出并标「预设已关」，默认不注入；新增配置 `stForced`，勾选即强制接回。判定顺序：显式开启 > 显式关闭 > 预设自带开关。
- **占位符识别**：同时认 `marker: true` 字段与固定 identifier（`chatHistory`、`worldInfoBefore/After`、`charDescription` …），不再靠「正文为空」猜。
- **深度注入提示**：`injection_position === 1` 的块在行尾标「深度注入」（本插件仍统一注入系统提示词，位置语义不模拟）。
- 客户端列表同步这套逻辑：条目数与 JSON 里的块数一致，新增「预设已关 / 深度注入」徽标。
- 测试补到 **137 项**：宿主 +7（多分支并集、对象形态、关闭块默认不注入、stForced 强行接回、仅第二分支的条目注入、marker 双路识别、深度注入标记），客户端 +4。


## 1.8.1

- **修正：完全覆盖不再顶掉人设**。宿主的 `complete` 语义是「只保留这一节」，1.8.0 直接把 ST 内容标成 complete，导致 `dsh:persona-studio`（人设）与 `dsh:persona-studio-extra`（额外写作规则）一起消失。
  - 现在覆盖时把这两段并入覆盖节：`人设 + 额外写作规则 + ST 内容`（空段自动跳过，顺序固定）。
  - 顶掉的只剩宿主自带的身份说明 / 工具规范 / 其它插件注入的提示词。
- 设置页提示与激活横幅改为说明真实行为（「系统提示词 = 人设 + 额外写作规则 + ST 内容」）。
- 测试补到 **125 项**：宿主 +2（覆盖态仍含人设正文、仍含额外写作规则文件内容）。

## 1.8.0

- **完全覆盖系统提示词**（新增开关 `stComplete`）：开启后 ST 装配结果成为唯一的系统提示段，顶替 DSH 自带的身份说明 / 工具规范 / 其它插件注入的提示词。
  - 复用宿主提示词注册表的 `complete` 语义：注册时把 `complete` 定义成 getter，每次装配按当前开关求值 → **切开关即时生效，无需重启**。
  - 只有「ST 主开关开 + 完全覆盖开 + 装配结果非空」时才接管；空内容自动不覆盖，避免把系统提示词清空。
  - 工具定义与运行时上下文走独立通道，不受影响。
- 设置页 SillyTavern：新增「完全覆盖系统提示词」开关（激活时边框与提示文字变色）+ 激活态提示行。
- 测试补到 **123 项**：宿主 +4（只剩一节、官方提示词消失、空内容不触发、关闭后恢复），客户端 +2（开关存在、激活横幅）。
- 测试基建：应用已打包进 `app.asar`，改为从任意含 `node_modules/@deepseek-ai` 的目录运行；测试断言兼容新版宿主的 `harness:identity` 节。

## 1.7.0

- **条目全字段编辑**：
  - 预设块：名称、角色（system/user/assistant）、正文；
  - 世界书条目：名称（`comment`）、正文、主关键词（`keys`）、次关键词（`keysecondary`）、顺序值（`order`）、常驻（`constant`）、需要次关键词（`selective`）、区分大小写（`case_sensitive`）、全词匹配（`match_whole_words`）。
- **顺序调整**：每行 `↑ ↓`；预设换 `prompt_order` 位置，世界书交换相邻两条的 `order` 值。
- **添加 / 删除条目**：列表末尾 `＋ 添加提示块` / `＋ 添加条目`，每行 `删除`（预设会同时清 `prompts` 与 `prompt_order`；世界书取 `uid+1`、`order+10` 建新条）。
- 「还原为导入时」现在覆盖全部可编辑字段，不只是正文。
- 世界书一旦被编辑，`entries` 从对象形态统一成数组（`uid` 保留原键），后续读写都在数组上做。
- 测试补到 **117 项**：客户端 +4（改名落草稿、添加后行数+1、删除后行数复原、世界书 name/keys/order/constant 写入 JSON）。

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
