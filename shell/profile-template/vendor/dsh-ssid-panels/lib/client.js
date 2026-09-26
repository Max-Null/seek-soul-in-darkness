window.__ModuleLoader__.load({
	id: "@max-null/dsh-ssid-panels",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_dom_client = require("react-dom/client");
		//#region src/client/icon-data.ts
		/**
		* SSiD 应用图标（shell/assets/icon.png 96px 缩放）内联 data-URL。
		* 由 scripts/generate-icon-data.mjs 生成——品牌槽位标记直接使用，
		* 保证与任务栏/窗口图标一致。
		*/
		const SSID_ICON_DATA_URL = "data:image/png;base64,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";
		//#endregion
		//#region src/client/index.tsx
		/**
		* @max-null/dsh-ssid-panels client half: four SSiD tabs registered on
		* ctx.betterSidebar (memory / guardian state / habit candidates / balances).
		* dsh-better-sidebar is an optional type-only peer: without it this half
		* registers nothing and the host routes stay unused.
		*
		* i18n: follows the DSH locale service when present (optional ctx.get('locale')
		* + 'locale/change'), silently falling back to Chinese otherwise — the same
		* pattern dsh-plugin-center uses.
		*/
		const inject = ["slots"];
		/** SSiD brand mark: the app icon, sized by the slot owner prop. */
		function SsidBrandMark({ size = 24, className }) {
			return (0, react.createElement)("img", {
				width: size,
				height: size,
				src: SSID_ICON_DATA_URL,
				className,
				alt: "",
				"aria-hidden": true,
				style: {
					borderRadius: Math.max(2, size * .14),
					display: "block"
				}
			});
		}
		const SETTINGS_NAV_MARKER = "data-dsh-ssid-panels-settings-nav";
		const SETTINGS_NAV_CSS = `
[data-dsh-ssid-panels-settings-nav] > svg:first-child { display: none; }
[data-dsh-ssid-panels-settings-nav]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E") center / contain no-repeat;
}
`;
		function registerSettingsNavIcon(label) {
			if (typeof document === "undefined") return () => {};
			let styleInjected = false;
			const injectStyle = () => {
				if (styleInjected) return;
				styleInjected = true;
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "@max-null/dsh-ssid-panels");
				style.textContent = SETTINGS_NAV_CSS;
				document.head.append(style);
			};
			injectStyle();
			let disposed = false;
			const sync = () => {
				if (disposed) return;
				const currentLabel = label().trim();
				document.querySelectorAll("[role=\"dialog\"] nav button").forEach((button) => {
					if (currentLabel.length > 0 && button.textContent?.trim() === currentLabel) button.setAttribute(SETTINGS_NAV_MARKER, "");
					else button.removeAttribute(SETTINGS_NAV_MARKER);
				});
			};
			sync();
			const observer = new MutationObserver(sync);
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true
			});
			return () => {
				disposed = true;
				observer.disconnect();
				document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`).forEach((element) => {
					element.removeAttribute(SETTINGS_NAV_MARKER);
				});
			};
		}
		const STRINGS = {
			zh: {
				about: "关于 SSiD",
				tabGuardian: "状态",
				tabHabit: "习惯",
				tabBalance: "余额",
				assertions: "断言计数",
				quiet: "安静",
				level: "{n} 级",
				reviewQueue: "编辑审查队列",
				noPending: "无待审查项",
				turn: "第 {n} 轮 · ",
				noPath: "(无路径)",
				habitCandidates: "候选习惯",
				evidence: "证据 {n} 条",
				confirmToMemory: "确认（写入记忆）",
				discard: "丢弃",
				available: "可用",
				insufficient: "余额不足",
				querying: "查询中…",
				queryFailed: "查询失败",
				refresh: "刷新",
				notQueried: "尚未查询",
				lastUpdated: "上次更新 {t}",
				missingKey: "未配置 API Key",
				httpFailed: "查询失败（HTTP {status}）",
				title: "思灵 (SSiD)",
				slogan: "于黑暗中，探寻灵魂。",
				starMe: "给我个星吧",
				checkUpdates: "检查更新",
				noRelease: "暂无发布版本",
				newVersion: "新版本可用：{name}（{tag}，{date}）",
				latestVersion: "已是最新：{name}（{tag}）",
				checking: "检查中…",
				checkNow: "立即检查",
				checkFailed: "更新检查失败",
				apiFailed: "检查失败（HTTP {status}）",
				updSilent: "（启动后已静默检查更新；下方可手动检查）",
				updChecking: "更新检查中…",
				updAvailable: "发现新版本 v{v}，点击下载",
				updDownload: "下载更新",
				updDownloading: "下载中… {p}%",
				updDownloaded: "下载完成，可安装",
				updInstall: "安装并重启",
				updError: "更新失败：{m}",
				updUnavailable: "在线增量更新不可用（{m}）",
				changelog: "更新日志",
				changelogCurrent: "当前版本（内置）",
				changelogOnline: "历史版本（在线）",
				changelogEmpty: "（暂无更新日志）",
				modalTitle: "思灵已更新",
				modalGotIt: "知道了",
				none: "（无）",
				presetPlugins: "预制插件",
				notifyTitle: "通知设置",
				notifyEnabled: "启用通知",
				notifyEnabledDesc: "窗口失焦（最小化/被遮挡）时以 Windows 通知提醒；聚焦时不打扰",
				notifyReplyDone: "会话完成",
				notifyReplyDoneDesc: "每轮会话完成时通知（含用时）",
				notifyQuestion: "提问",
				notifyQuestionDesc: "AI 向你提问、需要回复时通知",
				notifyApproval: "授权申请",
				notifyApprovalDesc: "工具请求授权、需要处理时通知",
				keepAwakeTitle: "执行期间保持唤醒",
				keepAwakeDesc: "会话或目标执行时阻止系统睡眠、屏幕不息；一轮结束后仍保持一段时间，覆盖多轮之间的空隙",
				keepAwakeTailTitle: "结束后的保持时长",
				keepAwakeTailDesc: "一轮结束到释放之间留多少毫秒；目标模式的多轮之间有缝隙，留一段可避免闪断",
				maskTitle: "执行中遮罩",
				maskTextTitle: "遮罩文案",
				maskTextDesc: "开启遮罩后盖在思灵窗口上的提示语（入口：托盘菜单项，或下面那个全局快捷键）",
				maskHotkeyTitle: "遮罩快捷键",
				maskHotkeyDesc: "Electron accelerator 语法，如 Control+Alt+M；保存后立即生效",
				maskLookTitle: "遮罩观感",
				maskLookDesc: "浓度越小越透（看得见底下的动静）· 模糊半径越大越糊（越读不出内容）",
				maskPasscodeTitle: "解除口令",
				maskPasscodeDesc: "留空则不设防（长按 2 秒直接解除）。设了之后托盘、快捷键、长按三个入口都要求输入口令。它不是安全边界——口令明文存在 notify.json 里，忘了就改文件删掉这一项",
				saved: "✓ 已保存",
				saveFail: "保存失败：",
				sessionRootTitle: "会话存储",
				sessionRootIsolated: "独立会话存储",
				sessionRootIsolatedDesc: "与手动 dsh web 的会话目录隔离，避免两个宿主并发写坏会话日志；重启 SSiD 后生效",
				sessionRootApplied: "当前生效：{v}",
				sessionRootAppliedOn: "独立（sessions-ssid）",
				sessionRootAppliedOff: "共享（sessions）",
				sessionRootPendingHint: "重启 SSiD 后生效（当前开关与生效状态不一致）",
				sessionRootImport: "载入原 DSH 会话",
				sessionRootImportDesc: "把共享根的历史会话复制到独立根（原件保留，已存在的会话跳过）",
				sessionRootImporting: "载入中…",
				sessionRootImportDone: "已载入 {copied} 个，跳过 {skipped} 个",
				sessionRootImportFailed: "载入出错 {n} 个，请查看日志",
				sessionRootRestartConfirm: "切换后需要重启 DSH 才能生效，是否现在重启？",
				sessionRootRestartBusy: "有 {n} 个会话正在进行中，未执行重启；设置已保存，请等待完成后再重启",
				sessionRootRestarting: "正在重启 DSH…",
				sessionRootRestartUnavailable: "当前环境不支持自动重启，请手动重启 SSiD",
				sessionRootRestartAskTitle: "需要重启生效",
				sessionRootRestartAskBody: "切换已保存，重启思灵后生效（有进行中会话时会先检查）",
				sessionRootRestartNow: "立即重启",
				sessionRootRestartLater: "稍后",
				sessionRootCounts: "独立根 {a} 个会话 · 共享根 {b} 个会话 · 已载入 {c} 个",
				sessionRootClear: "移除已载入会话",
				sessionRootClearConfirm: "将删除 {n} 个已载入的会话（隔离后新建的会话与共享根都不受影响，原件保留）。确定移除？",
				sessionRootCleared: "已移除 {n} 个已载入会话",
				sessionRootRefreshHint: "重启思灵后生效（载入/清空不触发会话列表刷新）",
				sessionRootRestartBtn: "重启思灵",
				sessionRootLoadFailed: "无法读取会话存储状态（插件服务未就绪）；请重启 SSiD 后重试"
			},
			en: {
				about: "About SSiD",
				tabGuardian: "Status",
				tabHabit: "Habits",
				tabBalance: "Balance",
				assertions: "Assertions",
				quiet: "Quiet",
				level: "Level {n}",
				reviewQueue: "Edit review queue",
				noPending: "No pending reviews",
				turn: "Turn {n} · ",
				noPath: "(no path)",
				habitCandidates: "Habit candidates",
				evidence: "{n} evidence",
				confirmToMemory: "Confirm (save to memory)",
				discard: "Discard",
				available: "Available",
				insufficient: "Insufficient",
				querying: "Querying…",
				queryFailed: "Query failed",
				refresh: "Refresh",
				notQueried: "Not queried yet",
				lastUpdated: "Last updated {t}",
				missingKey: "API key not configured",
				httpFailed: "Query failed (HTTP {status})",
				title: "SSiD",
				slogan: "Seek the soul in the dark.",
				starMe: "Give us a star",
				checkUpdates: "Check for updates",
				noRelease: "No published release",
				newVersion: "New version: {name} ({tag}, {date})",
				latestVersion: "Up to date: {name} ({tag})",
				checking: "Checking…",
				checkNow: "Check now",
				checkFailed: "Update check failed",
				apiFailed: "Check failed (HTTP {status})",
				updSilent: "(a silent check runs at startup; manual check below)",
				updChecking: "Checking for updates…",
				updAvailable: "New version v{v} available — download now",
				updDownload: "Download update",
				updDownloading: "Downloading… {p}%",
				updDownloaded: "Download complete — ready to install",
				updInstall: "Install & restart",
				updError: "Update failed: {m}",
				updUnavailable: "Online incremental update unavailable ({m})",
				changelog: "Changelog",
				changelogCurrent: "Current version (bundled)",
				changelogOnline: "Release history (online)",
				changelogEmpty: "(no changelog yet)",
				modalTitle: "SSiD has been updated",
				modalGotIt: "Got it",
				none: "(none)",
				presetPlugins: "Bundled plugins",
				notifyTitle: "Notifications",
				notifyEnabled: "Enable notifications",
				notifyEnabledDesc: "Windows notifications when the window is unfocused (minimized/covered); silent while focused",
				notifyReplyDone: "Reply done",
				notifyReplyDoneDesc: "Notify when each turn completes (with duration)",
				notifyQuestion: "Questions",
				notifyQuestionDesc: "Notify when the AI asks you a question",
				notifyApproval: "Approvals",
				notifyApprovalDesc: "Notify when a tool requests approval",
				keepAwakeTitle: "Stay awake while running",
				keepAwakeDesc: "Block system sleep and display-off while a session or goal runs; stays on briefly after a turn to cover gaps between rounds",
				keepAwakeTailTitle: "Hold after a turn ends",
				keepAwakeTailDesc: "Milliseconds to keep holding after a turn ends; goal mode has gaps between rounds",
				maskTitle: "In-progress mask",
				maskTextTitle: "Mask text",
				maskTextDesc: "The message overlaid on the SSiD window while the mask is on (via the tray item or the shortcut below)",
				maskHotkeyTitle: "Mask shortcut",
				maskHotkeyDesc: "Electron accelerator syntax, e.g. Control+Alt+M; takes effect immediately",
				maskLookTitle: "Mask look",
				maskLookDesc: "Opacity: lower is more see-through · Blur radius: higher is less readable",
				maskPasscodeTitle: "Release passcode",
				maskPasscodeDesc: "Empty = no lock (hold 2s releases). When set, the tray item, the shortcut and the hold button all require it. Not a security boundary — stored in plain text in notify.json; forgot it? edit the file and remove the key",
				saved: "✓ Saved",
				saveFail: "Save failed: ",
				sessionRootTitle: "Session storage",
				sessionRootIsolated: "Isolate session storage",
				sessionRootIsolatedDesc: "Separate the session directory from the manual dsh web, so two hosts cannot corrupt the same log; takes effect after restarting SSiD",
				sessionRootApplied: "Active: {v}",
				sessionRootAppliedOn: "isolated (sessions-ssid)",
				sessionRootAppliedOff: "shared (sessions)",
				sessionRootPendingHint: "Takes effect after restarting SSiD (switch differs from active state)",
				sessionRootImport: "Import original DSH sessions",
				sessionRootImportDesc: "Copy historical sessions from the shared root into the isolated root (originals kept; existing ids skipped)",
				sessionRootImporting: "Importing…",
				sessionRootImportDone: "Imported {copied}, skipped {skipped}",
				sessionRootImportFailed: "{n} import error(s); check the log",
				sessionRootRestartConfirm: "A DSH restart is required for the switch to take effect. Restart now?",
				sessionRootRestartBusy: "{n} session(s) still in progress — restart skipped; setting saved, restart later",
				sessionRootRestarting: "Restarting DSH…",
				sessionRootRestartUnavailable: "Auto-restart unavailable here; please restart DSH manually",
				sessionRootRestartAskTitle: "Restart required",
				sessionRootRestartAskBody: "Switch saved; takes effect after restarting SSiD (active sessions are checked first)",
				sessionRootRestartNow: "Restart now",
				sessionRootRestartLater: "Later",
				sessionRootCounts: "Isolated root {a} sessions · shared root {b} sessions · imported {c}",
				sessionRootClear: "Remove imported sessions",
				sessionRootClearConfirm: "This deletes {n} imported session(s) only (sessions created after isolation and the shared root are untouched; originals kept). Remove now?",
				sessionRootCleared: "Removed {n} imported session(s)",
				sessionRootRefreshHint: "Takes effect after restarting SSiD (import/clear does not refresh the session list in-place)",
				sessionRootRestartBtn: "Restart SSiD",
				sessionRootLoadFailed: "Cannot read session storage state (plugin service not ready); restart SSiD and retry"
			}
		};
		let localeId = "zh";
		const localeListeners = /* @__PURE__ */ new Set();
		function adoptLocale(id) {
			const next = id === "en" ? "en" : "zh";
			if (next === localeId) return;
			localeId = next;
			localeListeners.forEach((l) => l());
		}
		function fmt(tpl, vars = {}) {
			return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
		}
		/** Copy function + locale subscription: mounted components re-render on DSH language switch. */
		function useT() {
			const [id, setId] = (0, react.useState)(localeId);
			(0, react.useEffect)(() => {
				const l = () => {
					setId(localeId);
				};
				localeListeners.add(l);
				return () => {
					localeListeners.delete(l);
				};
			}, []);
			return (key, vars) => fmt(STRINGS[id][key] ?? STRINGS.zh[key], vars);
		}
		/** POST one /ssid/api method and unwrap the {ok, value|error} envelope. */
		async function api(method, payload) {
			const body = await (await fetch(`/ssid/api/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload ?? {})
			})).json();
			if (body.ok !== true) throw new Error(body.error?.message ?? `${method} failed`);
			return body.value;
		}
		/** Small inline-styled primitives (no CSS build step). */
		const ssid = {
			accent: "#4FC3F7",
			wrap: {
				display: "flex",
				flexDirection: "column",
				gap: 8,
				padding: "10px 12px",
				overflowY: "auto",
				height: "100%",
				boxSizing: "border-box"
			},
			card: {
				background: "var(--dsw-alias-bg-layer-3, #1a2333)",
				border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				borderRadius: 12,
				padding: "14px 16px"
			},
			title: {
				fontSize: 12,
				fontWeight: 600,
				letterSpacing: ".06em",
				textTransform: "uppercase",
				color: "var(--dsw-alias-label-tertiary, #8a95a8)",
				marginBottom: 6,
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center"
			},
			text: {
				fontSize: 13,
				color: "var(--dsw-alias-label-primary, #d8e0ea)",
				lineHeight: 1.5
			},
			muted: {
				fontSize: 12,
				color: "var(--dsw-alias-label-tertiary, #8a95a8)",
				lineHeight: 1.5
			},
			empty: {
				padding: "28px 12px",
				textAlign: "center",
				fontSize: 13,
				color: "var(--dsw-alias-label-tertiary, #8a95a8)"
			},
			btn: {
				padding: "5px 14px",
				fontSize: 13,
				lineHeight: 1.5,
				background: "none",
				border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				borderRadius: 8,
				color: "var(--dsw-alias-label-primary, #d8e0ea)",
				cursor: "pointer",
				fontFamily: "inherit"
			},
			badge: (level) => ({
				fontSize: 11,
				fontWeight: 500,
				lineHeight: 17,
				padding: "1px 8px",
				borderRadius: 999,
				whiteSpace: "nowrap",
				border: "1px solid",
				color: level === 0 ? "var(--dsw-alias-label-secondary, #67748a)" : level === 1 ? "#f7c94f" : level === 2 ? "#f7a14f" : "#f76f4f",
				borderColor: level === 0 ? "var(--dsw-alias-border-l2, #1e2836)" : level === 1 ? "#f7c94f55" : level === 2 ? "#f7a14f55" : "#f76f4f55"
			})
		};
		/**
		* 侧栏 tab 图标：与 better-sidebar / DSH 原生右栏的图标同风格——**彩色**线性图标、22px。
		*
		* 尺寸取 22 的依据：原生右栏「开始」页的图标容器是
		* `.geFEbW_entryIcon { width: 26px; height: 26px; display: flex; align-items: center }`，
		* 它自带的占位图标是 22px（四周各留 2px）——整列基准就是 22。内置于 better-sidebar
		* 自绘的底部工作台卡片里另有 12–14px 的一档，我们拿不到按场景分支的入口，以用户实际
		* 看到的「开始」页为准（2026-09-14 用户指「尺寸 14 不太对，其他都在 22 左右」）。
		* 颜色按内置风格各自硬编码（内置也不跟随主题，用 currentColor 反而显得比内置"素"）。
		* @param path - 24 格 viewBox 下的描边路径。
		* @param color - 该 tab 的品牌色。
		*/
		function tabIcon(path, color) {
			return (0, react.createElement)("svg", {
				width: 22,
				height: 22,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: color,
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, (0, react.createElement)("path", { d: path }));
		}
		/**
		* 记忆面板（0.3.0）：三组分组（待审核/已审核·按需/常驻注入）+ namespace
		* 筛选 + 搜索 + 「常驻注入」开关（approved 可切、suggested 禁用）+ 确认/
		* 删除 + 刷新 + 「整理记忆」按钮（一点即发：建会话→open→input 就绪后
		* setDraft→submit，机制实证自 dsh-better-sidebar conversation-draft.ts）。
		*/
		/** 状态面板：Guardian 触发线快照（1s 轮询，可见时）。 */
		function GuardianView(props) {
			const t = useT();
			const [snapshot, setSnapshot] = (0, react.useState)({});
			(0, react.useEffect)(() => {
				if (!props.visible) return;
				const tick = () => {
					api("guardian.snapshot").then((value) => {
						setSnapshot(value);
					}).catch(() => {});
				};
				tick();
				const timer = setInterval(tick, 1e3);
				return () => {
					clearInterval(timer);
				};
			}, [props.visible]);
			const session = snapshot.session;
			const count = session?.assertionCount ?? 0;
			const level = session?.assertionLevel ?? 0;
			const queue = snapshot.reviewQueue ?? [];
			const label = level === 0 ? t("quiet") : t("level", { n: level });
			return (0, react.createElement)("div", { style: ssid.wrap }, (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("assertions")), (0, react.createElement)("span", { style: ssid.badge(level) }, label)), (0, react.createElement)("div", { style: {
				fontSize: 22,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, String(count))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, t("reviewQueue")), queue.length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, t("noPending")) : queue.map((item, index) => (0, react.createElement)("div", {
				key: index,
				style: {
					...ssid.text,
					fontSize: 11.5,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, `${item.turn !== void 0 ? t("turn", { n: item.turn }) : ""}${item.filePath ?? t("noPath")}`))));
		}
		function HabitView(props) {
			const t = useT();
			const [candidates, setCandidates] = (0, react.useState)([]);
			const reload = async () => {
				try {
					setCandidates(await api("habit.snapshot"));
				} catch {
					setCandidates([]);
				}
			};
			(0, react.useEffect)(() => {
				if (!props.visible) return;
				reload();
				const timer = setInterval(() => {
					reload();
				}, 1e3);
				return () => {
					clearInterval(timer);
				};
			}, [props.visible]);
			const pending = candidates.filter((candidate) => candidate.status === "pending");
			return (0, react.createElement)("div", { style: ssid.wrap }, pending.length === 0 ? (0, react.createElement)("div", { style: ssid.empty }, t("noPending")) : pending.map((candidate) => (0, react.createElement)("div", {
				key: candidate.id,
				style: ssid.card
			}, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("habitCandidates")), (0, react.createElement)("span", { style: ssid.badge(candidate.confidence === "high" ? 1 : candidate.confidence === "medium" ? 2 : 3) }, candidate.confidence)), (0, react.createElement)("div", { style: ssid.text }, candidate.habit), (0, react.createElement)("div", { style: {
				...ssid.muted,
				marginTop: 4
			} }, t("evidence", { n: candidate.evidenceCount })), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 6,
				marginTop: 8
			} }, (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("habit.confirm", { id: candidate.id }).then(() => reload());
				}
			}, t("confirmToMemory")), (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("habit.discard", { id: candidate.id }).then(() => reload());
				}
			}, t("discard"))))));
		}
		function BalanceView() {
			const t = useT();
			const [result, setResult] = (0, react.useState)({});
			const [updated, setUpdated] = (0, react.useState)(null);
			const refresh = async () => {
				const [ds, kimi] = await Promise.all([api("balance.deepseek").then((value) => value).catch(() => ({
					ok: false,
					code: "http-failed"
				})), api("balance.kimi").then((value) => value).catch(() => ({
					ok: false,
					code: "http-failed"
				}))]);
				setResult({
					ds,
					kimi
				});
				setUpdated((/* @__PURE__ */ new Date()).toLocaleTimeString(localeId === "en" ? "en-US" : "zh-CN", { hour12: false }));
			};
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			const errorText = (info) => {
				if (info.code === "missing-key") return t("missingKey");
				if (info.code === "http-failed") return `${t("httpFailed", { status: info.status ?? "?" })}${info.message !== void 0 && info.message !== "" ? ` (${info.message})` : ""}`;
				return info.message ?? t("queryFailed");
			};
			const card = (name, info) => (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, name), info?.ok === true ? (0, react.createElement)("span", { style: ssid.badge(info.isAvailable === true ? 0 : 3) }, info.isAvailable === true ? t("available") : t("insufficient")) : null), info === void 0 ? (0, react.createElement)("div", { style: ssid.muted }, t("querying")) : !info.ok ? (0, react.createElement)("div", { style: ssid.muted }, errorText(info)) : (0, react.createElement)("div", { style: {
				fontSize: 22,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, `¥ ${Number(info.balanceInfos?.[0]?.totalBalance ?? "0").toFixed(2)}`));
			return (0, react.createElement)("div", { style: ssid.wrap }, card("DeepSeek", result.ds), card("Kimi K3", result.kimi), (0, react.createElement)("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 6,
				alignItems: "stretch"
			} }, (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					refresh();
				}
			}, t("refresh")), (0, react.createElement)("div", { style: {
				...ssid.muted,
				textAlign: "center"
			} }, updated === null ? t("notQueried") : t("lastUpdated", { t: updated }))));
		}
		/** 延迟提交的文本框：输入时不打扰，回车或失焦才提交。
		*
		*  用受控 + 本地草稿，而不是 defaultValue：后者只在挂载时取一次值，服务端回写
		*  之后（或别处改了同一份配置）输入框会停在旧值上。editing 期间不接受外部值，
		*  否则正在输入时被一次回写覆盖。 */
		function DraftInput(props) {
			const [draft, setDraft] = (0, react.useState)(props.value);
			const [editing, setEditing] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!editing) setDraft(props.value);
			}, [props.value, editing]);
			return (0, react.createElement)("input", {
				type: "text",
				value: draft,
				placeholder: props.placeholder,
				spellCheck: false,
				onFocus: () => {
					setEditing(true);
				},
				onChange: (e) => {
					setDraft(e.target.value);
				},
				onKeyDown: (e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				},
				onBlur: () => {
					setEditing(false);
					if (draft !== props.value) props.onCommit(draft);
				},
				style: {
					flex: "none",
					width: props.width,
					height: 34,
					padding: "0 12px",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 8,
					background: "var(--dsw-alias-bg-layer-3)",
					font: "inherit",
					fontSize: 13,
					color: "var(--dsw-alias-label-primary)"
				}
			});
		}
		function NotifySettings() {
			const t = useT();
			const [config, setConfig] = (0, react.useState)(null);
			const [msg, setMsg] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				api("notify.get").then((value) => {
					setConfig(value);
				}, () => {});
			}, []);
			/** 统一写入：乐观交给返回值（服务端回的是合并后的完整配置），失败回滚。
			*  patch 只带改动的字段——服务端按字段逐项合并，不认识的键原样保留。 */
			const save = (patch) => {
				if (config === null) return;
				const before = config;
				setMsg("");
				api("notify.set", patch).then((value) => {
					setConfig(value);
					setMsg(t("saved"));
				}, (error) => {
					setConfig(before);
					setMsg(t("saveFail") + (error instanceof Error ? error.message : String(error)));
				});
			};
			const toggle = (key) => {
				if (config === null) return;
				save({ [key]: !config[key] });
			};
			const switchBtn = (on, onClick, label) => (0, react.createElement)("button", {
				type: "button",
				"aria-label": label,
				onClick,
				style: {
					width: 40,
					height: 22,
					borderRadius: 11,
					border: "none",
					cursor: "pointer",
					padding: 0,
					flex: "none",
					background: on ? "var(--dsw-alias-state-business-primary, #4FC3F7)" : "var(--dsw-alias-border-l4, rgba(0,0,0,.16))",
					transition: "background .15s"
				}
			}, (0, react.createElement)("span", { style: {
				display: "block",
				width: 16,
				height: 16,
				borderRadius: 8,
				background: "#fff",
				marginLeft: on ? 22 : 2,
				transition: "margin-left .15s"
			} }));
			const row = (key, labelKey, descKey) => (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10
			} }, (0, react.createElement)("div", { style: {
				flex: 1,
				display: "flex",
				flexDirection: "column",
				gap: 4
			} }, (0, react.createElement)("span", { style: {
				fontSize: 13,
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, t(labelKey)), (0, react.createElement)("span", { style: {
				...ssid.muted,
				fontSize: 12
			} }, t(descKey))), switchBtn(config !== null && config[key], () => {
				toggle(key);
			}, t(labelKey))));
			/** 数字/文本输入行：回车或失焦才提交，与截图设置同一套手感。 */
			const inputRow = (opts) => (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10
			} }, (0, react.createElement)("div", { style: {
				flex: 1,
				display: "flex",
				flexDirection: "column",
				gap: 4
			} }, (0, react.createElement)("span", { style: {
				fontSize: 13,
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, t(opts.labelKey)), (0, react.createElement)("span", { style: {
				...ssid.muted,
				fontSize: 12
			} }, t(opts.descKey))), (0, react.createElement)(DraftInput, {
				value: opts.value,
				placeholder: opts.placeholder,
				width: opts.width ?? 200,
				onCommit: opts.commit
			})));
			if (config === null) return null;
			return (0, react.createElement)("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			} }, row("enabled", "notifyEnabled", "notifyEnabledDesc"), row("replyDone", "notifyReplyDone", "notifyReplyDoneDesc"), row("question", "notifyQuestion", "notifyQuestionDesc"), row("approval", "notifyApproval", "notifyApprovalDesc"), row("keepAwake", "keepAwakeTitle", "keepAwakeDesc"), inputRow({
				labelKey: "keepAwakeTailTitle",
				descKey: "keepAwakeTailDesc",
				value: String(config.keepAwakeTailMs),
				width: 140,
				commit: (raw) => {
					const ms = Number(raw.trim());
					if (!Number.isFinite(ms) || ms < 0) return;
					save({ keepAwakeTailMs: Math.round(ms) });
				}
			}), inputRow({
				labelKey: "maskTextTitle",
				descKey: "maskTextDesc",
				value: config.mask.text,
				width: 260,
				commit: (raw) => {
					if (raw.trim() !== "") save({ mask: { text: raw } });
				}
			}), inputRow({
				labelKey: "maskHotkeyTitle",
				descKey: "maskHotkeyDesc",
				value: config.mask.hotkey,
				placeholder: "Control+Alt+M",
				commit: (raw) => {
					const v = raw.trim();
					if (v !== "") save({ mask: { hotkey: v } });
				}
			}), inputRow({
				labelKey: "maskLookTitle",
				descKey: "maskLookDesc",
				value: `${String(config.mask.alpha)} / ${String(config.mask.blur)}`,
				placeholder: "0.12 / 10",
				width: 140,
				commit: (raw) => {
					const [alpha, blur] = raw.split("/").map((part) => Number(part.trim()));
					if (alpha === void 0 || blur === void 0) return;
					if (!Number.isFinite(alpha) || !Number.isFinite(blur)) return;
					save({ mask: {
						alpha,
						blur
					} });
				}
			}), inputRow({
				labelKey: "maskPasscodeTitle",
				descKey: "maskPasscodeDesc",
				value: config.mask.passcode,
				placeholder: "（留空 = 不设防）",
				width: 200,
				commit: (raw) => {
					save({ mask: { passcode: raw } });
				}
			}), msg === "" ? null : (0, react.createElement)("div", { style: {
				fontSize: 12,
				lineHeight: 1.5,
				paddingLeft: 2,
				color: msg.startsWith("✓") ? "var(--dsw-alias-state-success-primary, #4ade80)" : "var(--dsw-alias-state-error-primary, #f87171)"
			} }, msg));
		}
		/** 自绘确认弹窗（2026-08-22，替代原生 window.confirm，与插件中心同款样式；
		*  重启确认与「清空独立根」的二次确认共用，danger 时确认按钮红色）。 */
		function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger = false, onConfirm, onClose }) {
			return (0, react_dom.createPortal)((0, react.createElement)("div", { style: {
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,.55)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 9999
			} }, (0, react.createElement)("div", { style: {
				width: "min(420px, 92vw)",
				background: "var(--dsw-alias-bg-layer-3, #1a2333)",
				border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				borderRadius: 12,
				padding: 14,
				display: "flex",
				flexDirection: "column",
				gap: 10
			} }, (0, react.createElement)("div", { style: {
				fontSize: 13,
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, title), (0, react.createElement)("div", { style: {
				fontSize: 12,
				color: "var(--dsw-alias-label-secondary, #67748a)",
				lineHeight: 1.5
			} }, body), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8,
				justifyContent: "flex-end"
			} }, (0, react.createElement)("button", {
				type: "button",
				style: ssid.btn,
				onClick: onClose
			}, cancelLabel), (0, react.createElement)("button", {
				type: "button",
				style: danger ? {
					padding: "3px 12px",
					fontSize: 11.5,
					background: "var(--dsw-alias-state-business-critical, #f76f4f)",
					border: "none",
					borderRadius: 6,
					color: "#fff",
					cursor: "pointer",
					fontWeight: 600
				} : {
					padding: "3px 12px",
					fontSize: 11.5,
					border: "none",
					borderRadius: 6,
					cursor: "pointer",
					fontWeight: 600,
					background: "var(--dsw-alias-button-primary-fill)",
					color: "var(--dsw-alias-label-primary-foreground)"
				},
				onClick: onConfirm
			}, confirmLabel)))), document.body);
		}
		function SessionRootSettings() {
			const t = useT();
			const [info, setInfo] = (0, react.useState)(null);
			const [loadFailed, setLoadFailed] = (0, react.useState)(false);
			const [importing, setImporting] = (0, react.useState)(false);
			const [resultNotice, setResultNotice] = (0, react.useState)(null);
			const [restartAsk, setRestartAsk] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				api("sessionRoot.get").then((value) => {
					setInfo(value);
					setLoadFailed(false);
				}, () => {
					setLoadFailed(true);
				});
			}, []);
			const runRestartNow = () => {
				api("sessionRoot.restart").then((result) => {
					const r = result;
					if (r.code === "busy") setResultNotice(t("sessionRootRestartBusy", { n: r.activeSessions ?? 0 }));
					else if (r.ok === true) setResultNotice(t("sessionRootRestarting"));
				}).catch(() => setResultNotice(t("sessionRootRestartUnavailable")));
			};
			const toggle = async () => {
				if (info === null) return;
				const nextIsolated = !info.isolated;
				const previous = info;
				setInfo({
					...info,
					isolated: nextIsolated
				});
				setResultNotice(null);
				try {
					const saved = await api("sessionRoot.set", { isolated: nextIsolated });
					setInfo(saved);
					if (nextIsolated !== info.applied) {
						if (saved.restartable === true) setRestartAsk(true);
						else setResultNotice(t("sessionRootRestartUnavailable"));
					}
				} catch {
					setInfo(previous);
				}
			};
			const runImport = async () => {
				setImporting(true);
				try {
					const r = await api("sessionRoot.import");
					setResultNotice(r.errors.length > 0 ? t("sessionRootImportFailed", { n: r.errors.length }) : t("sessionRootImportDone", {
						copied: r.copied,
						skipped: r.skipped
					}));
					api("sessionRoot.get").then((value) => setInfo(value), () => {});
				} catch (error) {
					setResultNotice(t("sessionRootImportFailed", { n: 1 }));
				} finally {
					setImporting(false);
				}
			};
			const [clearAsk, setClearAsk] = (0, react.useState)(false);
			const runClear = async () => {
				setClearAsk(false);
				try {
					const r = await api("sessionRoot.clear");
					setResultNotice(t("sessionRootCleared", { n: r.cleared ?? 0 }));
					api("sessionRoot.get").then((value) => setInfo(value), () => {});
				} catch (error) {
					setResultNotice(t("sessionRootImportFailed", { n: 1 }));
				}
			};
			const pending = info !== null && info.isolated !== info.applied;
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			} }, (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10
			} }, (0, react.createElement)("div", { style: {
				flex: 1,
				display: "flex",
				flexDirection: "column",
				gap: 4
			} }, (0, react.createElement)("span", { style: {
				fontSize: 13,
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, t("sessionRootIsolated")), (0, react.createElement)("span", { style: {
				...ssid.muted,
				fontSize: 12
			} }, t("sessionRootIsolatedDesc"))), (0, react.createElement)("button", {
				type: "button",
				disabled: info === null,
				style: {
					width: 40,
					height: 22,
					borderRadius: 11,
					border: "none",
					cursor: info === null ? "not-allowed" : "pointer",
					padding: 0,
					opacity: info === null ? .5 : 1,
					background: info !== null && info.isolated ? "var(--dsw-alias-state-business-primary, #4FC3F7)" : "var(--dsw-alias-border-l4, rgba(0,0,0,.16))",
					transition: "background .15s"
				},
				onClick: () => {
					toggle();
				}
			}, (0, react.createElement)("span", { style: {
				display: "block",
				width: 16,
				height: 16,
				borderRadius: 8,
				background: "#fff",
				marginLeft: info !== null && info.isolated ? 22 : 2,
				transition: "margin-left .15s"
			} })))), info === null ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 12,
				padding: "0 2px",
				color: "#f76f4f"
			} }, t("sessionRootLoadFailed")) : (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 12,
				padding: "0 2px"
			} }, pending ? t("sessionRootPendingHint") : t("sessionRootApplied", { v: info.applied ? t("sessionRootAppliedOn") : t("sessionRootAppliedOff") })), info !== null ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 12,
				padding: "0 2px"
			} }, t("sessionRootCounts", {
				a: info.isolatedSessions ?? 0,
				b: info.sharedSessions ?? 0,
				c: info.importedSessions ?? 0
			})) : null, info?.isolated === true ? (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 4
			} }, (0, react.createElement)("span", { style: {
				fontSize: 13,
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, t("sessionRootImport")), (0, react.createElement)("span", { style: {
				...ssid.muted,
				fontSize: 12,
				lineHeight: 1.5
			} }, t("sessionRootImportDesc"))), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8,
				justifyContent: "flex-end",
				marginTop: 10
			} }, (0, react.createElement)("button", {
				type: "button",
				disabled: importing,
				style: {
					padding: "5px 14px",
					fontSize: 13,
					lineHeight: 1.5,
					borderRadius: 8,
					cursor: "pointer",
					fontWeight: 600,
					border: "none",
					background: "transparent",
					color: "var(--dsw-alias-label-primary, #d8e0ea)"
				},
				onClick: () => {
					runImport();
				}
			}, importing ? t("sessionRootImporting") : t("sessionRootImport")), (0, react.createElement)("button", {
				type: "button",
				style: {
					padding: "5px 14px",
					fontSize: 13,
					lineHeight: 1.5,
					borderRadius: 8,
					cursor: "pointer",
					border: "none",
					background: "transparent",
					color: "var(--dsw-alias-state-error-primary, #f76f4f)"
				},
				disabled: (info?.importedSessions ?? 0) === 0,
				onClick: () => {
					setClearAsk(true);
				}
			}, t("sessionRootClear"))), resultNotice !== null ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 12,
				marginTop: 8,
				color: ssid.accent
			} }, resultNotice) : null, info?.listNeedsRestart === true ? (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8,
				alignItems: "center",
				marginTop: 12,
				paddingTop: 10,
				borderTop: "1px solid var(--dsw-alias-border-l2, #1e2836)"
			} }, (0, react.createElement)("button", {
				type: "button",
				style: {
					padding: "5px 14px",
					fontSize: 13,
					lineHeight: 1.5,
					borderRadius: 8,
					cursor: "pointer",
					border: "none",
					background: "transparent",
					color: "var(--dsw-alias-label-primary, #d8e0ea)"
				},
				onClick: () => {
					setRestartAsk(true);
				}
			}, t("sessionRootRestartBtn")), (0, react.createElement)("span", { style: {
				...ssid.muted,
				fontSize: 11
			} }, t("sessionRootRefreshHint"))) : null) : null), restartAsk ? (0, react.createElement)(ConfirmDialog, {
				title: t("sessionRootRestartAskTitle"),
				body: t("sessionRootRestartAskBody"),
				confirmLabel: t("sessionRootRestartNow"),
				cancelLabel: t("sessionRootRestartLater"),
				onConfirm: () => {
					setRestartAsk(false);
					runRestartNow();
				},
				onClose: () => {
					setRestartAsk(false);
				}
			}) : null, clearAsk ? (0, react.createElement)(ConfirmDialog, {
				title: t("sessionRootClear"),
				body: t("sessionRootClearConfirm", { n: info?.importedSessions ?? 0 }),
				confirmLabel: t("sessionRootClear"),
				cancelLabel: t("sessionRootRestartLater"),
				danger: true,
				onConfirm: () => {
					runClear();
				},
				onClose: () => {
					setClearAsk(false);
				}
			}) : null);
		}
		function SsidAboutSection() {
			const t = useT();
			const [about, setAbout] = (0, react.useState)(null);
			const [update, setUpdate] = (0, react.useState)(null);
			const [checking, setChecking] = (0, react.useState)(false);
			const [notes, setNotes] = (0, react.useState)(null);
			const check = async () => {
				setChecking(true);
				try {
					setUpdate(await api("update-check"));
				} catch {
					setUpdate({
						currentVersion: about?.shellVersion ?? "0.0.0",
						code: "check-failed"
					});
				} finally {
					setChecking(false);
				}
				doUpdCheck();
			};
			const [upd, setUpd] = (0, react.useState)({ state: "idle" });
			const pollUpd = async () => {
				try {
					const next = await api("update.status");
					console.info("[ssid-update] status:", JSON.stringify(next));
					setUpd(next);
				} catch {}
			};
			const doUpdCheck = async () => {
				console.info("[ssid-update] manual check start");
				setUpd({ state: "checking" });
				try {
					const next = await api("update.check");
					console.info("[ssid-update] check result:", JSON.stringify(next));
					setUpd(next);
				} catch (error) {
					console.error("[ssid-update] check failed:", error);
					setUpd({
						state: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				}
			};
			const doUpdDownload = () => {
				console.info("[ssid-update] download start");
				setUpd({
					state: "downloading",
					percent: 0
				});
				api("update.download").catch((error) => {
					console.error("[ssid-update] download failed:", error);
					setUpd({
						state: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				});
				const timer = setInterval(() => {
					pollUpd();
				}, 1e3);
				setTimeout(() => {
					clearInterval(timer);
				}, 6e5);
			};
			const doUpdInstall = async () => {
				console.info("[ssid-update] install start");
				try {
					const result = await api("update.install");
					console.info("[ssid-update] install result:", JSON.stringify(result));
				} catch (error) {
					console.error("[ssid-update] install failed:", error);
				}
			};
			(0, react.useEffect)(() => {
				pollUpd();
			}, []);
			const updBlock = (() => {
				const state = String(upd.state ?? "idle");
				const pct = upd.percent !== void 0 && upd.percent !== null ? String(upd.percent) : "0";
				switch (state) {
					case "available": return (0, react.createElement)("div", { style: { marginTop: 6 } }, (0, react.createElement)("div", { style: {
						...ssid.text,
						color: ssid.accent
					} }, t("updAvailable", { v: String(upd.version ?? "?") })), (0, react.createElement)("button", {
						style: {
							...ssid.btn,
							marginTop: 6
						},
						onClick: () => {
							doUpdDownload();
						}
					}, t("updDownload")));
					case "checking": return (0, react.createElement)("div", { style: {
						...ssid.muted,
						marginTop: 6
					} }, t("updChecking"));
					case "downloading": return (0, react.createElement)("div", { style: {
						...ssid.muted,
						marginTop: 6
					} }, t("updDownloading", { p: pct }));
					case "downloaded": return (0, react.createElement)("div", { style: { marginTop: 6 } }, (0, react.createElement)("div", { style: {
						...ssid.text,
						color: ssid.accent
					} }, t("updDownloaded")), (0, react.createElement)("button", {
						style: {
							...ssid.btn,
							marginTop: 6
						},
						onClick: () => {
							doUpdInstall();
						}
					}, t("updInstall")));
					case "error": return (0, react.createElement)("div", { style: {
						...ssid.muted,
						marginTop: 6,
						color: "#f76f4f"
					} }, t("updError", { m: String(upd.message ?? "?") }));
					case "unavailable": return (0, react.createElement)("div", { style: {
						...ssid.muted,
						marginTop: 6
					} }, t("updUnavailable", { m: String(upd.message ?? "") }));
					default: return (0, react.createElement)("div", { style: {
						...ssid.muted,
						marginTop: 6
					} }, t("updSilent"));
				}
			})();
			(0, react.useEffect)(() => {
				api("about").then((value) => {
					console.log("[ssid-about] about loaded:", JSON.stringify(value));
					setAbout(value);
				}).catch((error) => {
					console.error("[ssid-about] about failed:", error instanceof Error ? error.message : String(error));
				});
				api("release-notes").then((value) => setNotes(value)).catch(() => setNotes(null));
			}, []);
			const latest = update?.latest ?? null;
			const newer = latest !== null && latest.tag !== "" && latest.tag !== `v${update?.currentVersion ?? ""}`;
			const descOf = (plugin) => localeId === "en" ? plugin.descriptionEn ?? plugin.descriptionZh ?? "" : plugin.descriptionZh ?? plugin.descriptionEn ?? "";
			return (0, react.createElement)("div", { style: {
				...ssid.wrap,
				maxWidth: 640,
				margin: "0 auto",
				width: "100%"
			} }, (0, react.createElement)("div", { style: { margin: "10px 2px 2px" } }, (0, react.createElement)("h3", { style: {
				margin: "0 0 4px",
				fontSize: 18,
				fontWeight: 600,
				lineHeight: "26px",
				color: "var(--dsw-alias-label-primary)"
			} }, t("about")), (0, react.createElement)("p", { style: {
				margin: 0,
				fontSize: 13,
				lineHeight: "20px",
				color: "var(--dsw-alias-label-tertiary)"
			} }, t("slogan"))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 12
			} }, (0, react.createElement)("div", { style: {
				flex: 1,
				minWidth: 0
			} }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("title"))), (0, react.createElement)("div", { style: {
				fontSize: 22,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, `v${about?.shellVersion ?? "…"}`)), (0, react.createElement)("a", {
				href: "https://github.com/Max-Null/seek-soul-in-darkness",
				target: "_blank",
				rel: "noopener noreferrer",
				style: {
					flex: "none",
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					fontSize: 12,
					lineHeight: "16px",
					color: "var(--dsw-alias-state-business-primary, #4f8ef7)",
					textDecoration: "none",
					border: "1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f8ef7) 35%, transparent)",
					borderRadius: 999,
					padding: "4px 11px"
				}
			}, (0, react.createElement)("span", { style: {
				fontSize: 13,
				lineHeight: 1
			} }, "⭐"), (0, react.createElement)("span", null, t("starMe"))), (0, react.createElement)("button", {
				style: {
					...ssid.btn,
					flex: "none",
					marginTop: 0
				},
				onClick: () => {
					check();
				},
				disabled: checking
			}, checking ? t("checking") : t("checkNow"))), latest === null ? update?.code === "api-failed" ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				marginTop: 8
			} }, t("apiFailed", { status: update.status ?? "?" })) : update?.code === "check-failed" ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				marginTop: 8
			} }, t("checkFailed")) : (0, react.createElement)("div", { style: {
				...ssid.muted,
				marginTop: 8
			} }, t("noRelease")) : newer ? (0, react.createElement)("div", { style: {
				...ssid.text,
				color: ssid.accent,
				marginTop: 8
			} }, t("newVersion", {
				name: latest.name,
				tag: latest.tag,
				date: latest.publishedAt.slice(0, 10)
			})) : (0, react.createElement)("div", { style: {
				...ssid.text,
				marginTop: 8
			} }, t("latestVersion", {
				name: latest.name,
				tag: latest.tag
			})), updBlock), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("notifyTitle"))), (0, react.createElement)(NotifySettings)), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("sessionRootTitle"))), (0, react.createElement)(SessionRootSettings)), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("changelog"))), notes === null || notes.version == null ? (0, react.createElement)("div", { style: ssid.muted }, t("changelogEmpty")) : (0, react.createElement)("div", null, (0, react.createElement)("div", { style: {
				...ssid.text,
				fontWeight: 600,
				marginBottom: 6
			} }, `${t("changelogCurrent")}：v${notes.version}${notes.date !== null ? ` · ${notes.date}` : ""}`), notes.sections.map((section) => (0, react.createElement)("div", {
				key: section.heading,
				style: { marginBottom: 8 }
			}, (0, react.createElement)("div", { style: {
				fontSize: 12,
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary, #d8e0ea)",
				marginBottom: 3
			} }, section.heading), (0, react.createElement)("ul", { style: {
				margin: 0,
				paddingLeft: 2,
				listStyle: "none"
			} }, section.items.map((item, index) => (0, react.createElement)("li", {
				key: index,
				style: {
					display: "flex",
					gap: 6,
					fontSize: 12,
					lineHeight: 1.7,
					color: "var(--dsw-alias-label-tertiary, #8a95a8)"
				}
			}, (0, react.createElement)("span", { style: {
				flex: "none",
				width: 6,
				height: 6,
				borderRadius: "50%",
				background: ssid.accent,
				marginTop: 7
			} }), (0, react.createElement)("span", null, item)))))), update !== null && (update.releases ?? []).length > 0 ? (0, react.createElement)("div", { style: {
				marginTop: 12,
				borderTop: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				paddingTop: 8
			} }, (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 11,
				marginBottom: 6
			} }, t("changelogOnline")), (update?.releases ?? []).map((release) => (0, react.createElement)("div", {
				key: release.tag,
				style: { marginBottom: 10 }
			}, (0, react.createElement)("div", { style: {
				...ssid.text,
				fontWeight: 600,
				fontSize: 12
			} }, `${release.name}（${release.tag}）· ${release.publishedAt.slice(0, 10)}`), (0, react.createElement)("pre", { style: {
				...ssid.muted,
				whiteSpace: "pre-wrap",
				margin: "4px 0 0",
				fontSize: 12
			} }, release.body)))) : null)), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("presetPlugins"))), (about?.plugins ?? []).length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, t("none")) : (about?.plugins ?? []).map((plugin) => (0, react.createElement)("div", {
				key: plugin.id,
				style: {
					padding: "5px 0",
					borderBottom: "1px solid var(--dsw-alias-border-l2, #1e2836)"
				}
			}, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "baseline",
				gap: 6
			} }, (0, react.createElement)("span", { style: {
				...ssid.text,
				fontWeight: 600,
				fontSize: 12
			} }, plugin.name), (0, react.createElement)("span", { style: {
				...ssid.muted,
				fontSize: 10.5
			} }, plugin.version !== void 0 ? `v${plugin.version}` : "")), descOf(plugin) !== "" ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 10.5,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				marginTop: 2
			} }, descOf(plugin)) : null))));
		}
		async function hostReadSeen() {
			try {
				const value = await api("changelogSeen.get");
				return typeof value?.version === "string" ? value.version : "";
			} catch {
				return "";
			}
		}
		function hostWriteSeen(version) {
			api("changelogSeen.set", { version }).catch(() => {});
		}
		function ChangelogGate() {
			const t = useT();
			const [data, setData] = (0, react.useState)(null);
			const [shellVersion, setShellVersion] = (0, react.useState)(null);
			const [show, setShow] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				const timer = setTimeout(() => {
					Promise.all([api("about"), api("release-notes")]).then(async ([aboutValue, notesValue]) => {
						const sv = aboutValue?.shellVersion ?? null;
						const parsed = notesValue;
						setData(parsed);
						setShellVersion(sv);
						if (parsed.version === null) return;
						if (sv !== null && parsed.version !== sv) return;
						if (await hostReadSeen() !== parsed.version) {
							hostWriteSeen(parsed.version);
							setShow(true);
						}
					}).catch(() => {});
				}, 2e3);
				return () => {
					clearTimeout(timer);
				};
			}, []);
			if (!show || data === null || data.version === null) return null;
			const close = () => {
				if (data.version !== null) hostWriteSeen(data.version);
				setShow(false);
			};
			return (0, react_dom.createPortal)((0, react.createElement)("div", { style: {
				position: "fixed",
				inset: 0,
				zIndex: 1e4,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0, 0, 0, 0.55)",
				fontFamily: "inherit"
			} }, (0, react.createElement)("div", { style: {
				width: 620,
				maxWidth: "92vw",
				maxHeight: "72vh",
				display: "flex",
				flexDirection: "column",
				background: "var(--dsw-alias-bg-layer-2, #161d2b)",
				border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				borderRadius: 14,
				boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
				overflow: "hidden"
			} }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "14px 18px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #1e2836)"
			} }, (0, react.createElement)("span", { style: { fontSize: 20 } }, "🎉"), (0, react.createElement)("span", { style: {
				fontSize: 16,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, t("modalTitle")), (0, react.createElement)("span", { style: {
				marginLeft: "auto",
				fontSize: 12,
				color: "var(--dsw-alias-label-tertiary, #8a95a8)"
			} }, `v${shellVersion ?? data.version}`)), (0, react.createElement)("div", { style: {
				flex: 1,
				overflowY: "auto",
				padding: "14px 18px 6px"
			} }, data.date !== null ? (0, react.createElement)("div", { style: {
				fontSize: 12,
				color: "var(--dsw-alias-label-tertiary, #8a95a8)",
				marginBottom: 10
			} }, data.date) : null, data.sections.map((section) => (0, react.createElement)("div", {
				key: section.heading,
				style: { marginBottom: 14 }
			}, (0, react.createElement)("h4", { style: {
				fontSize: 13,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)",
				margin: "0 0 6px"
			} }, section.heading), (0, react.createElement)("ul", { style: {
				margin: 0,
				paddingLeft: 2,
				listStyle: "none"
			} }, section.items.map((item, index) => (0, react.createElement)("li", {
				key: index,
				style: {
					display: "flex",
					gap: 8,
					fontSize: 13,
					lineHeight: 1.7,
					color: "var(--dsw-alias-label-secondary, #aab4c6)"
				}
			}, (0, react.createElement)("span", { style: {
				flex: "none",
				width: 6,
				height: 6,
				borderRadius: "50%",
				background: "#4f8ef7",
				marginTop: 7
			} }), (0, react.createElement)("span", null, item))))))), (0, react.createElement)("div", { style: {
				padding: "12px 18px",
				borderTop: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				textAlign: "right"
			} }, (0, react.createElement)("button", {
				style: {
					padding: "7px 24px",
					fontSize: 13,
					fontWeight: 600,
					border: 0,
					borderRadius: 8,
					background: "#4f8ef7",
					color: "#fff",
					cursor: "pointer",
					fontFamily: "inherit"
				},
				onClick: close
			}, t("modalGotIt"))))), document.body);
		}
		/** Plugin body: settings about section (unconditional) + sidebar tabs (optional peer). */
		function apply(ctx) {
			const face = ctx;
			const initial = (face.get?.("locale"))?.getLocale?.()?.active;
			if (typeof initial === "string") adoptLocale(initial);
			face.on?.("locale/change", (snap) => {
				adoptLocale(snap?.active);
			});
			ctx.effect(() => registerSettingsNavIcon(() => STRINGS[localeId].about));
			ctx.effect(() => {
				const host = document.createElement("div");
				document.body.appendChild(host);
				const root = (0, react_dom_client.createRoot)(host);
				root.render((0, react.createElement)(ChangelogGate));
				return () => {
					root.unmount();
					host.remove();
				};
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "ssid-about",
				order: 100,
				label: () => STRINGS[localeId].about,
				inject: () => ({})
			}, () => (0, react.createElement)(SsidAboutSection)));
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register({
				name: "sidebar.brand.mark",
				priority: -1
			}, ({ size, className }) => (0, react.createElement)(SsidBrandMark, {
				size,
				className
			})));
			ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register({
				name: "conversation.hero.brand.mark",
				priority: -1
			}, ({ size, className }) => (0, react.createElement)(SsidBrandMark, {
				size,
				className
			})));
			ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({
				name: "sidebar.brand.name",
				priority: -1
			}, () => (0, react.createElement)("span", { style: {
				fontSize: 13,
				fontWeight: 600
			} }, "思灵")));
			ctx.inject(["betterSidebar"], (sidebarCtx) => {
				const service = sidebarCtx.betterSidebar;
				if (service === void 0) return;
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:guardian",
					title: () => STRINGS[localeId].tabGuardian,
					icon: () => tabIcon("M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2", "#06b6d4"),
					order: 61,
					single: true,
					component: ({ visible }) => (0, react.createElement)(GuardianView, { visible })
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:habit",
					title: () => STRINGS[localeId].tabHabit,
					icon: () => tabIcon("m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14m-14 18-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3", "#f97316"),
					order: 62,
					single: true,
					component: ({ visible }) => (0, react.createElement)(HabitView, { visible })
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:balance",
					title: () => STRINGS[localeId].tabBalance,
					icon: () => tabIcon("M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4", "#22c55e"),
					order: 63,
					single: true,
					component: () => (0, react.createElement)(BalanceView)
				}));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map