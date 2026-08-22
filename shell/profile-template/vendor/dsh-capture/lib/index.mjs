import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region src/index.ts
/** Plugin identity for cordis.yml rows. */
const name = "@max-null/dsh-capture";
/** Services required before mounting: the webserver routes and the web runtime's trusted hosts. */
const inject = ["webServer", "webRuntime"];
/** 配置文件路径（与 shell/main.mjs 的 SCREENSHOT_CONFIG_PATH 一致）。 */
const CONFIG_PATH = join(homedir(), ".ssid", "screenshot.json");
const CONFIG_DEFAULTS = {
	hideWindow: true,
	hotkey: "Control+Shift+A"
};
/** 服务键（与 shell/kernel.ts 的 SSID_SHELL_SCREENSHOT_KEY 一致）。 */
const SHELL_SCREENSHOT_KEY = "ssid.shell.screenshot";
/** 读取配置（损坏/缺失 → 默认值）。 */
function readConfig() {
	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
		return {
			hideWindow: parsed?.hideWindow !== false,
			hotkey: typeof parsed?.hotkey === "string" && parsed.hotkey.trim() !== "" ? parsed.hotkey : CONFIG_DEFAULTS.hotkey
		};
	} catch {
		return { ...CONFIG_DEFAULTS };
	}
}
/** 写入配置（目录不存在则创建）。 */
function writeConfig(next) {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
}
/** 是否运行在 SSiD 壳内（Electron 主进程注入过截图能力）。 */
function shellScreenshot(ctx) {
	return ctx.get(SHELL_SCREENSHOT_KEY);
}
/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 20;
/** One API failure with its wire code and HTTP status. */
var ScreenshotError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "ScreenshotError";
	}
};
function writeJson(res, status, body) {
	const r = res;
	r.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	r.end(JSON.stringify(body));
}
function writeError(res, error) {
	if (error instanceof ScreenshotError) {
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
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new ScreenshotError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new ScreenshotError("bad-request", "request body is not valid JSON");
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
/**
* Plugin body: mount the fenced /ssid/api/screenshot route.
* @param ctx - host plugin context (webServer, webRuntime).
*/
function apply(ctx) {
	const fence = (req) => isTrusted(req, ctx.webRuntime.trustedHosts);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/ssid/api/screenshot",
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
			const method = pathname.startsWith("/ssid/api/screenshot/") ? pathname.slice(21) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new ScreenshotError("not-found", "unknown screenshot API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				let value;
				if (method === "get") value = {
					...readConfig(),
					shellAvailable: shellScreenshot(ctx) !== void 0
				};
				else if (method === "set") {
					const record = payload;
					const config = readConfig();
					if (typeof record?.hideWindow === "boolean") config.hideWindow = record.hideWindow;
					if (typeof record?.hotkey === "string" && record.hotkey.trim() !== "") config.hotkey = record.hotkey.trim();
					writeConfig(config);
					const applied = shellScreenshot(ctx)?.apply?.() ?? false;
					value = {
						...config,
						appliedHotkey: applied === true
					};
				} else if (method === "trigger") {
					const shell = shellScreenshot(ctx);
					if (shell === void 0) throw new ScreenshotError("shell-unavailable", "screenshot capture is only available inside the SSiD desktop shell", 503);
					shell.trigger();
					value = { ok: true };
				} else throw new ScreenshotError("not-found", `unknown screenshot API method "${method}"`, 404);
				writeJson(res, 200, {
					ok: true,
					value
				});
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "@max-null/dsh-capture: /ssid/api/screenshot routes");
}
//#endregion
export { apply, inject, name };
