import { env, file } from "bun";
import { describe, expect, it } from "bun:test";

import { query, timeframeDb } from "./db";

describe("TEST DATABASE", () => {
	describe("env variables", () => {
		it("should successfully defined PATH_SQLITE and PRAGMA_KEY_SQLITE", () => {
			expect(env.PATH_SQLITE).not.toBeEmpty();
			expect(env.PATH_SQLITE).toBeDefined();
			expect(env.PRAGMA_KEY_SQLITE).not.toBeEmpty();
			expect(env.PRAGMA_KEY_SQLITE).toBeDefined();
		});
	});

	describe("initialization", () => {
		const pathTasksDb = env.PATH_SQLITE.replace(".db", "-test.db");
		const pathTimeframeDb = pathTasksDb.replace(".db", "-timeframe.db");

		it("should successfully initialize the database", async () => {
			const db1 = await file(pathTasksDb).exists();
			const db2 = await file(pathTimeframeDb).exists();
			expect(db1).toBeTrue();
			expect(db2).toBeTrue();
		});

		it("should successfully query to the tasks database", () => {
			const res = query<Omit<OwnerTable, "key">>("SELECT * FROM owner", pathTasksDb);
			expect(res).toBeNull();
		});

		it("should successfully query to the timeframe database", async () => {
			const db = timeframeDb(pathTimeframeDb);
			const res = db.query<{ id: 1, lastRecordAt: number }, []>("SELECT * FROM timeframe");
			const timeframe = res.get();
			expect(timeframe).not.toBeNull();
			expect(timeframe).toBeDefined();
			expect(timeframe).toHaveProperty("id");
			expect(timeframe?.id).toBe(1);
			expect(timeframe).toHaveProperty("lastRecordAt");
			expect(timeframe?.lastRecordAt).toBeTypeOf("number");
			db.close();
		});
	});
});