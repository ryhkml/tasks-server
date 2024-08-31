import { argv, env, file, sleep } from "bun";
import { Database } from "bun:sqlite";

import { rm } from "node:fs/promises";

async function init(): Promise<void> {
	try {
		if (env.PATH_SQLITE == null) {
			throw new Error("PATH_SQLITE to be defined");
		}
		const forceDelete = argv[argv.length - 1] == "-f" || argv[argv.length - 1] == "--force";
		const pathTimeframeDb = env.PATH_SQLITE.replace(".db", "-timeframe.db");
		if (forceDelete) {
			await Promise.all([
				rm(env.PATH_SQLITE, { force: true }).catch(() => {}),
				rm(env.PATH_SQLITE + "-shm", { force: true }).catch(() => {}),
				rm(env.PATH_SQLITE + "-wal", { force: true }).catch(() => {}),
				rm(pathTimeframeDb, { force: true }).catch(() => {}),
				rm(pathTimeframeDb + "-shm", { force: true }).catch(() => {}),
				rm(pathTimeframeDb + "-wal", { force: true }).catch(() => {})
			]);
			await sleep(1);
		}
		// Tasks DB
		if (await file(env.PATH_SQLITE).exists()) {
			console.warn("Tasks DB is already exists");
		} else {
			const db = new Database(env.PATH_SQLITE, { strict: true });
			const raw = await file("src/db/sql/tasks.sql").text();
			db.run(raw);
			db.close();
			await sleep(1);
			console.log("Tasks DB Ok");
		}
		// Timeframe DB
		if (await file(pathTimeframeDb).exists()) {
			console.warn("Timeframe DB is already exists");
		} else {
			const db = new Database(pathTimeframeDb, { strict: true });
			const raw = await file("src/db/sql/timeframe.sql").text();
			db.run(raw);
			db.run("INSERT INTO timeframe (id, lastRecordAt) VALUES (?1, ?2)", [1, Date.now()]);
			db.close();
			await sleep(1);
			console.log("Timeframe DB Ok");
		}
	} catch (e) {
		console.error(e);
	}
}

init();