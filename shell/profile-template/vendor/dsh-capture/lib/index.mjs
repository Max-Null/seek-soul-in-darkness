import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
//#endregion
//#region ../dsh-chat-rail/node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.5/node_modules/@deepseek-ai/cosmokit/lib/index.js
var lib_exports = /* @__PURE__ */ __exportAll({
	Binary: () => Binary,
	Time: () => Time,
	arrayBufferToBase64: () => arrayBufferToBase64,
	arrayBufferToHex: () => arrayBufferToHex,
	base64ToArrayBuffer: () => base64ToArrayBuffer,
	camelCase: () => camelCase,
	camelize: () => camelize,
	capitalize: () => capitalize,
	clone: () => clone,
	contain: () => contain,
	createVolatile: () => createVolatile,
	deduplicate: () => deduplicate,
	deepEqual: () => deepEqual,
	defineProperty: () => defineProperty,
	difference: () => difference,
	filterKeys: () => filterKeys,
	formatProperty: () => formatProperty,
	hexToArrayBuffer: () => hexToArrayBuffer,
	hyphenate: () => hyphenate,
	intersection: () => intersection,
	is: () => is,
	isNonNullable: () => isNonNullable,
	isNullable: () => isNullable,
	isPlainObject: () => isPlainObject,
	isVolatile: () => isVolatile,
	makeArray: () => makeArray,
	mapValues: () => mapValues,
	noop: () => noop,
	omit: () => omit,
	paramCase: () => paramCase,
	pick: () => pick,
	remove: () => remove,
	sanitize: () => sanitize,
	snakeCase: () => snakeCase,
	trimSlash: () => trimSlash,
	uncapitalize: () => uncapitalize,
	union: () => union,
	updateVolatile: () => updateVolatile,
	valueMap: () => mapValues,
	volatileEntries: () => volatileEntries
});
/** No-op callback returning `undefined` at runtime and `any` at type level. */
function noop() {}
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true when a value is neither `null` nor `undefined`. */
function isNonNullable(value) {
	return !isNullable(value);
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Omit selected keys from a shallow object copy. */
function omit(source, keys) {
	if (!keys) return { ...source };
	const result = { ...source };
	for (const key of keys) Reflect.deleteProperty(result, key);
	return result;
}
/** Define a non-enumerable writable property and return the object. */
function defineProperty(object, key, value) {
	return Object.defineProperty(object, key, {
		writable: true,
		value,
		enumerable: false
	});
}
/** Return true when every item in `array2` is present in `array1`. */
function contain(array1, array2) {
	return array2.every((item) => array1.includes(item));
}
/** Return items that appear in both arrays. */
function intersection(array1, array2) {
	return array1.filter((item) => array2.includes(item));
}
/** Return items from `array1` that do not appear in `array2`. */
function difference(array1, array2) {
	return array1.filter((item) => !array2.includes(item));
}
/** Return the set-union of two arrays while preserving first occurrence order. */
function union(array1, array2) {
	return Array.from(/* @__PURE__ */ new Set([...array1, ...array2]));
}
/** Remove duplicate values while preserving first occurrence order. */
function deduplicate(array) {
	return [...new Set(array)];
}
/** Remove one item from an array and report whether it was found. */
function remove(list, item) {
	const index = list?.indexOf(item);
	if (index >= 0) {
		list.splice(index, 1);
		return true;
	} else return false;
}
/** Normalize nullish, scalar, or array input to an array. */
function makeArray(source) {
	return Array.isArray(source) ? source : isNullable(source) ? [] : [source];
}
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value) => {
			current = value;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
/**
* Collect config references without descending into their snapshots or opaque objects.
* @internal
* @param value - parsed config; cyclic ordinary fields are visited once per path.
* @returns references and their object-key paths, including an empty path for a root reference.
*/
function volatileEntries(value) {
	const ancestors = /* @__PURE__ */ new Set();
	function visit(value, path) {
		if (isVolatile(value)) return [{
			path,
			ref: value
		}];
		if (!value || typeof value !== "object" || ancestors.has(value)) return [];
		if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return [];
		ancestors.add(value);
		try {
			return Object.entries(value).flatMap(([key, child]) => visit(child, [...path, key]));
		} finally {
			ancestors.delete(value);
		}
	}
	return visit(value, []);
}
/**
* Commit an already validated immutable snapshot from another reference.
* @internal
* @param target - the owning plugin's stable reference.
* @param source - a newly parsed candidate reference.
*/
function updateVolatile(target, source) {
	target[write](source.get());
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a, b) {
		if (a === b) return true;
		if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
		if (ancestors.has(a)) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		ancestors.add(a);
		try {
			return check(Array.isArray, (a, b) => {
				if (a.length !== b.length) return false;
				for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
				return true;
			}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a,
				...b
			}).every((key) => compare(a[key], b[key])));
		} finally {
			ancestors.delete(a);
		}
	}
	return compare(a, b);
}
/** Uppercase the first character of a string. */
function capitalize(source) {
	return source.charAt(0).toUpperCase() + source.slice(1);
}
/** Lowercase the first character of a string. */
function uncapitalize(source) {
	return source.charAt(0).toLowerCase() + source.slice(1);
}
/** Convert dash or underscore delimited text to camelCase. */
function camelCase(source) {
	return source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase());
}
function tokenize(source, delimiters, delimiter) {
	const output = [];
	let state = 0;
	for (let i = 0; i < source.length; i++) {
		const code = source.charCodeAt(i);
		if (code >= 65 && code <= 90) {
			if (state === 1) {
				const next = source.charCodeAt(i + 1);
				if (next >= 97 && next <= 122) output.push(delimiter);
				output.push(code + 32);
			} else {
				if (state !== 0) output.push(delimiter);
				output.push(code + 32);
			}
			state = 1;
		} else if (code >= 97 && code <= 122) {
			output.push(code);
			state = 2;
		} else if (delimiters.includes(code)) {
			if (state !== 0) output.push(delimiter);
			state = 0;
		} else output.push(code);
	}
	return String.fromCharCode(...output);
}
/** Convert text to dash-delimited parameter case. */
function paramCase(source) {
	return tokenize(source, [45, 95], 45);
}
/** Convert text to underscore-delimited snake case. */
function snakeCase(source) {
	return tokenize(source, [45, 95], 95);
}
/** Format a property key as a JavaScript member access suffix. */
function formatProperty(key) {
	if (typeof key !== "string") return `[${key.toString()}]`;
	return /^[a-z_$][\w$]*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}
/** Remove one trailing slash from a path string. */
function trimSlash(source) {
	return source.replace(/\/$/, "");
}
/** Ensure a path starts with `/` and has no trailing slash. */
function sanitize(source) {
	if (!source.startsWith("/")) source = "/" + source;
	return trimSlash(source);
}
var write, Binary, base64ToArrayBuffer, arrayBufferToBase64, hexToArrayBuffer, arrayBufferToHex, camelize, hyphenate, Time;
var init_lib = __esmMin((() => {
	write = Symbol.for("cosmokit.volatile.write");
	(function(Binary) {
		Binary.is = isArrayBufferLike;
		Binary.isSource = isArrayBufferSource;
		function fromSource(source) {
			if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
			else return source;
		}
		Binary.fromSource = fromSource;
		function toBase64(source) {
			source = fromSource(source);
			if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
			let binary = "";
			const bytes = new Uint8Array(source);
			for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
			return btoa(binary);
		}
		Binary.toBase64 = toBase64;
		function fromBase64(source) {
			if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
			return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
		}
		Binary.fromBase64 = fromBase64;
		function toHex(source) {
			source = fromSource(source);
			if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
			return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
		}
		Binary.toHex = toHex;
		function fromHex(source) {
			if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
			const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
			const buffer = [];
			for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
			return Uint8Array.from(buffer).buffer;
		}
		Binary.fromHex = fromHex;
	})(Binary || (Binary = {}));
	base64ToArrayBuffer = Binary.fromBase64;
	arrayBufferToBase64 = Binary.toBase64;
	hexToArrayBuffer = Binary.fromHex;
	arrayBufferToHex = Binary.toHex;
	camelize = camelCase;
	hyphenate = paramCase;
	(function(Time) {
		Time.millisecond = 1;
		Time.second = 1e3;
		Time.minute = Time.second * 60;
		Time.hour = Time.minute * 60;
		Time.day = Time.hour * 24;
		Time.week = Time.day * 7;
		let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
		function setTimezoneOffset(offset) {
			timezoneOffset = offset;
		}
		Time.setTimezoneOffset = setTimezoneOffset;
		function getTimezoneOffset() {
			return timezoneOffset;
		}
		Time.getTimezoneOffset = getTimezoneOffset;
		function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
			if (typeof date === "number") date = new Date(date);
			if (offset === void 0) offset = timezoneOffset;
			return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
		}
		Time.getDateNumber = getDateNumber;
		function fromDateNumber(value, offset) {
			const date = new Date(value * Time.day);
			if (offset === void 0) offset = timezoneOffset;
			return new Date(+date + offset * Time.minute);
		}
		Time.fromDateNumber = fromDateNumber;
		const numeric = /\d+(?:\.\d+)?/.source;
		const timeRegExp = new RegExp(`^${[
			"w(?:eek(?:s)?)?",
			"d(?:ay(?:s)?)?",
			"h(?:our(?:s)?)?",
			"m(?:in(?:ute)?(?:s)?)?",
			"s(?:ec(?:ond)?(?:s)?)?"
		].map((unit) => `(${numeric}${unit})?`).join("")}$`);
		function parseTime(source) {
			const capture = timeRegExp.exec(source);
			if (!capture) return 0;
			return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
		}
		Time.parseTime = parseTime;
		function parseDate(date) {
			const parsed = parseTime(date);
			if (parsed) date = Date.now() + parsed;
			else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
			else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
			return date ? new Date(date) : /* @__PURE__ */ new Date();
		}
		Time.parseDate = parseDate;
		function format(ms) {
			const abs = Math.abs(ms);
			if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
			else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
			else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
			else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
			return ms + "ms";
		}
		Time.format = format;
		function toDigits(source, length = 2) {
			return source.toString().padStart(length, "0");
		}
		Time.toDigits = toDigits;
		function template(template, time = /* @__PURE__ */ new Date()) {
			return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
		}
		Time.template = template;
	})(Time || (Time = {}));
}));
//#endregion
//#region src/index.ts
var import_lib = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	let _deepseek_ai_cosmokit = (init_lib(), __toCommonJS(lib_exports));
	const kSchema = Symbol.for("schemastery");
	const kValidationError = Symbol.for("ValidationError");
	globalThis.__schemastery_index__ ??= 0;
	globalThis.__schemastery_refs__ = void 0;
	var ValidationError = class extends TypeError {
		options;
		name = "ValidationError";
		constructor(message, options) {
			let prefix = "$";
			for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
			else if (typeof segment === "number") prefix += "[" + segment + "]";
			else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
			if (prefix.startsWith(".")) prefix = prefix.slice(1);
			super((prefix === "$" ? "" : `${prefix} `) + message);
			this.options = options;
		}
		static is(error) {
			return !!error?.[kValidationError];
		}
	};
	Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
	const Schema = function(options) {
		const schema = function(data, options = {}) {
			return Schema.resolve(data, schema, options)[0];
		};
		if (options.refs) {
			const refs = (0, _deepseek_ai_cosmokit.valueMap)(options.refs, (options) => new Schema(options));
			const getRef = (uid) => refs[uid];
			for (const key in refs) {
				const options = refs[key];
				options.sKey = getRef(options.sKey);
				options.inner = getRef(options.inner);
				options.list = options.list && options.list.map(getRef);
				options.dict = options.dict && (0, _deepseek_ai_cosmokit.valueMap)(options.dict, getRef);
			}
			return refs[options.uid];
		}
		Object.assign(schema, options);
		if (typeof schema.callback === "string") try {
			schema.callback = new Function("return " + schema.callback)();
		} catch {}
		Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
		Object.setPrototypeOf(schema, Schema.prototype);
		schema.meta ||= {};
		schema.toString = schema.toString.bind(schema);
		return schema;
	};
	Schema.prototype = Object.create(Function.prototype);
	Schema.prototype[kSchema] = true;
	Object.defineProperty(Schema.prototype, "~standard", { get() {
		return {
			version: 1,
			vendor: "schemastery",
			validate: (value) => {
				try {
					return { value: Schema.resolve(value, this, {})[0] };
				} catch (error) {
					if (ValidationError.is(error)) return { issues: [{
						message: error.message,
						path: error.options.path
					}] };
					throw error;
				}
			}
		};
	} });
	Schema.ValidationError = ValidationError;
	Schema.prototype.toJSON = function toJSON() {
		if (globalThis.__schemastery_refs__) {
			globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
			return this.uid;
		}
		globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
		globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
		const result = {
			uid: this.uid,
			refs: globalThis.__schemastery_refs__
		};
		globalThis.__schemastery_refs__ = void 0;
		return result;
	};
	Schema.prototype.set = function set(key, value) {
		this.dict[key] = value;
		return this;
	};
	Schema.prototype.push = function push(value) {
		this.list.push(value);
		return this;
	};
	function mergeDesc(original, messages) {
		const result = typeof original === "string" ? { "": original } : { ...original };
		for (const locale in messages) {
			const value = messages[locale];
			if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
			else if (typeof value === "string") result[locale] = value;
		}
		return result;
	}
	function getInner(value) {
		return value?.$value ?? value?.$inner;
	}
	function extractKeys(data) {
		return (0, _deepseek_ai_cosmokit.filterKeys)(data ?? {}, (key) => !key.startsWith("$"));
	}
	Schema.prototype.i18n = function i18n(messages) {
		const schema = Schema(this);
		const desc = mergeDesc(schema.meta.description, messages);
		if (Object.keys(desc).length) schema.meta.description = desc;
		if (schema.dict) schema.dict = (0, _deepseek_ai_cosmokit.valueMap)(schema.dict, (inner, key) => {
			return inner.i18n((0, _deepseek_ai_cosmokit.valueMap)(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
		});
		if (schema.list) schema.list = schema.list.map((inner, index) => {
			return inner.i18n((0, _deepseek_ai_cosmokit.valueMap)(messages, (data = {}) => {
				if (Array.isArray(getInner(data))) return getInner(data)[index];
				if (Array.isArray(data)) return data[index];
				return extractKeys(data);
			}));
		});
		if (schema.inner) schema.inner = schema.inner.i18n((0, _deepseek_ai_cosmokit.valueMap)(messages, (data) => {
			if (getInner(data)) return getInner(data);
			return extractKeys(data);
		}));
		if (schema.sKey) schema.sKey = schema.sKey.i18n((0, _deepseek_ai_cosmokit.valueMap)(messages, (data) => data?.$key));
		return schema;
	};
	Schema.prototype.extra = function extra(key, value) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	};
	for (const key of [
		"required",
		"disabled",
		"collapse",
		"hidden",
		"loose"
	]) Object.assign(Schema.prototype, { [key](value = true) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	} });
	Schema.prototype.deprecated = function deprecated() {
		const schema = Schema(this);
		schema.meta.badges ||= [];
		schema.meta.badges.push({
			text: "deprecated",
			type: "danger"
		});
		return schema;
	};
	Schema.prototype.experimental = function experimental() {
		const schema = Schema(this);
		schema.meta.badges ||= [];
		schema.meta.badges.push({
			text: "experimental",
			type: "warning"
		});
		return schema;
	};
	Schema.prototype.pattern = function pattern(regexp) {
		const schema = Schema(this);
		const pattern = (0, _deepseek_ai_cosmokit.pick)(regexp, ["source", "flags"]);
		schema.meta = {
			...schema.meta,
			pattern
		};
		return schema;
	};
	Schema.prototype.simplify = function simplify(value) {
		if ((0, _deepseek_ai_cosmokit.isVolatile)(value)) value = value.get();
		if ((0, _deepseek_ai_cosmokit.deepEqual)(value, this.meta.default, this.type === "dict")) return null;
		if ((0, _deepseek_ai_cosmokit.isNullable)(value)) return value;
		if (this.type === "object" || this.type === "dict") {
			const result = {};
			for (const key in value) {
				const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
				if (this.type === "dict" || !(0, _deepseek_ai_cosmokit.isNullable)(item)) result[key] = item;
			}
			if ((0, _deepseek_ai_cosmokit.deepEqual)(result, this.meta.default, this.type === "dict")) return null;
			return result;
		} else if (this.type === "array" || this.type === "tuple") {
			const result = [];
			value.forEach((value, index) => {
				const schema = this.type === "array" ? this.inner : this.list[index];
				const item = schema ? schema.simplify(value) : value;
				result.push(item);
			});
			return result;
		} else if (this.type === "intersect") {
			const result = {};
			for (const item of this.list) Object.assign(result, item.simplify(value));
			return result;
		} else if (this.type === "union") for (const schema of this.list) try {
			Schema.resolve(value, schema, {});
			return schema.simplify(value);
		} catch {}
		return value;
	};
	Schema.prototype.toString = function toString(inline) {
		return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
	};
	Schema.prototype.role = function role(role, extra) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			role,
			extra
		};
		return schema;
	};
	for (const key of [
		"default",
		"link",
		"comment",
		"description",
		"max",
		"min",
		"step"
	]) Object.assign(Schema.prototype, { [key](value) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	} });
	Schema.prototype.volatile = function volatile() {
		if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
		return this.extra("volatile", true);
	};
	const resolvers = {};
	const checkedVolatile = Symbol("checked-volatile-schema");
	function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
		const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
		if (states.has(blocked)) return;
		states.add(blocked);
		seen.set(schema, states);
		if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
		const nested = blocked || !!schema.meta?.volatile;
		if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
		if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
		if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
		if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
	}
	Schema.extend = function extend(type, resolve) {
		resolvers[type] = resolve;
	};
	Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
		if (!schema) return [data];
		if (!options[checkedVolatile]) {
			validateVolatileSchema(schema, options.path);
			options = {
				...options,
				[checkedVolatile]: true
			};
		}
		if (schema.meta?.volatile) {
			const inner = Schema(schema);
			inner.meta = {
				...schema.meta,
				volatile: false
			};
			const [value, adapted] = Schema.resolve(data, inner, options, strict);
			try {
				return [(0, _deepseek_ai_cosmokit.createVolatile)(value), adapted];
			} catch (error) {
				throw new ValidationError(error instanceof Error ? error.message : String(error), options);
			}
		}
		if (options.ignore?.(data, schema)) return [data];
		if ((0, _deepseek_ai_cosmokit.isNullable)(data) && schema.type !== "lazy") {
			if (schema.meta.required) throw new ValidationError(`missing required value`, options);
			let current = schema;
			let fallback = schema.meta.default;
			while (current?.type === "intersect" && (0, _deepseek_ai_cosmokit.isNullable)(fallback)) {
				current = current.list[0];
				fallback = current?.meta.default;
			}
			if ((0, _deepseek_ai_cosmokit.isNullable)(fallback)) return [data];
			data = (0, _deepseek_ai_cosmokit.clone)(fallback);
		}
		const callback = resolvers[schema.type];
		if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
		try {
			return callback(data, schema, options, strict);
		} catch (error) {
			if (!schema.meta.loose) throw error;
			return [schema.meta.default];
		}
	};
	Schema.from = function from(source) {
		if ((0, _deepseek_ai_cosmokit.isNullable)(source)) return Schema.any();
		else if ([
			"string",
			"number",
			"boolean"
		].includes(typeof source)) return Schema.const(source).required();
		else if (source[kSchema]) return source;
		else if (typeof source === "function") switch (source) {
			case String: return Schema.string().required();
			case Number: return Schema.number().required();
			case Boolean: return Schema.boolean().required();
			case Function: return Schema.function().required();
			default: return Schema.is(source).required();
		}
		else throw new TypeError(`cannot infer schema from ${source}`);
	};
	Schema.lazy = function lazy(builder) {
		const toJSON = () => {
			if (!schema.inner[kSchema]) {
				schema.inner = schema.builder();
				schema.inner.meta = {
					...schema.meta,
					...schema.inner.meta
				};
			}
			return schema.inner.toJSON();
		};
		const schema = new Schema({
			type: "lazy",
			builder,
			inner: { toJSON }
		});
		return schema;
	};
	Schema.natural = function natural() {
		return Schema.number().step(1).min(0);
	};
	Schema.percent = function percent() {
		return Schema.number().step(.01).min(0).max(1).role("slider");
	};
	Schema.date = function date() {
		return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
			const date = new Date(value);
			if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
			return date;
		}, true)]);
	};
	Schema.regExp = function regExp(flag = "") {
		return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
			try {
				return new RegExp(value, flag);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)]);
	};
	Schema.arrayBuffer = function arrayBuffer(encoding) {
		return Schema.union([
			Schema.is(ArrayBuffer),
			Schema.is(SharedArrayBuffer),
			Schema.transform(Schema.any(), (value, options) => {
				if (_deepseek_ai_cosmokit.Binary.isSource(value)) return _deepseek_ai_cosmokit.Binary.fromSource(value);
				throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
			}, true),
			...encoding ? [Schema.transform(Schema.string(), (value, options) => {
				try {
					return encoding === "base64" ? _deepseek_ai_cosmokit.Binary.fromBase64(value) : _deepseek_ai_cosmokit.Binary.fromHex(value);
				} catch (e) {
					throw new ValidationError(e.message, options);
				}
			}, true)] : []
		]);
	};
	Schema.extend("lazy", (data, schema, options, strict) => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
			validateVolatileSchema(schema.inner, options.path, true);
		}
		return Schema.resolve(data, schema.inner, options, strict);
	});
	Schema.extend("any", (data) => {
		return [data];
	});
	Schema.extend("never", (data, _, options) => {
		throw new ValidationError(`expected nullable but got ${data}`, options);
	});
	Schema.extend("const", (data, { value }, options) => {
		if ((0, _deepseek_ai_cosmokit.deepEqual)(data, value)) return [value];
		throw new ValidationError(`expected ${value} but got ${data}`, options);
	});
	function checkWithinRange(data, meta, description, options, skipMin = false) {
		const { max = Infinity, min = -Infinity } = meta;
		if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
		if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
	}
	Schema.extend("string", (data, { meta }, options) => {
		if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
		if (meta.pattern) {
			const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
			if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
		}
		checkWithinRange(data.length, meta, "string length", options);
		return [data];
	});
	function decimalShift(data, digits) {
		const str = data.toString();
		if (str.includes("e")) return data * Math.pow(10, digits);
		const index = str.indexOf(".");
		if (index === -1) return data * Math.pow(10, digits);
		const frac = str.slice(index + 1);
		const integer = str.slice(0, index);
		if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
		return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
	}
	function isMultipleOf(data, min, step) {
		step = Math.abs(step);
		if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
		const index = step.toString().indexOf(".");
		const digits = step.toString().slice(index + 1).length;
		return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
	}
	Schema.extend("number", (data, { meta }, options) => {
		if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
		checkWithinRange(data, meta, "number", options);
		const { step } = meta;
		if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
		return [data];
	});
	Schema.extend("boolean", (data, _, options) => {
		if (typeof data === "boolean") return [data];
		throw new ValidationError(`expected boolean but got ${data}`, options);
	});
	Schema.extend("bitset", (data, { bits, meta }, options) => {
		let value = 0, keys = [];
		if (typeof data === "number") {
			value = data;
			for (const key in bits) if (data & bits[key]) keys.push(key);
		} else if (Array.isArray(data)) {
			keys = data;
			for (const key of keys) {
				if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
				if (key in bits) value |= bits[key];
			}
		} else throw new ValidationError(`expected number or array but got ${data}`, options);
		if (value === meta.default) return [value];
		return [value, keys];
	});
	Schema.extend("function", (data, _, options) => {
		if (typeof data === "function") return [data];
		throw new ValidationError(`expected function but got ${data}`, options);
	});
	Schema.extend("is", (data, { constructor }, options) => {
		if (typeof constructor === "function") {
			if (data instanceof constructor) return [data];
			throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
		} else {
			if ((0, _deepseek_ai_cosmokit.isNullable)(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
			let prototype = Object.getPrototypeOf(data);
			while (prototype) {
				if (prototype.constructor?.name === constructor) return [data];
				prototype = Object.getPrototypeOf(prototype);
			}
			throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		}
	});
	function property(data, key, schema, options) {
		try {
			const [value, adapted] = Schema.resolve(data[key], schema, {
				...options,
				path: [...options.path || [], key]
			});
			if (adapted !== void 0) data[key] = adapted;
			return value;
		} catch (e) {
			if (!options?.autofix) throw e;
			delete data[key];
			return schema.meta.volatile ? (0, _deepseek_ai_cosmokit.createVolatile)(schema.meta.default) : schema.meta.default;
		}
	}
	Schema.extend("array", (data, { inner, meta }, options) => {
		if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
		checkWithinRange(data.length, meta, "array length", options, !(0, _deepseek_ai_cosmokit.isNullable)(inner.meta.default));
		return [data.map((_, index) => property(data, index, inner, options))];
	});
	Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
		if (!(0, _deepseek_ai_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
		const result = {};
		for (const key in data) {
			let rKey;
			try {
				rKey = Schema.resolve(key, sKey, options)[0];
			} catch (error) {
				if (strict) continue;
				throw error;
			}
			result[rKey] = property(data, key, inner, options);
			data[rKey] = data[key];
			if (key !== rKey) delete data[key];
		}
		return [result];
	});
	Schema.extend("tuple", (data, { list }, options, strict) => {
		if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
		const result = list.map((inner, index) => property(data, index, inner, options));
		if (strict) return [result];
		result.push(...data.slice(list.length));
		return [result];
	});
	function merge(result, data) {
		for (const key in data) {
			if (key in result) continue;
			result[key] = data[key];
		}
	}
	Schema.extend("object", (data, { dict }, options, strict) => {
		if (!(0, _deepseek_ai_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
		const result = {};
		for (const key in dict) {
			const value = property(data, key, dict[key], options);
			if (!(0, _deepseek_ai_cosmokit.isNullable)(value) || key in data) result[key] = value;
		}
		if (!strict) merge(result, data);
		return [result];
	});
	Schema.extend("union", (data, { list, toString }, options, strict) => {
		const messages = [];
		for (const inner of list) try {
			return Schema.resolve(data, inner, options, strict);
		} catch (error) {
			messages.push(error);
		}
		throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	});
	Schema.extend("intersect", (data, { list, toString }, options, strict) => {
		if (!list.length) return [data];
		let result;
		for (const inner of list) {
			const value = Schema.resolve(data, inner, options, true)[0];
			if ((0, _deepseek_ai_cosmokit.isNullable)(value)) continue;
			if ((0, _deepseek_ai_cosmokit.isNullable)(result)) result = value;
			else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
			else if (typeof value === "object") merge(result ??= {}, value);
			else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		}
		if (!strict && (0, _deepseek_ai_cosmokit.isPlainObject)(data)) merge(result, data);
		return [result];
	});
	Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
		const [result, adapted = data] = Schema.resolve(data, inner, options, true);
		if (preserve) return [callback(result)];
		else return [callback(result), callback(adapted)];
	});
	const formatters = {};
	function defineMethod(name, keys, format) {
		formatters[name] = format;
		Object.assign(Schema, { [name](...args) {
			const schema = new Schema({ type: name });
			keys.forEach((key, index) => {
				switch (key) {
					case "sKey":
						schema.sKey = args[index] ?? Schema.string();
						break;
					case "inner":
						schema.inner = Schema.from(args[index]);
						break;
					case "list":
						schema.list = args[index].map(Schema.from);
						break;
					case "dict":
						schema.dict = (0, _deepseek_ai_cosmokit.valueMap)(args[index], Schema.from);
						break;
					case "bits":
						schema.bits = {};
						for (const key in args[index]) {
							if (typeof args[index][key] !== "number") continue;
							schema.bits[key] = args[index][key];
						}
						break;
					case "callback": {
						const callback = schema.callback = args[index];
						callback["toJSON"] ||= () => callback.toString();
						break;
					}
					case "constructor": {
						const constructor = schema.constructor = args[index];
						if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
						break;
					}
					default: schema[key] = args[index];
				}
			});
			if (name === "object" || name === "dict") schema.meta.default = {};
			else if (name === "array" || name === "tuple") schema.meta.default = [];
			else if (name === "bitset") schema.meta.default = 0;
			return schema;
		} });
	}
	defineMethod("is", ["constructor"], ({ constructor }) => {
		if (typeof constructor === "function") return constructor.name;
		else return constructor;
	});
	defineMethod("any", [], () => "any");
	defineMethod("never", [], () => "never");
	defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
	defineMethod("string", [], () => "string");
	defineMethod("number", [], () => "number");
	defineMethod("boolean", [], () => "boolean");
	defineMethod("bitset", ["bits"], () => "bitset");
	defineMethod("function", [], () => "function");
	defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
	defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
	defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
	defineMethod("object", ["dict"], ({ dict }) => {
		if (Object.keys(dict).length === 0) return "{}";
		return `{ ${Object.entries(dict).map(([key, inner]) => {
			return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
		}).join(", ")} }`;
	});
	defineMethod("union", ["list"], ({ list }, inline) => {
		const result = list.map(({ toString: format }) => format()).join(" | ");
		return inline ? `(${result})` : result;
	});
	defineMethod("intersect", ["list"], ({ list }) => {
		return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
	});
	defineMethod("transform", [
		"inner",
		"callback",
		"preserve"
	], ({ inner }, isInner) => inner.toString(isInner));
	module.exports = Schema;
})))(), 1);
/** Plugin identity for cordis.yml rows. */
const name = "@max-null/dsh-capture";
/** 设置 namespace（设置——插件页卡片锚点；与 client settingsScope.bind 一致）。 */
const CAPTURE_NS = "dsh-capture";
/** 设置 schema（隐藏窗口 + 全局快捷键；存储仍走 screenshot.json——主进程壳层消费）。
*
*  0.1.7 起插件的 Config schema 本身就构成它的 settings section（不再有
*  `installSection`），**可变字段必须标 `.volatile()`**——`settings/src/schema.ts`
*  的 `isVolatilePath` 只承认「祖先节点标了 volatile」的路径，非 volatile 路径在
*  `settings/src/index.ts:406` 直接抛错；漏标则本插件的 namespace 不被 Host serve，
*  设置卡整区不渲染（2026-09-26 实测）。见官方范例 `web-search-deepseek/src/index.ts`
*  与我们的 `dsh-node-appearance`。
*
*  不写 `z<Config>` 显式泛型：`.volatile()` 会把字段的 schema Mode 变成
*  `'volatile-defined'`，与接口里声明的 `Volatile<T>` 不是同一个 Mode，显式泛型会报类型不匹配。 */
const Config = import_lib.default.object({
	hideWindow: import_lib.default.boolean().default(true).volatile(),
	hotkey: import_lib.default.string().default("Control+Shift+A").volatile()
});
/**
* Services required before mounting: the shared Fetch route registry.
*
* `ctx.connection` is carrier-neutral: the Web app owns its `/api` HTTP bridge,
* while a shell-owned carrier (Electron) dispatches the same handler over its
* own transport. Trust and browser authentication are applied by the carrier
* before this handler runs, so the plugin no longer carries a Host/Origin fence.
*/
const inject = ["connection"];
/** 配置文件路径（与壳层 `ssid-desktop/apps/desktop/src/ssid/screenshot.ts` 同源；
*  该处的 `SSID_SCREENSHOT_CONFIG` 可整体覆盖，供隔离实例用独立配置）。 */
const CONFIG_PATH = join(homedir(), ".ssid", "screenshot.json");
const CONFIG_DEFAULTS = {
	hideWindow: true,
	hotkey: "Control+Shift+A"
};
/** 服务键（与壳层 `ssid-desktop/apps/desktop-host/src/ssid-screenshot.ts` 的 SSID_SHELL_SCREENSHOT_KEY 一致）。 */
const SHELL_SCREENSHOT_KEY = "ssid.shell.screenshot";
/** 路由基址（必须在 `/api` 之下：共享通道只分发该前缀）。 */
const ROUTE_BASE = "/api/ssid/screenshot";
/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 20;
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
/** JSON response helper (Fetch API shape, no node:http objects). */
function jsonResponse(status, body) {
	return Response.json(body, {
		status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
}
/** 把任意异常转成响应体（保留 wire code 与状态码）。 */
function errorResponse(error) {
	if (error instanceof ScreenshotError) return jsonResponse(error.status, {
		ok: false,
		error: {
			code: error.code,
			message: error.message
		}
	});
	return jsonResponse(500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
/** 读取 JSON body（空 body → {}；超限/非法 → ScreenshotError）。 */
async function readJsonBody(request) {
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) throw new ScreenshotError("bad-request", "request body too large");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new ScreenshotError("bad-request", "request body is not valid JSON");
	}
}
/** 单条路由的业务处理（方法名即路由尾段）。 */
async function handle(method, ctx, payload) {
	if (method === "get") return {
		...readConfig(),
		shellAvailable: shellScreenshot(ctx) !== void 0
	};
	if (method === "set") {
		const record = payload;
		const config = readConfig();
		if (typeof record?.hideWindow === "boolean") config.hideWindow = record.hideWindow;
		if (typeof record?.hotkey === "string" && record.hotkey.trim() !== "") config.hotkey = record.hotkey.trim();
		writeConfig(config);
		const applied = shellScreenshot(ctx)?.apply?.() ?? false;
		return {
			...config,
			appliedHotkey: applied === true
		};
	}
	const shell = shellScreenshot(ctx);
	if (shell === void 0) throw new ScreenshotError("shell-unavailable", "screenshot capture is only available inside the SSiD desktop shell", 503);
	shell.trigger();
	return { ok: true };
}
/**
* Plugin body: register the three exact `/api/ssid/screenshot/*` routes.
* @param ctx - host plugin context (connection).
*/
function apply(ctx) {
	for (const method of [
		"get",
		"set",
		"trigger"
	]) ctx.effect(() => ctx.connection.fetch.register({
		path: `${ROUTE_BASE}/${method}`,
		methods: ["POST"],
		requestBody: "buffered",
		fetch: async (request) => {
			try {
				const payload = await readJsonBody(request);
				return jsonResponse(200, {
					ok: true,
					value: await handle(method, ctx, payload)
				});
			} catch (error) {
				return errorResponse(error);
			}
		}
	}), `@max-null/dsh-capture: ${ROUTE_BASE}/${method}`);
}
//#endregion
export { CAPTURE_NS, Config, apply, inject, name };
