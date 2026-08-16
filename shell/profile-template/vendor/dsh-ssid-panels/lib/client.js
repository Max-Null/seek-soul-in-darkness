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
		*/
		const inject = ["slots"];
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
				placeholder: "搜索记忆…",
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
			}, label))), filtered.length === 0 ? (0, react.createElement)("div", { style: ssid.empty }, "黑暗中未见灵光") : filtered.map((record) => (0, react.createElement)("div", {
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
			}, "确认") : null, (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("memory.forget", { id: record.id }).then(() => reload());
				}
			}, "删除")))));
		}
		/** 状态面板：Guardian 触发线快照（1s 轮询，可见时）。 */
		function GuardianView(props) {
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
			const label = level === 0 ? "安静" : `${level} 级`;
			return (0, react.createElement)("div", { style: ssid.wrap }, (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, "断言计数"), (0, react.createElement)("span", { style: ssid.badge(level) }, label)), (0, react.createElement)("div", { style: {
				fontSize: 22,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, String(count))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, "编辑审查队列"), queue.length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, "无待审查项") : queue.map((item, index) => (0, react.createElement)("div", {
				key: index,
				style: {
					...ssid.text,
					fontSize: 11.5,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, `${item.turn !== void 0 ? `第 ${item.turn} 轮 · ` : ""}${item.filePath ?? "(无路径)"}`))));
		}
		function HabitView(props) {
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
			return (0, react.createElement)("div", { style: ssid.wrap }, pending.length === 0 ? (0, react.createElement)("div", { style: ssid.empty }, "黑暗中未见灵光") : pending.map((candidate) => (0, react.createElement)("div", {
				key: candidate.id,
				style: ssid.card
			}, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, "候选习惯"), (0, react.createElement)("span", { style: ssid.badge(candidate.confidence === "high" ? 1 : candidate.confidence === "medium" ? 2 : 3) }, candidate.confidence)), (0, react.createElement)("div", { style: ssid.text }, candidate.habit), (0, react.createElement)("div", { style: {
				...ssid.muted,
				marginTop: 4
			} }, `证据 ${candidate.evidenceCount} 条`), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 6,
				marginTop: 8
			} }, (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("habit.confirm", { id: candidate.id }).then(() => reload());
				}
			}, "确认（写入记忆）"), (0, react.createElement)("button", {
				style: ssid.btn,
				onClick: () => {
					api("habit.discard", { id: candidate.id }).then(() => reload());
				}
			}, "丢弃")))));
		}
		function BalanceView() {
			const [result, setResult] = (0, react.useState)({});
			const [updated, setUpdated] = (0, react.useState)(null);
			const refresh = async () => {
				const [ds, kimi] = await Promise.all([api("balance.deepseek").then((value) => value).catch(() => ({
					ok: false,
					message: "查询异常"
				})), api("balance.kimi").then((value) => value).catch(() => ({
					ok: false,
					message: "查询异常"
				}))]);
				setResult({
					ds,
					kimi
				});
				setUpdated((/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false }));
			};
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			const card = (name, info) => (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, name), info?.ok === true ? (0, react.createElement)("span", { style: ssid.badge(info.isAvailable === true ? 0 : 3) }, info.isAvailable === true ? "可用" : "余额不足") : null), info === void 0 ? (0, react.createElement)("div", { style: ssid.muted }, "查询中…") : !info.ok ? (0, react.createElement)("div", { style: ssid.muted }, info.message ?? "查询失败") : (0, react.createElement)("div", { style: {
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
			}, "刷新"), (0, react.createElement)("div", { style: {
				...ssid.muted,
				textAlign: "center"
			} }, updated === null ? "尚未查询" : `上次更新 ${updated}`)));
		}
		function SsidAboutSection() {
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
						message: "更新检查失败"
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
			return (0, react.createElement)("div", { style: {
				...ssid.wrap,
				maxWidth: 640,
				margin: "0 auto",
				width: "100%"
			} }, (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, "思灵 (SSiD)")), (0, react.createElement)("div", { style: {
				fontSize: 22,
				fontWeight: 700,
				color: "var(--dsw-alias-label-primary, #d8e0ea)"
			} }, `v${about?.shellVersion ?? "…"}`), (0, react.createElement)("div", { style: ssid.muted }, "于黑暗中，探寻灵魂。")), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, "检查更新")), latest === null ? update?.message !== void 0 ? (0, react.createElement)("div", { style: ssid.muted }, update.message) : (0, react.createElement)("div", { style: ssid.muted }, "暂无发布版本") : newer ? (0, react.createElement)("div", { style: {
				...ssid.text,
				color: ssid.accent
			} }, `新版本可用：${latest.name}（${latest.tag}，${latest.publishedAt.slice(0, 10)}）`) : (0, react.createElement)("div", { style: ssid.text }, `已是最新：${latest.name}（${latest.tag}）`), (0, react.createElement)("button", {
				style: {
					...ssid.btn,
					marginTop: 8
				},
				onClick: () => {
					check();
				},
				disabled: checking
			}, checking ? "检查中…" : "立即检查")), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, "更新日志")), (update?.releases ?? []).length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, "暂无发布版本（点上方「立即检查」拉取）") : (update?.releases ?? []).map((release) => (0, react.createElement)("div", {
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
			} }, release.body)))), (0, react.createElement)("div", { style: ssid.card }, (0, react.createElement)("div", { style: ssid.title }, (0, react.createElement)("span", null, "预制插件")), (about?.plugins ?? []).length === 0 ? (0, react.createElement)("div", { style: ssid.muted }, "（无）") : (about?.plugins ?? []).map((plugin) => (0, react.createElement)("div", {
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
			} }, plugin.version !== void 0 ? `v${plugin.version}` : "")), plugin.description !== void 0 && plugin.description !== "" ? (0, react.createElement)("div", { style: {
				...ssid.muted,
				fontSize: 10.5,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				marginTop: 2
			} }, plugin.description) : null))));
		}
		/** Plugin body: settings about section (unconditional) + sidebar tabs (optional peer). */
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "ssid-about",
				order: 100,
				label: () => "关于 SSiD",
				inject: () => ({})
			}, () => (0, react.createElement)(SsidAboutSection)));
			ctx.inject(["betterSidebar"], (sidebarCtx) => {
				const service = sidebarCtx.betterSidebar;
				if (service === void 0) return;
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:memory",
					title: () => "记忆",
					icon: tabIcon("M12 7v14M16 12h2M16 8h2M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3zM6 12h2M6 8h2"),
					order: 60,
					single: true,
					component: () => (0, react.createElement)(MemoryView)
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:guardian",
					title: () => "状态",
					icon: tabIcon("M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"),
					order: 61,
					single: true,
					component: ({ visible }) => (0, react.createElement)(GuardianView, { visible })
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:habit",
					title: () => "习惯",
					icon: tabIcon("m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14m-14 18-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"),
					order: 62,
					single: true,
					component: ({ visible }) => (0, react.createElement)(HabitView, { visible })
				}));
				sidebarCtx.effect(() => service.registerTab({
					id: "@max-null/dsh-ssid-panels:balance",
					title: () => "余额",
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