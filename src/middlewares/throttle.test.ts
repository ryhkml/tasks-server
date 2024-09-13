import { hash, sleep, SocketAddress } from "bun";
import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";

import { Hono } from "hono";

import { UTCDate } from "@date-fns/utc";

import { throttle } from "./throttle";
import { throttleDb } from "../db/db";
import { exceptionFilter } from "./exception-filter";

type Socket = {
	Bindings: {
		ip: SocketAddress;
	};
};

describe("TEST THROTTLE", () => {
	
	const id = hash("127.0.0.1").toString();

	const stmtRequestCount = throttleDb.prepare<Pick<ControlTable, "requestCount">, string>("SELECT requestCount FROM control WHERE id = ?");

	const api = new Hono<Var & Socket>();

	api.onError(exceptionFilter);

	api.use(async (c, next) => {
		c.set("clientId", id);
		c.set("todayAt", new UTCDate().getTime());
		await next();
	});
	api.use(throttle);

	api.get("/status", c => c.text("OK"));

	describe("", () => {
		it("should allow requests within the limit", async () => {
			const res = await api.request("/status", {
				cache: "no-cache",
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate"
				})
			});
			expect(res.status).toBe(200);
			const { requestCount } = stmtRequestCount.get(id)!;
			expect(requestCount).toBe(1);
		});
		afterEach(async () => {
			throttleDb.run("DELETE FROM control WHERE id = ?", [id]);
			await sleep(1);
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
			const { requestCount } = stmtRequestCount.get(id)!;
			expect(requestCount).toBe(10);
		});
		afterEach(async () => {
			throttleDb.run("DELETE FROM control WHERE id = ?", [id]);
			await sleep(1);
		});
	});

	describe("", () => {
		beforeEach(async () => {
			setSystemTime(new UTCDate("Dec 12 2012 12:00:00 PM"));
			for (let i = 1; i <= 10; i++) {
				await api.request("/status", {
					cache: "no-cache",
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate"
					})
				});
				await sleep(1);
			}
		});
		it("should reset the count after the time window", async () => {
			// 1 minute later
			setSystemTime(new UTCDate("Dec 12 2012 12:01:00 PM"));
			const res = await api.request("/status", {
				cache: "no-cache",
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate"
				})
			});
			expect(res.status).toBe(200);
			const { requestCount } = stmtRequestCount.get(id)!;
			expect(requestCount).toBe(1);
		});
		afterEach(() => {
			setSystemTime();
		});
	});
});