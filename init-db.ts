import { env, file, sleep, spawnSync } from "bun";
import { Database } from "bun:sqlite";

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { exit } from "node:process";

async function init(): Promise<void> {
	try {
		if (env.PATH_SQLITE == null) {
			throw new Error("PATH_SQLITE to be defined");
		}
		const pathTasksDb = env.NODE_ENV == "development"
			? env.PATH_SQLITE.replace(".db", "-test.db")
			: env.PATH_SQLITE;
		if (env.PRAGMA_KEY_SQLITE == null) {
			throw new Error("PRAGMA_KEY_SQLITE to be defined");
		}
		// Timeframe
		const pathTimeframeDb = pathTasksDb.replace(".db", "-timeframe.db");
		if (env.NODE_ENV == "development") {
			await rm(pathTimeframeDb, { force: true });
			await sleep(1);
		}
		if (!existsSync(pathTimeframeDb)) {
			const db = new Database(pathTimeframeDb, { strict: true });
			const raw = await file("src/sql/timeframe.sql").text();
			db.run(raw);
			db.run("INSERT INTO timeframe (id, lastRecordAt) VALUES (?1, ?2)", [1, Date.now()]);
			db.close();
			await sleep(1);
		}
		// Tasks
		if (env.NODE_ENV == "development") {
			await rm(pathTasksDb, { force: true });
			await sleep(1);
		}
		if (!existsSync(pathTasksDb)) {
			const options = ["-bail", "-nofollow", "-noheader", "-json"];
			const { stderr, success } = spawnSync(["sqlcipher", pathTasksDb, ...options, `PRAGMA key = '${env.PRAGMA_KEY_SQLITE}'`, ".read src/sql/tasks.sql"], {
				stdout: null,
				env: {}
			});
			if (success) {
				console.log("Done");
				await sleep(1);
			} else {
				throw new Error(stderr.toString().trim());
			}
		} else {
			console.warn("Already exists");
		}
	} catch (e) {
		console.error(e);
		exit(1);
	}
}

init();