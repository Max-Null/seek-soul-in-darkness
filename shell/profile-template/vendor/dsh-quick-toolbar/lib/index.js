import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";
//#region src/schema.ts
/**
* @max-null/dsh-quick-toolbar — 用户适配器配置 schema（zod）
*
* 用户配置（~/.dsh/quick-toolbar-adapters.json）与内置适配器同构；
* zod 校验是「LLM 生成输出」的第一道防线：非法条目丢弃并报 detail
* （不吞全表——其余合法条目继续生效）。
*/
const adapterSchema = z.object({
	id: z.string().min(1),
	button: z.string().min(1),
	icon: z.discriminatedUnion("source", [z.object({ source: z.literal("from-button") }), z.object({
		source: z.literal("custom"),
		value: z.string().min(1)
	})]).optional(),
	label: z.string().optional(),
	act: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("click") }),
		z.object({
			kind: z.literal("toggle-panel"),
			secondClick: z.union([
				z.string().min(1),
				z.object({ kind: z.literal("mask") }),
				z.object({
					kind: z.literal("click"),
					selector: z.string().min(1)
				})
			]).optional(),
			close: z.string().optional()
		}),
		z.object({
			kind: z.literal("dispatch-event"),
			event: z.string(),
			detail: z.string().optional()
		}),
		z.object({
			kind: z.literal("open-settings"),
			path: z.string().optional()
		}),
		z.object({
			kind: z.literal("command"),
			name: z.string()
		})
	]).optional(),
	hide: z.boolean().optional(),
	enabled: z.boolean().optional()
});
const adaptersFileSchema = z.object({ adapters: z.array(adapterSchema) });
/** 解析用户配置文件：返回 { ok, value } 或 { ok: false, issues } */
function parseUserAdapters(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			ok: false,
			issues: ["invalid-json"]
		};
	}
	const result = adaptersFileSchema.safeParse(parsed);
	if (!result.success) return {
		ok: false,
		issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
	};
	return {
		ok: true,
		value: result.data
	};
}
//#endregion
//#region src/index.ts
/**
* @max-null/dsh-quick-toolbar — host half.
*
* v1.5：暴露用户适配器配置读取 API（与 chat-rail 收藏 host 化同模式）：
*   GET /quick-toolbar/api/adapters → 读 ~/.dsh/quick-toolbar-adapters.json
*   + zod 校验 → { ok: true, value } 或 { ok: false, error, detail }
* 客户端据此合并「内置适配器集 + 用户适配器」（用户配置 = 驻场 LLM 产出）。
*/
const name = "@max-null/dsh-quick-toolbar";
/** 配置文件路径（用户级，profile 无关） */
const ADAPTERS_PATH = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "quick-toolbar-adapters.json");
const ROUTE_PATH = "/quick-toolbar/api/adapters";
function sendJson(res, status, body) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
const adaptersRouteDefinition = {
	kind: "exact",
	path: ROUTE_PATH,
	handler: async (req, res) => {
		if (req.method === "GET") {
			try {
				const parsed = parseUserAdapters(readFileSync(ADAPTERS_PATH, "utf8"));
				if (!parsed.ok) {
					sendJson(res, 200, {
						ok: false,
						error: "invalid-schema",
						detail: parsed.issues
					});
					return;
				}
				sendJson(res, 200, {
					ok: true,
					value: parsed.value
				});
			} catch {
				sendJson(res, 200, {
					ok: true,
					value: { adapters: [] }
				});
			}
			return;
		}
		if (req.method === "POST") {
			let raw = "";
			req.on?.("data", (chunk) => {
				raw += chunk;
			});
			await new Promise((resolve) => req.on?.("end", () => {
				resolve();
			}));
			try {
				const parsed = parseUserAdapters(raw);
				if (!parsed.ok) {
					sendJson(res, 200, {
						ok: false,
						error: "invalid-schema",
						detail: parsed.issues
					});
					return;
				}
				const tmp = ADAPTERS_PATH + ".tmp";
				writeFileSync(tmp, raw, "utf8");
				renameSync(tmp, ADAPTERS_PATH);
				sendJson(res, 200, {
					ok: true,
					value: parsed.value
				});
			} catch {
				sendJson(res, 200, {
					ok: false,
					error: "write-failed"
				});
			}
			return;
		}
		sendJson(res, 405, {
			ok: false,
			error: "method-not-allowed"
		});
	}
};
const STATE_PATH = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "quick-toolbar-state.json");
const STATE_ROUTE = "/quick-toolbar/api/state";
/** 默认状态（文件缺失/字段缺失时取默认，宽松向下兼容）。 */
function defaultState() {
	return {
		pos: null,
		collapsed: true,
		pinned: false,
		shellVisible: false
	};
}
/** 归一化（防御非法文件：字段级回退默认，不因一条坏字段全丢）。 */
function normalizeState(raw) {
	const d = defaultState();
	const s = raw !== null && typeof raw === "object" ? raw : {};
	const pos = s.pos;
	if (pos !== null && pos !== void 0 && typeof pos === "object" && pos !== null) {
		const p = pos;
		if (typeof p.x === "number" && typeof p.y === "number") d.pos = {
			x: p.x,
			y: p.y
		};
	}
	if (typeof s.collapsed === "boolean") d.collapsed = s.collapsed;
	if (typeof s.pinned === "boolean") d.pinned = s.pinned;
	if (typeof s.shellVisible === "boolean") d.shellVisible = s.shellVisible;
	return d;
}
/** 读状态文件（缺失/非法 → 默认；不抛）。 */
function readStateFile() {
	try {
		return normalizeState(JSON.parse(readFileSync(STATE_PATH, "utf8")));
	} catch {
		return defaultState();
	}
}
/** 原子写状态文件（tmp + rename，防中断半写）。 */
function writeStateFile(state) {
	const tmp = STATE_PATH + ".tmp";
	writeFileSync(tmp, JSON.stringify(state));
	renameSync(tmp, STATE_PATH);
}
const stateRouteDefinition = {
	kind: "exact",
	path: STATE_ROUTE,
	handler: async (req, res) => {
		if (req.method === "GET") {
			sendJson(res, 200, {
				ok: true,
				state: readStateFile()
			});
			return;
		}
		if (req.method === "POST") {
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
			});
			await new Promise((resolve) => req.on("end", () => {
				resolve();
			}));
			try {
				writeStateFile(normalizeState(JSON.parse(raw)));
				sendJson(res, 200, { ok: true });
			} catch {
				sendJson(res, 200, {
					ok: false,
					error: "invalid-state"
				});
			}
			return;
		}
		sendJson(res, 405, {
			ok: false,
			error: "method-not-allowed"
		});
	}
};
let wsSvc = null;
const authUrlRouteDefinition = {
	kind: "exact",
	path: "/quick-toolbar/api/auth-url",
	handler: async (_req, res) => {
		const w = wsSvc;
		if (w === null || w === void 0) {
			sendJson(res, 200, {
				ok: false,
				error: "auth-url-unavailable"
			});
			return;
		}
		try {
			sendJson(res, 200, {
				ok: true,
				url: w.connection.authenticatedUrl("http://" + w.webServer.host + ":" + String(w.webServer.port) + "/")
			});
		} catch {
			sendJson(res, 200, {
				ok: false,
				error: "auth-url-unavailable"
			});
		}
	}
};
function apply(ctx) {
	ctx.inject(["webServer", "connection"], ((wsCtx) => {
		wsSvc = wsCtx;
		wsCtx.webServer.register(adaptersRouteDefinition);
		wsCtx.webServer.register(stateRouteDefinition);
		wsCtx.webServer.register(authUrlRouteDefinition);
	}));
}
//#endregion
export { apply, defaultState, name, normalizeState, readStateFile, writeStateFile };
