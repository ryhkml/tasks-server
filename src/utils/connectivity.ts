import { env } from "bun";

import { resolve } from "node:dns/promises";

export async function connectivity(): Promise<string> {
	try {
		await resolve(env.CONNECTIVITY_HOSTNAME, "A");
		return "Online";
	} catch (_) {
		return "Offline";
	}
}