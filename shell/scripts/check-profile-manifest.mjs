#!/usr/bin/env node
/**
 * check-profile-manifest —— profile 侧 manifest 必须能通过「包身份解析」（手册 §7 坑 #66）
 *
 * ## 为什么值得一个门
 *
 * 2026-10-02 实机事故：往 `~/.dsh/profiles/ssid/cordis.patch.yml` 插了一条指向本地文件的
 * 插件条目（一次性修复脚本），而该文件向上找到的最近 `package.json`（就是 profile 根那份，
 * 官方 `initProfile` 建的骨架）声明了 `name` 却没有 `version`。请求侧给每次 DeepSeek 请求
 * 收集插件包清单的 provider（`@deepseek-ai/dsh-plugin-package-inventory-deepseek` 的
 * `identityFromManifest`）对「有 name 无 version」是**硬失败**，于是：
 *
 *   - **每一次模型请求**在发出前就抛错（`REQUEST_EXTENSION`），界面只显示「本轮运行失败」；
 *   - 插件本身**正常激活**、YAML 合法、日志无异常 —— 整条链路沉默；
 *   - 报错文案指向「DeepSeek 请求」，把排查方向带向网络/密钥。
 *
 * 事故复盘全文见 `docs/决策/2026-10-02-请求扩展准备失败-本地插件条目打死模型请求.md`。
 * 本门把这条规则机械化的两个面都钉住：
 *
 *   A. **受管 profile 根 manifest 必须声明非空 `version`** —— 根因面；
 *   B. **补丁里以本地文件路径插入的条目**，其「最近祖先 `package.json`」必须带非空
 *      `version` —— 机制面。B 覆盖 A 管不到的情形（条目指向 profile 之外的目录）。
 *
 * 管不到的：DSH 官方自建的 profile（`desktop` / `headless` 等）不在白名单里 ——
 * 它们由官方 `initProfile` 生成、不属于思灵的交付面。
 *
 * 退出码契约同其它门：0 通过 / 1 有违规 / 2 空语料。
 * 自测注入：`SSID_PROFILE_MANIFEST_ROOTS`（`path.delimiter` 分隔：目录或 package.json 路径）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGate } from './lib/gate-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');

/** 补丁层文件名（与 profile 侧的 `PATCH_FILENAME` 同值）。 */
const PATCH_FILENAME = 'cordis.patch.yml';

/** 受管 profile 白名单：思灵交付面（模板）与单元里在维护的运行时 profile。 */
const DEFAULT_ROOTS = [
  { label: 'shell/profile-template', direction: path.join(SHELL, 'profile-template') },
  { label: 'profile:ssid', direction: path.join(DSH_HOME, 'profiles', 'ssid') },
  { label: 'profile:web', direction: path.join(DSH_HOME, 'profiles', 'web') },
];

const roots = process.env.SSID_PROFILE_MANIFEST_ROOTS
  ? process.env.SSID_PROFILE_MANIFEST_ROOTS.split(path.delimiter).filter(Boolean)
    .map((p) => ({ label: p, direction: p.endsWith('.json') ? path.dirname(p) : p }))
  : DEFAULT_ROOTS;

const gate = createGate({ id: 'check-profile-manifest', label: 'profile manifest 可解析性', base: REPO });

/** 非空字符串判定 —— 与内核侧 `identityFromManifest` 的判据同形。 */
function declared(value) {
  return typeof value === 'string' && value.length > 0;
}

/** 读一份 manifest 的 `version`，并给出违规定位用的行号。 */
function readVersion(manifestPath) {
  const text = fs.readFileSync(manifestPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.code ?? error.message}`);
  }
  const line = text.split('\n').findIndex((l) => /^\s*"version"\s*:/.test(l));
  return { version: parsed?.version, line: line < 0 ? null : line + 1 };
}

/**
 * 条目 `name` 的取值：去引号、去行尾注释。
 * @param raw - YAML 行里 `name:` 之后的部分。
 */
function specifierOf(raw) {
  const text = raw.trim();
  const quote = text[0];
  if (quote === "'" || quote === '"') {
    const end = text.indexOf(quote, 1);
    return end < 0 ? text.slice(1) : text.slice(1, end);
  }
  const comment = text.indexOf(' #');
  return (comment < 0 ? text : text.slice(0, comment)).trim();
}

/** 是否是以本地文件/路径形式给出的模块（裸包名与 `cordis:` 都不算）。 */
function isLocalModule(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/')
    || specifier.startsWith('file:') || /^[A-Za-z]:[\\/]/.test(specifier);
}

/** 本地模块说明符 → 文件系统路径。 */
function modulePathOf(specifier, baseDir) {
  if (specifier.startsWith('file:')) return fileURLToPath(specifier);
  return path.isAbsolute(specifier) ? path.normalize(specifier) : path.resolve(baseDir, specifier);
}

/** 与内核 `nearestManifest` 同形的逐级上溯。 */
function nearestManifest(modulePath) {
  let current = path.dirname(modulePath);
  const root = path.parse(current).root;
  for (;;) {
    const manifest = path.join(current, 'package.json');
    if (fs.existsSync(manifest)) return manifest;
    if (current === root) return undefined;
    current = path.dirname(current);
  }
}

/** 扫补丁里的 `name:` 行，返回本地模块条目（含行号）。 */
function localEntries(patchPath) {
  const lines = fs.readFileSync(patchPath, 'utf8').split('\n');
  const found = [];
  lines.forEach((line, index) => {
    const hit = /^[ \t]*(?:-[ \t]*)?name[ \t]*:[ \t]*(.+?)[ \t]*$/.exec(line);
    if (hit === null) return;
    const specifier = specifierOf(hit[1]);
    if (isLocalModule(specifier)) found.push({ specifier, line: index + 1 });
  });
  return found;
}

for (const { label, direction } of roots) {
  const manifestPath = path.join(direction, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    gate.info(`跳过（不存在）：${label}`);
    continue;
  }

  // A. 根 manifest 自身必须有非空 version。
  gate.inspect();
  let rootVersion;
  try {
    rootVersion = readVersion(manifestPath);
  } catch (error) {
    gate.violation(manifestPath, null, String(error.message));
    continue;
  }
  if (!declared(rootVersion.version)) {
    gate.violation(
      manifestPath,
      rootVersion.line,
      '缺少非空 version —— 本地插件条目的包身份解析会命中这份 manifest 并硬失败，'
      + '该实例的**每一次模型请求**都会以 REQUEST_EXTENSION 失败（手册 §7 坑 #66）',
    );
  } else {
    gate.info(`${label}：根 manifest version=${rootVersion.version}`);
  }

  // B. 补丁里以本地路径插入的条目，其最近祖先 manifest 也要有 version。
  const patchPath = path.join(direction, PATCH_FILENAME);
  if (!fs.existsSync(patchPath)) continue;
  const entries = localEntries(patchPath);
  if (entries.length === 0) continue;
  gate.info(`${label}：本地文件条目 ${entries.length} 条`);
  for (const entry of entries) {
    gate.inspect();
    const manifest = nearestManifest(modulePathOf(entry.specifier, direction));
    if (manifest === undefined) {
      // 没有祖先 manifest ⇒ 内核侧按"非包模块"排除，不是违规。
      gate.info(`  ${entry.specifier}：无祖先 manifest（内核按非包模块排除）`);
      continue;
    }
    let found;
    try {
      found = readVersion(manifest);
    } catch (error) {
      gate.violation(patchPath, entry.line, `${entry.specifier}：祖先 manifest ${manifest} ${String(error.message)}`);
      continue;
    }
    if (!declared(found.version)) {
      gate.violation(
        patchPath,
        entry.line,
        `本地插件条目 ${entry.specifier} 的最近祖先 manifest ${manifest} 缺非空 version`
        + ' —— 该实例的每一次模型请求都会失败（手册 §7 坑 #66）',
      );
    }
  }
}

process.exit(gate.done());
