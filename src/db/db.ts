import { env } from "bun";
import { Database } from "bun:sqlite";

import { existsSync } from "node:fs";
import { exit } from "node:process";

import { logError } from "../utils/logger";

if (!existsSync(env.PATH_SQLITE)) {
	logError("Tasks DB not found");
	exit(1);
}
if (!existsSync(env.PATH_SQLITE.replace(".db", "-throttle.db"))) {
	logError("Throttle DB not found");
	exit(1);
}
if (!existsSync(env.PATH_SQLITE.replace(".db", "-timeframe.db"))) {
	logError("Timeframe DB not found");
	exit(1);
}

export const tasksDb = new Database(env.PATH_SQLITE, { strict: true, create: false });
export const throttleDb = new Database(env.PATH_SQLITE.replace(".db", "-throttle.db"), { strict: true, create: false });
export const timeframeDb = new Database(env.PATH_SQLITE.replace(".db", "-timeframe.db"), { strict: true, create: false });