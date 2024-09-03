import { env, hash, sleep, SocketAddress } from "bun";
import { afterEach, beforeEach, beforeAll, describe, expect, it } from "bun:test";

import { Hono } from "hono";

import { throttle } from "./throttle";
import { throttleDb } from "../db/db";
import { exceptionFilter } from "../exception/exception-filter";
import { safeInteger } from "../utils/common";

type Socket = {
	Bindings: {
		ip: SocketAddress;
	};
};

describe("TEST THROTTLE", () => {
	
	const id = hash("127.0.0.1").toString();

	const api = new Hono<Var & Socket>();

	api.onError(exceptionFilter);

	api.use(async (c, next) => {
		c.set("clientId", id);
		c.set("todayAt", Date.now());
		await next();
	});
	api.use(throttle);

	api.get("/status", c => c.text("OK"));

	beforeAll(() => {
		// @ts-expect-error
		env.MAX_THROTTLE_TIME_WINDOW = 3000;
	});

	describe("", () => {
		it("should allow requests within the limit", async () => {
			const res = await api.request("/status", {
				cache: "no-cache",
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate"
				})
			});
			expect(res.status).toBe(200);
			const control = throttleDb.query<Pick<ControlTable, "requestCount">, string>("SELECT requestCount FROM control WHERE id = ?");
			const { requestCount } = control.get(id)!;
			expect(requestCount).toBe(1);
		});
		afterEach(() => {
			throttleDb.run("DELETE FROM control WHERE id = ?", [id]);
		});
	});

	describe("", () => {
		it("should limit requests exceeding the limit", async () => {
			for (let i = 1; i <= 10; i++) {
				await api.request("/status", {
					cache: "no-cache",
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate"
					})
				});
			}
			const res = await api.request("/status", {
				headers: new Headers({
					cache: "no-cache",
					"Cache-Control": "no-cache, no-store, must-revalidate"
				})
			});
			expect(res.status).toBe(429);
			const control = throttleDb.query<Pick<ControlTable, "requestCount">, string>("SELECT requestCount FROM control WHERE id = ?");
			const { requestCount } = control.get(id)!;
			expect(requestCount).toBe(10);
		});
		afterEach(() => {
			throttleDb.run("DELETE FROM control WHERE id = ?", [id]);
		});
	});

	describe("", () => {
		beforeEach(async () => {
			for (let i = 1; i <= 10; i++) {
				await api.request("/status", {
					cache: "no-cache",
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate"
					})
				});
			}
		});
		it("should reset the count after the time window", async () => {
			await sleep(safeInteger(env.MAX_THROTTLE_TIME_WINDOW));
			const res = await api.request("/status", {
				cache: "no-cache",
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate"
				})
			});
			expect(res.status).toBe(200);
			const control = throttleDb.query<Pick<ControlTable, "requestCount">, string>("SELECT requestCount FROM control WHERE id = ?");
			const { requestCount } = control.get(id)!;
			expect(requestCount).toBe(1);
		});
	});
});