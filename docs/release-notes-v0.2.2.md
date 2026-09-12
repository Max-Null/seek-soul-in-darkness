# v0.2.2 思灵（SSiD）

> ⚠️ 草稿（2026-09-07 深夜晚间整理）——发版会话请按 `docs/发版流程规范.md` §2 以
> `git log v0.2.1..HEAD` 最终分组提炼，「下载与校验」节 hash 打包后填入。

## 内置升级

- **升级部署「用户层保留」子条目级修复**：用户自装 MCP 作为既有 `- insert:` 列表
  追加子条目时，升级部署不再丢弃（v0.2.1 只覆盖了「独立顶层 insert 块」形态）；
  另修复 UTF-8 BOM 开头文件整块丢弃风险。配套单测 18 例。
- **用户对出厂 MCP 条目的改动不再被升级打回**：patch 合并升级为**三方合并**
  （以「上次部署的模板」为基线）——用户在 MCP 管理页改过的 cwd / 启停等改动会
  跨升级保留，同时模板自身的升级（如新增保护参数）对未改动的条目照常生效。
  升级报告的 `patchMerged.overridden` 会列出被保留的用户改动。
- **CodeGraph MCP 预制修正**：出厂关闭匿名遥测（`CODEGRAPH_TELEMETRY=off`）；
  引擎由 postinstall 下载（升级链允许 build scripts，见 archive 修正）。
- **CodeGraph 索引目录不再默认用户主目录**（用户反馈修复）：此前出厂默认把索引
  目录设为用户主目录，而主目录没有代码仓库——首次调用会扫描 `AppData` 等无关目录、
  撞 `--max-files` 上限后长时间卡死（8 分钟+、内存 900MB+），恢复响应后查询结果也
  与项目无关。现在改为 **boot 前解析**：`SSID_MCP_CG_WS` 环境变量 →
  `~/.ssid/codegraph.json` → **最近会话的工作目录**（自动适配）；都取不到时该 MCP
  **保持停用**（不再扫描主目录）。首次启动会弹一次引导（可跳过，随时可在
  「设置 → MCP」里改）；出厂 args 另加 `--exclude node_modules/.git/AppData/target/dist/build/.venv/__pycache__`
  保护清单。详见 `docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`。
- **dsh-wechat pin 修正**：`^0.9.1` → 精确 `0.9.1`（归档确定性）。

## 新增

- （按 git log 补充：新预制/新交付形态等）

## 调整

- 免安装版（zip）交付形态延续（v0.2.1 起）——Win10 64 位家庭版等安装器受阻场景
  的正解：解压即用，见「下载与校验」。

## 修复

- 部署失败/取消且旧环境无闭包锚点 → 明确阻断提示（不再「无法定位 DeepSeek
  Harness 运行时」崩溃）——v0.2.1 已含，本版回归确认。
- **发版归档不再带调试截图/临时脚本**：`build.files` 增加 `!.tmp-*` / `!*.png`
  排除——electron-builder 不读 `.gitignore`，此前被忽略的本地调试产物仍会被打进包。
- 其余按 git log 分组补充。

## 更新说明

- 老用户安装 v0.2.2：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，
  可取消）；重部署后 profile 与本版预置一致，此前已被覆盖的用户 MCP 可从
  `~/.ssid/profile-backups/` 快照对照找回（2026-09-07 实例）。

## 下载与校验

- 优先使用免安装版（zip）：解压即用，绕过安装器/签名拦截；NSIS 安装版报
  「不支持的 16 位应用程序」= 下载文件损坏（非兼容问题），删后重下或换 zip。
- 资产（GitHub Release 页）：
  - `ssid-shell-0.2.2-win.zip`（约 4XX MB）
  - `ssid-shell-setup-0.2.2.exe`（约 3XX MB）
- SHA256（`certutil -hashfile <文件> SHA256`）：
  - zip：`<打包后填入>`
  - exe：`<打包后填入>`
