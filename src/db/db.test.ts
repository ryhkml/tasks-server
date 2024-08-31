import { env, file } from "bun";
import { describe, expect, it } from "bun:test";

import { tasksDb, timeframeDb } from "./db";

describe("TEST DATABASE", () => {
	describe("env variables", () => {
		it("should successfully defined PATH_SQLITE", () => {
			expect(env.PATH_SQLITE).not.toBeEmpty();
			expect(env.PATH_SQLITE).toBeDefined();
		});
	});

	describe("initialization", () => {
		it("should successfully initialize tasks and timeframe database", async () => {
			const db1 = await file(env.PATH_SQLITE).exists();
			const db2 = await file(env.PATH_SQLITE.replace(".db", "-timeframe.db")).exists();
			expect(db1).toBeTrue();
			expect(db2).toBeTrue();
		});

		it("should successfully query to the tasks database", () => {
			const status = tasksDb.query<{ status: "Ok" }, []>("SELECT 'Ok' AS status").get();
			expect(status).not.toBeNull();
			expect(status).toStrictEqual({ status: "Ok" });
		});

		it("should successfully query to the timeframe database", async () => {
			const timeframe = timeframeDb.query<{ id: 1, lastRecordAt: number }, []>("SELECT * FROM timeframe").get();
			expect(timeframe).not.toBeNull();
			expect(timeframe).toBeDefined();
			expect(timeframe).toHaveProperty("id");
			expect(timeframe?.id).toBe(1);
			expect(timeframe).toHaveProperty("lastRecordAt");
			expect(timeframe?.lastRecordAt).toBeTypeOf("number");
		});
	});
});