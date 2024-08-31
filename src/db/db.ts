import { env } from "bun";
import { Database } from "bun:sqlite";

import { existsSync } from "node:fs";
import { exit } from "node:process";

if (!existsSync(env.PATH_SQLITE)) {
	console.error("Tasks DB not found");
	exit(1);
}
if (!existsSync(env.PATH_SQLITE.replace(".db", "-timeframe.db"))) {
	console.error("Timeframe DB not found");
	exit(1);
}

export const tasksDb = new Database(env.PATH_SQLITE, { strict: true });
export const timeframeDb = new Database(env.PATH_SQLITE.replace(".db", "-timeframe.db"), { strict: true });