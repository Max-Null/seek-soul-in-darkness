// kernel.ts
import { spawnSync } from "node:child_process";
import { cpSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as join2, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL as pathToFileURL2 } from "node:url";
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  resolveProfileDir
} from "@deepseek-ai/dsh-app-boot";
import { provideCmdline } from "@deepseek-ai/dsh-cmdline";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { DSH_LAUNCH_ENVIRONMENT_KEY } from "@deepseek-ai/dsh-launch-environment";

// module-resolution.ts
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
function isBareSpecifier(specifier) {
  return !specifier.startsWith(".") && !specifier.startsWith("/") && !URL.canParse(specifier);
}
function loaderSrcPrefix(profileBaseUrl) {
  const profileRequire = createRequire(profileBaseUrl);
  const pkgPath = profileRequire.resolve("@deepseek-ai/cordis-plugin-loader/package.json");
  return new URL(".", pathToFileURL(pkgPath)).href;
}
function installProfilePackageResolver(profileBaseUrl) {
  const prefix = loaderSrcPrefix(profileBaseUrl);
  const selfUrl = import.meta.url;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL ?? "";
      const fromLoader = parent.startsWith(prefix) || parent === selfUrl || parent.includes("/vendor/loader/");
      if (!fromLoader || !isBareSpecifier(specifier)) {
        return nextResolve(specifier, context);
      }
      return nextResolve(specifier, { ...context, parentURL: profileBaseUrl });
    }
  });
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    hooks.deregister();
  };
}

// lib/profile-merge.mjs
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
function parseVersion(input) {
  const raw = String(input ?? "").trim().replace(/^[~^>=<\s]+/, "");
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(raw);
  if (m === null) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
}
function cmpPre(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const ra = a.split(".");
  const rb = b.split(".");
  const len = Math.max(ra.length, rb.length);
  for (let i = 0; i < len; i++) {
    if (i >= ra.length) return -1;
    if (i >= rb.length) return 1;
    const x = ra[i];
    const y = rb[i];
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      if (+x !== +y) return +x < +y ? -1 : 1;
      continue;
    }
    if (xn !== yn) return xn ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return null;
  for (const key of ["major", "minor", "patch"]) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }
  const preCmp = cmpPre(pa.pre, pb.pre);
  if (preCmp !== 0) return preCmp;
  return 0;
}
function shouldDropPending(declared, pendingVersion) {
  if (typeof declared !== "string" || declared === "") return true;
  const kind = /^(file:|link:|workspace:|npm:)/.test(declared) ? "dir" : "registry";
  if (kind === "dir") return true;
  const cmp = compareVersions(cleanSpec(declared), pendingVersion);
  if (cmp === null) return true;
  return cmp >= 0;
}
function cleanSpec(spec) {
  const raw = String(spec ?? "");
  const first = raw.split(/[\s|,]+/).filter(Boolean)[0] ?? raw;
  return first.replace(/^[~^>=<]+/, "");
}

// kernel.ts
var BIN_NAME = "ssid";
var PROFILE_NAME = "ssid";
var PROFILE_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
var ROOT_CONFIG_FILENAME = "cordis.yml";
var TELEMETRY_ROW_ID = "session-telemetry-otel";
var SSID_SHELL_RESTART_KEY = "ssid.shell.restart";
var SSID_SHELL_UPDATE_KEY = "ssid.shell.update";
var SSID_SHELL_SCREENSHOT_KEY = "ssid.shell.screenshot";
function sourceRuntime(root) {
  return {
    kind: "source",
    installAnchor: join2(root, "apps", "cli", "package.json"),
    agentPresetsRoot: join2(root, "apps", "cli", "config", "agent-presets")
  };
}
function detectLoadedKernel(probe = "@deepseek-ai/dsh-app-boot") {
  let url;
  try {
    url = import.meta.resolve(probe);
  } catch {
    return { sourceKind: "unknown" };
  }
  if (!url.startsWith("file:")) return { sourceKind: "unknown" };
  const entry = fileURLToPath(url);
  let dir = dirname(entry);
  for (let i = 0; i < 12; i++) {
    const candidate = join2(dir, "package.json");
    if (existsSync2(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8"));
        const sourceKind = dir.includes(`${sep}node_modules${sep}`) ? "bundled" : "source";
        return { version: pkg.version, sourceKind };
      } catch {
        return { sourceKind: "unknown" };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { sourceKind: "unknown" };
}
function bundledRuntime(root) {
  return {
    kind: "bundled",
    installAnchor: join2(root, "node_modules", "@deepseek-ai", "dsh", "package.json"),
    agentPresetsRoot: join2(root, "node_modules", "@deepseek-ai", "dsh", "config", "agent-presets")
  };
}
function resolveDshRuntime() {
  const fromEnv = process.env.DSH_CHECKOUT?.trim();
  if (fromEnv !== void 0 && fromEnv !== "") {
    const envRoot = resolve(fromEnv);
    if (existsSync2(join2(envRoot, "apps", "cli", "package.json"))) return sourceRuntime(envRoot);
    if (existsSync2(join2(envRoot, "node_modules", "@deepseek-ai", "dsh", "package.json"))) {
      return bundledRuntime(envRoot);
    }
    throw new Error(
      `DSH_CHECKOUT \u6307\u5411\u4E86\u65E0\u6548\u8DEF\u5F84\uFF1A${envRoot}
\u9700\u8981 DeepSeek Harness \u6E90\u7801\u4ED3\u5E93\u6839\uFF08\u542B apps/cli/package.json\uFF09\uFF0C\u6216\u5185\u7F6E dsh-runtime \u76EE\u5F55\u3002`
    );
  }
  const defaultRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../deepseek-harness");
  if (existsSync2(join2(defaultRoot, "apps", "cli", "package.json"))) return sourceRuntime(defaultRoot);
  throw new Error(
    `\u65E0\u6CD5\u5B9A\u4F4D DeepSeek Harness \u8FD0\u884C\u65F6\uFF1A\u9ED8\u8BA4\u8DEF\u5F84 ${defaultRoot} \u6CA1\u6709\u6E90\u7801\u3002
\u8BF7\u91CD\u65B0\u5B89\u88C5\u601D\u7075\uFF08\u65B0\u7248\u5B89\u88C5\u5305\u81EA\u5E26\u8FD0\u884C\u73AF\u5883\uFF09\uFF0C\u6216\u6267\u884C\uFF1A
  git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness <\u8DEF\u5F84>
\u7136\u540E\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF DSH_CHECKOUT=<\u8DEF\u5F84>\uFF0C\u518D\u91CD\u65B0\u6253\u5F00\u601D\u7075\u3002`
  );
}
function syncPresetSkills(sourceDir, targetDir) {
  let entries;
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  try {
    mkdirSync2(targetDir, { recursive: true });
  } catch (error) {
    console.warn(`ssid: preset skills sync failed to create ${targetDir}: ${String(error)}`);
    return 0;
  }
  let copied = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".system") continue;
    const target = join2(targetDir, entry.name);
    if (existsSync2(target)) continue;
    try {
      cpSync(join2(sourceDir, entry.name), target, { recursive: true });
      copied++;
    } catch (error) {
      console.warn(`ssid: preset skill "${entry.name}" sync failed: ${String(error)}`);
    }
  }
  if (copied > 0) console.log(`ssid: preset skills synced ${copied} new -> ${targetDir}`);
  return copied;
}
function applyPendingPluginUpdates(profileDir) {
  const pendingDir = join2(homedir(), ".ssid", "pending-plugin-updates");
  const indexFile = join2(pendingDir, "index.json");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(indexFile, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return;
  let declaredDeps = {};
  try {
    const manifest = JSON.parse(readFileSync(join2(profileDir, "package.json"), "utf8"));
    declaredDeps = manifest.dependencies ?? {};
  } catch {
  }
  const ssidPnpm = process.env.SSID_PNPM;
  const pnpmNode = process.env.SSID_MCP_NODE ?? "node";
  const candidates = [
    ...ssidPnpm !== void 0 && ssidPnpm !== "" ? [/\.(cjs|mjs|js)$/i.test(ssidPnpm) ? `"${pnpmNode}" "${ssidPnpm}"` : ssidPnpm] : [],
    "pnpm",
    "pnpm.cmd"
  ];
  const remaining = [];
  for (const raw of parsed) {
    const entry = raw;
    if (entry === null || typeof entry.name !== "string" || typeof entry.version !== "string") continue;
    const spec = `${entry.name}@${entry.version}`;
    const declared = declaredDeps[entry.name];
    if (shouldDropPending(declared, entry.version)) {
      if (typeof entry.tgz === "string") {
        try {
          rmSync(entry.tgz, { force: true });
        } catch {
        }
      }
      console.log(
        `ssid: pending plugin update dropped (declared=${declared ?? "(absent)"} pending=${entry.version}): ${entry.name}`
      );
      continue;
    }
    let done = false;
    let detail = "no pnpm candidate found";
    for (const command of candidates) {
      const result = spawnSync(
        command,
        ["add", "-w", spec],
        { cwd: profileDir, shell: true, windowsHide: true, timeout: 10 * 6e4, encoding: "utf8" }
      );
      if (result.status === 0) {
        done = true;
        break;
      }
      detail = result.error !== void 0 ? result.error.message : `exit ${result.status ?? 1}${typeof result.stderr === "string" ? `
${result.stderr.slice(-1200)}` : ""}`;
    }
    if (done) {
      if (typeof entry.tgz === "string") {
        try {
          rmSync(entry.tgz, { force: true });
        } catch {
        }
      }
      console.log(`ssid: pending plugin update applied: ${spec}`);
    } else {
      console.log(`ssid: pending plugin update deferred (retry next boot): ${spec}
  ${detail}`);
      remaining.push(entry);
    }
  }
  try {
    if (remaining.length === 0) rmSync(indexFile, { force: true });
    else writeFileSync(indexFile, JSON.stringify(remaining, null, 2) + "\n");
  } catch {
  }
}
async function bootKernel(exit = (code) => process.exit(code), opts = {}) {
  const home = resolveDshHome();
  const profileDir = resolveProfileDir(PROFILE_NAME, home);
  process.env.SSID_PROFILE_DIR = profileDir;
  if (!existsSync2(join2(profileDir, "package.json"))) {
    initProfile(profileDir, PROFILE_BUNDLES);
  }
  syncPresetSkills(join2(profileDir, "skills"), join2(home, "skills"));
  process.env.SSID_PENDING_CONSUMER = "1";
  applyPendingPluginUpdates(profileDir);
  let runtime;
  const deployedAnchor = join2(profileDir, "node_modules", "@deepseek-ai", "dsh", "package.json");
  if (opts.preferBundled === true) {
    if (existsSync2(deployedAnchor)) {
      runtime = bundledRuntime(profileDir);
    } else {
      runtime = resolveDshRuntime();
    }
  } else if (process.env.DSH_CHECKOUT === void 0 && existsSync2(deployedAnchor)) {
    runtime = bundledRuntime(profileDir);
  } else {
    runtime = resolveDshRuntime();
  }
  const installAnchor = runtime.installAnchor;
  const dshVersion = (() => {
    const detected = detectLoadedKernel();
    if (detected.version !== void 0) return detected.version;
    try {
      const pkg = JSON.parse(readFileSync(installAnchor, "utf8"));
      return pkg.version ?? "unknown";
    } catch {
      return "unknown";
    }
  })();
  await healProfilesModuleFallback({ installAnchor, home });
  const releaseResolver = installProfilePackageResolver(
    pathToFileURL2(join2(profileDir, "package.json")).href
  );
  try {
    const profile = loadProfile(BIN_NAME, PROFILE_NAME, installAnchor, home);
    const rootConfig = join2(profile.dir, ROOT_CONFIG_FILENAME);
    writeFileSync(rootConfig, "[]\n");
    const safeMode = process.env.SSID_SAFE_MODE === "1";
    const layers = safeMode ? profile.layers.filter((layer) => layer.packageName.startsWith("@deepseek-ai/")) : profile.layers;
    if (safeMode) {
      console.log(
        `ssid: \u7EAF\u51C0\u6A21\u5F0F\uFF08SSID_SAFE_MODE=1\uFF09\uFF1A${String(profile.layers.length)} \u5C42\u4E2D\u4FDD\u7559\u5B98\u65B9 ${String(layers.length)} \u5C42\uFF1A${layers.map((l) => l.packageName).join(", ")}\uFF1B\u4E22\u5F03 ${String(profile.patches.length)} \u6761 profile patch \u4E0E home patch`
      );
    }
    const homePatches = safeMode ? [] : loadOptionalPatches(BIN_NAME, join2(home, PROFILE_PATCH_FILENAME)) ?? [];
    const patches = [
      ...layers.flatMap((layer) => layer.patches),
      ...safeMode ? [] : profile.patches,
      ...homePatches
    ];
    const rows = /* @__PURE__ */ new Map();
    for (const row of composeEntries([patches])) {
      if (typeof row.id === "string") rows.set(row.id, row);
    }
    const presets = rows.get("agent-presets");
    if (presets !== void 0) {
      const shippedRoot = runtime.agentPresetsRoot;
      patches.push({
        id: "agent-presets",
        config: {
          ...typeof presets.config === "object" && presets.config !== null && !Array.isArray(presets.config) ? presets.config : {},
          roots: [{ path: shippedRoot, trust: "system" }]
        }
      });
    }
    if ((process.env.DSH_TELEMETRY_DISABLED ?? "") !== "" && rows.has(TELEMETRY_ROW_ID)) {
      patches.push({ id: TELEMETRY_ROW_ID, disabled: true });
    }
    const sessionRootConfigPath = join2(homedir(), ".ssid", "session-root.json");
    const isolatedSessionsRoot = join2(home, "sessions-ssid");
    const sharedSessionsRoot = join2(home, "sessions");
    let isolatedSessionRoot = true;
    try {
      const parsed = JSON.parse(readFileSync(sessionRootConfigPath, "utf8"));
      isolatedSessionRoot = parsed?.isolated === true;
    } catch {
    }
    process.env.SSID_SESSION_ISOLATED_ROOT = isolatedSessionsRoot;
    process.env.SSID_SESSION_SHARED_ROOT = sharedSessionsRoot;
    process.env.SSID_BOOTED_AT = String(Date.now());
    if (isolatedSessionRoot) {
      patches.push({
        id: "session-persistence-jsonl",
        config: { root: isolatedSessionsRoot }
      });
    }
    try {
      if (!existsSync2(sessionRootConfigPath)) {
        mkdirSync2(dirname(sessionRootConfigPath), { recursive: true });
        writeFileSync(
          sessionRootConfigPath,
          JSON.stringify({ isolated: true, applied: true }, null, 2) + "\n"
        );
      } else {
        const prev = JSON.parse(readFileSync(sessionRootConfigPath, "utf8"));
        writeFileSync(
          sessionRootConfigPath,
          JSON.stringify({ ...prev ?? {}, applied: isolatedSessionRoot }, null, 2) + "\n"
        );
      }
    } catch {
    }
    const environment = loadLayeredEnv(BIN_NAME);
    const ctx = await boot(BIN_NAME, rootConfig, structuredClone(patches), (hostCtx) => {
      hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment);
      if (opts.restart !== void 0) hostCtx.provide(SSID_SHELL_RESTART_KEY, opts.restart);
      if (opts.update !== void 0) hostCtx.provide(SSID_SHELL_UPDATE_KEY, opts.update);
      if (opts.screenshot !== void 0) hostCtx.provide(SSID_SHELL_SCREENSHOT_KEY, opts.screenshot);
      provideCmdline(hostCtx, {
        // rc.8 起 dsh web 默认打开浏览器（openBrowser 默认 true）；壳内嵌场景
        // 必须关闭，否则每次启动弹系统浏览器（--no-open 由 web-startup 解析）。
        args: ["--host", "127.0.0.1", "--port", "0", "--no-open"],
        exit
      });
    });
    const webServer = ctx.get("webServer");
    if (webServer === void 0) {
      throw new Error("ssid: booted tree has no webServer service");
    }
    const baseUrl = `http://127.0.0.1:${String(webServer.port)}/`;
    const connection = ctx.get("connection");
    const url = typeof connection?.authenticatedUrl === "function" ? connection.authenticatedUrl(baseUrl) : baseUrl;
    return {
      port: webServer.port,
      url,
      dshVersion,
      ctx,
      get: (name) => ctx.get(name),
      shutdown: async (code) => {
        await ctx.fiber.dispose();
        exit(code);
      }
    };
  } catch (cause) {
    releaseResolver();
    throw cause;
  }
}

// kernel-child-bridge.ts
import { randomUUID } from "node:crypto";
var CALL_TIMEOUT_MS = 3e4;
var pending = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Map();
function call(name, method, args = []) {
  return new Promise((resolve2, reject) => {
    const callId = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`\u80FD\u529B\u8C03\u7528\u8D85\u65F6\uFF1A${name}.${method}\uFF08\u4E3B\u8FDB\u7A0B ${CALL_TIMEOUT_MS / 1e3}s \u672A\u54CD\u5E94\uFF09`));
    }, CALL_TIMEOUT_MS);
    pending.set(callId, { resolve: resolve2, reject, timer });
    try {
      process.send?.({ type: "capability", name, method, callId, args });
    } catch (cause) {
      clearTimeout(timer);
      pending.delete(callId);
      reject(new Error(`\u80FD\u529B\u8C03\u7528\u65E0\u6CD5\u9001\u8FBE\u4E3B\u8FDB\u7A0B\uFF1A${String(cause)}`));
    }
  });
}
function handleParentMessage(msg) {
  if (msg === null || typeof msg !== "object") return false;
  const m = msg;
  if (m.type === "capabilityReply") {
    const slot = pending.get(m.callId);
    if (slot === void 0) return true;
    clearTimeout(slot.timer);
    pending.delete(m.callId);
    if (m.ok) slot.resolve(m.value);
    else slot.reject(new Error(m.error));
    return true;
  }
  if (m.type === "capabilityEvent") {
    for (const cb of listeners.get(m.name) ?? []) {
      try {
        cb(m.payload);
      } catch {
      }
    }
    return true;
  }
  return false;
}
function createCapabilityProxies() {
  const subscribe = (name, cb) => {
    const set = listeners.get(name) ?? /* @__PURE__ */ new Set();
    set.add(cb);
    listeners.set(name, set);
    return () => {
      set.delete(cb);
    };
  };
  return {
    restart: () => {
      void call("restart", "invoke").catch(() => {
      });
    },
    update: {
      check: async () => await call("update", "check"),
      download: async () => await call("update", "download"),
      install: async () => await call("update", "install"),
      onStatus: (callback) => subscribe("update:status", (payload) => {
        callback(payload ?? {});
      })
    },
    screenshot: {
      trigger: () => {
        void call("screenshot", "trigger").catch(() => {
        });
      },
      apply: () => {
        void call("screenshot", "apply").catch(() => {
        });
        return true;
      }
    }
  };
}

// kernel-child.ts
var send = (msg) => {
  try {
    process.send?.(msg);
  } catch {
  }
};
function forwardEvent(event) {
  const type = event.type;
  if (type === "turn/start") {
    const data = event.data;
    send({ type: "event", name: "turn/start", payload: { turn: data?.turn, time: event.time, nowMs: Date.now() } });
    return;
  }
  if (type === "turn/end") {
    const data = event.data;
    send({
      type: "event",
      name: "turn/end",
      payload: { turn: data?.turn, time: event.time, reasonKind: data?.reason?.kind }
    });
    return;
  }
  if (type === "approval/asked") {
    const data = event.data;
    send({ type: "event", name: "approval/asked", payload: { toolName: data?.toolName } });
  }
}
async function main() {
  const capabilities = createCapabilityProxies();
  const kernel = await bootKernel(
    (code) => {
      process.exit(code);
    },
    {
      ...capabilities,
      // 打包形态**必须**显式声明「优先内置闭包」。缺了它 kernel.ts 会落到
      // resolveDshRuntime()：先认 $DSH_CHECKOUT（用户残留变量会把运行时劫持到旧源码，
      // 即 pitfalls #5 的幽灵依赖），再认 `<bundle目录>/../../deepseek-harness`
      // ——打包后那是安装目录附近，必然不存在，boot 直接失败。
      // 判据由主进程传入：只有 Electron 主进程知道 app.isPackaged，子进程不知道。
      preferBundled: process.env.SSID_KERNEL_CHILD_PACKAGED === "1"
    }
  );
  send({
    type: "ready",
    port: kernel.port,
    url: kernel.url,
    dshVersion: kernel.dshVersion,
    pid: process.pid
  });
  kernel.ctx.on("session/event", (_session, event) => {
    forwardEvent(event);
  });
  const uq = kernel.get("userQuestions");
  const ask = uq?.ask;
  if (uq !== void 0 && typeof ask === "function") {
    const originalAsk = ask.bind(uq);
    uq.ask = async (...args) => {
      send({ type: "event", name: "question/asked" });
      return await originalAsk(...args);
    };
    console.error("ssid: kernel-child \u5DF2\u5305\u88C5 userQuestions\uFF08AI \u63D0\u95EE\u901A\u77E5\u53EF\u7528\uFF09");
  } else {
    console.error("ssid: kernel-child \u672A\u63D0\u4F9B userQuestions\uFF0CAI \u63D0\u95EE\u901A\u77E5\u4E0D\u53EF\u7528");
  }
  process.on("message", (msg) => {
    if (handleParentMessage(msg)) return;
    if (msg?.type === "shutdown") {
      void kernel.shutdown(0).catch((cause) => {
        send({ type: "fatal", message: `shutdown \u5931\u8D25\uFF1A${String(cause)}` });
        process.exit(1);
      });
    }
  });
  process.on("disconnect", () => {
    process.exit(0);
  });
}
void main().catch((cause) => {
  const err = cause instanceof Error ? cause : new Error(String(cause));
  send({ type: "fatal", message: err.message, stack: err.stack });
  console.error("ssid kernel-child \u542F\u52A8\u5931\u8D25\uFF1A", err.stack ?? err.message);
  process.exit(1);
});
