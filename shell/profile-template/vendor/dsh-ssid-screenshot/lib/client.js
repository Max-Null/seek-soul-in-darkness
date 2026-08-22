window.__ModuleLoader__.load({
	id: "@max-null/dsh-ssid-screenshot",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
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
		//#region src/client/CaptureOverlay.tsx
		/**
		* CaptureOverlay: 纯 DSH（浏览器模式）的全屏截图遮罩。
		*
		* 与壳层浮层（shell/screenshot.html）同一套交互：左键拖拽框选 → 双击/回车
		* 进入标注（红框强调）→ 回车/「完成」交付；右键/Esc 逐级回退（撤当前框 →
		* 撤已画框 → 回框选 → 退出）。
		*
		* 坐标口径：**全部交互状态存「帧物理坐标」**（拖拽时经 wrap 显示尺寸实时
		* 换算），渲染时再换算回显示像素绘制——同一套数据既驱动选区 CSS 也驱动
		* 最终 canvas 合成，避免两套坐标漂移。
		*
		* 通过 createPortal 挂到 document.body（由 ScreenshotButton 渲染）。
		*/
		const CSS$2 = [
			".ssd3ov{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.98);display:flex;align-items:center;justify-content:center;cursor:crosshair;user-select:none}",
			".ssd3ov-wrap{position:relative;display:flex;align-items:center;justify-content:center}",
			".ssd3ov-frame{display:block;pointer-events:none}",
			".ssd3ov-dim{position:absolute;inset:0;background:rgba(0,0,0,.42);pointer-events:none}",
			".ssd3ov-sel{position:absolute;border:1px solid #4FC3F7;background:rgba(79,195,247,.08);box-shadow:0 0 0 100000px rgba(0,0,0,.42);pointer-events:none;display:none}",
			".ssd3ov-sel::before,.ssd3ov-sel::after{content:\"\";position:absolute;width:14px;height:14px;border-color:#4FC3F7;border-style:solid}",
			".ssd3ov-sel::before{left:-1px;top:-1px;border-width:3px 0 0 3px}",
			".ssd3ov-sel::after{right:-1px;bottom:-1px;border-width:0 3px 3px 0}",
			".ssd3ov-size{position:absolute;right:6px;bottom:6px;padding:2px 8px;border-radius:4px;background:rgba(10,14,20,.85);color:#E1F5FE;font:12px/1.6 \"Microsoft YaHei UI\",\"PingFang SC\",\"Segoe UI\",sans-serif;pointer-events:none;display:none}",
			".ssd3ov-tip{position:fixed;top:24px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:18px;background:rgba(10,14,20,.78);color:#E1F5FE;font:13px/1.6 \"Microsoft YaHei UI\",\"PingFang SC\",\"Segoe UI\",sans-serif;pointer-events:none;white-space:nowrap;z-index:1}",
			".ssd3ov-tip em{font-style:normal;color:#4FC3F7}",
			".ssd3ov-tip em.red{color:#FF5B4D}",
			".ssd3ov-panel{position:fixed;right:20px;top:20px;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(10,14,20,.82);z-index:1}",
			".ssd3ov-btn{padding:5px 12px;border:none;border-radius:14px;background:rgba(255,255,255,.12);color:#E1F5FE;font:13px/1.6 \"Microsoft YaHei UI\",\"PingFang SC\",\"Segoe UI\",sans-serif;cursor:pointer}",
			".ssd3ov-btn:hover{background:rgba(255,255,255,.2)}",
			".ssd3ov-btn-done{padding:5px 16px;background:#2E6BE6;color:#fff}",
			".ssd3ov-btn-done:hover{background:#3B78F5}"
		].join("\n");
		const STYLE_ID$2 = "@max-null/dsh-ssid-screenshot/overlay.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${STYLE_ID$2}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ssid-screenshot";
			tag.dataset.pluginCss = STYLE_ID$2;
			tag.textContent = CSS$2;
			document.head.appendChild(tag);
		}
		function norm(x1, y1, x2, y2) {
			return {
				x: Math.min(x1, x2),
				y: Math.min(y1, y2),
				w: Math.abs(x2 - x1),
				h: Math.abs(y2 - y1)
			};
		}
		function loadImage(src) {
			return new Promise((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => reject(/* @__PURE__ */ new Error("frame decode failed"));
				image.src = src;
			});
		}
		/** 视口内容适配尺寸（≤96vw/≤94vh 等比缩放，contains）。 */
		function fitSize(w, h) {
			const availW = window.innerWidth * .96;
			const availH = window.innerHeight * .94;
			const scale = Math.min(availW / w, availH / h, 1);
			return {
				w: Math.max(1, Math.round(w * scale)),
				h: Math.max(1, Math.round(h * scale))
			};
		}
		/** 浏览器截图遮罩（框选 + 标注 + 交付）。 */
		function CaptureOverlay(props) {
			const { dataUrl, width, height, onDone, onCancel } = props;
			const wrapRef = (0, react.useRef)(null);
			const annoCanvasRef = (0, react.useRef)(null);
			const annoOrigin = (0, react.useRef)(null);
			const [phase, setPhase] = (0, react.useState)("select");
			/** 帧的显示尺寸（select 用整屏帧、annotate 用裁剪图，各自计算）。 */
			const [showSize, setShowSize] = (0, react.useState)(null);
			const [cropUrl, setCropUrl] = (0, react.useState)(null);
			const [selPhys, setSelPhys] = (0, react.useState)(null);
			const [dragStart, setDragStart] = (0, react.useState)(null);
			const [annoRects, setAnnoRects] = (0, react.useState)([]);
			const [annoDraft, setAnnoDraft] = (0, react.useState)(null);
			const live = (0, react.useRef)({
				phase,
				selPhys,
				dragStart,
				annoRects,
				annoDraft,
				cropUrl,
				showSize
			});
			live.current = {
				phase,
				selPhys,
				dragStart,
				annoRects,
				annoDraft,
				cropUrl,
				showSize
			};
			/** 显示坐标 → 帧物理坐标。 */
			const toPhys = (0, react.useCallback)((clientX, clientY) => {
				const wrap = wrapRef.current;
				if (wrap === null) return null;
				const r = wrap.getBoundingClientRect();
				if (r.width === 0 || r.height === 0) return null;
				return {
					x: (clientX - r.left) / r.width * width,
					y: (clientY - r.top) / r.height * height
				};
			}, [width, height]);
			const cropAndEnterAnnotate = (0, react.useCallback)(async () => {
				const s = live.current;
				if (s.selPhys === null || s.selPhys.w < 2 || s.selPhys.h < 2) return;
				const image = await loadImage(dataUrl);
				const canvas = document.createElement("canvas");
				canvas.width = s.selPhys.w;
				canvas.height = s.selPhys.h;
				canvas.getContext("2d").drawImage(image, s.selPhys.x, s.selPhys.y, s.selPhys.w, s.selPhys.h, 0, 0, s.selPhys.w, s.selPhys.h);
				setAnnoRects([]);
				setAnnoDraft(null);
				setCropUrl(canvas.toDataURL("image/png"));
				setShowSize(fitSize(canvas.width, canvas.height));
				setPhase("annotate");
			}, [dataUrl]);
			const finish = (0, react.useCallback)(async () => {
				const s = live.current;
				if (s.cropUrl === null) return;
				const image = await loadImage(s.cropUrl);
				const canvas = document.createElement("canvas");
				canvas.width = image.naturalWidth;
				canvas.height = image.naturalHeight;
				const ctx = canvas.getContext("2d");
				ctx.drawImage(image, 0, 0);
				ctx.strokeStyle = "#FF3B30";
				ctx.lineWidth = 3;
				ctx.fillStyle = "rgba(255, 59, 48, .12)";
				for (const r of s.annoRects) {
					ctx.strokeRect(r.x, r.y, r.w, r.h);
					ctx.fillRect(r.x, r.y, r.w, r.h);
				}
				onDone(canvas.toDataURL("image/png"));
			}, [onDone]);
			const cancelOrBack = (0, react.useCallback)(() => {
				const s = live.current;
				if (s.phase === "annotate") {
					if (s.annoDraft !== null) setAnnoDraft(null);
					else if (s.annoRects.length > 0) setAnnoRects(s.annoRects.slice(0, -1));
					else {
						setPhase("select");
						setCropUrl(null);
						setAnnoRects([]);
						setAnnoDraft(null);
						setSelPhys(null);
						setShowSize(null);
					}
					return;
				}
				onCancel();
			}, [onCancel]);
			(0, react.useEffect)(() => {
				const onMouseDown = (event) => {
					if (event.button === 2) {
						event.preventDefault();
						cancelOrBack();
						return;
					}
					if (event.button !== 0) return;
					if (live.current.phase === "annotate") {
						const p = toPhys(event.clientX, event.clientY);
						if (p === null) return;
						setAnnoDraft({
							x: p.x,
							y: p.y,
							w: 0,
							h: 0
						});
						annoOrigin.current = p;
						return;
					}
					setDragStart({
						x: event.clientX,
						y: event.clientY
					});
					setSelPhys(null);
				};
				const onMouseMove = (event) => {
					const s = live.current;
					if (s.phase === "annotate") {
						if (s.annoDraft !== null) {
							const p = toPhys(event.clientX, event.clientY);
							if (p === null || annoOrigin.current === null) return;
							setAnnoDraft(norm(annoOrigin.current.x, annoOrigin.current.y, p.x, p.y));
						}
						return;
					}
					if (s.dragStart !== null) {
						const p = toPhys(event.clientX, event.clientY);
						if (p === null) return;
						const origin = toPhys(s.dragStart.x, s.dragStart.y);
						if (origin === null) return;
						setSelPhys(norm(origin.x, origin.y, p.x, p.y));
					}
				};
				const onMouseUp = () => {
					const s = live.current;
					if (s.phase === "annotate") {
						if (s.annoDraft !== null && s.annoDraft.w >= 4 && s.annoDraft.h >= 4) setAnnoRects([...s.annoRects, s.annoDraft]);
						setAnnoDraft(null);
						annoOrigin.current = null;
						return;
					}
					if (s.selPhys !== null && s.selPhys.w < 4 && s.selPhys.h < 4) setSelPhys(null);
					setDragStart(null);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") cancelOrBack();
					else if (event.key === "Enter") {
						if (live.current.phase === "annotate") finish().catch(() => {});
						else cropAndEnterAnnotate().catch(() => {});
					}
				};
				const onDblClick = () => {
					if (live.current.phase === "annotate") finish().catch(() => {});
					else cropAndEnterAnnotate().catch(() => {});
				};
				const onContextMenu = (event) => event.preventDefault();
				document.addEventListener("mousedown", onMouseDown);
				document.addEventListener("mousemove", onMouseMove);
				document.addEventListener("mouseup", onMouseUp);
				document.addEventListener("dblclick", onDblClick);
				document.addEventListener("contextmenu", onContextMenu);
				window.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("mousedown", onMouseDown);
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseUp);
					document.removeEventListener("dblclick", onDblClick);
					document.removeEventListener("contextmenu", onContextMenu);
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [
				cancelOrBack,
				cropAndEnterAnnotate,
				finish,
				toPhys
			]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				if (phase === "select") loadImage(dataUrl).then((image) => {
					if (!cancelled) setShowSize(fitSize(image.naturalWidth, image.naturalHeight));
				}).catch(() => {});
				else if (phase === "annotate" && cropUrl !== null) loadImage(cropUrl).then((image) => {
					if (!cancelled) setShowSize(fitSize(image.naturalWidth, image.naturalHeight));
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [
				phase,
				cropUrl,
				dataUrl
			]);
			(0, react.useEffect)(() => {
				const canvas = annoCanvasRef.current;
				if (canvas === null || phase !== "annotate" || showSize === null) return;
				const ctx = canvas.getContext("2d");
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				const scaleX = showSize.w / width;
				const scaleY = showSize.h / height;
				const draw = (r) => {
					const x = r.x * scaleX;
					const y = r.y * scaleY;
					const w = r.w * scaleX;
					const h = r.h * scaleY;
					ctx.strokeStyle = "#FF5B4D";
					ctx.lineWidth = 2.5;
					ctx.strokeRect(x, y, w, h);
					ctx.fillStyle = "rgba(255, 91, 77, .12)";
					ctx.fillRect(x, y, w, h);
				};
				for (const r of annoRects) draw(r);
				if (annoDraft !== null) draw(annoDraft);
			}, [
				phase,
				showSize,
				width,
				height,
				annoRects,
				annoDraft
			]);
			if (showSize === null) return (0, react_dom.createPortal)((0, react.createElement)("div", { className: "ssd3ov" }), document.body);
			const s = live.current;
			const scaleX = showSize.w / width;
			const scaleY = showSize.h / height;
			const selDisplay = s.selPhys === null ? null : {
				x: s.selPhys.x * scaleX,
				y: s.selPhys.y * scaleY,
				w: s.selPhys.w * scaleX,
				h: s.selPhys.h * scaleY
			};
			const tip = phase === "select" ? (0, react.createElement)("div", { className: "ssd3ov-tip" }, (0, react.createElement)("em", null, "拖拽 "), "选择截图区域 · ", (0, react.createElement)("em", null, "双击 / 回车 "), "确认 · ", (0, react.createElement)("em", null, "右键"), " 取消") : (0, react.createElement)("div", { className: "ssd3ov-tip" }, "拖拽画", (0, react.createElement)("em", { className: "red" }, "红框 "), "强调 · ", (0, react.createElement)("em", null, "回车 "), "完成 · ", (0, react.createElement)("em", null, "右键"), " 撤销框 / 重选");
			const panel = phase === "annotate" ? (0, react.createElement)("div", { className: "ssd3ov-panel" }, [
				(0, react.createElement)("button", {
					key: "undo",
					type: "button",
					className: "ssd3ov-btn",
					onClick: () => setAnnoRects(annoRects.slice(0, -1))
				}, "撤销"),
				(0, react.createElement)("button", {
					key: "redo",
					type: "button",
					className: "ssd3ov-btn",
					onClick: cancelOrBack
				}, "重选"),
				(0, react.createElement)("button", {
					key: "done",
					type: "button",
					className: "ssd3ov-btn ssd3ov-btn-done",
					onClick: () => {
						finish().catch(() => {});
					}
				}, "完成")
			]) : null;
			return (0, react_dom.createPortal)((0, react.createElement)("div", { className: "ssd3ov" }, [
				(0, react.createElement)("div", {
					key: "wrap",
					className: "ssd3ov-wrap",
					ref: wrapRef,
					style: {
						width: showSize.w,
						height: showSize.h
					}
				}, [
					(0, react.createElement)("img", {
						key: "frame",
						className: "ssd3ov-frame",
						src: phase === "select" ? dataUrl : cropUrl ?? void 0,
						style: {
							width: showSize.w,
							height: showSize.h
						},
						alt: ""
					}),
					phase === "select" ? (0, react.createElement)("div", {
						key: "dim",
						className: "ssd3ov-dim"
					}) : null,
					phase === "select" && selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1 ? (0, react.createElement)("div", {
						key: "sel",
						className: "ssd3ov-sel",
						style: {
							display: "block",
							left: selDisplay.x,
							top: selDisplay.y,
							width: selDisplay.w,
							height: selDisplay.h
						}
					}) : null,
					phase === "select" && selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1 ? (0, react.createElement)("div", {
						key: "size",
						className: "ssd3ov-size",
						style: { display: "block" }
					}, `${Math.round(s.selPhys.w)} × ${Math.round(s.selPhys.h)}`) : null,
					phase === "annotate" ? (0, react.createElement)("canvas", {
						key: "anno",
						ref: annoCanvasRef,
						width: showSize.w,
						height: showSize.h,
						className: "ssd3ov-anno",
						style: {
							position: "absolute",
							inset: 0,
							pointerEvents: "none"
						}
					}) : null
				]),
				tip,
				panel
			]), document.body);
		}
		//#endregion
		//#region src/client/delivery.ts
		/**
		* 截图投递：把裁剪结果 PNG 经 DSH 官方 composer 图片 intake 填入输入框草稿。
		* 合成 drop（new DataTransfer + DragEvent）与真实拖拽等价：量/类型/大小限制、
		* 草稿预览、删除、发送序列化全部走官方路径（ui-attachment 的 document 级
		* drop 处理器，只认 `dataTransfer.types.includes('Files')`）。
		*/
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
		//#endregion
		//#region src/client/ScreenshotButton.tsx
		/**
		* ScreenshotButton: the composer's right-tool-seat entry (conversation.input.right
		* — the same seat as dsh-draft-polish), dual-engine:
		*
		*  - SSiD 壳内（引擎 A）：POST /ssid/api/screenshot/trigger → 壳开全屏浮层
		*    （多显示器、快捷键、隐藏窗口、像素级帧）。
		*  - 纯 DSH / 无壳（引擎 B）：点击手势内同步调用 navigator.mediaDevices
		*    .getDisplayMedia（系统选择器选一个屏幕）→ 抓一帧 → 页面内全屏遮罩
		*    CaptureOverlay（框选 + 红框标注）→ 官方 drop intake 投递。
		*
		* 探测（shellAvailable，来自 host 的 /ssid/api/screenshot/get）在组件挂载时
		* 拉取并缓存——点击必须同步决定引擎（getDisplayMedia 要求用户手势调用栈），
		* 不能先 await 再选。
		*/
		/** Product copy (zh/en via the document lang, same pattern as dsh-draft-polish). */
		const STRINGS$1 = {
			zh: {
				button: "截图",
				tooltip: "框选屏幕区域，截图直接进入消息框（支持标注；思灵壳内可用快捷键）",
				triggerFailed: "截图触发失败：",
				captureUnsupported: "当前浏览器不支持屏幕捕获",
				captureRejected: "未获得屏幕共享权限",
				captureFailed: "截图失败："
			},
			en: {
				button: "Capture",
				tooltip: "Box-select a screen region; the image lands in the composer (annotation supported)",
				triggerFailed: "Capture failed: ",
				captureUnsupported: "Screen capture is not supported by this browser",
				captureRejected: "Screen share permission was not granted",
				captureFailed: "Capture failed: "
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
		/** 壳探测缓存（模块级，避免重复探测；失败后回调为 false 即切换引擎 B）。 */
		let shellProbe = null;
		/** 截图按钮：双引擎截图（壳浮层 或 浏览器 getDisplayMedia + 页面遮罩）。 */
		function ScreenshotButton() {
			const t = langStrings$1();
			const [busy, setBusy] = (0, react.useState)(false);
			const [toast, setToast] = (0, react.useState)(null);
			const [overlay, setOverlay] = (0, react.useState)(null);
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
			(0, react.useEffect)(() => {
				let cancelled = false;
				screenshotGet().then((config) => {
					if (!cancelled) shellProbe = config.shellAvailable;
				}).catch(() => {
					if (!cancelled) shellProbe = false;
				});
				return () => {
					cancelled = true;
				};
			}, []);
			/** 引擎 A：壳浮层（异步触发；失败切换引擎 B 缓存）。 */
			const triggerShell = (0, react.useCallback)(() => {
				screenshotTrigger().then(() => {
					setBusy(false);
				}).catch((error) => {
					shellProbe = false;
					setBusy(false);
					const message = error instanceof Error ? error.message : String(error);
					showToast(t.triggerFailed + message, true);
				});
			}, [showToast, t]);
			/** 引擎 B：浏览器屏幕捕获（必须在用户手势内同步调用 getDisplayMedia）。 */
			const beginBrowserCapture = (0, react.useCallback)(() => {
				const media = navigator.mediaDevices;
				if (media === void 0 || typeof media.getDisplayMedia !== "function") {
					showToast(t.captureUnsupported, true);
					return;
				}
				setBusy(true);
				(async () => {
					const stream = await media.getDisplayMedia({
						video: { displaySurface: "screen" },
						audio: false
					}).catch(() => null);
					if (stream === null) {
						setBusy(false);
						showToast(t.captureRejected, true);
						return;
					}
					try {
						const settings = stream.getVideoTracks()[0].getSettings();
						const video = document.createElement("video");
						video.srcObject = stream;
						video.muted = true;
						await video.play();
						const w = Math.max(1, Math.round(settings.width ?? video.videoWidth ?? 0));
						const h = Math.max(1, Math.round(settings.height ?? video.videoHeight ?? 0));
						const canvas = document.createElement("canvas");
						canvas.width = w;
						canvas.height = h;
						canvas.getContext("2d").drawImage(video, 0, 0, w, h);
						const dataUrl = canvas.toDataURL("image/png");
						for (const item of stream.getTracks()) item.stop();
						video.srcObject = null;
						setBusy(false);
						setOverlay({
							dataUrl,
							width: w,
							height: h
						});
					} catch (error) {
						for (const item of stream.getTracks()) item.stop();
						setBusy(false);
						showToast(t.captureFailed + (error instanceof Error ? error.message : String(error)), true);
					}
				})();
			}, [showToast, t]);
			const handleClick = (0, react.useCallback)(() => {
				if (busy || overlay !== null) return;
				setBusy(true);
				if (shellProbe === true) triggerShell();
				else beginBrowserCapture();
			}, [
				busy,
				overlay,
				triggerShell,
				beginBrowserCapture
			]);
			const overlayDone = (0, react.useCallback)((dataUrl) => {
				setOverlay(null);
				deliverToComposer(dataUrl).catch((error) => {
					console.warn(`[ssid-screenshot] delivery failed: ${error instanceof Error ? error.message : String(error)}`);
				});
			}, []);
			const overlayCancel = (0, react.useCallback)(() => {
				setOverlay(null);
			}, []);
			return (0, react.createElement)("div", { className: "ssd3-wrap" }, [
				(0, react.createElement)("button", {
					key: "btn",
					type: "button",
					className: "ssd3-btn",
					disabled: busy || overlay !== null,
					"aria-label": t.button,
					title: t.tooltip,
					onClick: handleClick
				}, IconCamera()),
				toast !== null ? (0, react.createElement)("div", {
					key: "toast",
					className: "ssd3-toast"
				}, (0, react.createElement)("span", { "data-error": toast.error ? "true" : "false" }, toast.text)) : null,
				overlay !== null ? (0, react.createElement)(CaptureOverlay, {
					key: "overlay",
					dataUrl: overlay.dataUrl,
					width: overlay.width,
					height: overlay.height,
					onDone: overlayDone,
					onCancel: overlayCancel
				}) : null
			]);
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
		/** 隐藏窗口开关行：切换即保存；非壳环境（无此能力）整行隐藏。 */
		function ScreenshotHideRow() {
			const t = langStrings();
			const [value, setValue] = (0, react.useState)(null);
			const [msg, setMsg] = (0, react.useState)(null);
			const [hidden, setHidden] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let cancelled = false;
				screenshotGet().then((config) => {
					if (cancelled) return;
					if (!config.shellAvailable) {
						setHidden(true);
						return;
					}
					setValue(config.hideWindow);
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
			if (hidden) return null;
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
		/** 全局快捷键行：回车/失焦即保存（延时 300ms 防抖）；非壳环境整行隐藏。 */
		function ScreenshotHotkeyRow() {
			const t = langStrings();
			const [value, setValue] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [msg, setMsg] = (0, react.useState)(null);
			const [hidden, setHidden] = (0, react.useState)(false);
			const timer = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				let cancelled = false;
				screenshotGet().then((config) => {
					if (cancelled) return;
					if (!config.shellAvailable) {
						setHidden(true);
						return;
					}
					setValue(config.hotkey);
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
			if (hidden) return null;
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