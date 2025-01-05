import { env } from "bun";

import { resolve } from "node:dns/promises";

import { logError, logInfo } from "./logger";

export async function connectivity(): Promise<ConnectivityStatus> {
	try {
		await resolve(env.CONNECTIVITY_HOSTNAME, "A");
		if (env.LOG == "1") {
			logInfo("Connectivity online");
		}
		return "ONLINE";
	} catch (_) {
		logError("Connectivity offline");
		return "OFFLINE";
	}
}
