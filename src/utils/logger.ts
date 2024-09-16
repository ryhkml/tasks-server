import { env } from "bun";

import { format } from "date-fns";

export function logInfo(...messages: unknown[]): void {
	console.log(`[${startWithDate()}]`, "INFO", "—", ...messages);
}

export function logWarn(...messages: unknown[]): void {
	console.warn(`[${startWithDate()}]`, "\x1b[33mWARNING\x1b[0m", "—", ...messages);
}

export function logError(...messages: unknown[]): void {
	console.error(`[${startWithDate()}]`, "\x1b[31mERROR\x1b[0m", "—", ...messages);
}

function startWithDate(): string {
	const locale = new Date().toLocaleString("en-US", { timeZone: env.LOG_TZ || env.TZ });
	return format(new Date(locale), "MMM/d/yyyy.hh:mm:ss.a");
}