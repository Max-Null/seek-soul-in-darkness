import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zstdDecompressSync } from "node:zlib";
import { interruptedTurnClosers } from "@deepseek-ai/dsh-session";
//#region src/release-notes.ts
/** 从 release-notes 文本提取版本号（首行 `# vX.Y.Z`）。无匹配返回 null。 */
function extractVersion(notes) {
	if (typeof notes !== "string") return null;
	const m = /^#\s*v?(\d+\.\d+\.\d+(?:[-+][\S]+)?)/m.exec(notes.trim());
	return m !== null ? m[1] : null;
}
/** 解析标题/日期/分节（覆盖 release notes 实际语法：`# `、`## `、`- `、标题内日期）。 */
function parseReleaseNotes(notes) {
	if (typeof notes !== "string") return {
		version: null,
		title: null,
		date: null,
		sections: []
	};
	let title = null;
	let date = null;
	const sections = [];
	let current = null;
	for (const raw of String(notes).split("\n")) {
		const line = raw.trimEnd();
		const h1 = /^#\s+(.+)$/.exec(line);
		const h2 = /^##\s+(.+)$/.exec(line);
		const li = /^-\s+(.+)$/.exec(line);
		if (h1 !== null) {
			title = h1[1];
			const d = /[（(](20\d{2}-\d{2}-\d{2})[)）]/.exec(h1[1]);
			if (d !== null) date = d[1];
			continue;
		}
		if (h2 !== null) {
			current = {
				heading: h2[1],
				items: []
			};
			sections.push(current);
			continue;
		}
		if (li !== null && current !== null) current.items.push(li[1]);
	}
	return {
		version: extractVersion(notes),
		title,
		date,
		sections: sections.filter((s) => s.items.length > 0)
	};
}
//#endregion
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
/** 预制插件英文简介（与 PLUGIN_ZH 键一一对应，客户端按 UI 语言选择）。 */
const PLUGIN_EN = {
	"@huanlin/dsh-plugin-better-sidebar-plugin-office": "Inline preview for Office files (docx/xlsx/pptx)",
	"@max-null/dsh-chinese-thinking": "Chinese thinking — system prompt injection, Chinese from the first turn",
	"@max-null/dsh-guardian": "Guardian state engine — assertion counts, edit review queue, feedback-loop watch",
	"@max-null/dsh-habit": "Self-learning habit engine — correction signals, thresholds, two human gates",
	"@max-null/dsh-memory": "Cross-session plaintext memory — BM25 retrieval, no vectors, human-manageable",
	"@max-null/dsh-ssid-panels": "SSiD panels — memory/status/habits/balance tabs and the about page",
	"dsh-better-sidebar": "VSCode-style right sidebar — files/terminal/git/browser, per-session",
	"dsh-excel-panel": "Excel editing panel — multi-sheet, formulas, batch formatting, save back",
	"dsh-sidebar-qa": "Selection Q&A — ask about selected text in the sidebar without interrupting the main chat",
	"dsh-skin": "Skin switcher — preset palettes, wallpaper, opacity/blur, font size",
	"dsh-video-preview": "Inline video preview — mp4/webm etc., scrubbing"
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
			descriptionZh: PLUGIN_ZH[name] ?? pkg.description,
			descriptionEn: PLUGIN_EN[name] ?? pkg.description
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
const NOTIFY_CONFIG_PATH = join(homedir(), ".ssid", "notify.json");
const NOTIFY_DEFAULTS = {
	enabled: true,
	replyDone: true,
	question: true,
	approval: true
};
function readNotifyConfig() {
	try {
		const parsed = JSON.parse(readFileSync(NOTIFY_CONFIG_PATH, "utf8"));
		return {
			...NOTIFY_DEFAULTS,
			...typeof parsed === "object" && parsed !== null ? parsed : {}
		};
	} catch {
		return { ...NOTIFY_DEFAULTS };
	}
}
const SESSION_ROOT_CONFIG_PATH = join(homedir(), ".ssid", "session-root.json");
/** B 方案（2026-08-23）：已载入会话清单——「移除已载入会话」只删清单内，
*  隔离后新建的会话不受影响。 */
const IMPORTED_SESSIONS_PATH = join(homedir(), ".ssid", "imported-sessions.json");
const ISOLATED_ROOT = process.env.SSID_SESSION_ISOLATED_ROOT;
const SHARED_ROOT = process.env.SSID_SESSION_SHARED_ROOT;
function readImportedSessions() {
	try {
		const parsed = JSON.parse(readFileSync(IMPORTED_SESSIONS_PATH, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry) => {
			const e = entry;
			return e !== null && typeof e.project === "string" && typeof e.id === "string";
		});
	} catch {
		return [];
	}
}
function writeImportedSessions(entries) {
	mkdirSync(dirname(IMPORTED_SESSIONS_PATH), { recursive: true });
	writeFileSync(IMPORTED_SESSIONS_PATH, JSON.stringify(entries, null, 2) + "\n");
}
/** 把 present（载入/已存在）并入清单（幂等按 project+id 去重）。 */
function mergeImportedSessions(present) {
	const merged = readImportedSessions();
	const seen = new Set(merged.map((entry) => `${entry.project}/${entry.id}`));
	for (const entry of present) {
		const key = `${entry.project}/${entry.id}`;
		if (!seen.has(key)) {
			seen.add(key);
			merged.push(entry);
		}
	}
	writeImportedSessions(merged);
}
function readSessionRootState() {
	try {
		const parsed = JSON.parse(readFileSync(SESSION_ROOT_CONFIG_PATH, "utf8"));
		return {
			isolated: parsed?.isolated === true,
			applied: parsed?.applied === true
		};
	} catch {
		return {
			isolated: false,
			applied: false
		};
	}
}
function writeSessionRootState(next) {
	mkdirSync(dirname(SESSION_ROOT_CONFIG_PATH), { recursive: true });
	writeFileSync(SESSION_ROOT_CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
}
/** 一个根目录下携带会话目录的计数（只列目录，不解析日志）。 */
function countSessionRoot(root) {
	if (root === void 0 || root === "") return 0;
	let projects = [];
	try {
		projects = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return 0;
	}
	let count = 0;
	for (const project of projects) try {
		count += readdirSync(join(root, project), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(root, project, entry.name, "session.jsonl.zstd"))).length;
	} catch {}
	return count;
}
/** 取一个 zstd 文件的第一个完整帧（header record 所在帧；扫描规则与
*  dsh session-persistence-jsonl 的 scanZstdFrames 一致）。 */
function firstZstdFrame(buf) {
	if (buf.length < 4 || buf.readUInt32LE(0) !== 4247762216) return void 0;
	let offset = 4;
	const descriptor = buf.readUInt8(offset);
	offset += 1;
	const single = (descriptor & 32) !== 0;
	const csum = (descriptor & 4) !== 0;
	const dictFlag = descriptor & 3;
	const dictBytes = dictFlag === 3 ? 4 : dictFlag;
	const contentSizeFlag = descriptor >>> 6;
	const contentSizeBytes = contentSizeFlag === 0 ? single ? 1 : 0 : 1 << contentSizeFlag;
	const remainingHeaderBytes = (single ? 0 : 1) + dictBytes + contentSizeBytes;
	if (buf.length - offset < remainingHeaderBytes) return void 0;
	offset += remainingHeaderBytes;
	for (;;) {
		if (buf.length - offset < 3) return void 0;
		const blockHeader = buf.readUIntLE(offset, 3);
		offset += 3;
		const lastBlock = (blockHeader & 1) !== 0;
		const blockType = blockHeader >>> 1 & 3;
		const blockSize = blockHeader >>> 3;
		if (blockType === 3) return void 0;
		const payloadBytes = blockType === 1 ? 1 : blockSize;
		if (buf.length - offset < payloadBytes) return void 0;
		offset += payloadBytes;
		if (lastBlock) break;
	}
	if (csum) {
		if (buf.length - offset < 4) return void 0;
		offset += 4;
	}
	return buf.subarray(0, offset);
}
/** 读一个会话 artifact 的 header cwd（只解压第一个 zstd 帧，成本 ~KB 级）。 */
function readArtifactHeaderCwd(artifact) {
	try {
		const frame = firstZstdFrame(readFileSync(artifact));
		if (frame === void 0) return void 0;
		const first = zstdDecompressSync(frame).toString("utf8").split("\n")[0];
		if (first === void 0) return void 0;
		const parsed = JSON.parse(first);
		return typeof parsed.cwd === "string" ? parsed.cwd : void 0;
	} catch {
		return;
	}
}
/** 把共享根的会话日志复制到独立根（只复制 session.jsonl.zstd，原件保留）。
*  `present` 收集所有「已存在（复制或跳过）」的会话，供载入后进行
*  workspace attach（侧栏分组可见——workspace 账目只随 attach/首次 bootstrap
*  填充，直接复制文件不会写入，2026-08-23 实测）。 */
function importSharedSessions() {
	if (ISOLATED_ROOT === void 0 || SHARED_ROOT === void 0 || ISOLATED_ROOT === SHARED_ROOT) throw new PanelsError("not-configured", "session roots are not configured (SSiD boot must inject SSID_SESSION_* env)", 503);
	let copied = 0;
	let skipped = 0;
	const errors = [];
	const present = [];
	let projects = [];
	try {
		projects = readdirSync(SHARED_ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return {
			copied,
			skipped,
			errors,
			present
		};
	}
	for (const project of projects) {
		const projectSource = join(SHARED_ROOT, project);
		let ids = [];
		try {
			ids = readdirSync(projectSource, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		} catch {
			continue;
		}
		for (const id of ids) {
			const sourceArtifact = join(projectSource, id, "session.jsonl.zstd");
			if (!existsSync(sourceArtifact)) continue;
			const targetArtifact = join(ISOLATED_ROOT, project, id, "session.jsonl.zstd");
			if (existsSync(targetArtifact)) {
				skipped += 1;
				present.push({
					id,
					project,
					source: sourceArtifact
				});
				continue;
			}
			try {
				mkdirSync(dirname(targetArtifact), { recursive: true });
				copyFileSync(sourceArtifact, targetArtifact);
				copied += 1;
				present.push({
					id,
					project,
					source: sourceArtifact
				});
			} catch (error) {
				errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}
	return {
		copied,
		skipped,
		errors: errors.slice(0, 20),
		present
	};
}
/** 把（载入/已存在的）会话 attach 到其 cwd 对应的 workspace：workspace 归属
*  要求「账目记录 + cwd 匹配」（types.ts:17-22），复制文件不写账目，故此步
*  幂等补齐——侧栏分组即时可见。cwd 不存在的会话与无匹配 workspace 的跳过。 */
async function attachCopiedToWorkspaces(ctx, present) {
	const registry = ctx.get("workspaceRegistry");
	if (registry === void 0) return 0;
	const workspaces = registry.list?.() ?? [];
	let attached = 0;
	for (const item of present) {
		const cwd = readArtifactHeaderCwd(item.source);
		if (cwd === void 0) continue;
		let real;
		try {
			real = realpathSync(cwd);
		} catch {
			continue;
		}
		const ws = workspaces.find((w) => w.path === real);
		if (ws === void 0) continue;
		try {
			await ws.attachSession(item.id);
			attached++;
		} catch {}
	}
	return attached;
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
		"notify.get": () => readNotifyConfig(),
		"notify.set": (payload) => {
			const record = payload;
			const next = readNotifyConfig();
			for (const key of [
				"enabled",
				"replyDone",
				"question",
				"approval"
			]) {
				const value = record?.[key];
				if (typeof value === "boolean") next[key] = value;
			}
			mkdirSync(dirname(NOTIFY_CONFIG_PATH), { recursive: true });
			writeFileSync(NOTIFY_CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
			return next;
		},
		"sessionRoot.get": () => {
			return {
				...readSessionRootState(),
				restartable: typeof ctx.get("ssid.shell.restart") === "function",
				sharedRoot: SHARED_ROOT,
				isolatedRoot: ISOLATED_ROOT,
				sharedSessions: countSessionRoot(SHARED_ROOT),
				isolatedSessions: countSessionRoot(ISOLATED_ROOT),
				importedSessions: readImportedSessions().length,
				listNeedsRestart: (() => {
					try {
						const bootedAt = Number(process.env.SSID_BOOTED_AT ?? 0);
						if (!Number.isFinite(bootedAt) || bootedAt === 0) return false;
						return statSync(IMPORTED_SESSIONS_PATH).mtimeMs > bootedAt;
					} catch {
						return false;
					}
				})()
			};
		},
		"sessionRoot.set": (payload) => {
			const record = payload;
			if (typeof record?.isolated !== "boolean") throw new PanelsError("bad-request", "missing or invalid \"isolated\"");
			const next = {
				isolated: record.isolated,
				applied: readSessionRootState().applied
			};
			writeSessionRootState(next);
			return {
				...next,
				restartable: typeof ctx.get("ssid.shell.restart") === "function",
				sharedRoot: SHARED_ROOT,
				isolatedRoot: ISOLATED_ROOT
			};
		},
		"sessionRoot.import": async () => {
			if (!readSessionRootState().isolated) throw new PanelsError("not-isolated", "session isolation is off; enable the switch first");
			const result = importSharedSessions();
			mergeImportedSessions(result.present.map(({ id, project }) => ({
				id,
				project
			})));
			let attached = 0;
			try {
				attached = await attachCopiedToWorkspaces(ctx, result.present);
			} catch {
				attached = 0;
			}
			return {
				...result,
				attached
			};
		},
		"sessionRoot.clear": () => {
			if (ISOLATED_ROOT === void 0 || ISOLATED_ROOT === "") throw new PanelsError("not-configured", "session roots are not configured", 503);
			const imported = readImportedSessions();
			let cleared = 0;
			for (const entry of imported) {
				const dir = join(ISOLATED_ROOT, entry.project, entry.id);
				if (existsSync(dir)) try {
					rmSync(dir, {
						recursive: true,
						force: true
					});
					cleared++;
				} catch {}
			}
			writeImportedSessions([]);
			return { cleared };
		},
		"sessionRoot.restart": () => {
			const restart = ctx.get("ssid.shell.restart");
			if (typeof restart !== "function") throw new PanelsError("restart-unavailable", "SSiD restart channel is unavailable (not booted by the shell?)", 503);
			const activeSessions = (ctx.get("sessions")?.list?.() ?? []).filter((session) => interruptedTurnClosers(session.events).length > 0).length;
			if (activeSessions > 0) return {
				ok: false,
				code: "busy",
				activeSessions
			};
			restart();
			return {
				ok: true,
				activeSessions: 0
			};
		},
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
					code: "api-failed",
					status: res.status,
					message: `GitHub API returned ${res.status}`
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
					code: "api-failed",
					message: error instanceof Error ? error.message : String(error)
				};
			}
		},
		"release-notes": () => {
			try {
				const path = join(dirname(fileURLToPath(import.meta.url)), "..", "release-notes.md");
				return parseReleaseNotes(readFileSync(path, "utf8"));
			} catch (error) {
				return {
					version: null,
					title: null,
					date: null,
					sections: [],
					error: error instanceof Error ? error.message : String(error)
				};
			}
		},
		"update.check": async () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				state: "unavailable",
				message: "更新桥未注入（手动 dsh web / 裸跑）"
			};
			return await bridge.check();
		},
		"update.download": async () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				ok: false,
				error: "更新桥未注入"
			};
			return await bridge.download();
		},
		"update.install": async () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				ok: false,
				error: "更新桥未注入"
			};
			return await bridge.install();
		},
		"update.status": () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				state: "unavailable",
				message: "更新桥未注入"
			};
			const holder = {};
			bridge.onStatus((status) => {
				holder.current = status;
			})();
			return holder.current ?? { state: "idle" };
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
				code: "missing-key",
				message: "DEEPSEEK_API_KEY is not configured"
			};
			const res = await fetch("https://api.deepseek.com/user/balance", { headers: { Authorization: `Bearer ${cred.value}` } });
			if (!res.ok) return {
				ok: false,
				code: "http-failed",
				status: res.status,
				message: "upstream balance query failed"
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
				code: "missing-key",
				message: "MOONSHOT_API_KEY is not configured"
			};
			const res = await fetch("https://api.moonshot.cn/v1/users/me/balance", { headers: { Authorization: `Bearer ${cred.value}` } });
			if (!res.ok) return {
				ok: false,
				code: "http-failed",
				status: res.status,
				message: "upstream balance query failed"
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
