//#region src/adapters.ts
/**
* 内置适配器集（黄金示例 = few-shot 语料 + 兜底；2026-08-30 现状按钮）。
* 注意：v0.1.x 时代这些按钮经「标题栏事件」驱动（ssid:titlebar），本表的
* act 描述同一行为的适配器形态；引擎执行器接入后逐步切换为适配器消费。
*/
const BUILTIN_ADAPTERS = [
	{
		id: "dsh-plugin-center",
		button: "[class*=\"pc-headerbtn\"]",
		icon: { source: "from-button" },
		label: "插件中心",
		act: {
			kind: "dispatch-event",
			event: "ssid:titlebar",
			detail: "plugin-center"
		},
		hide: true
	},
	{
		id: "dsh-better-sidebar.sidebar",
		button: "[class*=\"toggleCluster\"]",
		icon: { source: "from-button" },
		label: "侧栏",
		act: {
			kind: "dispatch-event",
			event: "ssid:titlebar",
			detail: "sidebar"
		},
		hide: true
	},
	{
		id: "dsh-better-sidebar.bottom",
		button: "[class*=\"toggleCluster\"]",
		icon: { source: "from-button" },
		label: "底栏",
		act: {
			kind: "dispatch-event",
			event: "ssid:titlebar",
			detail: "bottom"
		},
		hide: true
	},
	{
		id: "dsh-session-manager",
		button: ".sm-footerBtn",
		icon: { source: "from-button" },
		label: "会话管理",
		act: {
			kind: "toggle-panel",
			close: ".sm-modal .close"
		},
		hide: true
	},
	{
		id: "dsh-settings",
		button: "button[aria-label=\"设置\"], button[aria-label=\"Settings\"]",
		icon: {
			source: "custom",
			value: "settings"
		},
		label: "设置",
		act: { kind: "open-settings" },
		hide: false
	}
];
//#endregion
//#region src/behaviors.ts
/**
* 直接点击目标（定位失败/禁用 → 静默跳过；称「防御执行」）。
*/
function actClick(target) {
	if (target === null || target === void 0 || target.disabled === true) return false;
	target.click();
	return true;
}
/**
* 面板开/关（v0.8.0 探测语义——替代已废弃的面板容器协议 findPanel/#id-panel，
* 该协议从未有环境实现：client 半 findPanel 恒 null，内置项走 toolbarAction 桥接，
* 用户适配器因此死路——「添加按钮2」会话 LLM 源码实测发现）：
* close 目标**可见** = 弹窗开着 → 点它关闭；**不可见/不存在** = 弹窗关着 → 点原按钮打开。
* @param openTarget 原按钮（弹窗关着时点击它打开）
* @param closeTarget 弹窗内关闭按钮（LLM 探测、随弹窗显隐）
* @param probeVisible 可见性探测（DOM 环境 = rect/computedStyle；测试可 stub）
*/
function actTogglePanel(openTarget, closeTarget, probeVisible) {
	if (closeTarget !== null && closeTarget !== void 0 && closeTarget.disabled !== true && probeVisible(closeTarget)) {
		closeTarget.click();
		return true;
	}
	if (openTarget === null || openTarget === void 0 || openTarget.disabled === true) return false;
	openTarget.click();
	return true;
}
/** 官方设置触发器锚点链（v2 调研点① 结论：DSH 面板 open 状态由 shell 私有，
*  公开语义入口 = sidebar.settings 槽的触发按钮——SettingsRoot.tsx onClick
*  setOpen(true)，footer 触发器类后缀 `_trigger`、无 aria。 */
const SETTINGS_ANCHORS = [
	"[class$=\"_trigger\"]",
	"button[aria-label=\"设置\"]",
	"button[aria-label=\"Settings\"]",
	"[role=\"button\"][aria-label=\"设置\"]",
	"[role=\"button\"][aria-label=\"Settings\"]",
	"button[title=\"设置\"]",
	"button[title=\"Settings\"]"
];
/** 官方设置关闭目标锚点链（面板开着时二次点击应关闭——trigger onClick 只
*  setOpen(true) 原生不 toggle，2026-08-30 用户实测「再点关闭失败」）。 */
const SETTINGS_CLOSE_ANCHORS = [
	"button[class$=\"_close\"]",
	"button[aria-label=\"关闭\"]",
	"button[title=\"关闭\"]"
];
/** 设置面板打开判定（modal mask；SettingsRoot.tsx：mask div onClick=onClose）。 */
const SETTINGS_MASK_SELECTOR = "[class$=\"_mask\"]";
/** 打开/关闭官方设置面板：开着（mask 存在）→ 关闭（close 按钮 → mask 兜底）；
*  关着 → 文本语义定位优先（footer trigger）→ 锚点链兜底。 */
function actOpenSettings(env) {
	const mask = env.find(SETTINGS_MASK_SELECTOR);
	if (mask !== null && mask !== void 0) {
		for (let i = 0; i < SETTINGS_CLOSE_ANCHORS.length; i++) {
			const closeBtn = env.find(SETTINGS_CLOSE_ANCHORS[i]);
			if (closeBtn !== null && closeBtn !== void 0 && closeBtn.disabled !== true) {
				closeBtn.click();
				return true;
			}
		}
		mask.click();
		return true;
	}
	if (env.findByText !== void 0) {
		const byText = env.findByText(["设置", "Settings"]);
		if (byText !== null && byText !== void 0 && byText.disabled !== true) {
			byText.click();
			return true;
		}
	}
	for (let i = 0; i < SETTINGS_ANCHORS.length; i++) {
		const target = env.find(SETTINGS_ANCHORS[i]);
		if (target !== null && target !== void 0 && target.disabled !== true) {
			target.click();
			return true;
		}
	}
	return false;
}
/** 触发 dsh-commands 文本命令（空白名防御；执行语义由环境实现——v2 调研点②）。 */
function actCommand(env, name) {
	if (name === void 0 || name === null || name.trim() === "") return false;
	return env.execute(name.trim());
}
//#endregion
//#region src/engine.ts
/**
* @max-null/dsh-quick-toolbar — 适配器执行器（DOM 绑定层）
*
* 引擎运行时：按适配器定位目标元素 → 调行为库 → 防御执行。
* 行为库保持窄接口（可测）；本层唯一负责 DOM 绑定（browser 环境，
* 不在 node:test 的范围里——DOM 交互留给 L2 环境验证）。
*/
/** 遮罩关闭候选链（第二次点击的 mask 通道——DSH 弹窗多为遮罩交互） */
const MASK_CHAINS = [
	"[class$=\"_backdrop\"]",
	"[class*=\"backdrop\"]",
	"[class$=\"_mask\"]",
	"[class*=\"modal-mask\"]"
];
/**
* 归一 secondClick 通道（v0.8.0「二次点击事件」）：secondClick 优先，close 旧字段
* 兼容（字符串简写 = 点击关闭按钮）。
*/
function closeTargetOf(act, env) {
	const spec = act.secondClick ?? act.close ?? null;
	if (spec === null) return null;
	if (typeof spec === "string") return env.find(spec);
	if (spec.kind === "mask") {
		const probe = env.isVisible ?? defaultIsVisible;
		for (let i = 0; i < MASK_CHAINS.length; i++) {
			const el = env.find(MASK_CHAINS[i]);
			if (el !== null && probe(el)) return el;
		}
		return null;
	}
	return env.find(spec.selector);
}
/** 缺省可见性探测（DOM：offset 尺寸优先，computedStyle 兜底） */
function defaultIsVisible(el) {
	if (el === null || typeof el !== "object") return false;
	const node = el;
	if (typeof node.offsetWidth === "number") {
		if (node.offsetWidth > 0 || node.offsetHeight > 0) return true;
		return false;
	}
	if (typeof getComputedStyle === "function") try {
		const style = getComputedStyle(node);
		return style.display !== "none" && style.visibility !== "hidden";
	} catch {
		return false;
	}
	return false;
}
/** 按内置定义执行一条适配器（防御执行：定位失败/禁用 → false，绝不误伤）
*  「换位置」缺省：act 未填 → click（点击原按钮）。 */
function runAdapter(adapter, env) {
	const act = adapter.act ?? { kind: "click" };
	switch (act.kind) {
		case "click": return actClick(env.find(adapter.button));
		case "dispatch-event": return env.dispatch(act.event, act.detail);
		case "toggle-panel": {
			const closeEl = closeTargetOf(act, env);
			return actTogglePanel(env.find(adapter.button), closeEl, env.isVisible ?? defaultIsVisible);
		}
		case "open-settings":
			if (act.path !== void 0) console.warn(`quick-toolbar: open-settings path '${act.path}' 暂不支持（v2 深链待入）`);
			return actOpenSettings({
				find: env.find,
				...env.findByText !== void 0 ? { findByText: env.findByText } : {}
			});
		case "command":
			if (env.runCommand === void 0) {
				console.warn("quick-toolbar: command 环境无 runCommand 通道（旧版 DSH/未注入）");
				return false;
			}
			return actCommand({ execute: env.runCommand }, act.name);
	}
}
//#endregion
//#region src/register-brief.ts
/**
* 注册任务书（v0.5.1）——「➕ 按钮」注入的 prompt 文本。
*
* 设计（V2-9 载体哲学 + 安装教程闭环）：
* 用户点击工具栏「➕」→ 首选经 sessions/workspaces/uiWorkspace 服务创建
* 「添加按钮」会话并把本任务书以 queue 模式注入（自动执行）——同款机制 =
* 插件中心 LLM 更新（ensureLlmUpdateSession，2026-08-30 实证修正：早期
* inject=[] 令 apply 只见 {fiber}，「无会话通道」判断是错结论）；
* 服务缺失/失败 → 降级为当前 composer 草稿注入（用户 Enter 发送）。
* 任务书必须自包含（环境 LLM 不一定能访问本仓库文件）——协议要点全部内嵌。
*
* 同步纪律：字段与 src/adapters.ts / src/schema.ts 保持一致；
* 漂移即教程失效（tests/register-brief.spec.ts 有锚点断言防退化）。
*/
const REGISTER_BRIEF = `# 任务：为「工具栏插件」迁移 / 新增一个按钮

你是 DSH 环境的驻场工程师。用户想把某个按钮**迁移**到工具栏
（@max-null/dsh-quick-toolbar：SSiD 标题栏按钮组 / web 悬浮球·聚合面板），
或者**新增**一个自定义按钮。工具栏是「载体」——你注册的是**数据**
（图标/文字/点击由载体从原按钮派生或按声明执行），不是代码。

## 第一步（现在就要做）：先反问用户，不要猜

用一句话向用户确认目标，等回答后再动手：

- **迁移**：要迁移的是哪个按钮？它在哪个面板/页面/插件里，长什么样？
- **新增**：要新增什么样的按钮？图标 / 文字 / 点击后应发生什么？

## 第二步（确认目标后）：自主探查并验证

- **探查通道**：经 ➕ 注入的本任务书开头附有「探查通道」段（当前 DSH 页面完整
  URL，含认证 token）——用浏览器直接打开它即可访问用户环境；**不要裸访问
  内核端口（会 401）**。手工粘贴本文件时若无附带 URL，向用户要页面地址。
- 用你的浏览器 / 代码能力找到目标按钮元素（DOM 查询、截图、读源码都行），
  **自己验证 CSS 选择器确实可用**——不要凭猜测写选择器，不要依赖用户给 DOM 快照。
- 提示：场景无限，没有"完美脚本"能预适配所有环境——探查正是你在场的原因，
  载体不内置扫描器，这个活由你做。

## 第三步：注册（数据，不是代码）

**最小注册（迁移——推荐起点）**：被整合的按钮自带图标/文字/点击事件，聚合就是
"换个位置"，两条就够了：

\`\`\`json
{ "id": "dsh-some-plugin", "button": ".some-btn" }
\`\`\`

\`\`\`json
{ "adapters": [ { "id": "dsh-some-plugin", "button": ".some-btn" } ] }
\`\`\`

- 图标 = 扣取原按钮视觉（svg/img/背景）；文字 = 扣取原按钮文案；
  点击 = 点击原按钮（act 缺省 \`click\`）。
- **原按钮自动隐藏**（换位置 = 双入口无意义；缺省隐藏，显式 \`"hide": false\` 才保留——
  若原按钮被隐藏后其弹窗定位错位，改用 \`hide: false\`）。
- **自定义按钮**（无原按钮可扣）才需要显式字段：
  \`\`\`json
  { "id": "my-btn", "button": "#app-shell", "icon": { "source": "custom", "value": "emoji 或 svg" },
    "label": "文字", "act": { "kind": "click" }, "hide": false }
  \`\`\`

**行为枚举（只能选这些，禁止写代码）**：

| kind | 语义 |
|---|---|
| \`click\` | 直接点击 |
| \`toggle-panel\` | **二次点击事件**：弹窗开 → 按 \`secondClick\` 通道关闭；关 → 点原按钮打开。\`secondClick\` 推荐 \`{ "kind": "mask" }\`（点遮罩关闭——DSH 弹窗通用交互）；或点关闭按钮 \`{ "kind": "click", "selector": "验证过的关闭按钮" }\`（也可直接写选择器字符串） |
| \`dispatch-event\` | 派发 CustomEvent（\`event\`、\`detail?\`） |
| \`open-settings\` | 打开设置面板（引擎语义锚点定位，再点关闭） |
| \`command\` | 向输入框注入斜杠命令草稿（\`name\`，不含 \`/\`） |

## 探测闭环（注册前必须完成——别让用户点出"开得关不掉"）

用你的浏览器能力实测原按钮行为，按结果选 act：

1. 点击一次：开的是**弹窗/面板**还是普通页面？
2. 弹窗/面板能**再点原按钮关闭**吗？**不能** → act 必须用 \`toggle-panel\` 并
   探测弹窗内的「关闭」按钮（浏览弹窗 DOM，选准且唯一的选择器写 \`close\`）：
   \`{\"act\": { \"kind\": \"toggle-panel\", \"close\": \".verified-close\" }}\`——
   「再点关闭」是载体的基本承诺，\`click\` 只适用于天然可再点切换的按钮。
3. 记录原按钮是否会在意「隐藏」（见第三步 hide 说明）。

## 第四步：写入配置，让用户刷新

把完整 JSON（含 \`adapters\` 数组）写入：
\`~/.dsh/quick-toolbar-adapters.json\`（DSH 环境即 \`$DSH_HOME/quick-toolbar-adapters.json\`；
重复 \`id\` = 覆盖既有注册）。写入后告知用户**刷新页面**，按钮即出现在工具栏；
若未出现，修正选择器后重试。协议全文见仓库 \`adapters.prompt.md\`（如可访问请先读一遍）。

## 注册后验证清单（刷新后逐项确认）

① 按钮已出现在工具栏（图标/文字来自原按钮） ② 点击可开启 ③ 再点能关闭
（toggle-panel 场景） ④ 原按钮已隐藏（或按 hide:false 保留）。任一项不满足 → 修正后重试。

## 纪律

- 只写数据，不提供函数/代码（schema 拒绝一切非枚举行为）。
- 一次只注册 1–2 个按钮，验证后再扩展；定位失败无害（引擎静默跳过，绝不误点）。`;
//#endregion
//#region src/client.ts
/**
* @max-null/dsh-quick-toolbar — browser half.
*
* SSiD 标题栏统一按钮组的 DSH 侧执行器（v0.4.0）：
*
* 1. 隐藏 DSH 内的原按钮（插件中心 header 按钮 + better-sidebar 的
*    toggleCluster），消除双入口与错位——统一由自绘标题栏按钮组接管。
* 2. 监听 main 进程经 `mainView.webContents.executeJavaScript` 派发的
*    `ssid:titlebar` CustomEvent：
*      detail = 'plugin-center' → win.__pluginCenterToggle?.()
*                                （plugin-center v0.1.7+ 全局控制器：再点关闭；
*                                  老版回退 __pluginCenterOpen）
*      detail = 'sidebar'       → 先 __pluginCenterClose?.()（互斥：模态让位
*                                工具面板），再 click toggleCluster 最后一个按钮
*      detail = 'bottom'        → 同上，click 第一个按钮（窄屏无底栏则跳过）
*      detail = 'session-manager' → 打开会话管理面板（桥接 click footer 按钮）
* 3. 会话管理入口统一：隐藏 dsh-session-manager 的 footer 按钮
*    （.sm-footerBtn，display:none 后 JS .click() 仍触发 React onClick），
*    在会话 header（.sm-header，归档/移动按钮行）内嵌「会话管理」按钮；
*    shell 标题栏按钮组经 ssid:titlebar 事件也可打开（web 无标题栏时
*    内嵌按钮兜底）。
* 4. 悬浮快捷工具栏（v0.4.0）：被屏蔽/接管按钮（插件中心、侧栏、底栏、
*    会话管理）的常驻出口——可拖拽移动（localStorage 持久化）、可展开/
*    收起；壳环境与无壳 web 均显示（与标题栏按钮组互为冗余，用户可收起）。
* 5. i18n（v0.4.2）：全部用户可见文案（工具栏标题/按钮/aria/title）跟随
*    document.documentElement.lang（zh* → 中文，其余 → 英文），并监听
*    lang 变化动态切换（DSH 异步设置语言，初始可能为静态 HTML 的 en）。
*
* 选择器只用 CSS Modules 的原始段（编译后如 nArs4W_toggleCluster），
* 与哈希前缀无关：better-sidebar / plugin-center 升级只要不改类名即有效。
* 隐藏元素仍可被 JS 的 .click() 触发（无需可见），与壳已有的
* 「侧边栏自动诊断」同模式。
*/
window.__ModuleLoader__.load({
	id: "@max-null/dsh-quick-toolbar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var win = window;
		var BASE_CSS = [
			"/* SSiD 标题栏统一按钮组：隐藏 DSH 内原按钮，避免双入口与错位 */",
			".sm-footerBtn { display: none !important; }",
			"[class*=\"pc-headerbtn\"] { display: none !important; }",
			"[class*=\"toggleCluster\"] { display: none !important; }",
			"#__open-sea-skin-btn__ { visibility: hidden !important; pointer-events: none !important; }"
		].join("\n");
		var SHELL_CSS = [];
		/**
		* 从 toggleCluster 按钮的 aria-label 反推面板状态——不依赖 CSS 类名
		* 通配（DSH 官方 UI 也有 css.panel 类，[class*="panel"] 会误匹配，
		* 2026-08-19 用户实测「打开插件中心同时打开右栏」）。
		* better-sidebar 按钮语义（src/client/locales.ts 实证）：
		*   侧栏按钮 aria-label：开着='折叠侧边栏'(collapse) / 关着='展开侧边栏'(expand)
		*   底栏按钮 aria-label：开着='折叠底部面板'(collapseBottomPanel) / 关着='展开底部面板'(expandBottomPanel)
		* 面板开着 = 对应按钮 label 是「折叠」语义（collapse/折叠）。
		*/
		function clusterSideButtons() {
			var cluster = document.querySelector("[class*=\"toggleCluster\"]");
			if (cluster === null) return {
				sidebar: null,
				bottom: null
			};
			var buttons = cluster.querySelectorAll("button");
			var sidebar = null, bottom = null;
			for (var i = 0; i < buttons.length; i++) {
				var label = (buttons[i].getAttribute("aria-label") || "").toLowerCase();
				if (label.indexOf("bottom") !== -1 || label.indexOf("底部") !== -1) bottom = buttons[i];
				else sidebar = buttons[i];
			}
			return {
				sidebar,
				bottom
			};
		}
		function isPanelOpen(button) {
			if (button === null || button === void 0) return false;
			var label = (button.getAttribute("aria-label") || "").toLowerCase();
			return label.indexOf("collapse") !== -1 || label.indexOf("折叠") !== -1;
		}
		function clickButton(button) {
			if (button !== null && button !== void 0 && !button.disabled) button.click();
		}
		/**
		* 反向互斥（2026-08-19 用户补充）：打开插件中心前，若侧栏/底栏
		* 开着则先收起（点其 toggleCluster 按钮），避免弹窗被面板遮挡。
		* 两个独立判断：右栏+底栏同时开着时都要收起（不能用 if/else if，
		* 否则短路漏掉一个——用户实测「双开时底栏保持打开」）。
		*/
		function closeSidePanelsBeforePluginCenter() {
			var btns = clusterSideButtons();
			if (isPanelOpen(btns.sidebar)) clickButton(btns.sidebar);
			if (isPanelOpen(btns.bottom)) clickButton(btns.bottom);
		}
		var LOCALE_TARGETS = [];
		function localeIsZh() {
			return (document.documentElement.lang || "").toLowerCase().indexOf("zh") === 0;
		}
		var LOCALE_DICT = {
			"tb.title": ["快捷工具栏", "Quick Toolbar"],
			"tb.pin": ["钉住", "Pin"],
			"tb.unpin": ["取消钉住", "Unpin"],
			"tb.pinAria": ["钉住/取消钉住", "Pin/Unpin"],
			"tb.expandAria": ["展开快捷工具栏", "Expand quick toolbar"],
			"tb.plugin": ["插件中心", "Plugin center"],
			"tb.sidebar": ["侧栏", "Sidebar"],
			"tb.bottom": ["底栏", "Bottom panel"],
			"tb.sessions": ["会话管理", "Sessions"],
			"tb.add": ["添加按钮", "Add button"],
			"tb.addAria": ["添加/迁移按钮（让 LLM 来注册）", "Add / migrate a button (let the LLM register it)"],
			"sm.open": ["会话管理", "Sessions"],
			"sm.openTitle": ["打开会话管理面板", "Open session manager"]
		};
		function applyLocale() {
			var zh = localeIsZh();
			for (var i = 0; i < LOCALE_TARGETS.length; i++) {
				var tgt = LOCALE_TARGETS[i];
				var pair = LOCALE_DICT[tgt.key];
				if (pair === void 0) continue;
				var text = pair[zh ? 0 : 1];
				if (tgt.attr === "text") tgt.el.textContent = text;
				else if (tgt.attr === "text-span") {
					var s = tgt.el.querySelector("span");
					if (s !== null) s.textContent = text;
				} else if (tgt.attr === "title") tgt.el.title = text;
				else tgt.el.setAttribute("aria-label", text);
			}
		}
		function trackLocale(el, key, attr) {
			LOCALE_TARGETS.push({
				el,
				key,
				attr
			});
		}
		/**
		* 会话管理面板开关桥（v0.4.1，支持 toggle）：dsh-session-manager 0.4.x
		* 的面板打开是单向的（footer 按钮 onClick 恒定 panelStore.set(true)，
		* store 在插件模块闭包内，外部 bundle 无法直接调用），关闭只有面板内
		* 「关闭」按钮（onClose → set(false)）。桥接按钮做成 opened → 关 /
		* closed → 开 的切换：
		*  ① 已打开（.sm-panel 可见）→ 点击面板内「关闭」按钮
		*  ② 未打开 → 按承载版本二选一：
		*     - master（dsh-session-manager 0.4.x）：footer 按钮已被 display:none，
		*       但 .click() 仍触发其 React onClick（panelStore.set(true)）；面板
		*       是 SafePanel 模态，不在按钮内，display:none 不影响其显示。
		*     - rc.2（0.2.x）：header utilities 槽的「会话管理」按钮带稳定标识
		*       [data-dsh-header-button]，click 它 → setDrawer({open:true,view:'manage'})。
		*/
		function isSmPanelOpen() {
			var p = document.querySelector(".sm-panel");
			return p !== null && p.offsetParent !== null;
		}
		function clickSmPanelClose() {
			var p = document.querySelector(".sm-panel");
			if (p === null) return false;
			var dialog = p.closest("[role=\"dialog\"]");
			var scopes = dialog !== null ? [dialog, p] : [p];
			for (var s = 0; s < scopes.length; s++) {
				var btns = scopes[s].querySelectorAll("button");
				for (var i = 0; i < btns.length; i++) {
					var label = btns[i].getAttribute("aria-label") || btns[i].getAttribute("title") || btns[i].textContent.trim();
					if (label === "关闭" || label === "Close") {
						btns[i].click();
						return true;
					}
				}
			}
			return false;
		}
		function clickSmOpenButton() {
			if (isSmPanelOpen()) {
				clickSmPanelClose();
				return;
			}
			var footer = document.querySelector(".sm-footerBtn");
			if (footer !== null && !footer.disabled) {
				footer.click();
				return;
			}
			var manage = document.querySelector("[data-dsh-header-button]");
			if (manage !== null && !manage.disabled) manage.click();
		}
		/**
		* 会话 header（.sm-header：归档/移动至工作区按钮行）内嵌「会话管理」
		* 按钮，web 端（无自绘标题栏）也能打开面板；React 切换会话会重渲染
		* .sm-header，靠 MutationObserver 保活（幂等：id 查重）。
		*/
		function mountSmHeaderButton() {
			var header = document.querySelector(".sm-header");
			if (header === null) return;
			if (document.getElementById("ssid-sm-open-btn") !== null) return;
			var btn = document.createElement("button");
			btn.type = "button";
			btn.id = "ssid-sm-open-btn";
			btn.className = "sm-headerBtn";
			btn.setAttribute("aria-label", "会话管理");
			btn.title = "打开会话管理面板";
			btn.addEventListener("click", clickSmOpenButton);
			trackLocale(btn, "sm.open", "text");
			trackLocale(btn, "sm.open", "aria");
			trackLocale(btn, "sm.openTitle", "title");
			header.appendChild(btn);
			applyLocale();
		}
		var TOOLBAR_ID = "ssid-toolbar";
		var qtState = {
			pos: null,
			collapsed: true,
			pinned: false,
			shellVisible: false
		};
		var loadState = function(done) {
			fetch("/quick-toolbar/api/state").then(function(r) {
				return r.json();
			}).then(function(data) {
				var s = data !== null && typeof data === "object" && data.ok === true ? data.state : void 0;
				if (s !== void 0 && s !== null) {
					if (s.pos !== null && s.pos !== void 0 && typeof s.pos.x === "number" && typeof s.pos.y === "number") qtState.pos = {
						x: s.pos.x,
						y: s.pos.y
					};
					if (typeof s.collapsed === "boolean") qtState.collapsed = s.collapsed;
					if (typeof s.pinned === "boolean") qtState.pinned = s.pinned;
					if (typeof s.shellVisible === "boolean") qtState.shellVisible = s.shellVisible;
				}
				done();
			}).catch(function() {
				done();
			});
		};
		var saveState = function() {
			try {
				fetch("/quick-toolbar/api/state", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(qtState)
				}).catch(function() {});
			} catch (_e) {}
		};
		var TOOLBAR_CSS = [
			"#ssid-toolbar{position:fixed;z-index:9999;font-family:system-ui,\"Segoe UI\",sans-serif;user-select:none;-webkit-user-select:none;box-sizing:border-box;width:36px;height:36px;border-radius:18px;background:var(--dsw-alias-bg-layer-3,#10151f);border:1px solid var(--dsw-alias-border-l2,#1e2836);box-shadow:0 4px 16px rgba(0,0,0,.3);overflow:hidden;transition:width .28s cubic-bezier(.25,.8,.25,1),height .28s cubic-bezier(.25,.8,.25,1),left .28s cubic-bezier(.25,.8,.25,1),top .28s cubic-bezier(.25,.8,.25,1),border-radius .28s cubic-bezier(.25,.8,.25,1)}",
			"#ssid-toolbar *{box-sizing:border-box}",
			"#ssid-toolbar.ssid-tb-expanded{border-radius:12px}",
			"#ssid-toolbar-ball{position:fixed;z-index:10000;width:36px;height:36px;margin:0;padding:0;border:0;background:transparent;box-shadow:none;appearance:none;-webkit-appearance:none;pointer-events:none;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary,#d8e0ea);opacity:.9;transition:opacity .18s ease}",
			"#ssid-toolbar-ball svg{width:16px;height:16px}",
			"#ssid-toolbar .ssid-tb-panel{position:absolute;left:0;top:0;display:flex;flex-direction:column;gap:4px;padding:6px;color:var(--dsw-alias-label-primary,#d8e0ea)}",
			"#ssid-toolbar .ssid-tb-panel>*{opacity:0;transform:translateY(4px);transition:opacity .16s ease,transform .16s ease}",
			"#ssid-toolbar.ssid-tb-expanded .ssid-tb-panel>*{opacity:1;transform:none}",
			"#ssid-toolbar .ssid-tb-head{position:relative;height:22px;cursor:grab}",
			"#ssid-toolbar .ssid-tb-head:active{cursor:grabbing}",
			"#ssid-toolbar .ssid-tb-pin{position:absolute;top:2px;right:2px;width:26px;height:26px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#7b8494);border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.75;transition:opacity .15s,background .15s}",
			"#ssid-toolbar .ssid-tb-pin:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(128,148,168,.14))}",
			"#ssid-toolbar .ssid-tb-pin svg{width:15px;height:15px}",
			"#ssid-toolbar .ssid-tb-btn{border:0;background:transparent;color:var(--dsw-alias-label-primary,#d8e0ea);border-radius:8px;height:30px;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;text-align:left}",
			"#ssid-toolbar .ssid-tb-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,148,168,.14))}",
			"#ssid-toolbar .ssid-tb-btn svg{flex:none;width:15px;height:15px;color:var(--dsw-alias-label-secondary,#98a2b3)}",
			"#ssid-toolbar .ssid-tb-add{border:1px dashed var(--dsw-alias-border-strong,rgba(128,148,168,.45));background:transparent;color:var(--dsw-alias-label-tertiary,#7b8494);border-radius:8px;height:30px;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;text-align:left;margin-top:2px;transition:color .15s,border-color .15s,background .15s}",
			"#ssid-toolbar .ssid-tb-add:hover{color:var(--dsw-alias-label-primary,#d8e0ea);border-color:var(--dsw-alias-label-secondary,#98a2b3);background:var(--dsw-alias-interactive-bg-hover,rgba(128,148,168,.14))}",
			"#ssid-toolbar .ssid-tb-add svg{flex:none;width:15px;height:15px;color:var(--dsw-alias-label-secondary,#98a2b3)}",
			".ssid-tb-row{position:relative;overflow:hidden;border-radius:8px}",
			".ssid-tb-slide{display:flex;position:relative;width:100%;transition:transform .2s ease}",
			".ssid-tb-row .ssid-tb-btn{flex:1 1 auto;min-width:0;position:relative;z-index:1;box-sizing:border-box;background:transparent}",
			".ssid-tb-row.ssid-tb-row-open .ssid-tb-slide{transform:translateX(-56px)}",
			".ssid-tb-del{position:absolute;right:-56px;top:0;bottom:0;width:56px;border:0;background:var(--dsw-alias-state-error-primary,#e5484d);color:#fff;font-size:12px;cursor:pointer;font-weight:500;border-radius:8px 0 0 8px}"
		].join("\n");
		function toolbarIcon(name) {
			var ICONS = {
				grid: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"2\" y=\"2\" width=\"5\" height=\"5\" rx=\"1\"/><rect x=\"9\" y=\"2\" width=\"5\" height=\"5\" rx=\"1\"/><rect x=\"2\" y=\"9\" width=\"5\" height=\"5\" rx=\"1\"/><rect x=\"9\" y=\"9\" width=\"5\" height=\"5\" rx=\"1\"/></svg>",
				plugin: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"2\" y=\"2\" width=\"5\" height=\"5\" rx=\"1\"/><rect x=\"9\" y=\"2\" width=\"5\" height=\"5\" rx=\"1\"/><rect x=\"2\" y=\"9\" width=\"5\" height=\"5\" rx=\"1\"/><rect x=\"9\" y=\"9\" width=\"5\" height=\"5\" rx=\"1\"/></svg>",
				sidebar: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"2\" y=\"2\" width=\"12\" height=\"12\" rx=\"1\"/><path d=\"M10 2v12\"/></svg>",
				bottom: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"2\" y=\"2\" width=\"12\" height=\"12\" rx=\"1\"/><path d=\"M2 10h12\"/></svg>",
				sessions: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"2\" y=\"3\" width=\"12\" height=\"10\" rx=\"1.5\"/><path d=\"M5 6.5h6M5 9.5h4\" stroke-linecap=\"round\"/></svg>",
				collapse: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M3 5.5h10M6.5 8.5h3M8 11.5h1\" stroke-linecap=\"round\"/></svg>",
				menu: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M3 5h10M3 8h10M3 11h10\" stroke-linecap=\"round\"/></svg>",
				pin: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9.8 2.2l4 4-2.6 1.4-1.8 1.8.4 2.6-1.4 1.4-2.6-3L3.9 13l-1-1 3-3.9-3-2.6 1.4-1.4 2.6.4 1.8-1.8z\"/></svg>",
				settings: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"8\" cy=\"8\" r=\"2.2\"/><path d=\"M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4\"/></svg>",
				add: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"><path d=\"M8 3.5v9M3.5 8h9\"/></svg>"
			};
			return ICONS[name] || ICONS.grid;
		}
		var toolbarEnv = function() {
			return {
				find: function(s) {
					return document.querySelector(s);
				},
				isVisible: function(el) {
					if (el === null || typeof el !== "object") return false;
					var node = el;
					if (typeof node.getBoundingClientRect === "function") {
						var r = node.getBoundingClientRect();
						if (r.width > 0 || r.height > 0) return true;
					}
					if (typeof getComputedStyle === "function") try {
						var s = getComputedStyle(node);
						return s.display !== "none" && s.visibility !== "hidden";
					} catch (_e) {
						return false;
					}
					return false;
				},
				dispatch: function(event, detail) {
					window.dispatchEvent(new CustomEvent(event, { detail }));
					return true;
				},
				findByText: function(texts) {
					var buttons = document.querySelectorAll("button");
					for (var bi = 0; bi < buttons.length; bi++) {
						var label = (buttons[bi].textContent || "").trim();
						for (var ti = 0; ti < texts.length; ti++) if (label === texts[ti]) return buttons[bi];
					}
					return null;
				},
				runCommand: function(name) {
					return typeCommandIntoComposer(name);
				}
			};
		};
		function injectComposerDraft(text) {
			var seat = document.querySelector("[data-composer-seat]");
			var el = seat !== null && seat !== void 0 ? seat.querySelector("textarea, [contenteditable=\"true\"]") : document.querySelector("textarea, [contenteditable=\"true\"]");
			if (el === null || el === void 0) return false;
			if (el instanceof HTMLTextAreaElement) {
				var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
				if (setter !== void 0 && setter.set !== void 0) setter.set.call(el, text);
				else el.value = text;
			} else if (el.isContentEditable) el.textContent = text;
			else return false;
			el.dispatchEvent(new InputEvent("input", {
				bubbles: true,
				inputType: "insertText",
				data: text
			}));
			el.focus();
			return true;
		}
		function typeCommandIntoComposer(name) {
			return injectComposerDraft("/" + name);
		}
		function toolbarAction(kind) {
			if (kind === "plugin") {
				closeSidePanelsBeforePluginCenter();
				var toggle = win.__pluginCenterToggle;
				if (typeof toggle === "function") {
					toggle();
					return;
				}
				var open = win.__pluginCenterOpen;
				if (typeof open === "function") open();
				return;
			}
			if (kind === "sidebar" || kind === "bottom") {
				var close = win.__pluginCenterClose;
				if (typeof close === "function") close();
				var btns = clusterSideButtons();
				clickButton(kind === "sidebar" ? btns.sidebar : btns.bottom);
				return;
			}
			if (kind === "sessions") {
				clickSmOpenButton();
				return;
			}
		}
		function createToolbar() {
			if (win.__SSID_SHELL__ === true && !qtState.shellVisible) return;
			if (document.getElementById(TOOLBAR_ID) !== null) return;
			var addBtn = null;
			var root = document.createElement("div");
			root.id = TOOLBAR_ID;
			var panel = document.createElement("div");
			panel.className = "ssid-tb-panel";
			var head = document.createElement("div");
			head.className = "ssid-tb-head";
			var pinBtn = document.createElement("button");
			pinBtn.type = "button";
			pinBtn.className = "ssid-tb-pin";
			pinBtn.setAttribute("aria-label", "钉住/取消钉住");
			pinBtn.title = "钉住";
			pinBtn.innerHTML = toolbarIcon("pin");
			trackLocale(pinBtn, "tb.pinAria", "aria");
			trackLocale(pinBtn, "tb.pin", "title");
			head.appendChild(pinBtn);
			panel.appendChild(head);
			var TOOLBAR_KIND_BY_ADAPTER = {
				"dsh-plugin-center": "plugin",
				"dsh-better-sidebar.sidebar": "sidebar",
				"dsh-better-sidebar.bottom": "bottom",
				"dsh-session-manager": "sessions"
			};
			var adapterIconHtml = function(adapter, kind) {
				if (adapter.icon !== void 0 && adapter.icon.source === "custom") {
					var value = adapter.icon.value;
					if (value.indexOf("<") === 0) return value;
					return toolbarIcon(value);
				}
				try {
					var el = document.querySelector(adapter.button);
					if (el !== null) {
						var svg = el.querySelector("svg");
						if (svg !== null) return svg.outerHTML;
						var img = el.querySelector("img");
						if (img !== null) return img.outerHTML;
						var bg = getComputedStyle(el).backgroundImage;
						if (bg !== null && bg !== "none") return "<span style=\"display:inline-block;width:15px;height:15px;background:" + bg + ";background-size:contain;background-repeat:no-repeat\"></span>";
					}
				} catch (_e) {}
				return kind !== null ? toolbarIcon(kind) : toolbarIcon("grid");
			};
			var adapterLabel = function(adapter) {
				if (adapter.label !== void 0 && adapter.label !== "") return adapter.label;
				try {
					var el = document.querySelector(adapter.button);
					if (el !== null && (el.textContent || "").trim() !== "") return (el.textContent || "").trim().slice(0, 12);
				} catch (_e) {}
				return adapter.id;
			};
			var renderButton = function(adapter, kind) {
				var b = document.createElement("button");
				b.type = "button";
				b.className = "ssid-tb-btn";
				b.setAttribute("data-adapter-id", adapter.id);
				b.innerHTML = adapterIconHtml(adapter, kind) + "<span></span>";
				if (kind !== null) {
					b.setAttribute("aria-label", "");
					b.title = "";
					trackLocale(b, "tb." + kind, "text-span");
					trackLocale(b, "tb." + kind, "aria");
					trackLocale(b, "tb." + kind, "title");
				} else {
					var label = adapterLabel(adapter);
					var textSpan = b.querySelector("span");
					if (textSpan !== null) textSpan.textContent = label;
					b.setAttribute("aria-label", label);
					b.title = label;
				}
				b.addEventListener("click", function() {
					if (kind !== null) {
						toolbarAction(kind);
						return;
					}
					runAdapter(adapter, toolbarEnv());
				});
				if (addBtn !== null && addBtn.parentNode === panel) panel.insertBefore(b, addBtn);
				else panel.appendChild(b);
				if (adapter.hide !== false) try {
					var origBtn = document.querySelector(adapter.button);
					if (origBtn !== null) origBtn.style.display = "none";
				} catch (_e) {}
				return b;
			};
			for (var ai = 0; ai < BUILTIN_ADAPTERS.length; ai++) {
				var adapter = BUILTIN_ADAPTERS[ai];
				var kind = TOOLBAR_KIND_BY_ADAPTER[adapter.id];
				renderButton(adapter, kind !== void 0 ? kind : null);
			}
			var slideCloseAll = function() {
				var rows = panel.querySelectorAll(".ssid-tb-row.ssid-tb-row-open");
				for (var ri = 0; ri < rows.length; ri++) rows[ri].classList.remove("ssid-tb-row-open");
			};
			document.addEventListener("mousedown", function(e) {
				var t = e.target;
				if (t === null) return;
				if (!(t instanceof Element ? t.closest(".ssid-tb-row") !== null : false)) slideCloseAll();
			});
			function removeUserAdapter(ad) {
				fetch("/quick-toolbar/api/adapters").then(function(r) {
					return r.json();
				}).then(function(data) {
					var envelope = data !== null && typeof data === "object" ? data : void 0;
					var rows = envelope !== void 0 && envelope.ok === true && envelope.value !== null && typeof envelope.value === "object" ? envelope.value.adapters : void 0;
					if (!Array.isArray(rows)) return;
					var next = rows.filter(function(a) {
						return a.id !== ad.id;
					});
					return fetch("/quick-toolbar/api/adapters", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ adapters: next })
					}).then(function(r) {
						return r.json();
					}).then(function(res) {
						if (res === null || typeof res !== "object" || res.ok !== true) return;
						try {
							var btn = panel.querySelector("[data-adapter-id=\"" + ad.id.replace(/"/g, "\\\"") + "\"]");
							var row = btn !== null && typeof btn.closest === "function" ? btn.closest(".ssid-tb-row") : null;
							if (row !== null && row.parentNode === panel) panel.removeChild(row);
						} catch (_e) {}
						try {
							var orig = document.querySelector(ad.button);
							if (orig !== null) orig.style.display = "";
						} catch (_e2) {}
					});
				}).catch(function() {});
			}
			function wrapAdapterRow(btn, ad) {
				var row = document.createElement("div");
				row.className = "ssid-tb-row";
				var slide = document.createElement("div");
				slide.className = "ssid-tb-slide";
				if (btn.parentNode !== null) btn.parentNode.removeChild(btn);
				slide.appendChild(btn);
				var delBtn = document.createElement("button");
				delBtn.type = "button";
				delBtn.className = "ssid-tb-del";
				delBtn.textContent = "删除";
				delBtn.addEventListener("click", function() {
					row.classList.remove("ssid-tb-row-open");
					setTimeout(function() {
						removeUserAdapter(ad);
					}, 220);
				});
				slide.appendChild(delBtn);
				row.appendChild(slide);
				panel.insertBefore(row, addBtn);
				btn.setAttribute("data-user-adapter", "1");
				row.addEventListener("contextmenu", function(e) {
					e.preventDefault();
					e.stopPropagation();
					if (row.classList.contains("ssid-tb-row-open")) {
						row.classList.remove("ssid-tb-row-open");
						return;
					}
					slideCloseAll();
					row.classList.add("ssid-tb-row-open");
				});
				return row;
			}
			var fetchUserAdapters = function() {
				fetch("/quick-toolbar/api/adapters").then(function(r) {
					return r.json();
				}).then(function(data) {
					var envelope = data !== null && typeof data === "object" ? data : void 0;
					var rows = envelope !== void 0 && envelope.ok === true && envelope.value !== null && typeof envelope.value === "object" ? envelope.value.adapters : void 0;
					if (!Array.isArray(rows)) return;
					for (var ui = 0; ui < rows.length; ui++) {
						var user = rows[ui];
						if (user === null || typeof user !== "object") continue;
						var userKind = TOOLBAR_KIND_BY_ADAPTER[user.id];
						try {
							var old = panel.querySelector("[data-adapter-id=\"" + user.id.replace(/"/g, "\\\"") + "\"]");
							var oldRow = old !== null && typeof old.closest === "function" ? old.closest(".ssid-tb-row") : null;
							if (oldRow !== null && oldRow.parentNode === panel) panel.removeChild(oldRow);
							else if (old !== null && old.parentNode === panel) panel.removeChild(old);
						} catch (_e) {}
						wrapAdapterRow(renderButton(user, userKind !== void 0 ? userKind : null), user);
					}
				}).catch(function() {});
			};
			addBtn = document.createElement("button");
			addBtn.type = "button";
			addBtn.className = "ssid-tb-add";
			addBtn.setAttribute("aria-label", "添加/迁移按钮");
			addBtn.title = "添加按钮";
			addBtn.innerHTML = toolbarIcon("add") + "<span></span>";
			trackLocale(addBtn, "tb.addAria", "aria");
			trackLocale(addBtn, "tb.add", "title");
			var addSpan = addBtn.querySelector("span");
			if (addSpan !== null) addSpan.textContent = "添加按钮";
			trackLocale(addBtn, "tb.add", "text-span");
			addBtn.addEventListener("click", function() {
				ensureRegisterSession().then(function(ok) {
					if (!ok) registerBriefWithSessionUrl().then(function(brief) {
						injectComposerDraft(brief);
					});
				});
			});
			panel.appendChild(addBtn);
			var ball = document.createElement("button");
			ball.type = "button";
			ball.id = TOOLBAR_ID + "-ball";
			ball.className = "ssid-tb-ball";
			ball.setAttribute("aria-label", "展开快捷工具栏");
			ball.title = "SSiD 快捷工具栏";
			ball.innerHTML = toolbarIcon("menu");
			trackLocale(ball, "tb.expandAria", "aria");
			trackLocale(ball, "tb.title", "title");
			root.appendChild(panel);
			document.body.appendChild(root);
			document.body.appendChild(ball);
			var BALL_SIZE = 36;
			var BALL_R = 18;
			var expanded = false;
			var ballX = 0, ballY = 0;
			if (qtState.pos !== null) {
				ballX = qtState.pos.x;
				ballY = qtState.pos.y;
			}
			if (ballX === 0 && ballY === 0) {
				ballX = window.innerWidth - BALL_SIZE - 16;
				ballY = window.innerHeight - BALL_SIZE - 16;
			}
			ballX = Math.max(4, Math.min(ballX, window.innerWidth - BALL_SIZE - 4));
			ballY = Math.max(4, Math.min(ballY, window.innerHeight - BALL_SIZE - 4));
			root.style.left = ballX + "px";
			root.style.top = ballY + "px";
			ball.style.left = ballX + "px";
			ball.style.top = ballY + "px";
			var panelPlacement = function(W, H) {
				var vw = window.innerWidth, vh = window.innerHeight;
				var cx = ballX + BALL_R, cy = ballY + BALL_R;
				var hor = cx + BALL_R + W <= vw - 8 ? "right" : "left";
				var vert = cy + BALL_R + H <= vh - 8 ? "down" : "up";
				var left = hor === "right" ? ballX : ballX + BALL_SIZE - W;
				var top = vert === "down" ? ballY : ballY + BALL_SIZE - H;
				left = Math.max(4, Math.min(left, vw - W - 4));
				top = Math.max(4, Math.min(top, vh - H - 4));
				return {
					left,
					top
				};
			};
			var invertPlacement = function(r) {
				var vw = window.innerWidth, vh = window.innerHeight;
				var W = r.width, H = r.height;
				var combos = [
					{
						hor: "right",
						vert: "down"
					},
					{
						hor: "left",
						vert: "up"
					},
					{
						hor: "right",
						vert: "up"
					},
					{
						hor: "left",
						vert: "down"
					}
				];
				for (var ci = 0; ci < combos.length; ci++) {
					var hor = combos[ci].hor;
					var vert = combos[ci].vert;
					var bx = hor === "right" ? r.left : r.left + W - BALL_SIZE;
					var by = vert === "down" ? r.top : r.top + H - BALL_SIZE;
					var cx2 = bx + BALL_R, cy2 = by + BALL_R;
					var h2 = cx2 + BALL_R + W <= vw - 8 ? "right" : "left";
					var v2 = cy2 + BALL_R + H <= vh - 8 ? "down" : "up";
					if (h2 === hor && v2 === vert) return {
						bx,
						by
					};
				}
				return {
					bx: r.left,
					by: r.top
				};
			};
			var setCollapsed = function(collapsed) {
				expanded = !collapsed;
				ball.style.opacity = collapsed ? "" : "0";
				if (collapsed) {
					root.classList.remove("ssid-tb-expanded");
					root.style.width = BALL_SIZE + "px";
					root.style.height = BALL_SIZE + "px";
					root.style.left = ballX + "px";
					root.style.top = ballY + "px";
				} else {
					var W = panel.offsetWidth + 2;
					var H = panel.offsetHeight + 2;
					var p = panelPlacement(W, H);
					root.style.width = W + "px";
					root.style.height = H + "px";
					root.style.left = p.left + "px";
					root.style.top = p.top + "px";
					root.classList.add("ssid-tb-expanded");
				}
				var kids = panel.children;
				for (var ki = 0; ki < kids.length; ki++) kids[ki].style.transitionDelay = collapsed ? "0ms" : 40 + ki * 24 + "ms";
				qtState.collapsed = collapsed;
				saveState();
			};
			try {
				new ResizeObserver(function() {
					if (!expanded) return;
					var w2 = panel.offsetWidth + 2;
					var h2 = panel.offsetHeight + 2;
					if (root.offsetWidth !== w2 || root.offsetHeight !== h2) {
						root.style.width = w2 + "px";
						root.style.height = h2 + "px";
					}
				}).observe(panel);
			} catch (_e) {}
			var pinned = false;
			pinned = qtState.pinned;
			var applyPin = function() {
				pinBtn.style.color = pinned ? "var(--dsw-alias-interactive-accent, #4d9fff)" : "";
				pinBtn.style.opacity = pinned ? "1" : "";
				trackLocale(pinBtn, pinned ? "tb.unpin" : "tb.pin", "title");
			};
			var applyPos = function(x, y) {
				var vw = window.innerWidth, vh = window.innerHeight;
				var w = root.offsetWidth || BALL_SIZE;
				var h = root.offsetHeight || BALL_SIZE;
				x = Math.max(4, Math.min(x, vw - w - 4));
				y = Math.max(4, Math.min(y, vh - h - 4));
				root.style.left = x + "px";
				root.style.top = y + "px";
			};
			setCollapsed(pinned ? false : true);
			applyPin();
			applyLocale();
			fetchUserAdapters();
			pinBtn.addEventListener("click", function() {
				pinned = !pinned;
				qtState.pinned = pinned;
				saveState();
				applyPin();
				setCollapsed(pinned ? false : true);
			});
			var hideTimer = null;
			var lastMouse = {
				x: -1,
				y: -1
			};
			var inShellArea = function() {
				var r = root.getBoundingClientRect();
				var m = 18;
				return lastMouse.x >= r.left - m && lastMouse.x <= r.right + m && lastMouse.y >= r.top - m && lastMouse.y <= r.bottom + m;
			};
			var scheduleCollapse = function() {
				if (pinned || !expanded) return;
				if (hideTimer !== null) clearTimeout(hideTimer);
				hideTimer = setTimeout(function() {
					setCollapsed(true);
				}, 220);
			};
			var cancelCollapse = function() {
				if (hideTimer !== null) {
					clearTimeout(hideTimer);
					hideTimer = null;
				}
			};
			document.addEventListener("mousemove", function(ev) {
				lastMouse = {
					x: ev.clientX,
					y: ev.clientY
				};
				if (pinned) return;
				var inside = inShellArea();
				if (expanded) {
					if (inside) cancelCollapse();
					else scheduleCollapse();
				} else if (inside) {
					cancelCollapse();
					setCollapsed(false);
				}
			});
			var dragging = null;
			head.addEventListener("mousedown", function(ev) {
				if (ev.target === pinBtn) return;
				var shellRect = root.getBoundingClientRect();
				dragging = {
					dx: ev.clientX - shellRect.left,
					dy: ev.clientY - shellRect.top
				};
				ev.preventDefault();
				var onMove = function(mev) {
					if (!dragging) return;
					applyPos(mev.clientX - dragging.dx, mev.clientY - dragging.dy);
				};
				var onUp = function() {
					dragging = null;
					document.removeEventListener("mousemove", onMove);
					document.removeEventListener("mouseup", onUp);
					var r = root.getBoundingClientRect();
					var sp = invertPlacement({
						left: r.left,
						top: r.top,
						width: r.width,
						height: r.height
					});
					var vw = window.innerWidth, vh = window.innerHeight;
					ballX = Math.max(4, Math.min(Math.round(sp.bx), vw - BALL_SIZE - 4));
					ballY = Math.max(4, Math.min(Math.round(sp.by), vh - BALL_SIZE - 4));
					ball.style.left = ballX + "px";
					ball.style.top = ballY + "px";
					qtState.pos = {
						x: ballX,
						y: ballY
					};
					saveState();
				};
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			});
		}
		exports.inject = [
			"sessions",
			"workspaces",
			"uiWorkspace"
		];
		var sessionsSvc = null;
		var workspacesSvc = null;
		var uiWorkspaceSvc = null;
		function buildRegisterBrief(url) {
			return "## 探查通道（已为你的浏览器认证好）：\n- 用浏览器打开下面这个 URL 即可直达当前 DSH 页面（首次访问会换 cookie 并自动重定向到干净根路径；token 仅本会话使用，勿写入文件/回复）:\n" + url + "\n\n" + REGISTER_BRIEF;
		}
		function registerBriefWithSessionUrl() {
			return fetch("/quick-toolbar/api/auth-url").then(function(r) {
				return r.json();
			}).then(function(d) {
				return buildRegisterBrief(d !== null && typeof d === "object" && d.ok === true && typeof d.url === "string" ? d.url : "");
			}).catch(function() {
				return buildRegisterBrief("");
			});
		}
		function ensureRegisterSession() {
			var svc = sessionsSvc;
			var wsvc = workspacesSvc;
			var uws = uiWorkspaceSvc;
			if (svc === null || wsvc === null || uws === null) return Promise.resolve(false);
			if (typeof uws.connectWorkspace !== "function") return Promise.resolve(false);
			var snapshot = wsvc.list !== void 0 && typeof wsvc.list.getSnapshot === "function" ? wsvc.list.getSnapshot() : void 0;
			var items = snapshot !== void 0 && snapshot !== null && snapshot.items !== void 0 && snapshot.items !== null ? snapshot.items : [];
			var wsId = items.length > 0 ? items[0].workspaceId : void 0;
			if (wsId === void 0 || wsId === "") return Promise.resolve(false);
			return uws.connectWorkspace(wsId).then(function(sid) {
				if (typeof sid !== "string" || sid === "") return false;
				var svc3 = svc;
				if (svc3 === null || svc3 === void 0) return false;
				var face = typeof svc3.binding === "function" ? svc3.binding(sid) : void 0;
				var s = face !== void 0 && face !== null && face.session !== void 0 && face.session !== null ? face.session : void 0;
				if (s === void 0 || s === null || typeof s.prompt !== "function") return false;
				return registerBriefWithSessionUrl().then(function(brief) {
					var sess2 = s;
					if (sess2 === void 0 || sess2 === null || typeof sess2.prompt !== "function") return Promise.resolve({ ok: false });
					return sess2.prompt([{
						type: "text",
						text: brief
					}], "queue");
				}).then(function(res) {
					if (res === void 0 || res === null || res.ok !== true) return false;
					var sess = s;
					var svc2 = svc;
					if (sess === void 0 || sess === null) return false;
					if (svc2 === null || svc2 === void 0) return false;
					if (typeof sess.rename === "function") sess.rename("添加按钮").catch(function() {});
					if (typeof svc2.open === "function") svc2.open(sid);
					return true;
				});
			}).catch(function() {
				return false;
			});
		}
		exports.apply = function(ctx) {
			if (win.__dshQuickToolbarInstalled === true) return;
			win.__dshQuickToolbarInstalled = true;
			var svcCtx = ctx !== null && typeof ctx === "object" ? ctx : {};
			sessionsSvc = svcCtx.sessions ?? null;
			workspacesSvc = svcCtx.workspaces ?? null;
			uiWorkspaceSvc = svcCtx.uiWorkspace ?? null;
			var style = document.createElement("style");
			style.setAttribute("data-dsh-quick-toolbar", "");
			style.textContent = BASE_CSS + (SHELL_CSS.length > 0 && win.__SSID_SHELL__ === true ? "\n" + SHELL_CSS.join("\n") : "");
			document.head.appendChild(style);
			var tbStyle = document.createElement("style");
			tbStyle.setAttribute("data-dsh-quick-toolbar-toolbar", "");
			tbStyle.textContent = TOOLBAR_CSS;
			document.head.appendChild(tbStyle);
			loadState(function() {
				if (win.__SSID_SHELL__ === true && !qtState.shellVisible) return;
				createToolbar();
			});
			var hideIfShell = function() {
				if (win.__SSID_SHELL__ !== true) return false;
				if (qtState.shellVisible) return false;
				var tb = document.getElementById(TOOLBAR_ID);
				if (tb !== null) tb.remove();
				var tbBall = document.getElementById(TOOLBAR_ID + "-ball");
				if (tbBall !== null) tbBall.remove();
				return true;
			};
			window.addEventListener("load", hideIfShell);
			var shellTries = 0;
			var shellTimer = setInterval(function() {
				shellTries++;
				if (hideIfShell() || shellTries >= 5) clearInterval(shellTimer);
			}, 1500);
			mountSmHeaderButton();
			new MutationObserver(function() {
				applyLocale();
			}).observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["lang"]
			});
			new MutationObserver(mountSmHeaderButton).observe(document.body, {
				childList: true,
				subtree: true
			});
			window.addEventListener("ssid:titlebar", function(event) {
				var detail = event !== null && typeof event === "object" ? event.detail : void 0;
				if (detail === "quick-toolbar-toggle") {
					var nextOn = !qtState.shellVisible;
					qtState.shellVisible = nextOn;
					saveState();
					if (nextOn) createToolbar();
					else {
						var tbEl = document.getElementById(TOOLBAR_ID);
						if (tbEl !== null) tbEl.remove();
						var tbBallEl = document.getElementById(TOOLBAR_ID + "-ball");
						if (tbBallEl !== null) tbBallEl.remove();
					}
					return;
				}
				if (detail === "session-manager") {
					clickSmOpenButton();
					return;
				}
				if (detail === "plugin-center") {
					closeSidePanelsBeforePluginCenter();
					var toggle = win.__pluginCenterToggle;
					if (typeof toggle === "function") toggle();
					else {
						var open = win.__pluginCenterOpen;
						if (typeof open === "function") open();
					}
					return;
				}
				if (detail === "open-sea-skin") {
					var ossBtn = document.getElementById("__open-sea-skin-btn__");
					if (ossBtn !== null && !ossBtn.disabled) ossBtn.click();
					return;
				}
				if (detail === "sidebar" || detail === "bottom") {
					var close = win.__pluginCenterClose;
					if (typeof close === "function") close();
					var btns = clusterSideButtons();
					clickButton(detail === "sidebar" ? btns.sidebar : btns.bottom);
				}
			});
		};
		return module.exports;
	}
});
//#endregion
