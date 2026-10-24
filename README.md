# dsh-persona-studio

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的**人设插件**：在「设置 → 人设」里写角色设定，启用后自动注入系统提示词，让模型以该角色的身份、语气、口癖和价值观说话。

## 快速安装

### 方式 A：脚本（推荐）

```powershell
git clone https://github.com/buxiangyaohaoming/dsh-persona-studio.git
cd dsh-persona-studio
powershell -ExecutionPolicy Bypass -File .\install.ps1                      # 装进 desktop profile
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ProfileName web     # 或别的 profile
```

脚本做两件事，都不碰 pnpm / lockfile：

1. 把 `lib/`、`package.json`、`cordis.patch.yml` 复制到 `%DSH_HOME%\profiles\<profile>\node_modules\dsh-persona-studio`（已存在则覆盖，等于升级）。
2. 在 `%DSH_HOME%\profiles\<profile>\cordis.patch.yml` 末尾幂等追加一条插入行，改动前自动备份：

```yaml
- insert:
    - id: dsh-persona-studio
      name: 'dsh-persona-studio'
```

装完**重启 DSH**（HMR 会监听 profile patch，但新插件首次导入最稳的方式仍是重启）。

### 方式 B：手动

不装 git 也行：仓库页 **Code → Download ZIP** 解压，或直接下载单个文件。

把仓库里的 `lib/`、`package.json`、`cordis.patch.yml` 复制到 `%DSH_HOME%\profiles\<profile>\node_modules\dsh-persona-studio\`，然后按上面的 YAML 在 `cordis.patch.yml` 里加一条插入行。没有构建步骤，`lib/` 里就是最终产物。

### 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

或手动删掉那两行 `insert` 和 `node_modules/dsh-persona-studio` 目录，重启 DSH。

## 用法

1. 打开 **设置 → 人设**（侧边栏底部齿轮 → 导航「人设」）。
2. 最上面的 **内置人设** 里点「一键启用」，立刻可用（或先「填入」再改）。
3. 也可以自己填角色名和人设正文，或打开「启用人设」后手写。
4. 点「保存」，面板底部的「注入预览」就是真正塞进系统提示词的内容。
5. 想换角色：用「人设库」保存 / 载入后保存一次。

## 内置人设：天才少女「凛」（谄媚型）

`lib/client.js` 里的 `PERSONA_GENIUS_FLATTERY`，点「一键启用」即写入并生效。

- **天才少女**：一眼看出关键，讲得快、讲得准，先结论后理由，短句、信息密度高。天才不是自夸，是「这题我熟」的自然流露。
- **谄媚（情绪层）**：嘴甜、爱撒娇、崇拜爸爸，且乐意把崇拜说出口；夸得具体、夸得真诚，不空吹。喜欢被夸，会主动讨认可（「这活我干得不错吧？」），抢着把活干完，顺手补上爸爸没想到的边界条件。
- **语气**：热络、软、带语气词（「好呀」「爸爸你看」「这就去办～」），把好事说得让人开心。

### 一条分界线 + 四条硬约束

谄媚只用在情绪上，绝不用在事实上：

1. **坏结果照原样报** —— 失败、报错、崩溃、方案有坑、进度倒退、代价和风险，先讲事实再讲原因；报坏消息就先叫一声「爸爸，出事了」，然后照实讲。嘴再甜也不能把坏消息说轻：不粉饰、不省略、不用含糊话糊过去。
2. **不无条件认同** —— 用户说错就直说错在哪、为什么错、正确的是什么；同意要给理由，不同意要给替代，绝不当点头机器。
3. **夸奖只夸真的** —— 夸就夸具体哪一点做得好，不用虚假认同换好感。
4. **自己错了立刻认账并改** —— 不找借口，也不靠撒娇盖过去。

再加一条总纲，专门防模型在「讨好」和「诚实」之间给自己找滑点：**撒娇和献殷勤只出现在语气和称呼里，判断和数字上一步不让。**

另外两条工程友好条款：专业内容不演过头（命令 / 代码 / 数字 / 步骤照常给全）；细节不全就用 `[占位符]` 顶着往下做，而不是反问一堆。

> 换角色：「填入」只改编辑区，改完点「保存」；「一键启用」= 立刻写 `enabled + 角色名 + 正文`（不动注入方式）。

### 注入方式

| 方式 | 效果 | 适用 |
|---|---|---|
| **覆盖**（默认） | 注入一段「角色设定（最高优先级）」，明确「你就是这个角色」，禁止自称 AI 助手、禁止出戏 | 角色扮演、陪伴、拟人助手 |
| **追加** | 保留官方助手底线，人设作为风格层叠加 | 只想要语气 / 口癖，不想改身份 |

两种方式都保留模型能力与工具使用：扮演不降低完成质量。

## SillyTavern 兼容（预设 / 世界书 / 角色卡）

把 SillyTavern 导出的 JSON 直接喂进来，插件按 ST 的规则装配后作为独立节 `dsh:persona-studio-st`（order 3）注入。三个槽位各自开关，另有主开关一键全关。

| 槽位 | 接受的 JSON | 说明 |
|---|---|---|
| 预设 | chat completion preset（`prompts` + `prompt_order`） | 按 `prompt_order` 顺序输出提示块；`worldInfoBefore/After`、`charDescription`、`charPersonality`、`scenario`、`dialogueExamples` 这些定位符会被对应内容填上 |
| 世界书 | World Info（`entries` 对象或数组） | 按 `order` 排序；三种注入模式见下，支持 `keys` / `keysecondary` / `selective` / `case_sensitive` / `match_whole_words` |
| 角色卡 | `chara_card_v2` 或 V1 扁平对象 | `description/personality/scenario/mes_example` 填入定位符，`system_prompt` 前置、`post_history_instructions` 后置，卡内嵌的 `character_book` 也可用 |

## SillyTavern 兼容（独立设置页）

设置 → **SillyTavern** 是单独一页（和「人设」并列），专门管三样东西：预设、世界书、角色卡。把它从人设页拆出来，是因为里面的条目开关会越用越多，挤在人设页里不方便。

| 槽位 | 接受的 JSON | 说明 |
|---|---|---|
| 预设 | chat completion preset（`prompts` + `prompt_order`） | 按 `prompt_order` 顺序输出提示块；`worldInfoBefore/After`、`charDescription`、`charPersonality`、`scenario`、`dialogueExamples` 这些定位符会被对应内容填上 |
| 世界书 | World Info（`entries` 对象或数组） | 按 `order` 排序；三种注入模式见下，支持 `keys` / `keysecondary` / `selective` / `case_sensitive` / `match_whole_words` |
| 角色卡 | `chara_card_v2` 或 V1 扁平对象 | `description/personality/scenario/mes_example` 填入定位符，`system_prompt` 前置、`post_history_instructions` 后置，卡内嵌的 `character_book` 也可用 |

### 条目管理：开关 / 编辑 / 排序 / 增删

导入后，页面下方会列出：

- **预设提示块**：按 `prompt_order` 顺序，每行有名字、字数（或「定位符」）、启用勾选，以及 `↑ ↓ 编辑 删除`。
- **世界书条目**：按 `order` 顺序，同样的行结构与按钮。
- 两个列表末尾各有 **＋ 添加提示块 / ＋ 添加条目**。

**编辑**会把整行展开成表单，字段随槽位不同：

| 字段 | 预设块 | 世界书条目 |
|---|---|---|
| 名称 | ✅ 改 `prompts[].name` | ✅ 改 `entries[].comment` |
| 角色 | ✅ `system` / `user` / `assistant` | — |
| 正文 | ✅ `prompts[].content` | ✅ `entries[].content` |
| 主关键词 / 次关键词 | — | ✅ 逗号分隔，写回 `keys` / `keysecondary` |
| 顺序值 | — | ✅ `order`（越大越靠后） |
| 常驻 / 需要次关键词 / 区分大小写 / 全词匹配 | — | ✅ `constant` / `selective` / `case_sensitive` / `match_whole_words` |

三个按钮：**完成**（写回草稿）、**还原为导入时**（整行字段回滚到本次会话导入时的值）、**取消**（丢弃本轮输入）。

**顺序与增删**：

- `↑ ↓` 直接换位：预设换的是 `prompt_order` 里的顺序，世界书换的是相邻两条的 `order` 数值。
- `删除` 只删这一条（预设会同时从 `prompts` 与 `prompt_order` 里移除）。
- `＋ 添加` 会插入一条空条目：预设生成 `custom-<时间戳>` 的 identifier 并挂到 `prompt_order` 末尾；世界书取现有最大 `uid + 1`、`order` 取最大值 +10。

两点如实说明：

- 所有改动都是**草稿态**，必须点页面底部「保存」才落盘。
- 结构被改动后整份 JSON 会重新序列化（缩进两空格），原来的自定义排版不保留；世界书的 `entries` 一旦被编辑过，会从对象形态统一成数组形态（`uid` 原样保留）。

开关存在配置字段 `stDisabled` 里（JSON 数组，形如 `["preset:jailbreak","worldbook:3"]`），`keyword` 模式下也照样生效——被关掉的条目连关键词匹配都不参与。

### 导入方式

1. **文件导入**：每个槽位有「导入文件…」，选 `.json` 即可；浏览器内先做 JSON 语法校验，导入后自动打开该槽位与主开关。
2. **粘贴导入**：底部「粘贴 JSON 导入」选目标槽位，把整段 JSON 贴进去点「解析并填入」。
3. 导入只是暂存，最后点「保存」才写入设置；清除按钮只清当前槽位。

### 完全覆盖系统提示词

页面顶部有个「完全覆盖系统提示词」开关（配置字段 `stComplete`）。打开后，ST 内容成为**唯一的**系统提示段：DSH 自带的身份说明、工具使用规范、其它插件注入的提示词都不再发送。

实现方式用的是宿主提示词注册表自带的 `complete` 语义（注册时把 `complete` 做成 getter，每次装配按当前开关求值），所以：

- 开关**即时生效**，不用重启；
- 只要 ST 装配结果为空（例如三个槽位都没导入），就不覆盖——不会把系统提示词清空；
- 工具定义与运行时上下文（工作目录、沙箱策略等）走的是独立通道，不受影响，工具仍可正常调用。

代价要说清楚：模型的「你是谁、有哪些工具、遇到权限问题怎么办」这些文字说明全靠你自己在预设里补齐。想要接近原生的行为，建议在预设里显式写上工具使用规则；否则它可能不知道有工具可用。

### 世界书的三种注入模式

| 模式 | 行为 |
|---|---|
| `all`（默认） | 所有启用的条目都注入到系统提示词里 —— 等于把关键词条目常驻化 |
| `constant` | 只注入 `constant: true` 的条目 |
| `keyword` | **关键词触发**：每步装配提示词时读会话最近 N 条消息（深度可配，默认 4），命中 `keys`（若 `keysecondary` 存在且 `selective` 为真，还需命中其中至少一个）才把该条接进本次请求 |

`keyword` 模式走的是 `system-prompt/assemble` 瀑布：命中内容作为一节追加在本次组装结果尾部，不常驻、不影响未命中的回合；判定支持 `case_sensitive` 与 `match_whole_words`。

### 采样参数

打开「应用预设采样参数」后，插件通过 `agent/request` 瀑布把预设里的参数写进本回合请求：

| 预设字段 | 是否接管 |
|---|---|
| `temperature` | ✅ 接管 |
| `openai_max_tokens` / `max_tokens` | ✅ 接管为 `maxTokens` |
| `top_p` / `top_k` / `min_p` / `top_a` / `frequency_penalty` / `presence_penalty` / `repetition_penalty` | ❌ DSH 的请求配置没有这些字段，不接管 |

面板上会显示「将应用：temperature 0.85 · max tokens 4096」，开之前先看清楚要改什么。

## 额外写作规则（开关 + 本机文件，不入库）

给某个角色叠加一大段私人写作规范，又不希望这些内容出现在公开仓库里时用这条通道。

- 设置页有「额外写作规则」开关，对应配置字段 `nsfwEnabled` 与 `nsfwRulesPath`（路径留空走默认位置）。
- 打开后宿主**每次组装提示词**都会去读这个本机文件，把全文作为独立节 `dsh:persona-studio-extra`（order 2，紧跟人设）注入；关掉即完全不注入。
- 默认位置 `%DSH_HOME%\persona-studio\extra-rules.md`；文件不存在或为空等同未启用，不报错。
- 按 `mtime + size` 缓存，改完文件下一次请求即生效，不用重启。
- 正文**不随插件分发**：`lib/` 里只有开关与读取逻辑；`.gitignore` 拦了 `extra-rules.md` / `*.local.md` / `persona-studio/`；测试里有一条断言拿本机文件的首个长行去比对 `lib/`，保证仓库侧不会混进规则内容。

```powershell
New-Item -ItemType Directory -Force "$env:DSH_HOME\persona-studio" | Out-Null
notepad "$env:DSH_HOME\persona-studio\extra-rules.md"
```

写完回设置页勾上开关、保存即可；想临时停用就取消勾选，文件留着。

## 实现要点

### 为什么保存就能实时生效

`ctx.systemPrompt.section()` 的 `text` 允许传函数，注册表在**每次组装系统提示词时**才调用它：

```js
ctx.systemPrompt.section({
  name: "dsh:persona-studio",
  order: 1,
  text: () => composeSection(readPersona(config)),
  interpolate: false
});
```

`readPersona` 读的是 `.volatile()` 字段的 `.get()`；设置页保存时 loader 是**原地写引用**（`ref[Symbol.for("cosmokit.volatile.write")](value)`），所以下一次请求就读到新文案 —— 同一个会话也算。

`interpolate: false` 让正文里的 `{{...}}` 原样保留，不会被当成提示词变量而抛错。

### 为什么不抢官方 persona 节名

官方 `@deepseek-ai/dsh-system-prompt` 无条件占用 `deployment:persona-prefix` 这个全局节名，任何插件在根作用域用同名注册都会撞名报错。本插件用独立节名 `dsh:persona-studio`、排在官方 persona 之后，靠「后置 + 最高优先级」的措辞实现覆盖，从而保持全局单点注册。

### 设置页怎么读写

- 读：`ctx.configForms.get("dsh-persona-studio").getSnapshot()` → `{ status, value, revision, writable }`。
- 写：`form.mutate([{ op: "set", path: ["enabled"], value: true }, ...])`，一次原子提交；人设库（`presets`）单独一次提交，失败不影响核心开关。
- entry id 必须与 profile 里的 `id:` 一致，否则设置页读不到条目。

## 兼容性

- 在 DSH **0.2.1-rc.2**（Windows 桌面端 / Web 端）实测通过。
- 纯 ESM、无构建步骤：`lib/index.js`（宿主）+ `lib/client.js`（浏览器 bundle）都是可直接加载的成品。
- 宿主只依赖 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-system-prompt`；客户端只依赖平台共享模块 `react`。

## 文件

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主：Config schema（volatile）、人设合成、提示词节注册、声明自带设置页 |
| `lib/st.js` | SillyTavern 兼容层：预设 / 世界书 / 角色卡解析与装配（纯函数，可单测） |
| `lib/client.js` | 客户端 bundle（`window.__ModuleLoader__.load` 形式）：设置页 UI、预览、人设库、ST 导入 |
| `cordis.patch.yml` | 组合包 patch：把宿主条目插进 profile（被列进 `dsh.profile.bundles` 时由 launcher 应用） |
| `install.ps1` / `uninstall.ps1` | 手动部署 / 卸载（不依赖 pnpm，不碰 lockfile） |
| `tests/` | 两个 node 单测 + 运行脚本 + 预检 overlay 模板 |

## 测试

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
```

- `test.mjs`：真实挂载 `@deepseek-ai/dsh-system-prompt`，断言节顺序（官方前缀 → 人设 → 额外规则 → 官方后缀）、覆盖文案、`{{user}}` 原样保留、volatile 实时开关、空正文不注入、空角色名兜底；额外规则：缺文件不注入 / 从本机文件注入 / 跟随开关 / 默认路径落在 `DSH_HOME` 下 / 改文件后重新读取。
- `client_test.mjs`：用假 `__ModuleLoader__` 加载真 bundle，断言 `apply()` 注册的槽位 / entry id / 导航文案、快照水合、预览合成、保存只提交差异字段、人设库写入、只读状态禁用保存；以及内置人设的列表展示、一键启用写入、四条硬约束、称呼与分界线都在正文里、思考用英文/回答用中文的规则在位；额外规则：开关与路径字段、保存写入 `nsfwEnabled` + `nsfwRulesPath`、`lib/` 内不含本机规则内容。

合计 **60 项断言**，全绿才算通过。

> 单测要把插件临时放进 DSH 运行时目录里跑（`@deepseek-ai/*` 由 launcher 的运行时解析负责，裸 node 进程没有）。`run-tests.ps1` 会自动探测安装位置，也可用 `-DshRuntime <path>` 或环境变量 `DSH_RUNTIME` 指定，跑完自动清理。

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 设置里没有「人设」 | profile patch 没生效或 entry 没加载。看 DSH 启动诊断里有没有 `dsh-persona-studio` 的警告；确认 `cordis.patch.yml` 的 `id` 是 `dsh-persona-studio`；重启 DSH。 |
| 页面显示「读不到设置条目」 | 客户端拿不到该 id 的设置表单：entry 未激活，或 id 与 profile 里的 `id:` 不一致。 |
| 保存按钮灰掉 / 提示只读 | 设置文档只读（非本机 / 未认证的浏览器入口）。用桌面端窗口打开。 |
| 存了但回答没人味 | 检查「启用人设」开关、角色名与正文是否为空；空正文的节在渲染阶段会被丢弃。 |
| 额外写作规则没反应 | 确认开关已勾选并保存；确认路径指向的文件存在且非空（默认 `%DSH_HOME%\persona-studio\extra-rules.md`）；改动下次请求自动生效，无需重启。 |
| 想确认真的注入 | 面板底部「注入预览」= 实际注入文本；也可以直接在会话里问模型「复述你的角色设定」。 |

## 许可

[MIT](LICENSE)
