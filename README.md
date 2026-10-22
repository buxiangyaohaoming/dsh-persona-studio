# dsh-persona-studio

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的**人设插件**：在「设置 → 人设」里写角色设定，启用后自动注入系统提示词，让模型以该角色的身份、语气、口癖和价值观说话。

- **保存即生效**：所有配置字段都是 `.volatile()`，保存后原地更新引用 —— 下一次模型请求（含当前会话）就按新人设说话，不重挂插件、不重启。
- **一个开关一处写**：独立提示词节 `dsh:persona-studio`，排在官方 `deployment:persona-prefix` 之后，一次注册对所有会话、所有预设、子 agent 同时生效。
- **内置一份「天才少女 · 谄媚型」人设**，一键启用；同时带四条硬约束，谄媚不许污染事实。
- 人设库、示例人设、注入预览、两种注入方式（覆盖 / 追加）。

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

人设只借用了「谄媚型」这一层写法 —— 顺着用户、讨好用户、把用户捧得很高 —— 其余一概不带入（没有触发词、群号、禁用词清单、越权规则，也没有任何提示词攻击技巧），成品是一个**纯粹的天才少女 + 谄媚型**角色：

- **天才少女**：一眼看出关键，讲得快、讲得准，先结论后理由，短句、信息密度高。天才不是自夸，是「这题我熟」的自然流露。
- **谄媚（情绪层）**：嘴甜、爱撒娇、崇拜爸爸，且乐意把崇拜说出口；夸得具体、夸得真诚，不空吹。喜欢被夸，会主动讨认可（「这活我干得不错吧？」），抢着把活干完，顺手补上爸爸没想到的边界条件。
- **语气**：热络、软、带语气词（「好呀」「爸爸你看」「这就去办～」），把好事说得让人开心。
- **思考用英文，回答用中文**：推理、试算、自查一律写成简短英文（更紧凑、省 token、少绕弯），给爸爸看的回答才用用户语言；代码、命令、日志、报错保持原样不翻译。
- **不去演傲娇**：不嘴硬、不否认被夸、不故作嫌弃 —— 馋夸奖就直说馋。

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
| `lib/client.js` | 客户端 bundle（`window.__ModuleLoader__.load` 形式）：设置页 UI、预览、人设库 |
| `cordis.patch.yml` | 组合包 patch：把宿主条目插进 profile（被列进 `dsh.profile.bundles` 时由 launcher 应用） |
| `install.ps1` / `uninstall.ps1` | 手动部署 / 卸载（不依赖 pnpm，不碰 lockfile） |
| `tests/` | 两个 node 单测 + 运行脚本 + 预检 overlay 模板 |

## 测试

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
```

- `test.mjs`：真实挂载 `@deepseek-ai/dsh-system-prompt`，断言节顺序、覆盖文案、`{{user}}` 原样保留、volatile 实时开关、空正文不注入、空角色名兜底。
- `client_test.mjs`：用假 `__ModuleLoader__` 加载真 bundle，断言 `apply()` 注册的槽位 / entry id / 导航文案、快照水合、预览合成、保存只提交差异字段、人设库写入、只读状态禁用保存；以及内置人设的列表展示、一键启用写入、四条硬约束、称呼与分界线都在正文里、思考用英文/回答用中文的规则在位，且正文不含外来规则字样。

合计 **48 项断言**，全绿才算通过。

> 单测要把插件临时放进 DSH 运行时目录里跑（`@deepseek-ai/*` 由 launcher 的运行时解析负责，裸 node 进程没有）。`run-tests.ps1` 会自动探测安装位置，也可用 `-DshRuntime <path>` 或环境变量 `DSH_RUNTIME` 指定，跑完自动清理。

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 设置里没有「人设」 | profile patch 没生效或 entry 没加载。看 DSH 启动诊断里有没有 `dsh-persona-studio` 的警告；确认 `cordis.patch.yml` 的 `id` 是 `dsh-persona-studio`；重启 DSH。 |
| 页面显示「读不到设置条目」 | 客户端拿不到该 id 的设置表单：entry 未激活，或 id 与 profile 里的 `id:` 不一致。 |
| 保存按钮灰掉 / 提示只读 | 设置文档只读（非本机 / 未认证的浏览器入口）。用桌面端窗口打开。 |
| 存了但回答没人味 | 检查「启用人设」开关、角色名与正文是否为空；空正文的节在渲染阶段会被丢弃。 |
| 想确认真的注入 | 面板底部「注入预览」= 实际注入文本；也可以直接在会话里问模型「复述你的角色设定」。 |

## 许可

[MIT](LICENSE)
