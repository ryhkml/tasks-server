import { env, file } from "bun";
import { describe, expect, it } from "bun:test";

import { tasksDb, throttleDb } from "./db";

describe("TEST DATABASE", () => {
	describe("env variables", () => {
		it("should successfully defined PATH_SQLITE", () => {
			expect(env.PATH_SQLITE).toBeDefined();
		});
	});

	describe("initialization", () => {
		it("should successfully initialize tasks and throttle database", async () => {
			const db1 = await file(env.PATH_SQLITE).exists();
			const db2 = await file(env.PATH_SQLITE.replace(".db", "-throttle.db")).exists();
			expect(db1).toBeTrue();
			expect(db2).toBeTrue();
		});

		it("should successfully query to the tasks database", () => {
			const stmt = tasksDb.query<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const owner = stmt.get("table", "owner");
			expect(owner).not.toBeNull();
			expect(owner?.name).toBe("owner");
			const queue = stmt.get("table", "queue");
			expect(queue).not.toBeNull();
			expect(queue?.name).toBe("queue");
			const config = stmt.get("table", "config");
			expect(config).not.toBeNull();
			expect(config?.name).toBe("config");
		});

		it("should successfully query to the throttle database", () => {
			const raw = throttleDb.query<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const control = raw.get("table", "control");
			expect(control).not.toBeNull();
			expect(control?.name).toBe("control");
		});
	});
});