# Changelog

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
