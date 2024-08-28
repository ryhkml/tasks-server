import { argv, env, file, sleep, spawnSync } from "bun";

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { timeframeDb } from "./src/db/db";

async function init(): Promise<void> {
	try {
		if (env.PATH_SQLITE == null) {
			throw new Error("PATH_SQLITE to be defined");
		}
		if (env.PRAGMA_KEY_SQLITE == null) {
			throw new Error("PRAGMA_KEY_SQLITE to be defined");
		}
		const forceDelete = argv[argv.length - 1] == "-f";
		const pathTimeframeDb = env.PATH_SQLITE.replace(".db", "-timeframe.db");
		if (forceDelete) {
			await Promise.all([
				rm(env.PATH_SQLITE, { force: true }),
				rm(pathTimeframeDb, { force: true })
			]);
			await sleep(1);
		}
		// Timeframe DB
		if (existsSync(pathTimeframeDb)) {
			console.warn("Timeframe DB is already exists");
		} else {
			const db = timeframeDb(pathTimeframeDb);
			const raw = await file("src/db/sql/timeframe.sql").text();
			db.run(raw);
			db.run("INSERT INTO timeframe (id, lastRecordAt) VALUES (?1, ?2)", [1, Date.now()]);
			db.close();
			console.log("Timeframe DB ok");
			await sleep(1);
		}
		// Tasks DB
		if (existsSync(env.PATH_SQLITE)) {
			console.warn("Tasks DB is already exists");
		} else {
			const options = ["-bail", "-nofollow", "-noheader", "-json"];
			const { stderr, success } = spawnSync(["sqlcipher", env.PATH_SQLITE, ...options, `PRAGMA key = '${env.PRAGMA_KEY_SQLITE}'`, ".read src/db/sql/tasks.sql"], {
				stdout: null,
				env: {}
			});
			if (success) {
				console.log("Tasks DB ok");
				await sleep(1);
			} else {
				throw new Error(stderr.toString().trim());
			}
		}
	} catch (e) {
		console.error(e);
	}
}

init();