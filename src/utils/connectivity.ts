import { env } from "bun";

import { resolve } from "node:dns/promises";

export async function connectivity(): Promise<ConnectivityStatus> {
	try {
		await resolve(env.CONNECTIVITY_HOSTNAME, "A");
		return "ONLINE";
	} catch (_) {
		return "OFFLINE";
	}
}