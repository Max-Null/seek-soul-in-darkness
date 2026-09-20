# Playwright MCP 双实例共用 profile（2026-09-20）

> 状态：**已修复**（出厂模板拆成有头/无头两条互不干扰的条目 + 本机 profile 同步；随下一版出包）
> 关联：`docs/决策/2026-08-24-Playwright-MCP-预制-实施方案.md`、
> `docs/决策/2026-09-15-MCP条目CLI缺失拖死启动修复.md`、`shell/fix-mcp-startup.ps1`

## 一、现象

同一会话里注册了两个 Playwright MCP（无头 `playwright` + 有头 `playwright-b`）。无头那个先开浏览器之后，有头的一调用就失败：

```
Error: Browser is already in use for
C:\Users\21030442\AppData\Local\ms-playwright-mcp\mcp-chrome-1d92d30,
use --isolated to run multiple instances of the same browser
```

结果是「两个 MCP 实际只有一个能用」，且哪个能用取决于谁先开浏览器。

## 二、根因

`@playwright/mcp` v0.0.81 在未指定 `--user-data-dir` 时，按 **MCP roots 上报的工作区** 推导默认 profile 目录（`playwright-core/lib/coreBundle.js`）：

```js
async function createUserDataDir(config, clientInfo) {
  const dir = ...path.join(defaultCacheDirectory(), "ms-playwright-mcp");
  const rootPathToken = createHash(clientInfo.cwd);            // sha256(…)[0:7]
  return path.join(dir, `mcp-${browserToken}-${rootPathToken}`);
}
```

而 `clientInfo.cwd` 来自 MCP 的 roots 协议，**不是子进程的 cwd**：

```js
const clientInfo = { cwd: firstRootPath(clientRoots), clientName: … };
```

同一会话里的两个条目上报同一个工作区 → 算出**同一个目录** → Chromium 的单实例锁（ProcessSingleton）把第二个启动挡掉。三个推论：

- 改 `dsh-mcp-client` 条目的 `cwd` 救不了：目录由**客户端上报的 roots** 决定。
- 目录会随工作区漂移：本机 `%LOCALAPPDATA%\ms-playwright-mcp\` 下积了 6 个 `mcp-chrome-<hash>` —— 换工作区就换一套 profile、换一套登录态。
- 有头/无头是**启动参数**，运行期改不了 → 想同时具备两种形态，只能做成两条目。

顺带一提：该版本的 `--help` 把 `--user-data-dir` 描述成 *"If not specified, a temporary directory will be created"*，
与上面这段实际行为（按工作区 hash 的**持久**目录）不符 —— 只看帮助文案会以为「不指定各起各的临时目录、天然不冲突」。

## 三、修复

模板（`shell/profile-template/cordis.patch.yml`）把单条 `mcp-playwright` 拆成两条，各自显式固定 `--user-data-dir`：

| id | serverName | 关键 args |
|---|---|---|
| `mcp-playwright-headless` | `playwright-headless` | `--headless` `--user-data-dir=%LOCALAPPDATA%\ms-playwright-mcp\headless` |
| `mcp-playwright-headed` | `playwright-headed` | `--user-data-dir=%LOCALAPPDATA%\ms-playwright-mcp\headed` |

显式路径**优先级高于**那套 hash 逻辑 —— `createPersistentBrowser` 是
`config.browser.userDataDir ?? await createUserDataDir(config, clientInfo)`，而 CLI 的 `--user-data-dir`
直接写进 `config.browser.userDataDir`（`configFromCLIOptions` 里的 `userDataDir: cliOptions.userDataDir`）。

路径用 `!!js` 表达式拼 `process.env.LOCALAPPDATA`（回退 `USERPROFILE`），不写死机器路径，也**不会求值为 null**
（null 会让整棵插件树加载失败，见 2026-09-15 那条）。

工具前缀随之变化：`mcp__playwright__*` → `mcp__playwright-headless__*`，
`mcp__playwright-b__*` → `mcp__playwright-headed__*`。

## 四、profile 迁移（本机既有登录态）

现有 `mcp-chrome-1d92d30`（1.1 GB，含 Cookies / Login Data / Local State）**改名**为 `headed`，
再整目录复制出一份 `headless`。两边起点相同，之后各自漂移（登录态不再互通）。

## 五、验证

1. **并发探针**：用与配置完全相同的 args 各起一个 MCP，并发 `browser_navigate` ——
   `PASS headless` / `PASS headed`，退出码 0。旧配置下第二个必然报第一节那句。
2. **YAML 实解析**：两份 patch 用 `js-yaml`（自定义 `!!js` 标量类型）解析并逐个求值 ——
   args 全为非空字符串、两条 `user-data-dir` 互不相同、旧条目无残留、`connection` 行（405 修复）仍在。
3. **应急脚本回归**：`fix-mcp-startup.ps1` 用 profile 副本跑两场景 —— CLI 全缺时三条目
   （codegraph + 两条 playwright）都被改为 `disabled: true` 且改后 YAML 复验通过；CLI 齐时文件字节不变。

## 六、遗留

- 两个 profile 的登录态**各管各的**：在无头里登录不会同步到有头，反之亦然。
- 历史 hash 目录**已清理**（2026-09-20）：`ms-playwright-mcp\` 下 5 个 `mcp-chrome-<hash>` 共 1.43 GB，
  外加 `ms-playwright\` 下 2 个老布局同类残留 152 MB。新配置不再产生新的 hash 目录。
- 已装旧版的机器需**重启思灵**才用得上新条目。重启前旧进程仍按老参数跑 —— 此时若调用 playwright 工具，
  会重新生成一个空的 `mcp-chrome-<hash>` 目录（不影响修复，重启后即弃用）。

## 七、附：运行时用的是**系统 Chrome**，不是自带 Chromium（2026-09-20 实测）

清理磁盘时顺手坐实了一件容易误判的事：`@playwright/mcp` 默认**不启动 Playwright 自带的 Chromium**，
而是走 `chrome` channel —— 即**本机安装的 Google Chrome**。

源码依据（`playwright-core/lib/coreBundle.js` 的 `validateBrowserConfig`）：

```js
let browserName = browser.browserName;
if (!browserName) {
  browserName = "chromium";
  if (browser.launchOptions.channel === void 0)
    browser.launchOptions.channel = "chrome";
}
```

实测证据：MCP 拉起的进程是 `"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless
--user-data-dir=…`，其父进程正是 `cli.js --headless --user-data-dir=…\headless`。两处自洽：
`createUserDataDir` 里 `browserToken = launchOptions.channel ?? browserName` 取到 `chrome`，
目录名 `mcp-chrome-<hash>` 里那个 `chrome` 就是这么来的。

**三个推论**：

- 模板头部原先那句「浏览器二进制不随安装包发布：首次使用需 `playwright install chromium`」是**误导**：
  它只对 `--browser firefox` / `webkit` 这类自带浏览器成立，**默认路径需要的是本机装有 Google Chrome**。
  2026-09-20 已改正模板与本机 profile 的该条注释。
- `%LOCALAPPDATA%\ms-playwright\` 下的浏览器本体**不是这个 MCP 在用**：本 profile 的 `playwright-core`
  虽在 `browsers.json` 里声明 chromium rev=1244、而本机根本没有 1244，却照常工作 —— 正因为它走 chrome channel。
  那里的消费者是别人，本机实测：`ai-da` 的 `playwright-core@1.60.0` 要 **rev=1223**、nvm 全局
  `playwright@1.62.1` 要 **rev=1234**。
- 因此清理磁盘**不能**把 `ms-playwright\` 当 MCP 缓存删：删掉 `chromium-1223`（412 MB）会打断 ai-da 侧的浏览器使用。
