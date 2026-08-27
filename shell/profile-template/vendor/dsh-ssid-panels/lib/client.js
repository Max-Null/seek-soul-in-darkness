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
		function tabIcon(path) {
			return (0, react.createElement)("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
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
		function NotifySettings() {
			const t = useT();
			const [config, setConfig] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				api("notify.get").then((value) => {
					setConfig(value);
				}, () => {});
			}, []);
			const toggle = async (key) => {
				if (config === null) return;
				const next = {
					...config,
					[key]: !config[key]
				};
				setConfig(next);
				api("notify.set", next).then((value) => {
					setConfig(value);
				}, () => {
					setConfig(config);
				});
			};
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
			} }, t(descKey))), (0, react.createElement)("button", {
				type: "button",
				style: {
					width: 40,
					height: 22,
					borderRadius: 11,
					border: "none",
					cursor: "pointer",
					padding: 0,
					background: config !== null && config[key] ? "var(--dsw-alias-state-business-primary, #4FC3F7)" : "var(--dsw-alias-border-l4, rgba(0,0,0,.16))",
					transition: "background .15s"
				},
				onClick: () => {
					toggle(key);
				}
			}, (0, react.createElement)("span", { style: {
				display: "block",
				width: 16,
				height: 16,
				borderRadius: 8,
				background: "#fff",
				marginLeft: config !== null && config[key] ? 22 : 2,
				transition: "margin-left .15s"
			} }))));
			return (0, react.createElement)("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			} }, row("enabled", "notifyEnabled", "notifyEnabledDesc"), row("replyDone", "notifyReplyDone", "notifyReplyDoneDesc"), row("question", "notifyQuestion", "notifyQuestionDesc"), row("approval", "notifyApproval", "notifyApprovalDesc"));
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
					icon: tabIcon("M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"),
					order: 61,
					single: true,
					component: ({ visible }) => (0, react.createElement)(GuardianView, { visible })
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:habit",
					title: () => STRINGS[localeId].tabHabit,
					icon: tabIcon("m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14m-14 18-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"),
					order: 62,
					single: true,
					component: ({ visible }) => (0, react.createElement)(HabitView, { visible })
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:balance",
					title: () => STRINGS[localeId].tabBalance,
					icon: tabIcon("M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"),
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