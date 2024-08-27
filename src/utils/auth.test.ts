import { env, password } from "bun";
import { beforeAll, describe, expect, it } from "bun:test";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import { ulid } from "ulid";
import { z } from "zod";

import { tasksAuth } from "./auth";
import { ownerId as ownerIdSchema } from "../schemas/auth";
import { query } from "./db";

describe("TEST AUTH", () => {
	const todayAt = Date.now();
	const ownerName = "dummy";
	let ownerId = "";
	let key = "";
	let secretKey = "";

	const pathTasksDb = env.PATH_SQLITE.replace(".db", "-test.db");

	const app = new Hono();
	// Register path for auth
	app.get(
		"/test/auth",
		zValidator("header", ownerIdSchema, (result) => {
			if (!result.success) {
				throw new HTTPException(403);
			}
		}),
		tasksAuth(pathTasksDb),
		(c) => {
			return c.text("Done");
		}
	);

	beforeAll(async () => {
		ownerId = ulid(todayAt);
		key = nanoid(42);
		secretKey = await password.hash(key);
		// Register owner
		query<{ id: string }>(`
			INSERT INTO owner (id, key, name, createdAt)
			VALUES ('${ownerId}', '${secretKey}', '${ownerName}', ${todayAt})
		`, pathTasksDb);
	});
	
	it("should successfully validate owner id and return a ULID", () => {
		const schema = z.string().ulid();
		const result = schema.safeParse(ownerId);
		expect(ownerId).not.toBeEmpty();
		expect(ownerId).toBeDefined();
		expect(result.success).toBeTrue();
	});

	it("should successfully validate secret key and return Argon2id hash algorithm with version 19, memory cost ~64MB, time cost 2, and parallelism 1", () => {
		expect(key).not.toBeEmpty();
		expect(key).toBeDefined();
		expect(secretKey).not.toBeEmpty();
		expect(secretKey).toBeDefined();
		expect(secretKey).toMatch(/\$argon2id\$v=19\$m=65536,t=2,p=1\$/);
	});

	it("should successfully authentication process http 200", async () => {
		const res = await app.request("/test/auth", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Authorization": "Bearer " + key,
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"X-Tasks-Owner-Id": ownerId
			})
		});
		expect(res.status).toBe(200);
	});

	it("should unsuccessfully authentication process with an invalid key", async () => {
		const res = await app.request("/test/auth", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Authorization": "Bearer invalid",
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"X-Tasks-Owner-Id": ownerId
			})
		});
		expect(res.status).toBe(403);
	});

	it("should unsuccessfully authentication process with an invalid owner id", async () => {
		const res = await app.request("/test/auth", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Authorization": "Bearer " + key,
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"X-Tasks-Owner-Id": "invalid"
			})
		});
		expect(res.status).toBe(403);
	});
});