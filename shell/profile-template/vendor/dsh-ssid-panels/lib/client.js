window.__ModuleLoader__.load({
	id: "@max-null/dsh-ssid-panels",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
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
		const STRINGS = {
			zh: {
				about: "关于 SSiD",
				tabMemory: "记忆",
				tabGuardian: "状态",
				tabHabit: "习惯",
				tabBalance: "余额",
				memorySearch: "搜索记忆…",
				empty: "黑暗中未见灵光",
				confirm: "确认",
				forget: "删除",
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
				checkUpdates: "检查更新",
				noRelease: "暂无发布版本",
				newVersion: "新版本可用：{name}（{tag}，{date}）",
				latestVersion: "已是最新：{name}（{tag}）",
				checking: "检查中…",
				checkNow: "立即检查",
				checkFailed: "更新检查失败",
				apiFailed: "检查失败（HTTP {status}）",
				changelog: "更新日志",
				none: "（无）",
				presetPlugins: "预制插件",
				tabNotify: "通知",
				notifyEnabled: "启用通知",
				notifyEnabledDesc: "窗口失焦（最小化/被遮挡）时以 Windows 通知提醒；聚焦时不打扰",
				notifyReplyDone: "会话完成",
				notifyReplyDoneDesc: "每轮会话完成时通知（含用时）",
				notifyQuestion: "提问",
				notifyQuestionDesc: "AI 向你提问、需要回复时通知",
				notifyApproval: "授权申请",
				notifyApprovalDesc: "工具请求授权、需要处理时通知"
			},
			en: {
				about: "About SSiD",
				tabMemory: "Memory",
				tabGuardian: "Status",
				tabHabit: "Habits",
				tabBalance: "Balance",
				memorySearch: "Search memory…",
				empty: "No spark in the dark",
				confirm: "Confirm",
				forget: "Forget",
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
				checkUpdates: "Check for updates",
				noRelease: "No published release",
				newVersion: "New version: {name} ({tag}, {date})",
				latestVersion: "Up to date: {name} ({tag})",
				checking: "Checking…",
				checkNow: "Check now",
				checkFailed: "Update check failed",
				apiFailed: "Check failed (HTTP {status})",
				changelog: "Changelog",
				none: "(none)",
				presetPlugins: "Bundled plugins",
				tabNotify: "Notify",
				notifyEnabled: "Enable notifications",
				notifyEnabledDesc: "Windows notifications when the window is unfocused (minimized/covered); silent while focused",
				notifyReplyDone: "Reply done",
				notifyReplyDoneDesc: "Notify when each turn completes (with duration)",
				notifyQuestion: "Questions",
				notifyQuestionDesc: "Notify when the AI asks you a question",
				notifyApproval: "Approvals",
				notifyApprovalDesc: "Notify when a tool requests approval"
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
				background: "var(--dsw-alias-bg-layer-1, #131a26)",
				border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				borderRadius: 10,
				padding: "10px 12px"
			},
			title: {
				fontSize: 12,
				fontWeight: 600,
				color: "var(--dsw-alias-label-secondary, #67748a)",
				marginBottom: 6,
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center"
			},
			text: {
				fontSize: 12.5,
				color: "var(--dsw-alias-label-primary, #d8e0ea)",
				lineHeight: 1.55
			},
			muted: {
				fontSize: 11,
				color: "var(--dsw-alias-label-secondary, #67748a)"
			},
			empty: {
				padding: "28px 12px",
				textAlign: "center",
				fontSize: 12.5,
				color: "var(--dsw-alias-label-secondary, #67748a)"
			},
			btn: {
				padding: "3px 12px",
				fontSize: 11.5,
				background: "none",
				border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
				borderRadius: 6,
				color: "var(--dsw-alias-label-primary, #d8e0ea)",
				cursor: "pointer"
			},
			badge: (level) => ({
				fontSize: 10.5,
				padding: "2px 8px",
				borderRadius: 10,
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
		function MemoryView() {
			const t = useT();
			const [records, setRecords] = (0, react.useState)([]);
			const [status, setStatus] = (0, react.useState)("auto");
			const [query, setQuery] = (0, react.useState)("");
			const reload = async () => {
				try {
					setRecords(await api("memory.list"));
				} catch {
					setRecords([]);
				}
			};
			(0, react.useEffect)(() => {
				reload();
			}, []);
			const filtered = records.filter((record) => record.status === status).filter((record) => query === "" || record.content.toLowerCase().includes(query.toLowerCase()));
			return (0, react.createElement)("div", { style: ssid.wrap }, (0, react.createElement)("input", {
				value: query,
				onChange: (event) => {
					setQuery(event.target.value);
				},
				placeholder: t("memorySearch"),
				style: {
					width: "100%",
					padding: "6px 10px",
					fontSize: 12.5,
					boxSizing: "border-box",
					background: "var(--dsw-alias-bg-layer-1, #0f141d)",
					border: "1px solid var(--dsw-alias-border-l2, #1e2836)",
					borderRadius: 8,
					color: "var(--dsw-alias-label-primary, #d8e0ea)",
					outline: "none"
				}
			}), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 4
			} }, [
				"auto",
				"suggested",
				"suggest"
			].map((label) => (0, react.createElement)("button", {
				key: label,
				onClick: () => {
					setStatus(label);
				},
				style: {
					flex: 1,
					...ssid.btn,
					...status === label ? {
						color: ssid.accent,
						borderColor: ssid.accent
					} : {}
				}
			}, label))), filtered.length === 0 ? (0, react.createElement)("div", { style: ssid.empty }, t("empty")) : filtered.map((record) => (0, react.createElement)("div", {
				key: record.id,
				style: ssid.card
			}, (0, react.createElement)("div", { style: ssid.text }, record.content), (0, react.createElement)("div", { style: {
				...ssid.muted,
				marginTop: 6
			} }, `${record.namespace} · ${record.status}`), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 6,
				marginTop: 8
			} }, record.status === "suggested" ? (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("memory.confirm", { id: record.id }).then(() => reload());
				}
			}, t("confirm")) : null, (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("memory.forget", { id: record.id }).then(() => reload());
				}
			}, t("forget"))))));
		}
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
			return (0, react.createElement)("div", { style: ssid.wrap }, pending.length === 0 ? (0, react.createElement)("div", { style: ssid.empty }, t("empty")) : pending.map((candidate) => (0, react.createElement)("div", {
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
		function NotifyView() {
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
				fontSize: 14,
				fontWeight: 600,
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
					background: config !== null && config[key] ? "var(--dsw-alias-state-business-primary, #4FC3F7)" : "var(--dsw-alias-bg-module-platform, rgba(128,148,168,.2))",
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
			return (0, react.createElement)("div", { style: ssid.wrap }, (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 12
			} }, t("notifyEnabledDesc"))), row("enabled", "notifyEnabled", "notifyEnabledDesc"), row("replyDone", "notifyReplyDone", "notifyReplyDoneDesc"), row("question", "notifyQuestion", "notifyQuestionDesc"), row("approval", "notifyApproval", "notifyApprovalDesc"));
		}
		function SsidAboutSection() {
			const t = useT();
			const [about, setAbout] = (0, react.useState)(null);
			const [update, setUpdate] = (0, react.useState)(null);
			const [checking, setChecking] = (0, react.useState)(false);
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
			};
			(0, react.useEffect)(() => {
				api("about").then((value) => {
					console.log("[ssid-about] about loaded:", JSON.stringify(value));
					setAbout(value);
				}).catch((error) => {
					console.error("[ssid-about] about failed:", error instanceof Error ? error.message : String(error));
				});
			}, []);
			const latest = update?.latest ?? null;
			const newer = latest !== null && latest.tag !== "" && latest.tag !== `v${update?.currentVersion ?? ""}`;
			const descOf = (plugin) => localeId === "en" ? plugin.descriptionEn ?? plugin.descriptionZh ?? "" : plugin.descriptionZh ?? plugin.descriptionEn ?? "";
			return (0, react.createElement)("div", { style: {
				...ssid.wrap,
				maxWidth: 640,
				margin: "0 auto",
				width: "100%"
			} }, (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("title"))), (0, react.createElement)("div", { style: {
				fontSize: 22,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, `v${about?.shellVersion ?? "…"}`), (0, react.createElement)("div", { style: ssid.muted }, t("slogan"))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("checkUpdates"))), latest === null ? update?.code === "api-failed" ? (0, react.createElement)("div", { style: ssid.muted }, t("apiFailed", { status: update.status ?? "?" })) : update?.code === "check-failed" ? (0, react.createElement)("div", { style: ssid.muted }, t("checkFailed")) : (0, react.createElement)("div", { style: ssid.muted }, t("noRelease")) : newer ? (0, react.createElement)("div", { style: {
				...ssid.text,
				color: ssid.accent
			} }, t("newVersion", {
				name: latest.name,
				tag: latest.tag,
				date: latest.publishedAt.slice(0, 10)
			})) : (0, react.createElement)("div", { style: ssid.text }, t("latestVersion", {
				name: latest.name,
				tag: latest.tag
			})), (0, react.createElement)("button", {
				style: {
					...ssid.btn,
					marginTop: 8
				},
				onClick: () => {
					check();
				},
				disabled: checking
			}, checking ? t("checking") : t("checkNow"))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("changelog"))), (update?.releases ?? []).length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, t("none")) : (update?.releases ?? []).map((release) => (0, react.createElement)("div", {
				key: release.tag,
				style: { marginBottom: 10 }
			}, (0, react.createElement)("div", { style: {
				...ssid.text,
				fontWeight: 600
			} }, `${release.name}（${release.tag}）· ${release.publishedAt.slice(0, 10)}`), (0, react.createElement)("pre", { style: {
				...ssid.muted,
				whiteSpace: "pre-wrap",
				margin: "4px 0 0",
				fontSize: 11.5
			} }, release.body)))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, t("presetPlugins"))), (about?.plugins ?? []).length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, t("none")) : (about?.plugins ?? []).map((plugin) => (0, react.createElement)("div", {
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
		/** Plugin body: settings about section (unconditional) + sidebar tabs (optional peer). */
		function apply(ctx) {
			const face = ctx;
			const initial = (face.get?.("locale"))?.getLocale?.()?.active;
			if (typeof initial === "string") adoptLocale(initial);
			face.on?.("locale/change", (snap) => {
				adoptLocale(snap?.active);
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "ssid-about",
				order: 100,
				label: () => STRINGS[localeId].about,
				inject: () => ({})
			}, () => (0, react.createElement)(SsidAboutSection)));
			ctx.inject(["betterSidebar"], (sidebarCtx) => {
				const service = sidebarCtx.betterSidebar;
				if (service === void 0) return;
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:memory",
					title: () => STRINGS[localeId].tabMemory,
					icon: tabIcon("M12 7v14M16 12h2M16 8h2M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3zM6 12h2M6 8h2"),
					order: 60,
					single: true,
					component: () => (0, react.createElement)(MemoryView)
				}));
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
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:notify",
					title: () => STRINGS[localeId].tabNotify,
					icon: tabIcon("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"),
					order: 64,
					single: true,
					component: () => (0, react.createElement)(NotifyView)
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