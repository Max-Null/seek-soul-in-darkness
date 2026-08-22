window.__ModuleLoader__.load({
	id: "@max-null/dsh-ssid-screenshot",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/api.ts
		/** POST one method and unwrap the envelope. */
		async function api(method, payload) {
			const res = await fetch(`/ssid/api/screenshot/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload ?? {})
			});
			let body;
			try {
				body = await res.json();
			} catch {
				throw new Error(`screenshot API ${method}: HTTP ${res.status}`);
			}
			if (body.ok !== true || body.value === void 0) throw new Error(body.error?.message ?? `screenshot API ${method}: HTTP ${res.status}`);
			return body.value;
		}
		function screenshotGet() {
			return api("get");
		}
		function screenshotSet(payload) {
			return api("set", payload);
		}
		function screenshotTrigger() {
			return api("trigger");
		}
		//#endregion
		//#region src/client/ScreenshotButton.tsx
		/**
		* ScreenshotButton: the composer's right-tool-seat entry (conversation.input.right
		* — the official "before the send button" seat, same seat as dsh-draft-polish).
		* Clicked → POST /ssid/api/screenshot/trigger → 壳层开全屏框选浮层；截图完成后
		* 由本插件 client 半（index.ts）投递到输入框。无 SSiD 壳（手动 dsh web）时
		* 503 → toast 提示。
		*
		* 视觉顺序：本按钮显示在润色按钮左侧（CSS order 规则，见下方 STYLES：
		* model seat/ContextMeter = 0，本 wrap = 1，润色 wrap = 2，发送 = 3）。
		*/
		/** Product copy (zh/en via the document lang, same pattern as dsh-draft-polish). */
		const STRINGS$1 = {
			zh: {
				button: "截图",
				tooltip: "框选屏幕区域，截图直接进入消息框（快捷键见设置）",
				shellOnly: "截图仅在思灵桌面壳（SSiD）可用",
				failed: "截图触发失败："
			},
			en: {
				button: "Capture",
				tooltip: "Box-select a screen region; the image lands in the composer",
				shellOnly: "Capture is only available inside the SSiD desktop shell",
				failed: "Capture failed: "
			}
		};
		function langStrings$1() {
			const lang = typeof document !== "undefined" ? (document.documentElement.lang || "zh").toLowerCase() : "zh";
			return STRINGS$1[lang.startsWith("zh") ? "zh" : "en"];
		}
		/** Button + toast styles (theme-variable driven, same posture as polish button). */
		const CSS$1 = [
			".ssd3-wrap{position:relative;display:grid;place-items:center}",
			".ssd3-wrap{order:1}",
			".ssd3-btn{background:0 0;border:none;border-radius:999px;width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;place-items:center;display:grid;flex:none;transition:background-color .15s,color .15s;padding:0}",
			".ssd3-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}",
			".ssd3-btn:disabled{opacity:.5;cursor:default}",
			".ssd3-toast{position:fixed;bottom:80px;left:50%;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font-size:13px;line-height:20px;pointer-events:none;z-index:9999;white-space:nowrap;transform:translate(-50%,0);animation:ssd3-fade .15s ease-out;max-width:70vw;overflow:hidden;text-overflow:ellipsis}",
			".ssd3-toast[data-error=true] span{color:var(--dsw-alias-state-error-primary)}",
			"@keyframes ssd3-fade{from{opacity:0;transform:translate(-50%,4px)}to{opacity:1;transform:translate(-50%,0)}}"
		].join("");
		const STYLE_ID$1 = "@max-null/dsh-ssid-screenshot/button.css";
		if (typeof document !== "undefined") {
			document.querySelector(`style[data-plugin-css="${STYLE_ID$1}"]`)?.remove();
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ssid-screenshot";
			tag.dataset.pluginCss = STYLE_ID$1;
			tag.textContent = CSS$1;
			document.head.appendChild(tag);
		}
		/** Lucide `camera` glyph (currentColor). */
		function IconCamera() {
			return (0, react.createElement)("svg", {
				viewBox: "0 0 16 16",
				width: "15",
				height: "15",
				fill: "none",
				"aria-hidden": true
			}, (0, react.createElement)("path", {
				d: "M5.1 3.2a.5.5 0 0 1 .4-.2h5a.5.5 0 0 1 .4.2l.9 1.2h2.2a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.4a1 1 0 0 1 1-1h2.2l.9-1.2Zm-.06.8-.75 1H2v7h12v-7h-2.29l-.75-1H5.04ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z",
				fill: "currentColor"
			}));
		}
		/** 截图按钮：触发壳层框选浮层（无草稿依赖，任何会话状态可点）。 */
		function ScreenshotButton() {
			const t = langStrings$1();
			const [busy, setBusy] = (0, react.useState)(false);
			const [toast, setToast] = (0, react.useState)(null);
			const toastTimer = (0, react.useRef)(0);
			const showToast = (0, react.useCallback)((text, error) => {
				setToast({
					text,
					error
				});
				window.clearTimeout(toastTimer.current);
				toastTimer.current = window.setTimeout(() => {
					setToast(null);
				}, 2500);
			}, []);
			(0, react.useEffect)(() => () => window.clearTimeout(toastTimer.current), []);
			const handleClick = (0, react.useCallback)(() => {
				if (busy) return;
				setBusy(true);
				screenshotTrigger().catch((error) => {
					const message = error instanceof Error ? error.message : String(error);
					showToast(message.includes("shell") ? t.shellOnly : t.failed + message, true);
				}).finally(() => {
					setBusy(false);
				});
			}, [
				busy,
				showToast,
				t
			]);
			return (0, react.createElement)("div", { className: "ssd3-wrap" }, [(0, react.createElement)("button", {
				key: "btn",
				type: "button",
				className: "ssd3-btn",
				disabled: busy,
				"aria-label": t.button,
				title: t.tooltip,
				onClick: handleClick
			}, IconCamera()), toast !== null ? (0, react.createElement)("div", {
				key: "toast",
				className: "ssd3-toast"
			}, (0, react.createElement)("span", { "data-error": toast.error ? "true" : "false" }, toast.text)) : null]);
		}
		//#endregion
		//#region src/client/ScreenshotSettings.tsx
		/**
		* ScreenshotSettings: two General-settings rows (settings.general.item —
		* the additive seat for a single setting that needs no page of its own).
		*
		* Rows (each fetched/saved through /ssid/api/screenshot/*):
		*  - screenshot-hide: 截图时是否隐藏思灵窗口（checkbox，切换即保存）
		*  - screenshot-hotkey: 全局快捷键（input，回车/失焦即保存，实时重注册）
		*
		* The General row contract: the section supplies no props at all — copy,
		* current value, and the write path are all the registrant's own.
		*/
		/** Product copy (zh/en via the document lang). */
		const STRINGS = {
			zh: {
				hideTitle: "截图时隐藏思灵窗口",
				hideDesc: "开：冻结帧不含思灵自身（引用其他应用）；关：冻结帧包含思灵（可框选对话内容）",
				hotkeyTitle: "截图全局快捷键",
				hotkeyDesc: "Electron accelerator 语法，如 Control+Shift+A；保存后立即生效",
				placeholder: "Control+Shift+A",
				saved: "✓ 已保存",
				saveFail: "保存失败：",
				hotkeyInvalid: "格式无效，例：Control+Shift+A",
				loadFail: "加载失败"
			},
			en: {
				hideTitle: "Hide the SSiD window while capturing",
				hideDesc: "On: frozen frame excludes SSiD (reference other apps); Off: includes SSiD (can box-select conversation content)",
				hotkeyTitle: "Capture global shortcut",
				hotkeyDesc: "Electron accelerator syntax, e.g. Control+Shift+A; takes effect immediately",
				placeholder: "Control+Shift+A",
				saved: "✓ Saved",
				saveFail: "Save failed: ",
				hotkeyInvalid: "Invalid format, e.g. Control+Shift+A",
				loadFail: "Failed to load"
			}
		};
		function langStrings() {
			const lang = typeof document !== "undefined" ? (document.documentElement.lang || "zh").toLowerCase() : "zh";
			return STRINGS[lang.startsWith("zh") ? "zh" : "en"];
		}
		/** Row styles — the DSH General-settings row language (title/desc left, control right). */
		const CSS = [
			".ssd3r{display:flex;align-items:center;gap:16px;padding:12px 0}",
			".ssd3r+.ssd3r{border-top:1px solid var(--dsw-alias-border-l2)}",
			".ssd3r-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
			".ssd3r-title{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}",
			".ssd3r-desc{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			".ssd3r-check{flex:none;width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}",
			".ssd3r-input{flex:none;width:200px;height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}",
			".ssd3r-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}",
			".ssd3r-input::placeholder{color:var(--dsw-alias-label-tertiary)}",
			".ssd3r-msg{font-size:12px;line-height:1.5}",
			".ssd3r-msg[data-ok=true]{color:var(--dsw-alias-state-success-primary)}",
			".ssd3r-msg[data-ok=false]{color:var(--dsw-alias-state-error-primary)}"
		].join("");
		const STYLE_ID = "@max-null/dsh-ssid-screenshot/settings.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ssid-screenshot";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		const HOTKEY_PATTERN = /^[A-Za-z0-9+]+$/;
		/** One General-row skeleton: title/desc left, control right, transient msg below the title. */
		function Row(props) {
			return (0, react.createElement)("div", { className: "ssd3r" }, [(0, react.createElement)("div", {
				key: "text",
				className: "ssd3r-text"
			}, [
				(0, react.createElement)("div", {
					key: "title",
					className: "ssd3r-title"
				}, props.title),
				(0, react.createElement)("div", {
					key: "desc",
					className: "ssd3r-desc"
				}, props.desc),
				props.msg !== null ? (0, react.createElement)("div", {
					key: "msg",
					className: "ssd3r-msg",
					"data-ok": props.msg.ok ? "true" : "false"
				}, props.msg.text) : null
			]), props.control]);
		}
		/** 隐藏窗口开关行：切换即保存。 */
		function ScreenshotHideRow() {
			const t = langStrings();
			const [value, setValue] = (0, react.useState)(null);
			const [msg, setMsg] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let cancelled = false;
				screenshotGet().then((config) => {
					if (!cancelled) setValue(config.hideWindow);
				}).catch(() => {
					if (!cancelled) setMsg({
						ok: false,
						text: t.loadFail
					});
				});
				return () => {
					cancelled = true;
				};
			}, [t]);
			const toggle = (0, react.useCallback)(() => {
				const next = !value;
				setValue(next);
				setMsg(null);
				screenshotSet({ hideWindow: next }).then(() => setMsg({
					ok: true,
					text: t.saved
				})).catch((error) => {
					setValue(!next);
					setMsg({
						ok: false,
						text: t.saveFail + (error instanceof Error ? error.message : String(error))
					});
				});
			}, [value, t]);
			return (0, react.createElement)(Row, {
				title: t.hideTitle,
				desc: t.hideDesc,
				msg,
				control: (0, react.createElement)("input", {
					className: "ssd3r-check",
					type: "checkbox",
					checked: value === true,
					disabled: value === null,
					"aria-label": t.hideTitle,
					onChange: toggle
				})
			});
		}
		/** 全局快捷键行：回车/失焦即保存（延时 300ms 防抖）。 */
		function ScreenshotHotkeyRow() {
			const t = langStrings();
			const [value, setValue] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [msg, setMsg] = (0, react.useState)(null);
			const timer = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				let cancelled = false;
				screenshotGet().then((config) => {
					if (!cancelled) setValue(config.hotkey);
				}).catch(() => {
					if (!cancelled) setMsg({
						ok: false,
						text: t.loadFail
					});
				});
				return () => {
					cancelled = true;
				};
			}, [t]);
			(0, react.useEffect)(() => () => window.clearTimeout(timer.current), []);
			const save = (0, react.useCallback)((raw) => {
				window.clearTimeout(timer.current);
				const hotkey = raw.trim();
				if (hotkey === "") return;
				if (!HOTKEY_PATTERN.test(hotkey)) {
					setMsg({
						ok: false,
						text: t.hotkeyInvalid
					});
					return;
				}
				setSaving(true);
				setMsg(null);
				screenshotSet({ hotkey }).then(() => {
					setMsg({
						ok: true,
						text: t.saved
					});
				}).catch((error) => {
					setMsg({
						ok: false,
						text: t.saveFail + (error instanceof Error ? error.message : String(error))
					});
				}).finally(() => {
					setSaving(false);
				});
			}, [t]);
			const scheduleSave = (0, react.useCallback)((raw) => {
				window.clearTimeout(timer.current);
				timer.current = window.setTimeout(() => save(raw), 300);
			}, [save]);
			return (0, react.createElement)(Row, {
				title: t.hotkeyTitle,
				desc: t.hotkeyDesc,
				msg,
				control: (0, react.createElement)("input", {
					className: "ssd3r-input",
					type: "text",
					value,
					placeholder: t.placeholder,
					spellCheck: false,
					disabled: saving,
					onKeyDown: (e) => {
						if (e.key === "Enter") save(value);
					},
					onChange: (e) => {
						setValue(e.target.value);
						setMsg(null);
					},
					onBlur: () => scheduleSave(value)
				})
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots"];
		/** 事件名（与 shell/main.mjs 派发一致）。 */
		const SCREENSHOT_EVENT = "ssid:screenshot";
		/** 事件 detail 的最低校验：必须是 image data URL。 */
		function isImageDataUrl(value) {
			return typeof value === "string" && value.startsWith("data:image/");
		}
		/** data URL → Blob（浏览器自带 fetch 解码，无需手动 base64 解析）。 */
		async function dataUrlToBlob(dataUrl) {
			return (await fetch(dataUrl)).blob();
		}
		/** 一次与真实图片拖拽等价的落放：PNG File 经官方 drop 通道进草稿。 */
		async function deliverToComposer(dataUrl) {
			const blob = await dataUrlToBlob(dataUrl);
			const file = new File([blob], "ssid-screenshot.png", { type: "image/png" });
			const transfer = new DataTransfer();
			transfer.items.add(file);
			console.info(`[ssid-screenshot] drop ${file.size} bytes, types=${transfer.types.join(",")}`);
			document.dispatchEvent(new DragEvent("drop", {
				bubbles: true,
				cancelable: true,
				dataTransfer: transfer
			}));
			console.info("[ssid-screenshot] drop dispatched");
		}
		/** Plugin body: register the delivery listener, the composer capture button,
		*  and the two General-settings rows. */
		function apply(ctx) {
			if (window.__dshSsidScreenshotInstalled === true) return;
			window.__dshSsidScreenshotInstalled = true;
			window.addEventListener(SCREENSHOT_EVENT, (event) => {
				const detail = event.detail;
				if (!isImageDataUrl(detail)) return;
				console.info(`[ssid-screenshot] event received (${detail.length} chars)`);
				deliverToComposer(detail).catch((error) => {
					console.warn(`[ssid-screenshot] delivery failed: ${error instanceof Error ? error.message : String(error)}`);
				});
			});
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "ssid-screenshot",
				order: -10
			}, ScreenshotButton));
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "ssid-screenshot-hide",
				order: 25
			}, ScreenshotHideRow));
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "ssid-screenshot-hotkey",
				order: 26
			}, ScreenshotHotkeyRow));
		}
		//#endregion
		exports.ScreenshotButton = ScreenshotButton;
		exports.ScreenshotHideRow = ScreenshotHideRow;
		exports.ScreenshotHotkeyRow = ScreenshotHotkeyRow;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map