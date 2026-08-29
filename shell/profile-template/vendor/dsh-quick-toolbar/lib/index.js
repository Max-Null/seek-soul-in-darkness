import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
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
	})]),
	label: z.string().optional(),
	act: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("click") }),
		z.object({
			kind: z.literal("toggle-panel"),
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
	]),
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
		if (req.method !== "GET") {
			sendJson(res, 405, {
				ok: false,
				error: "method-not-allowed"
			});
			return;
		}
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
	}
};
function apply(ctx) {
	ctx.inject(["webServer"], ((wsCtx) => {
		wsCtx.webServer.register(adaptersRouteDefinition);
	}));
}
//#endregion
export { apply, name };
