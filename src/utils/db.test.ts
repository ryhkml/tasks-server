import { env, file, spawnSync } from "bun";
import { beforeEach, describe, expect, it } from "bun:test";

import { query, timeframeDb } from "./db";

describe("TEST DATABASE", () => {

	const pathTimeframeDb = env.PATH_SQLITE.replace(".db", "-timeframe.db");

	describe("env variables", () => {
		it("should successfully defined PATH_SQLITE and PRAGMA_KEY_SQLITE", () => {
			expect(env.PATH_SQLITE).not.toBeEmpty();
			expect(env.PATH_SQLITE).toBeDefined();
			expect(env.PRAGMA_KEY_SQLITE).not.toBeEmpty();
			expect(env.PRAGMA_KEY_SQLITE).toBeDefined();
		});
	});

	describe("sqlcipher command", () => {
		let sqlcipherError = false;
		let sqlcipherStdout: undefined | string;
		beforeEach(() => {
			try {
				const { exitCode, stdout } = spawnSync(["sqlcipher", "-version"], {
					stderr: "pipe",
					env: {}
				});
				sqlcipherError = exitCode != 0;
				sqlcipherStdout = stdout.toString().trim();
			} catch (_) {
				sqlcipherError = true;
			}
		});
		it.skipIf(sqlcipherError)("should successfully run sqlcipher version", () => {
			expect(sqlcipherStdout).toBeDefined();
			expect(sqlcipherStdout).toContain("SQLCipher");
		});
	});

	describe("initialization", () => {
		it("should successfully initialize tasks and timeframe database", async () => {
			const db1 = await file(env.PATH_SQLITE).exists();
			const db2 = await file(pathTimeframeDb).exists();
			expect(db1).toBeTrue();
			expect(db2).toBeTrue();
		});

		it("should successfully query to the tasks database", () => {
			const res = query<Omit<OwnerTable, "key">>("SELECT * FROM owner");
			expect(res).toBeNull();
		});

		it("should successfully query to the timeframe database", async () => {
			const db = timeframeDb(pathTimeframeDb);
			const res = db.query<{ id: 1, lastRecordAt: number }, []>("SELECT * FROM timeframe");
			const timeframe = res.get();
			db.close();
			expect(timeframe).not.toBeNull();
			expect(timeframe).toBeDefined();
			expect(timeframe).toHaveProperty("id");
			expect(timeframe?.id).toBe(1);
			expect(timeframe).toHaveProperty("lastRecordAt");
			expect(timeframe?.lastRecordAt).toBeTypeOf("number");
		});
	});
});