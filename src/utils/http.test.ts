import { $, which } from "bun";
import { describe, expect, it, mock } from "bun:test";

import { lastValueFrom } from "rxjs";
import { z } from "zod";

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

	const mockCAres = mock(async () => {
		const res = await $`curl -V`.text();
		return res.trim().includes("c-ares/");
	});
	const mockLibGsasl = mock(async () => {
		const res = await $`curl -V`.text();
		return res.trim().includes("libgsasl/");
	});

	describe("curl", async () => {
		it("should successfully has the curl command", () => {
			const command = which("curl");
			expect(command).not.toBeNull();
		});
		const hasCAres = await mockCAres();
		it.if(hasCAres)("should successfully support c-ares", () => {
			expect(hasCAres).toBeTrue();
		});
		const hasLibGsasl = await mockLibGsasl();
		it.if(hasLibGsasl)("should successfully support libgsasl", () => {
			expect(hasLibGsasl).toBeTrue();
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