export function inRange(v: number, min: number, max: number): boolean {
	return (Math.min(min, max) <= v && v <= Math.max(min, max));
}

export function isEmpty<T>(v: T): boolean {
	// @ts-expect-error
	return [Object, Array].includes((v || {}).constructor) && !Object.entries((v || {})).length;
}

export function isPlainObject(v: unknown): v is { [k: string]: any } {
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

export function safeInteger<T>(v: T): number {
	const state = Math.abs(Number(v));
	if (isNaN(state) || state == 0) {
		return 0;
	}
	if (state >= Number.MAX_SAFE_INTEGER) {
		return Number.MAX_SAFE_INTEGER;
	}
	return Math.floor(state);
}