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
	}
];
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
		var TOOLBAR_POS_KEY = "ssid-toolbar-pos";
		var TOOLBAR_COLLAPSED_KEY = "ssid-toolbar-collapsed";
		var TOOLBAR_PINNED_KEY = "ssid-toolbar-pinned";
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
			"#ssid-toolbar .ssid-tb-btn svg{flex:none;width:15px;height:15px;color:var(--dsw-alias-label-secondary,#98a2b3)}"
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
				pin: "<svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9.8 2.2l4 4-2.6 1.4-1.8 1.8.4 2.6-1.4 1.4-2.6-3L3.9 13l-1-1 3-3.9-3-2.6 1.4-1.4 2.6.4 1.8-1.8z\"/></svg>"
			};
			return ICONS[name] || ICONS.grid;
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
			if (win.__SSID_SHELL__ === true) return;
			if (document.getElementById(TOOLBAR_ID) !== null) return;
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
			var items = [];
			for (var ai = 0; ai < BUILTIN_ADAPTERS.length; ai++) {
				var adapter = BUILTIN_ADAPTERS[ai];
				var kind = TOOLBAR_KIND_BY_ADAPTER[adapter.id];
				if (kind === void 0) continue;
				items.push({
					kind,
					adapter
				});
			}
			for (var i = 0; i < items.length; i++) {
				var b = document.createElement("button");
				b.type = "button";
				b.className = "ssid-tb-btn";
				b.innerHTML = toolbarIcon(items[i].kind) + "<span></span>";
				b.setAttribute("aria-label", "");
				b.title = "";
				trackLocale(b, "tb." + items[i].kind, "text-span");
				trackLocale(b, "tb." + items[i].kind, "aria");
				trackLocale(b, "tb." + items[i].kind, "title");
				(function(kind) {
					b.addEventListener("click", function() {
						toolbarAction(kind);
					});
				})(items[i].kind);
				panel.appendChild(b);
			}
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
			try {
				var savedPos = JSON.parse(String(localStorage.getItem(TOOLBAR_POS_KEY) || "null"));
				if (savedPos !== null && typeof savedPos.x === "number" && typeof savedPos.y === "number") {
					ballX = savedPos.x;
					ballY = savedPos.y;
				}
			} catch (_e) {}
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
				try {
					localStorage.setItem(TOOLBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
				} catch (_e) {}
			};
			var pinned = false;
			try {
				pinned = localStorage.getItem(TOOLBAR_PINNED_KEY) === "1";
			} catch (_e) {}
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
			pinBtn.addEventListener("click", function() {
				pinned = !pinned;
				try {
					localStorage.setItem(TOOLBAR_PINNED_KEY, pinned ? "1" : "0");
				} catch (_e) {}
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
					try {
						localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify({
							x: ballX,
							y: ballY
						}));
					} catch (_e) {}
				};
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			});
		}
		exports.inject = [];
		exports.apply = function(ctx) {
			if (win.__dshQuickToolbarInstalled === true) return;
			win.__dshQuickToolbarInstalled = true;
			var style = document.createElement("style");
			style.setAttribute("data-dsh-quick-toolbar", "");
			style.textContent = BASE_CSS + (SHELL_CSS.length > 0 && win.__SSID_SHELL__ === true ? "\n" + SHELL_CSS.join("\n") : "");
			document.head.appendChild(style);
			var tbStyle = document.createElement("style");
			tbStyle.setAttribute("data-dsh-quick-toolbar-toolbar", "");
			tbStyle.textContent = TOOLBAR_CSS;
			document.head.appendChild(tbStyle);
			createToolbar();
			window.addEventListener("load", function() {
				if (win.__SSID_SHELL__ !== true) return;
				var tb = document.getElementById(TOOLBAR_ID);
				if (tb !== null) tb.remove();
				var tbBall = document.getElementById(TOOLBAR_ID + "-ball");
				if (tbBall !== null) tbBall.remove();
				var st = document.querySelector("style[data-dsh-quick-toolbar]");
				if (st !== null) st.textContent = BASE_CSS + "\n" + SHELL_CSS.join("\n");
			});
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
