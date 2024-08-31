import { describe, expect, it } from "bun:test";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCode } from "hono/utils/http-status";

import { exceptionFilter } from "./exception-filter";
import { safeInteger } from "../utils/common";

describe("TEST EXCEPTION FILTER", () => {

	const api = new Hono();

	api.onError(exceptionFilter);

	api.all("/test/errors/unknown", () => {
		throw new Error("Unknown");
	});
	api.all("/test/errors/:status", (c) => {
		const status = safeInteger(c.req.param("status")) as StatusCode;
		throw new HTTPException(status);
	});

	it("should successfully return http status code 400", async () => {
		const res = await api.request("/test/errors/400", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(400);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 401", async () => {
		const res = await api.request("/test/errors/401", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(401);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 403", async () => {
		const res = await api.request("/test/errors/403", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(403);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 409", async () => {
		const res = await api.request("/test/errors/409", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(409);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 413", async () => {
		const res = await api.request("/test/errors/413", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(413);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 422", async () => {
		const res = await api.request("/test/errors/422", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(422);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 500", async () => {
		const res = await api.request("/test/errors/500", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(500);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});

	it("should successfully return http status code 500 unknown error", async () => {
		const res = await api.request("/test/errors/unknown", {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
		const error = await res.json();
		expect(res.status).toBe(500);
		expect(error).toHaveProperty("action");
		expect(error).toHaveProperty("message");
	});
});