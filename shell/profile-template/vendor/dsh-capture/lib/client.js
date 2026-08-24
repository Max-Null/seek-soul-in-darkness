window.__ModuleLoader__.load({
	id: "@max-null/dsh-capture",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		* CaptureOverlay: 纯 DSH（浏览器模式）的页面截图遮罩。
		*
		* 微信式单阶段交互（与壳层浮层 screenshot.html 同一套）：
		*   左键拖拽框选 → 选区定格（工具条出现）→ 同一全屏画面上任意位置拖拽画
		*   红框强调（合成时按选区裁剪）→ 回车/「完成」一次确认交付；
		*   右键/Esc 逐级回退（画框中 → 撤框 → 重选 → 退出）。
		*
		* 坐标口径：全部交互状态存「帧物理坐标」（拖拽时经 wrap 显示尺寸实时换算），
		* 渲染时换算回显示像素绘制；最终合成：裁剪选区 + 红框 clip 叠加。
		*/
		/** 画标注色板（默认红；可见性按背景自动对比，白/黄/绿常驻）。 */
		const ANNO_COLORS = [
			"#FF5B4D",
			"#FF9F43",
			"#FFD93D",
			"#3ED598",
			"#4FC3F7",
			"#7C6BFF",
			"#FF5CA8",
			"#FFFFFF"
		];
		const COLOR_NAMES = [
			"红",
			"橙",
			"黄",
			"绿",
			"青",
			"紫",
			"品红",
			"白"
		];
		/** '#RRGGBB' → 'rgba(r,g,b,a)'。 */
		function hexToRgba(hex, alpha) {
			const n = parseInt(hex.slice(1), 16);
			return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
		}
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
			".ssd3ov-toolbar{position:absolute;display:none;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;background:rgba(26,32,42,.94);box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:2}",
			".ssd3ov-tool{display:grid;place-items:center;width:30px;height:30px;border:none;border-radius:7px;background:transparent;color:#C7D3E3;cursor:pointer}",
			".ssd3ov-tool:hover{background:rgba(255,255,255,.12);color:#fff}",
			".ssd3ov-tool-active{background:#2E6BE6;color:#fff}",
			".ssd3ov-tool-active:hover{background:#2E6BE6;color:#fff}",
			".ssd3ov-tool-text{width:auto;padding:0 12px;font:13px/1.6 \"Microsoft YaHei UI\",\"PingFang SC\",\"Segoe UI\",sans-serif}",
			".ssd3ov-sep{width:1px;height:20px;background:rgba(255,255,255,.18)}",
			".ssd3ov-done{padding:5px 16px;border:none;border-radius:14px;background:#2E6BE6;color:#fff;font:13px/1.6 \"Microsoft YaHei UI\",\"PingFang SC\",\"Segoe UI\",sans-serif;cursor:pointer}",
			".ssd3ov-done:hover{background:#3B78F5}",
			".ssd3ov-swatch{width:16px;height:16px;flex:none;border:none;border-radius:50%;cursor:pointer;padding:0;box-shadow:0 0 0 2px rgba(255,255,255,0)}",
			".ssd3ov-swatch.on{box-shadow:0 0 0 2px rgba(255,255,255,.85)}",
			".ssd3ov-text-input{position:absolute;border:1px solid #4FC3F7;background:rgba(10,14,20,.82);color:#fff;font:15px/1.4 \"Microsoft YaHei UI\",\"PingFang SC\",\"Segoe UI\",sans-serif;padding:2px 6px;border-radius:4px;outline:none;min-width:40px;z-index:3}",
			".ssd3ov-text-input::placeholder{color:rgba(255,255,255,.45)}"
		].join("\n");
		const STYLE_ID$3 = "@max-null/dsh-capture/overlay.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${STYLE_ID$3}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-capture";
			tag.dataset.pluginCss = STYLE_ID$3;
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
		/** 红框与选区的交集（无交集返回 null——红框不允许超出蓝框选区）。 */
		function clampToSel(r, sel) {
			const x1 = Math.max(r.x, sel.x);
			const y1 = Math.max(r.y, sel.y);
			const x2 = Math.min(r.x + r.w, sel.x + sel.w);
			const y2 = Math.min(r.y + r.h, sel.y + sel.h);
			if (x2 <= x1 || y2 <= y1) return null;
			return {
				x: x1,
				y: y1,
				w: x2 - x1,
				h: y2 - y1
			};
		}
		/** 把点吸附进选区（画框起点在选区外时贴到就近边界）。 */
		function clampPoint(p, sel) {
			return {
				x: Math.min(Math.max(p.x, sel.x), sel.x + sel.w),
				y: Math.min(Math.max(p.y, sel.y), sel.y + sel.h)
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
		function fitSize(w, h) {
			const availW = window.innerWidth * .96;
			const availH = window.innerHeight * .94;
			const scale = Math.min(availW / w, availH / h, 1);
			return {
				w: Math.max(1, Math.round(w * scale)),
				h: Math.max(1, Math.round(h * scale))
			};
		}
		const ICON_BOX = "M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm1.2.8v7.4c0 .17.13.3.3.3h7.4c.17 0 .3-.13.3-.3V4.3c0-.17-.13-.3-.3-.3H3.5c-.17 0-.3.13-.3.3Z";
		const ICON_UNDO = "M6.7 3.2 3.2 6.7l3.5 3.5M3.6 6.7h6.1a3.1 3.1 0 0 1 0 6.2H8.3";
		/** 箭头：主线段 + 两翼（指向右上）。 */
		const ICON_ARROW = "M13.2 2.8 4.9 11.1M13.2 2.8v4.6M13.2 2.8H8.6";
		function icon(iconPath, color, flip = false) {
			return (0, react.createElement)("svg", {
				viewBox: "0 0 16 16",
				width: "15",
				height: "15",
				fill: "none",
				"aria-hidden": true,
				style: flip ? { transform: "scaleX(-1)" } : void 0
			}, (0, react.createElement)("path", {
				d: iconPath,
				stroke: color === "none" ? "none" : "currentColor",
				fill: color === "none" ? "none" : color,
				strokeWidth: "1.4",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}));
		}
		/** 浏览器截图遮罩：框选 + 单阶段红框标注 + 交付（immediate=整图编辑模式）。 */
		function CaptureOverlay(props) {
			const { dataUrl, width, height, immediate = false, onDone, onCancel } = props;
			const wrapRef = (0, react.useRef)(null);
			const annoRef = (0, react.useRef)(null);
			const [phase, setPhase] = (0, react.useState)(immediate ? "tool" : "select");
			const [showSize, setShowSize] = (0, react.useState)(null);
			const [sel, setSel] = (0, react.useState)(immediate ? {
				x: 0,
				y: 0,
				w: width,
				h: height
			} : null);
			const [annoRects, setAnnoRects] = (0, react.useState)([]);
			const [annoDraft, setAnnoDraft] = (0, react.useState)(null);
			const [toolKind, setToolKind] = (0, react.useState)("rect");
			const [annoColor, setAnnoColor] = (0, react.useState)(ANNO_COLORS[0]);
			/** 文字工具进行中的输入（物理锚点 + 草稿值）；提交后并入 annoRects。 */
			const [textEdit, setTextEdit] = (0, react.useState)(null);
			const textEditRef = (0, react.useRef)(textEdit);
			textEditRef.current = textEdit;
			const live = (0, react.useRef)({
				phase,
				sel,
				annoRects,
				annoDraft,
				showSize,
				toolKind,
				annoColor
			});
			live.current = {
				phase,
				sel,
				annoRects,
				annoDraft,
				showSize,
				toolKind,
				annoColor
			};
			const dragStart = (0, react.useRef)(null);
			const annoStart = (0, react.useRef)(null);
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
			/** 合成箭头（含头翼）的共用绘制：坐标为画布内坐标。 */
			const drawArrowPath = (ctx, x1, y1, x2, y2) => {
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				const angle = Math.atan2(y2 - y1, x2 - x1);
				const head = 12;
				ctx.moveTo(x2, y2);
				ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
				ctx.moveTo(x2, y2);
				ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
				ctx.stroke();
			};
			/** 合成文字标注：标注色文字 + 细黑描边（无背景块；描边保证任意底色可读）。 */
			const drawTextAnno = (ctx, an, ox, oy) => {
				const x = an.x - ox;
				const y = an.y - oy;
				ctx.font = "16px \"Microsoft YaHei UI\", \"PingFang SC\", sans-serif";
				ctx.textBaseline = "top";
				ctx.lineWidth = 3;
				ctx.strokeStyle = "rgba(0, 0, 0, .55)";
				ctx.strokeText(an.text ?? "", x, y);
				ctx.fillStyle = an.color;
				ctx.fillText(an.text ?? "", x, y);
			};
			const finish = (0, react.useCallback)(async () => {
				const s = live.current;
				if (s.sel === null || s.sel.w < 2 || s.sel.h < 2) return;
				const image = await loadImage(dataUrl);
				const canvas = document.createElement("canvas");
				canvas.width = Math.round(s.sel.w);
				canvas.height = Math.round(s.sel.h);
				const ctx = canvas.getContext("2d");
				ctx.drawImage(image, s.sel.x, s.sel.y, s.sel.w, s.sel.h, 0, 0, canvas.width, canvas.height);
				const source = canvas.toDataURL("image/png");
				ctx.save();
				ctx.beginPath();
				ctx.rect(0, 0, canvas.width, canvas.height);
				ctx.clip();
				for (const r of s.annoRects) {
					ctx.strokeStyle = r.color;
					ctx.lineWidth = 3;
					ctx.fillStyle = hexToRgba(r.color, .12);
					if (r.kind === "text") {
						drawTextAnno(ctx, r, s.sel.x, s.sel.y);
						continue;
					}
					const x = r.x - s.sel.x;
					const y = r.y - s.sel.y;
					if (r.kind === "arrow") drawArrowPath(ctx, x, y, x + r.w, y + r.h);
					else if (r.kind === "ellipse") {
						ctx.beginPath();
						ctx.ellipse(x + r.w / 2, y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
						ctx.stroke();
						ctx.fill();
					} else {
						ctx.strokeRect(x, y, r.w, r.h);
						ctx.fillRect(x, y, r.w, r.h);
					}
				}
				ctx.restore();
				onDone(s.annoRects.length > 0 ? {
					source,
					annotated: canvas.toDataURL("image/png")
				} : { source });
			}, [
				dataUrl,
				width,
				height,
				onDone
			]);
			const backToSelect = (0, react.useCallback)(() => {
				if (immediate) {
					onCancel();
					return;
				}
				setPhase("select");
				setSel(null);
				setAnnoRects([]);
				setAnnoDraft(null);
				setToolKind("rect");
			}, [immediate, onCancel]);
			const cancelOrBack = (0, react.useCallback)(() => {
				const s = live.current;
				if (s.phase === "tool") {
					if (s.annoDraft !== null) setAnnoDraft(null);
					else if (s.annoRects.length > 0) setAnnoRects(s.annoRects.slice(0, -1));
					else backToSelect();
					return;
				}
				onCancel();
			}, [backToSelect, onCancel]);
			const enterTool = (0, react.useCallback)(() => {
				setPhase("tool");
				setAnnoRects([]);
				setAnnoDraft(null);
				setToolKind("rect");
			}, []);
			/** 提交进行中的文字输入（空值丢弃锚点）；供 input/画布点击共用。 */
			const commitText = (0, react.useCallback)((text) => {
				const e = textEditRef.current;
				if (e === null) return;
				const clean = text.trim();
				if (clean !== "") {
					const d = {
						kind: "text",
						x: e.x,
						y: e.y,
						w: 0,
						h: 0,
						color: live.current.annoColor,
						text: clean
					};
					setAnnoRects([...live.current.annoRects, d]);
				}
				setTextEdit(null);
			}, []);
			(0, react.useEffect)(() => {
				const onMouseDown = (event) => {
					const toolbarEl = document.querySelector(".ssd3ov-toolbar");
					if (toolbarEl !== null && toolbarEl.contains(event.target)) return;
					if (event.target instanceof HTMLInputElement && event.target.classList.contains("ssd3ov-text-input")) return;
					if (event.button === 2) {
						event.preventDefault();
						cancelOrBack();
						return;
					}
					if (event.button !== 0) return;
					const s = live.current;
					if (s.phase === "tool" && s.sel !== null) {
						const p = toPhys(event.clientX, event.clientY);
						if (p === null) return;
						if (s.toolKind === "text") {
							if (textEditRef.current !== null) commitText(textEditRef.current.value);
							event.preventDefault();
							const anchor = clampPoint(p, s.sel);
							setTextEdit({
								x: anchor.x,
								y: anchor.y,
								value: ""
							});
							return;
						}
						annoStart.current = clampPoint(p, s.sel);
						setAnnoDraft({
							x: annoStart.current.x,
							y: annoStart.current.y,
							w: 0,
							h: 0,
							kind: s.toolKind,
							color: s.annoColor
						});
						return;
					}
					const p = toPhys(event.clientX, event.clientY);
					dragStart.current = {
						phys: p,
						moved: false
					};
				};
				const onMouseMove = (event) => {
					const s = live.current;
					if (s.phase === "tool" && s.sel !== null) {
						if (annoStart.current !== null) {
							const p = toPhys(event.clientX, event.clientY);
							if (p === null) return;
							if (s.toolKind === "arrow") {
								const a = clampPoint(annoStart.current, s.sel);
								const b = clampPoint(p, s.sel);
								setAnnoDraft({
									x: a.x,
									y: a.y,
									w: b.x - a.x,
									h: b.y - a.y,
									kind: "arrow",
									color: s.annoColor
								});
							} else {
								const clipped = clampToSel(norm(annoStart.current.x, annoStart.current.y, p.x, p.y), s.sel);
								setAnnoDraft(clipped === null ? null : {
									...clipped,
									kind: s.toolKind,
									color: s.annoColor
								});
							}
						}
						return;
					}
					const drag = dragStart.current;
					if (drag !== null && drag.phys !== null) {
						const p = toPhys(event.clientX, event.clientY);
						if (p === null) return;
						if (!drag.moved && Math.hypot(p.x - drag.phys.x, p.y - drag.phys.y) > 4) {
							drag.moved = true;
							setSel(null);
						}
						if (drag.moved) setSel(norm(drag.phys.x, drag.phys.y, p.x, p.y));
					}
				};
				const onMouseUp = () => {
					const drag = dragStart.current;
					const s = live.current;
					if (s.phase === "tool") {
						if (s.annoDraft !== null) {
							const d = s.annoDraft;
							if (d.kind === "arrow" ? Math.hypot(d.w, d.h) >= 8 : d.kind !== "text" && d.w >= 3 && d.h >= 3) setAnnoRects([...s.annoRects, d]);
						}
						setAnnoDraft(null);
						annoStart.current = null;
						return;
					}
					if (drag === null) return;
					const justDragged = drag.moved;
					dragStart.current = null;
					if (justDragged && s.sel !== null && s.sel.w >= 4 && s.sel.h >= 4) enterTool();
				};
				const onKeyDown = (event) => {
					if (event.target instanceof HTMLInputElement && event.target.classList.contains("ssd3ov-text-input")) return;
					if (textEditRef.current !== null) {
						if (event.key === "Escape") {
							event.preventDefault();
							setTextEdit(null);
						}
						return;
					}
					if (event.key === "Escape") cancelOrBack();
					else if (event.key === "Enter" && live.current.phase === "tool") finish().catch(() => {});
				};
				const onDblClick = () => {
					const s = live.current;
					if (s.phase === "tool") finish().catch(() => {});
					else if (s.sel !== null && s.sel.w >= 4 && s.sel.h >= 4) enterTool();
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
				commitText,
				enterTool,
				finish,
				toPhys
			]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				loadImage(dataUrl).then((image) => {
					if (!cancelled) setShowSize(fitSize(image.naturalWidth, image.naturalHeight));
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [dataUrl]);
			(0, react.useEffect)(() => {
				const canvas = annoRef.current;
				if (canvas === null || phase !== "tool" || showSize === null) return;
				const ctx = canvas.getContext("2d");
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				const sx = showSize.w / width;
				const sy = showSize.h / height;
				const draw = (r) => {
					ctx.strokeStyle = r.color;
					ctx.fillStyle = hexToRgba(r.color, .12);
					ctx.lineWidth = 2.5;
					if (r.kind === "text") {
						ctx.font = "15px \"Microsoft YaHei UI\", \"PingFang SC\", sans-serif";
						ctx.textBaseline = "top";
						ctx.lineWidth = 3;
						ctx.strokeStyle = "rgba(0, 0, 0, .55)";
						ctx.strokeText(r.text ?? "", r.x * sx, r.y * sy);
						ctx.fillStyle = r.color;
						ctx.fillText(r.text ?? "", r.x * sx, r.y * sy);
						return;
					}
					const x = r.x * sx;
					const y = r.y * sy;
					const w = r.w * sx;
					const h = r.h * sy;
					if (r.kind === "arrow") {
						drawArrowPath(ctx, x, y, x + w, y + h);
						return;
					}
					if (r.kind === "ellipse") {
						ctx.beginPath();
						ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
						ctx.stroke();
						ctx.fill();
						return;
					}
					ctx.strokeRect(x, y, w, h);
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
			const sx = showSize.w / width;
			const sy = showSize.h / height;
			const selDisplay = s.sel === null ? null : {
				x: s.sel.x * sx,
				y: s.sel.y * sy,
				w: s.sel.w * sx,
				h: s.sel.h * sy
			};
			const toolbar = selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1 ? (0, react.createElement)("div", {
				key: "toolbar",
				className: "ssd3ov-toolbar",
				style: {
					display: "flex",
					left: Math.max(170, Math.min(showSize.w - 170, selDisplay.x + selDisplay.w / 2)),
					transform: "translateX(-50%)",
					top: selDisplay.y + selDisplay.h + 8 <= showSize.h - 48 ? selDisplay.y + selDisplay.h + 8 : Math.max(4, selDisplay.y - 48)
				}
			}, [
				(0, react.createElement)("button", {
					key: "box",
					type: "button",
					className: `ssd3ov-tool${toolKind === "rect" ? " ssd3ov-tool-active" : ""}`,
					title: "矩形框",
					onClick: () => setToolKind("rect")
				}, icon(ICON_BOX, "#FF5B4D")),
				(0, react.createElement)("button", {
					key: "ellipse",
					type: "button",
					className: `ssd3ov-tool${toolKind === "ellipse" ? " ssd3ov-tool-active" : ""}`,
					title: "椭圆框",
					onClick: () => setToolKind("ellipse")
				}, (0, react.createElement)("svg", {
					viewBox: "0 0 16 16",
					width: "15",
					height: "15",
					fill: "none",
					"aria-hidden": true
				}, (0, react.createElement)("circle", {
					cx: "8",
					cy: "8",
					r: "5.6",
					stroke: "#FF5B4D",
					strokeWidth: "1.8"
				}))),
				(0, react.createElement)("button", {
					key: "arrow",
					type: "button",
					className: `ssd3ov-tool${toolKind === "arrow" ? " ssd3ov-tool-active" : ""}`,
					title: "箭头（指向要改的内容）",
					onClick: () => setToolKind("arrow")
				}, icon(ICON_ARROW, "none")),
				(0, react.createElement)("button", {
					key: "text",
					type: "button",
					className: `ssd3ov-tool${toolKind === "text" ? " ssd3ov-tool-active" : ""}`,
					title: "文字（点一下输入描述）",
					onClick: () => setToolKind("text")
				}, "T"),
				(0, react.createElement)("div", {
					key: "sep1",
					className: "ssd3ov-sep"
				}),
				...ANNO_COLORS.map((color, i) => (0, react.createElement)("button", {
					key: `swatch-${color}`,
					type: "button",
					className: `ssd3ov-swatch${annoColor === color ? " on" : ""}`,
					title: COLOR_NAMES[i],
					style: { background: color },
					onClick: () => setAnnoColor(color)
				})),
				(0, react.createElement)("div", {
					key: "sep2",
					className: "ssd3ov-sep"
				}),
				(0, react.createElement)("button", {
					key: "undo",
					type: "button",
					className: "ssd3ov-tool",
					title: "撤销（上一标注）",
					onClick: () => {
						if (s.annoRects.length > 0) setAnnoRects(s.annoRects.slice(0, -1));
					}
				}, icon(ICON_UNDO, "none")),
				(0, react.createElement)("button", {
					key: "reselect",
					type: "button",
					className: "ssd3ov-tool ssd3ov-tool-text",
					title: "取消（清除标注并重新选择）",
					onClick: backToSelect
				}, "取消"),
				(0, react.createElement)("button", {
					key: "done",
					type: "button",
					className: "ssd3ov-done",
					onClick: () => {
						finish().catch(() => {});
					}
				}, "完成")
			]) : null;
			const tip = s.phase === "select" ? (0, react.createElement)("div", { className: "ssd3ov-tip" }, (0, react.createElement)("em", null, "拖拽 "), "选择截图区域 · ", (0, react.createElement)("em", null, "右键 / Esc"), " 取消") : (0, react.createElement)("div", { className: "ssd3ov-tip" }, "拖拽画", (0, react.createElement)("em", { className: "red" }, "标注 "), "· ", (0, react.createElement)("em", null, "T"), " 点一下写文字 · ", (0, react.createElement)("em", null, "回车"), " 完成 · ", (0, react.createElement)("em", null, "右键 / Esc"), " 逐级回退");
			return (0, react_dom.createPortal)((0, react.createElement)("div", { className: "ssd3ov" }, [(0, react.createElement)("div", {
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
					src: dataUrl,
					alt: "",
					style: {
						width: showSize.w,
						height: showSize.h
					}
				}),
				s.phase === "select" ? (0, react.createElement)("div", {
					key: "dim",
					className: "ssd3ov-dim"
				}) : null,
				!immediate && selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1 ? (0, react.createElement)("div", {
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
				!immediate && selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1 ? (0, react.createElement)("div", {
					key: "size",
					className: "ssd3ov-size",
					style: { display: "block" }
				}, `${Math.round(s.sel.w)} × ${Math.round(s.sel.h)}`) : null,
				(0, react.createElement)("canvas", {
					key: "anno",
					ref: annoRef,
					width: showSize.w,
					height: showSize.h,
					style: {
						position: "absolute",
						inset: 0,
						pointerEvents: "none"
					}
				}),
				textEdit !== null ? (0, react.createElement)("input", {
					key: "text-input",
					className: "ssd3ov-text-input",
					type: "text",
					style: {
						left: textEdit.x * sx,
						top: textEdit.y * sy
					},
					value: textEdit.value,
					placeholder: "输入文字…",
					autoFocus: true,
					onChange: (e) => setTextEdit({
						...textEdit,
						value: e.target.value
					}),
					onKeyDown: (e) => {
						if (e.key === "Enter") commitText(textEdit.value);
						else if (e.key === "Escape") setTextEdit(null);
						if (typeof e.nativeEvent.stopPropagation === "function") e.nativeEvent.stopPropagation();
						else e.stopPropagation();
					},
					onBlur: () => commitText(textEdit.value)
				}) : null,
				toolbar
			]), tip]), document.body);
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
		/** 重复投递防抖：同内容 800ms 内的第二次调用直接丢弃。
		*  背景：client-hmr 热替换前的旧 bundle 曾用一次性 window 守卫注册永不移除的
		*  监听器（2026-08-24 修复），页面未刷新时新旧监听并存 → 一次确认投递两次、
		*  消息区出现两张截图。投递层幂等兜底，任何路径残留监听都不会双发。 */
		let lastKey = "";
		let lastAt = 0;
		function isDuplicate(dataUrl) {
			const key = `${dataUrl.length}:${dataUrl.slice(0, 64)}`;
			const now = Date.now();
			if (key === lastKey && now - lastAt < 800) return true;
			lastKey = key;
			lastAt = now;
			return false;
		}
		/** 一次与真实图片拖拽等价的落放：PNG File 经官方 drop 通道进草稿。
		*  @param filename - 附件名（原图/编辑图区分，如 ssid-screenshot-source.png）。 */
		async function deliverToComposer(dataUrl, filename = "ssid-screenshot.png") {
			if (isDuplicate(dataUrl)) {
				console.warn("[ssid-screenshot] duplicate delivery skipped");
				return;
			}
			const blob = await dataUrlToBlob(dataUrl);
			const file = new File([blob], filename, { type: "image/png" });
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
		const STYLE_ID$2 = "@max-null/dsh-capture/button.css";
		if (typeof document !== "undefined") {
			document.querySelector(`style[data-plugin-css="${STYLE_ID$2}"]`)?.remove();
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-capture";
			tag.dataset.pluginCss = STYLE_ID$2;
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
			const overlayDone = (0, react.useCallback)((result) => {
				setOverlay(null);
				const annotated = result.annotated;
				deliverToComposer(result.source, "ssid-screenshot-source.png").then(() => {
					if (annotated === void 0) return void 0;
					return deliverToComposer(annotated, "ssid-screenshot-annotated.png");
				}).catch((error) => {
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
			".ssd3r-input{flex:none;width:200px;height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}",
			".ssd3r-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}",
			".ssd3r-input::placeholder{color:var(--dsw-alias-label-tertiary)}",
			".ssd3r-msg{font-size:12px;line-height:1.5}",
			".ssd3r-msg[data-ok=true]{color:var(--dsw-alias-state-success-primary)}",
			".ssd3r-msg[data-ok=false]{color:var(--dsw-alias-state-error-primary)}",
			".ssd3r-switch{width:40px;height:22px;flex:none;border:none;border-radius:11px;cursor:pointer;padding:0;background:var(--dsw-alias-border-l4,rgba(0,0,0,.16));transition:background .15s}",
			".ssd3r-switch.on{background:var(--dsw-alias-state-business-primary,#4FC3F7)}",
			".ssd3r-switch .knob{display:block;width:16px;height:16px;border-radius:8px;background:#fff;margin-left:2px;transition:margin-left .15s}",
			".ssd3r-switch.on .knob{margin-left:22px}"
		].join("");
		const STYLE_ID$1 = "@max-null/dsh-capture/settings.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${STYLE_ID$1}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-capture";
			tag.dataset.pluginCss = STYLE_ID$1;
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
				control: (0, react.createElement)("button", {
					className: `ssd3r-switch${value === true ? " on" : ""}`,
					type: "button",
					disabled: value === null,
					"aria-label": t.hideTitle,
					onClick: toggle
				}, (0, react.createElement)("span", { className: "knob" }))
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
		//#region src/client/ImagePreviewEdit.tsx
		/**
		* ImagePreviewEdit: 官方「原图预览」(ImageLightbox) 的编辑入口。
		*
		* MutationObserver 发现预览 dialog（role=dialog + aria-label 原图预览 /
		* Original image preview —— 官方文案，不依赖 CSS hash，草稿附件预览与
		* 消息图片预览共用同一个 ImageLightbox）→ 注入「编辑」按钮 → 点击打开
		* CaptureOverlay 整图模式（immediate：跳过框选直接标注）→ 完成时：
		*   - 有标注：投递一张编辑图到输入框（原图已在对话里，不再投原图）；
		*   - 无标注：视为未修改，直接关闭不投递（2026-08-24 用户决定）。
		* Escape / 取消逐级回退到底 = 放弃编辑回到原预览。
		*/
		const PREVIEW_LABELS = /^(原图预览|Original image preview)$/;
		const EDIT_BTN_CSS = [".dsh-img-edit-btn{position:fixed;top:20px;right:64px;z-index:1;display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(255,255,255,.14));border-radius:999px;background:var(--dsw-specific-input-major,rgba(20,24,32,.92));color:var(--dsw-alias-label-primary,#e8eaed);cursor:pointer;padding:0}", ".dsh-img-edit-btn:hover{border-color:var(--dsw-alias-brand-primary,#4f8cff);color:var(--dsw-alias-brand-primary,#4f8cff)}"].join("");
		const STYLE_ID = "@max-null/dsh-capture/image-edit.css";
		function ensureStyle() {
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-capture";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = EDIT_BTN_CSS;
			document.head.appendChild(tag);
		}
		/** 常驻注入宿主：观察预览对话框并注入编辑按钮；零视觉输出（null portal）。 */
		function ImagePreviewEditHost() {
			const [edit, setEdit] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const busyRef = (0, react.useRef)(false);
			const editRef = (0, react.useRef)(edit);
			editRef.current = edit;
			(0, react.useEffect)(() => {
				ensureStyle();
				const openEdit = (src) => {
					if (busyRef.current || editRef.current !== null) return;
					busyRef.current = true;
					const probe = new Image();
					probe.onload = () => {
						busyRef.current = false;
						setEdit({
							src,
							width: probe.naturalWidth,
							height: probe.naturalHeight
						});
					};
					probe.onerror = () => {
						busyRef.current = false;
						setError("图片加载失败，无法编辑");
					};
					probe.src = src;
				};
				const injectInto = (dialog, img) => {
					if (dialog.querySelector("[data-dsh-image-edit]") !== null) return false;
					const btn = document.createElement("button");
					btn.type = "button";
					btn.dataset.dshImageEdit = "1";
					btn.className = "dsh-img-edit-btn";
					btn.setAttribute("aria-label", "编辑图片");
					btn.title = "标注编辑这张图片";
					btn.innerHTML = "✎";
					btn.addEventListener("click", (event) => {
						event.stopPropagation();
						openEdit(img.src);
					});
					dialog.appendChild(btn);
					return true;
				};
				const scan = () => {
					for (const dialog of Array.from(document.querySelectorAll("[role=\"dialog\"]"))) {
						if (!PREVIEW_LABELS.test(dialog.getAttribute("aria-label") ?? "")) continue;
						const img = dialog.querySelector("img");
						if (img !== null) injectInto(dialog, img);
					}
				};
				const observer = new MutationObserver(scan);
				if (document.body !== null) {
					observer.observe(document.body, {
						childList: true,
						subtree: true
					});
					scan();
				}
				return () => observer.disconnect();
			}, []);
			(0, react.useEffect)(() => {
				if (error !== null) {
					const timer = window.setTimeout(() => setError(null), 2500);
					return () => window.clearTimeout(timer);
				}
			}, [error]);
			if (edit === null) return null;
			const onDone = (result) => {
				setEdit(null);
				if (result.annotated === void 0) return;
				deliverToComposer(result.annotated, "image-edit-annotated.png").catch((err) => {
					console.warn(`[ssid-screenshot] image edit delivery failed: ${err instanceof Error ? err.message : String(err)}`);
				});
			};
			const overlay = (0, react.createElement)(CaptureOverlay, {
				key: "image-edit",
				dataUrl: edit.src,
				width: edit.width,
				height: edit.height,
				immediate: true,
				onDone,
				onCancel: () => setEdit(null)
			});
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [overlay, error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-img-edit-error",
				style: {
					position: "fixed",
					bottom: 80,
					left: "50%",
					transform: "translateX(-50%)",
					zIndex: 2147483647,
					padding: "6px 14px",
					borderRadius: 8,
					background: "var(--dsw-alias-interactive-bg-hover-solid,rgba(30,36,46,.95))",
					color: "var(--dsw-alias-state-error-primary,#ff6b6b)",
					font: "13px/20px sans-serif"
				},
				children: error
			}) : null] }), document.body);
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* @max-null/dsh-capture — browser half.
		*
		* 三层职责：
		*  1. 投递（壳层 → 输入框）：监听 `ssid:screenshot` CustomEvent（detail =
		*     裁剪结果 `data:image/png;base64,…`，由 shell/main.mjs 经
		*     mainView.webContents.executeJavaScript 派发），把 PNG 送进当前会话
		*     输入框草稿——合成 drop 走 DSH 官方 composer 图片 intake
		*     （ui-attachment 的 document 级 drop 处理器，只认
		*     `dataTransfer.types.includes('Files')`，量/类型/大小限制与真实拖拽一致）。
		*  2. 截图按钮：注册 `conversation.input.right`（润色按钮同一座位），点击
		*     调 /ssid/api/screenshot/trigger 让壳层开浮层。
		*  3. 设置行：注册两个 `settings.general.item`（通用设置）：隐藏窗口开关
		*     + 全局快捷键编辑，即改即存。
		*/
		const inject = ["slots"];
		/** 事件名（与 shell/main.mjs 派发一致）。 */
		const SCREENSHOT_EVENT = "ssid:screenshot";
		function parseShotPayload(detail) {
			if (typeof detail !== "object" || detail === null) return null;
			const p = detail;
			if (typeof p.uid !== "string" || p.uid === "") return null;
			if (typeof p.source !== "string" || !isImageDataUrl(p.source)) return null;
			let annotated;
			if (p.annotated !== void 0) {
				if (typeof p.annotated !== "string" || !isImageDataUrl(p.annotated)) return null;
				annotated = p.annotated;
			}
			return {
				uid: p.uid,
				source: p.source,
				annotated
			};
		}
		/** 已投递 uid 集合：主进程单会话只派发一次，防御性去重；
		*  模块级缓存防止 hmr 后重复投递。 */
		const deliveredUids = /* @__PURE__ */ new Set();
		/** Plugin body: register the delivery listener, the composer capture button,
		*  and the two General-settings rows. */
		function apply(ctx) {
			const onScreenshot = (event) => {
				const payload = parseShotPayload(event.detail);
				if (payload === null) return;
				if (deliveredUids.has(payload.uid)) {
					console.warn(`[ssid-screenshot] duplicate uid ${payload.uid} skipped`);
					return;
				}
				deliveredUids.add(payload.uid);
				console.info(`[ssid-screenshot] event received uid=${payload.uid} (source ${payload.source.length}, annotated ${payload.annotated?.length ?? 0})`);
				const annotated = payload.annotated;
				deliverToComposer(payload.source, "ssid-screenshot-source.png").then(() => {
					if (annotated === void 0) return void 0;
					return deliverToComposer(annotated, "ssid-screenshot-annotated.png");
				}).catch((error) => {
					console.warn(`[ssid-screenshot] delivery failed: ${error instanceof Error ? error.message : String(error)}`);
				});
			};
			ctx.effect(() => {
				window.addEventListener(SCREENSHOT_EVENT, onScreenshot);
				return () => window.removeEventListener(SCREENSHOT_EVENT, onScreenshot);
			}, "dsh-capture: screenshot delivery");
			const host = document.createElement("div");
			host.dataset.dshImagePreviewEdit = "1";
			document.body.appendChild(host);
			const root = (0, react_dom_client.createRoot)(host);
			root.render((0, react.createElement)(ImagePreviewEditHost));
			ctx.effect(() => () => {
				root.unmount();
				host.remove();
			}, "dsh-capture: image edit preview host");
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