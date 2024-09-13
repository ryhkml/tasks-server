import { $, which } from "bun";
import { beforeAll, describe, expect, it } from "bun:test";

import { lastValueFrom } from "rxjs";
import { z } from "zod";

import { isEmpty } from "./common";
import { http } from "./http";
import { logWarn } from "./logger";
import { taskSchema } from "../schemas/task";

type TaskRequest = z.infer<typeof taskSchema>;

describe("TEST HTTP", () => {

	logWarn("If any test is skipped, curl may not support the feature");
	logWarn("Ensure that you use the latest version of curl, or build curl with support for c-ares and libgsasl, if necessary");

	const targetUrl = "https://us-central1-adroit-cortex-391921.cloudfunctions.net/on-premise-tasks-wht/cb";

	const safeParse = (data: TaskRequest) => {
		return taskSchema.safeParse(data);
	};

	beforeAll(async () => {
		// Fetch target to reduce cold start
		await fetch(targetUrl, {
			method: "GET",
			cache: "no-cache",
			headers: new Headers({
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Content-Type": "application/json"
			})
		});
	});

	describe("curl", async () => {
		const cAres = await $`curl -V | grep "c-ares" 2>&1`.text();
		const libGsasl = await $`curl -V | grep "libgsasl" 2>&1`.text();
		describe("", () => {
			it("should successfully has the curl command", () => {
				const command = which("curl");
				expect(command).not.toBeNull();
			});
			it.skipIf(isEmpty(cAres))("should successfully support c-ares", () => {
				expect(cAres).toBeDefined();
				expect(cAres).toContain("c-ares");
			});
			it.skipIf(isEmpty(libGsasl))("should successfully support libgsasl", () => {
				expect(libGsasl).toBeDefined();
				expect(libGsasl).toContain("libgsasl");
			});
		});
	});

	describe("http", () => {
		it("should successfully request with default config", async () => {
			// @ts-expect-error
			const { data } = safeParse({
				httpRequest: {
					url: targetUrl,
					method: "GET"
				}
			});
			expect(data?.config).toBeDefined();
			expect(data?.config).toStrictEqual({
				executionDelay: 1,
				executeImmediately: false,
				retry: 0,
				retryInterval: 1,
				retryExponential: false,
				ignoreStatusCode: [],
				timeout: 30000,
				httpVersion: "1.1",
				userAgent: "Tasks-Server/1.0 (compatible; Linux x86_64; +http://tasks-server)",
				ipVersion: 4,
				refererUrl: "AUTO",
				keepAliveDuration: 30,
				sessionId: true,
				insecure: false,
				location: true,
				redirectAttempts: 8,
				proxyHttpVersion: "1.1"
			});
			const res = await lastValueFrom(http(data!));
			expect(res).toHaveProperty("id");
			expect(res).toHaveProperty("data");
			expect(res).toHaveProperty("state");
			expect(res).toHaveProperty("status");
			expect(res).toHaveProperty("statusText");
		});
	});
});