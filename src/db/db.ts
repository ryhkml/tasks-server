import { env, sleep } from "bun";
import { Database } from "bun:sqlite";

import { existsSync } from "node:fs";
import { exit } from "node:process";

import cluster from "node:cluster";

import { clusterMode } from "../utils/cluster";
import { logError } from "../utils/logger";

if (!existsSync(env.PATH_SQLITE)) {
	logError("Tasks DB not found");
	exit(1);
}
if (!existsSync(env.PATH_SQLITE.replace(".db", "-throttle.db"))) {
	logError("Throttle DB not found");
	exit(1);
}

export const tasksDb = new Database(env.PATH_SQLITE, {
	create: false,
	strict: true
});
export const throttleDb = new Database(env.PATH_SQLITE.replace(".db", "-throttle.db"), {
	create: false,
	strict: true
});

function closeDb(): void {
	try {
		tasksDb.run("UPDATE timeframe SET lastRecordAt = ?1, data = ?2 WHERE id = 1", [
			new Date().getTime(),
			null
		]);
		exit();
	} catch (e) {
		logError(String(e));
		exit(1);
	}
}

if (clusterMode == "ACTIVE" && cluster.isPrimary) {
	["beforeExit", "SIGINT", "SIGTERM", "exit"].forEach(signal => process.on(signal, closeDb));
}
if (clusterMode == "INACTIVE") {
	["beforeExit", "SIGINT", "SIGTERM", "exit"].forEach(signal => process.on(signal, closeDb));
}