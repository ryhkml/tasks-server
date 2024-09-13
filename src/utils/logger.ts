import { format } from "date-fns";

export function logInfo(...messages: unknown[]): void {
	console.log(`[${today()}]`, "INFO", "—", ...messages);
}

export function logWarn(...messages: unknown[]): void {
	console.log(`[${today()}]`, "\x1b[33mWARNING\x1b[0m", "—", ...messages);
}

export function logError(...messages: unknown[]): void {
	console.log(`[${today()}]`, "\x1b[31mERROR\x1b[0m", "—", ...messages);
}

function today(): string {
	const locale = new Date().toLocaleString();
	return format(locale, "MMM/d/yyyy.hh:mm:ss.a");
}