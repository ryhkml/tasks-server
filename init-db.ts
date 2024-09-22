import { argv, env, file, sleep } from "bun";
import { Database } from "bun:sqlite";

import { rm } from "node:fs/promises";

import { logError, logInfo, logWarn } from "./src/utils/logger";

async function init(): Promise<void> {
	try {
		if (env.PATH_SQLITE == null) {
			throw new Error("PATH_SQLITE to be defined");
		}
		const forceDelete = argv[argv.length - 1] == "-f" || argv[argv.length - 1] == "--force";
		const pathThrottleDb = env.PATH_SQLITE.replace(".db", "-throttle.db");
		if (forceDelete) {
			await Promise.all([
				rm(env.PATH_SQLITE, { force: true }).catch(() => {}),
				rm(env.PATH_SQLITE + "-shm", { force: true }).catch(() => {}),
				rm(env.PATH_SQLITE + "-wal", { force: true }).catch(() => {}),
				rm(pathThrottleDb, { force: true }).catch(() => {}),
				rm(pathThrottleDb + "-shm", { force: true }).catch(() => {}),
				rm(pathThrottleDb + "-wal", { force: true }).catch(() => {})
			]);
			await sleep(1);
		}
		// Tasks DB
		if (await file(env.PATH_SQLITE).exists()) {
			logWarn("Tasks DB is already exists");
		} else {
			const db = new Database(env.PATH_SQLITE, { strict: true });
			const raw = await file("src/db/sql/tasks.sql").text();
			db.run(raw);
			db.run("INSERT INTO timeframe (id, lastRecordAt) VALUES (?1, ?2)", [
				1,
				new Date().getTime()
			]);
			await sleep(1);
			db.close(false);
			logInfo("Tasks DB Ok");
		}
		// Throttle DB
		if (await file(pathThrottleDb).exists()) {
			logWarn("Throttle DB is already exists");
		} else {
			const db = new Database(pathThrottleDb, { strict: true });
			const raw = await file("src/db/sql/throttle.sql").text();
			db.run(raw);
			await sleep(1);
			db.close(false);
			logInfo("Throttle DB Ok");
		}
	} catch (e) {
		logError(e);
	}
}

init();