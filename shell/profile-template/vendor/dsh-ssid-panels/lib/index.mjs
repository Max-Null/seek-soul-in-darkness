import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
//#region src/index.ts
const require = createRequire(import.meta.url);
/** 预制插件中文简介（未知插件回退包内 description）。 */
const PLUGIN_ZH = {
	"@huanlin/dsh-plugin-better-sidebar-plugin-office": "Office 三件套内联预览（docx/xlsx/pptx）",
	"@max-null/dsh-chinese-thinking": "中文思考——系统提示注入，首轮即中文",
	"@max-null/dsh-guardian": "Guardian 状态引擎——断言计数、编辑审查队列、无反馈环监控",
	"@max-null/dsh-habit": "自学习习惯引擎——纠错信号检测、阈值判断、两级人工闸门",
	"@max-null/dsh-memory": "跨会话明文记忆——BM25 检索、无向量、人工可管",
	"@max-null/dsh-ssid-panels": "SSiD 面板——记忆/状态/习惯/余额 tab 与关于页",
	"dsh-better-sidebar": "VSCode 式右侧栏——文件/终端/Git/浏览器，按会话隔离",
	"dsh-excel-panel": "Excel 编辑面板——多工作表、公式、批量格式、保存回写",
	"dsh-sidebar-qa": "划选提问——选文本到侧栏追问，不打断主对话",
	"dsh-skin": "皮肤切换——预设调色板、壁纸、透明度/模糊、字号",
	"dsh-video-preview": "视频内联预览——mp4/webm 等，支持拖进度"
};
/** 读一个已挂载插件的版本与简介。
* 优先从 profile node_modules 直接路径读（SSID_PROFILE_DIR 由壳注入，
* 不依赖各包 exports 是否暴露 ./package.json），回退模块解析。 */
function pluginMeta(name) {
	const candidates = [];
	const profileDir = process.env.SSID_PROFILE_DIR;
	if (profileDir !== void 0 && profileDir !== "") candidates.push(join(profileDir, "node_modules", name, "package.json"));
	try {
		candidates.push(require.resolve(`${name}/package.json`));
	} catch {}
	for (const candidate of candidates) try {
		const pkg = JSON.parse(readFileSync(candidate, "utf8"));
		return {
			version: pkg.version,
			description: PLUGIN_ZH[name] ?? pkg.description
		};
	} catch {}
	return {};
}
/** Plugin identity for cordis.yml rows. */
const name = "@max-null/dsh-ssid-panels";
/** Services required before mounting: the webserver routes and the web runtime's trusted hosts. */
const inject = ["webServer", "webRuntime"];
/** SSiD 壳版本（main.mjs 启动时从 shell/package.json 注入环境变量）。 */
const SHELL_VERSION = process.env.SSID_SHELL_VERSION ?? "0.0.0";
/** SSiD 仓库（更新检查与更新日志来源）。 */
const SSID_REPO = "Max-Null/seek-soul-in-darkness";
/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 20;
/** One API failure with its wire code and HTTP status. */
var PanelsError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "PanelsError";
	}
};
/** Write a JSON response. */
function writeJson(res, status, body) {
	const r = res;
	r.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	r.end(JSON.stringify(body));
}
/** Write the failure envelope for any thrown value. */
function writeError(res, error) {
	if (error instanceof PanelsError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
/** Read and parse the JSON request body (bounded). */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new PanelsError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new PanelsError("bad-request", "request body is not valid JSON");
	}
}
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Whether one request may reach the plugin routes (mirror of the /api gateway fence). */
function isTrusted(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!(isLoopbackHostname(hostUrl.hostname) || trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		return entryUrl !== void 0 && entryUrl.host === hostUrl.host;
	}))) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Read one optional service or throw 503 so the client can degrade. */
function required(service, label) {
	if (service === void 0) throw new PanelsError("service-unavailable", `the ${label} service is not mounted in this deployment`, 503);
	return service;
}
/**
* Plugin body: mount the fenced /ssid/api route.
* @param ctx - host plugin context (webServer, webRuntime).
*/
function apply(ctx) {
	const api = {
		"about": () => ({
			shellVersion: SHELL_VERSION,
			plugins: [...ctx.loader.entries()].filter((entry) => !entry.options.group && entry.options.name !== void 0 && !entry.options.name.startsWith("@deepseek-ai/") && !entry.options.name.startsWith("cordis:")).map((entry) => ({
				id: entry.id,
				name: entry.options.name,
				...pluginMeta(entry.options.name)
			})).sort((a, b) => a.name.localeCompare(b.name))
		}),
		"update-check": async () => {
			try {
				const res = await fetch(`https://api.github.com/repos/${SSID_REPO}/releases?per_page=20`, { headers: { accept: "application/vnd.github+json" } });
				if (!res.ok) return {
					currentVersion: SHELL_VERSION,
					latest: null,
					releases: [],
					message: `GitHub API 返回 ${res.status}`
				};
				const list = (await res.json()).map((release) => ({
					tag: release.tag_name ?? "",
					name: release.name ?? release.tag_name ?? "",
					body: release.body ?? "",
					publishedAt: release.published_at ?? ""
				}));
				return {
					currentVersion: SHELL_VERSION,
					latest: list[0] ?? null,
					releases: list
				};
			} catch (error) {
				return {
					currentVersion: SHELL_VERSION,
					latest: null,
					releases: [],
					message: error instanceof Error ? error.message : String(error)
				};
			}
		},
		"memory.list": () => {
			return required(ctx.get("memory"), "memory").list?.() ?? [];
		},
		"memory.search": (payload) => {
			const memory = required(ctx.get("memory"), "memory");
			const record = payload;
			const query = typeof record?.query === "string" ? record.query : "";
			return memory.search?.(query) ?? [];
		},
		"memory.confirm": (payload) => {
			const memory = required(ctx.get("memory"), "memory");
			const record = payload;
			if (typeof record?.id !== "string") throw new PanelsError("bad-request", "missing or invalid \"id\"");
			return memory.setStatus?.(record.id, "auto") ?? null;
		},
		"memory.forget": (payload) => {
			const memory = required(ctx.get("memory"), "memory");
			const record = payload;
			if (typeof record?.id !== "string") throw new PanelsError("bad-request", "missing or invalid \"id\"");
			return memory.forget?.(record.id) ?? false;
		},
		"guardian.snapshot": () => {
			return required(ctx.get("guardian"), "guardian").snapshot?.() ?? {
				session: null,
				reviewQueue: []
			};
		},
		"habit.snapshot": () => {
			return required(ctx.get("habit"), "habit").snapshot?.() ?? [];
		},
		"habit.confirm": async (payload) => {
			const habit = required(ctx.get("habit"), "habit");
			const memory = ctx.get("memory");
			const record = payload;
			if (typeof record?.id !== "string") throw new PanelsError("bad-request", "missing or invalid \"id\"");
			const candidate = habit.confirm?.(record.id);
			if (candidate !== void 0 && candidate !== null && memory !== void 0) await memory.remember?.({ content: `[习惯] ${candidate.habit}` });
			return candidate ?? null;
		},
		"habit.discard": (payload) => {
			const habit = required(ctx.get("habit"), "habit");
			const record = payload;
			if (typeof record?.id !== "string") throw new PanelsError("bad-request", "missing or invalid \"id\"");
			return habit.discard?.(record.id) ?? null;
		},
		"balance.deepseek": async () => {
			const cred = await required(ctx.get("credentials"), "credentials").resolve("DEEPSEEK_API_KEY");
			if (cred === void 0) return {
				ok: false,
				message: "未配置 DEEPSEEK_API_KEY"
			};
			const res = await fetch("https://api.deepseek.com/user/balance", { headers: { Authorization: `Bearer ${cred.value}` } });
			if (!res.ok) return {
				ok: false,
				message: `余额查询失败（HTTP ${res.status}）`
			};
			const data = await res.json();
			return {
				ok: true,
				isAvailable: data.is_available === true,
				balanceInfos: (data.balance_infos ?? []).map((info) => ({
					currency: info.currency ?? "CNY",
					totalBalance: info.total_balance ?? "0"
				}))
			};
		},
		"balance.kimi": async () => {
			const cred = await required(ctx.get("credentials"), "credentials").resolve("MOONSHOT_API_KEY");
			if (cred === void 0) return {
				ok: false,
				message: "未配置 MOONSHOT_API_KEY"
			};
			const res = await fetch("https://api.moonshot.cn/v1/users/me/balance", { headers: { Authorization: `Bearer ${cred.value}` } });
			if (!res.ok) return {
				ok: false,
				message: `余额查询失败（HTTP ${res.status}）`
			};
			const available = (await res.json()).data?.available_balance;
			const value = typeof available === "number" ? available : 0;
			return {
				ok: true,
				isAvailable: value > 0,
				balanceInfos: [{
					currency: "CNY",
					totalBalance: String(value)
				}]
			};
		}
	};
	const fence = (req) => isTrusted(req, ctx.webRuntime.trustedHosts);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/ssid/api",
		handler: async (req, res) => {
			const request = req;
			if (!fence(request)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(request.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/ssid/api/") ? pathname.slice(10) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new PanelsError("not-found", "unknown ssid API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const handler = api[method];
				if (handler === void 0) throw new PanelsError("not-found", `unknown ssid API method "${method}"`, 404);
				writeJson(res, 200, {
					ok: true,
					value: await handler(payload)
				});
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "@max-null/dsh-ssid-panels: /ssid/api routes");
}
//#endregion
export { apply, inject, name };
