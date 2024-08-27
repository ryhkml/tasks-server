export function isEmpty<T>(v: T): boolean {
	// @ts-expect-error
	return [Object, Array].includes((v || {}).constructor) && !Object.entries((v || {})).length;
}

export function isPlainObject<T extends object>(v: T): boolean {
	if (typeof v !== "object" || v === null) {
		return false;
	}
	if (Object.prototype.toString.call(v) !== "[object Object]") {
		return false;
	}
	const proto = Object.getPrototypeOf(v);
	if (proto === null) {
		return true;
	}
	const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
	return typeof ctor === "function" && ctor instanceof ctor && Function.prototype.call(ctor) === Function.prototype.call(v);
}

export function isString<T>(v: T): boolean {
	if (v != null && typeof v.valueOf() === "string") {
		return true;
	}
	return false;
}

export function toSafeInteger<T>(v: T): number {
	const state = Math.abs(Number(v));
	if (isNaN(state) || state == 0) {
		return 0;
	}
	if (state >= Number.MAX_SAFE_INTEGER) {
		return Number.MAX_SAFE_INTEGER;
	}
	return Math.floor(state);
}