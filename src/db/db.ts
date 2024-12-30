import { env } from "bun";
import { Database } from "bun:sqlite";

import { existsSync } from "node:fs";
import { exit } from "node:process";

import cluster from "node:cluster";

import { clusterMode } from "../utils/cluster";
import { logError } from "../utils/logger";
import { subscriptionManager } from "../utils/subscription";

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

const signals = ["beforeExit", "SIGINT", "SIGTERM", "exit"];
const stmt = tasksDb.query("UPDATE timeframe SET lastRecordAt = ?1, data = ?2, exit = ?3 WHERE id = 1");

function closeDb(): void {
	try {
		subscriptionManager.unsubscribeAll();
		stmt.run(new Date().getTime(), null, 1);
	} catch (e) {
		logError(String(e));
	} finally {
		setTimeout(() => exit(), 1);
	}
}

if (clusterMode == "ACTIVE" && cluster.isPrimary) {
	for (let i = 0; i < signals.length; i++) {
		process.on(signals[i], () => closeDb());
	}
}
if (clusterMode == "INACTIVE") {
	for (let i = 0; i < signals.length; i++) {
		process.on(signals[i], () => closeDb());
	}
}