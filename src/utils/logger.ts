import { env, color } from "bun";

import { format } from "date-fns";

const DEFAULT_COLOR = color("#ffffff", "ansi");

export function logInfo(...messages: unknown[]): void {
	console.log(`[${startWithDate()}]`, "INFO", "—", ...messages);
}

export function logWarn(...messages: unknown[]): void {
	console.log(`[${startWithDate()}]`, color("#faad14", "ansi") + "WARNING" + DEFAULT_COLOR, "—", ...messages);
}

export function logError(...messages: unknown[]): void {
	console.log(`[${startWithDate()}]`, color("#ff4d4f", "ansi") + "ERROR" + DEFAULT_COLOR, "—", ...messages);
}

function startWithDate(): string {
	const locale = new Date().toLocaleString("en-US", { timeZone: env.LOG_TZ || env.TZ });
	return format(new Date(locale), "MMM/d/yyyy.hh:mm:ss.a");
}
