import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { Hono } from "hono";

import { tasksDb } from "../db/db";
import { exceptionFilter } from "../middlewares/exception-filter";

import owner from "./owner";

describe("TEST OWNER", () => {

	const ownerName = "test-owner";
	let ownerId = "";
	let key = "";

	const api = new Hono<Var>();

	api.use(async (c, next) => {
		c.set("todayAt", new Date().getTime());
		await next();
	});

	api.onError(exceptionFilter);

	api.basePath("/v1").route("/owners", owner);

	describe("POST /v1/owners/register", () => {
		it("should unsuccessfully register invalid owner name", async () => {
			const res = await api.request("/v1/owners/register", {
				method: "POST",
				cache: "no-cache",
				body: JSON.stringify({
					name: "invalid name"
				}),
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json"
				})
			});
			const owner = await res.json();
			expect(res.status).toBe(400);
			expect(owner).toHaveProperty("action");
			expect(owner).toHaveProperty("message");
		});

		describe("", () => {
			let ownerId = "";
			beforeEach(async () => {
				const res = await api.request("/v1/owners/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify({
						name: "same-owner"
					}),
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json"
					})
				});
				const owner = await res.json();
				ownerId = owner.id;
			});
			it("should unsuccessfully register same owner name", async () => {
				const res = await api.request("/v1/owners/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify({
						name: "same-owner"
					}),
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json"
					})
				});
				const owner = await res.json();
				expect(res.status).toBe(409);
				expect(owner).toHaveProperty("action");
				expect(owner).toHaveProperty("message");
			});
			afterEach(() => {
				tasksDb.run("DELETE FROM owner WHERE id = ?", [ownerId]);
			});
		});

		it("should successfully register new owner", async () => {
			const res = await api.request("/v1/owners/register", {
				method: "POST",
				cache: "no-cache",
				body: JSON.stringify({
					name: ownerName
				}),
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json"
				})
			});
			const owner = await res.json();
			ownerId = owner.id;
			key = owner.key;
			expect(res.status).toBe(201);
			expect(owner).toHaveProperty("id");
			expect(owner).toHaveProperty("key");
			expect(owner.id).toBeTypeOf("string");
			expect(owner.key).toBeTypeOf("string");
		});
	});

	describe("GET /v1/owners/:name", () => {
		it("should unsuccessfully get invalid owner name", async () => {
			const res = await api.request("/v1/owners/test", {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					"Authorization": "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Tasks-Owner-Id": ownerId
				})
			});
			const owner = await res.json();
			expect(res.status).toBe(400);
			expect(owner).toHaveProperty("action");
			expect(owner).toHaveProperty("message");
		});

		it("should successfully get unavailable owner", async () => {
			const res = await api.request("/v1/owners/unavailable-owner", {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					"Authorization": "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Tasks-Owner-Id": ownerId
				})
			});
			const owner = await res.json();
			expect(res.status).toBe(404);
			expect(owner).toStrictEqual({});
		});

		it("should successfully get owner", async () => {
			const res = await api.request("/v1/owners/" + ownerName, {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					"Authorization": "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Tasks-Owner-Id": ownerId
				})
			});
			const owner = await res.json() as Omit<OwnerTable, "key">;
			expect(res.status).toBe(200);
			expect(owner).toHaveProperty("id");
			expect(owner).toHaveProperty("name");
			expect(owner).toHaveProperty("createdAt");
			expect(owner).toHaveProperty("tasksInQueue");
			expect(owner).toHaveProperty("tasksInQueueLimit");
		});
	});

	describe("DELETE /v1/owners/:name", () => {
		it("should unsuccessfully delete invalid owner name", async () => {
			const res = await api.request("/v1/owners/test", {
				method: "DELETE",
				cache: "no-cache",
				headers: new Headers({
					"Authorization": "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Tasks-Owner-Id": ownerId
				})
			});
			const owner = await res.json();
			expect(res.status).toBe(400);
			expect(owner).toHaveProperty("action");
			expect(owner).toHaveProperty("message");
		});

		describe("", () => {
			beforeEach(() => {
				tasksDb.run("UPDATE owner SET tasksInQueue = tasksInQueue + 1 WHERE id = ?", [ownerId]);
			});
			it("should unsuccessfully delete owner", async () => {
				const res = await api.request("/v1/owners/" + ownerName, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						"Authorization": "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Tasks-Owner-Id": ownerId
					})
				});
				const owner = await res.json();
				expect(res.status).toBe(422);
				expect(owner).toHaveProperty("action");
				expect(owner).toHaveProperty("message");
			});
			afterEach(() => {
				tasksDb.run("UPDATE owner SET tasksInQueue = 0 WHERE id = ?", [ownerId]);
			});
		});

		it("should successfully delete owner", async () => {
			const res = await api.request("/v1/owners/" + ownerName, {
				method: "DELETE",
				cache: "no-cache",
				headers: new Headers({
					"Authorization": "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Tasks-Owner-Id": ownerId
				})
			});
			const owner = await res.json();
			expect(res.status).toBe(200);
			expect(owner).toStrictEqual({ status: "Done" });
		});
	});
});