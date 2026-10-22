# Changelog

## 1.0.0

首个公开版本。

- 宿主半边 `lib/index.js`：注册系统提示词节 `dsh:persona-studio`（order 1，紧跟官方 `deployment:persona-prefix`），用函数形式的 `text` 每次组装时现算，因此保存人设后**下一次请求即生效**，含当前会话；`interpolate: false` 保证正文里的 `{{...}}` 原样保留。
- 客户端半边 `lib/client.js`：注册「设置 → 人设」页（`settings.section`，order 55），读写官方设置表单 `ctx.configForms.get("dsh-persona-studio")`，支持启用开关、两种注入方式、角色名与正文、人设库、注入预览、只读提示与状态行。
- 内置人设「天才少女 · 谄媚型『凛』」：谄媚只用在情绪层，事实层由四条硬约束守住（坏结果照原样报 / 不无条件认同 / 夸奖只夸真的 / 自己错了立刻认账），并有一条总纲「判断和数字上一步不让」防止讨好污染事实。
- `install.ps1` / `uninstall.ps1`：不依赖 pnpm 的部署与卸载，改动 profile patch 前自动备份，插入行幂等。
- 测试：宿主 8 项 + 客户端 38 项，合计 46 项断言；`tests/run-tests.ps1` 自动探测 DSH 运行时并把插件 stage 进去跑。
