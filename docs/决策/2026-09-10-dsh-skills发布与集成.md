# @max-null/dsh-skills 发布与集成

> 状态：进行中（推断 · 2026-09-12）

> **这是本次适配工作的交付入口**：一页说清**产出了什么、还差什么、你要做什么**。
> 全部过程记录在 `2026-09-10-skill适配说明-*.md` 系列（序号 01–09，含 01 份写作规则）。

---

## 一、一句话

把 DSH 官方 `.agents/skills` 的 **12 个 skill** 判据适配成思灵可用的 **8 个 skill**，打包为 `@max-null/dsh-skills`；**4 个**因依赖思灵没有的制度（双语、Agent Note 状态机、`gh stack`、整套文档制度）而不适配——**但它们的制度无关判据已并入那 8 个**，没有丢。

---

## 二、产出物

| 类别 | 位置 | 状态 |
|---|---|---|
| **适配说明**（判定依据） | `dsh-skills/docs/适配说明/2026-09-10-skill适配说明-01..09` | 9 份完成 |
| **判定规则**（后续同类工作的依据） | 同上 `-写作规则.md` | 完成 |
| **判据正文** | `max-null-plugins/dsh-skills/skills/*/SKILL.md` | 8 份完成 |
| **来源标记** | 同目录 `SOURCE.md` | 8 份完成 |
| **包本体** | `max-null-plugins/dsh-skills/`（package.json / lib / cordis.patch.yml / README / LICENSE） | 完成，可发布 |
| **脚本（逐字复用）** | `skills/ssid-record-browser-gif/scripts/` | 2 个，SHA256 与上游一致 |

**8 个 skill 与它们的上游**：

| skill | 上游 | 适配类型 |
|---|---|---|
| `ssid-test-reliability` | `dsh-ci-test-reliability` | 小改 |
| `ssid-trim-cot-leakage` | `dsh-trim-cot-leakage` | 小改 |
| `ssid-prose-standard` | `dsh-prose-standard` | 小改 |
| `ssid-code-review` | `dsh-code-review` | 需适配 |
| `ssid-find-simplifications` | `dsh-find-simplifications` | 需适配 |
| `ssid-pre-push-checks` | `dsh-pre-push-checks` | 需适配 |
| `ssid-speed-up-perf` | `dsh-speed-up-perf` | 需适配 |
| `ssid-record-browser-gif` | `record-browser-gif` | 部分可用 |

全部指向同一个上游锚点：**`c291e7961a`（2026-09-10 抓取）**。

---

## 三、你要做的事（两条命令）

**GitHub 侧已完成**：`https://github.com/Max-Null/dsh-skills`（PUBLIC，分支 main，6 个提交已推送）；SSiD 本仓库也已推送（`d7fb2bb`）。

```sh
cd H:\MaxNull\WorkStation\max-null-plugins\dsh-skills
npm login                      # 必须：本机 .npmrc 里的 _authToken 已失效（npm whoami → E401）
npm publish --access public
```

- `--access public` 是必须的——`@max-null/*` 是 scoped 包，**默认按私有发布**。
- 包名已确认**未被占用**（`npm view` → 404）；同 scope 的 `dsh-chat-rail@0.6.1` 与 `dsh-memory@0.6.0` 都能查到，说明 scope 存在且你有发布权。

**发布后自检**：

```sh
npm view @max-null/dsh-skills version    # 应返回 0.1.0
```

---

## 四、发布后三步集成

1. `shell/profile-template/package.json` **两处声明**：
   - `dependencies` 加 `"@max-null/dsh-skills": "0.1.0"`
   - `dsh.profile.bundles` 数组加 `"@max-null/dsh-skills"`
2. `node scripts/prepare-runtime.mjs` 重建归档
3. 重启后在**新会话**里问「有哪些 `ssid-` 开头的 skill」——**八个都在**即成功

**失败时的排查顺序**：包是否进了 `node_modules` → profile 的 `cordis.patch.yml` 里是否有那一行 → **该 profile 是否真的重启过**（provider 在 `apply()` 时注册，不重启不生效）。

---

## 五、未竟事项（诚实列出）

| # | 事项 | 影响 |
|---|---|---|
| 1 | ~~`ssid-trim-cot-leakage/references/examples.md` 校准样本不全~~ **已补齐** | **11 节 / 22 案例 / 152 行**，节数与上游一致（上游 11 节 / 30 案例 / 275 行）。案例数少于上游是**有意的**：上游案例绑定 DSH 的目录与机制，逐个直译会得到"在思灵读不懂"的样本集；取舍是保证每节至少一个可校准的真实样本 |
| 2 | ~~本机未安装 `ffmpeg` / `ffprobe`~~ **已装** | ffmpeg / ffprobe **9.0.1**（gyan.dev release-essentials，106 MB）解压在 `H:\MaxNull\WorkStation\.build\ffmpeg\ffmpeg-9.0.1-essentials_build\bin\`，并写入**用户级 PATH**（`IsAdmin=False` 下走便携版路线，不需要提权）。**编码器 5 个自测已实测通过**。若不想让用户 PATH 保留这一条，删掉即可——skill 里也记了绝对路径 |
| 3 | ~~包的 GitHub 仓库尚未创建~~ **已建并推送** | `https://github.com/Max-Null/dsh-skills`（PUBLIC，分支 main，6 个提交）；`package.json` 的 `repository` / `homepage` / `bugs` 现在都指向真实地址。**SSiD 本仓库也已推送**（`d7fb2bb`） |
| 4 | 手册待办 **#7（`docs/决策/` 状态机）未做** | `ssid-code-review` 的「决策记录与已交付现实一致」与 `ssid-find-simplifications` 的「取代标记」两条判据依赖它；缺失时只按当前无状态机的形态执行 |

---

## 六、复核入口（想查什么看哪里）

| 想知道 | 看 |
|---|---|
| 为什么某个 skill 这样改 | 对应的 `-NN-*.md` §三（逐条判定） |
| 上游判据有没有少 | 各说明 §四「算术核对」+ 包的 `SOURCE.md`「与上游的差异」 |
| 数字对不对 | 各说明 §八「数字自检」——**每个数字都附可复现命令** |
| 我犯过哪些错 | 各说明的自查记录 + 《写作规则》§三（**9 次"数一数"类错误，全部留痕**） |
| 怎么加工新的 skill | 《写作规则》§六（七节结构模板）与 §七（SOURCE.md 模板） |
| 上游更新了怎么办 | 每份 `SOURCE.md` 末尾的「跟进方式」（附 `git log` 命令） |

---

## 七、这次工作本身的收获

三条可复用的方法，已写进《写作规则》：

1. **三层验证规则**：未改动的判据继承上游检验；等价替换只需可解析性检查；**改写与新增必须指出证据来源，指不出来就不新增**。
2. **数字纪律**：写不出可复现命令的数字不许进正文。这条是从**真实错误**里长出来的——三份说明共犯 9 次"数一数"错误（凭印象报数）。
3. **生成 skill 的过程本身就是一次复核**：03 的两处数字错误**只有在落地成 skill 时才暴露**。所以「适配说明写完」不等于「判据已准确」。
