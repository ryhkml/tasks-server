import { $, env, which } from "bun";
import { describe, expect, it, mock } from "bun:test";

import { lastValueFrom } from "rxjs";
import { z } from "zod";

import { http } from "./http";
import { logWarn } from "./logger";
import { taskSchema } from "../schemas/task";

type TaskRequest = z.infer<typeof taskSchema>;

describe("TEST HTTP", () => {
	logWarn("Ensure that you use the latest version of curl, or build curl with support for c-ares and libgsasl");

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
		const command = which("curl");
		it.if(!!command)("should successfully has the curl command", () => {
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

	describe("config", () => {
		it("should successfully use default transport with default config", async () => {
			// @ts-expect-error
			const { data } = safeParse({
				httpRequest: {
					url: env.DUMMY_TARGET_URL,
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
				traceResponseData: true,
				httpVersion: "1.1",
				userAgent: "Tasks-Server/1.0 (compatible; Linux x86_64; +http://tasks-server)",
				ipVersion: 4,
				// @ts-expect-error
				refererUrl: undefined,
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
		it("should successfully use curl transport with default config", async () => {
			// @ts-expect-error
			const { data } = safeParse({
				httpRequest: {
					url: env.DUMMY_TARGET_URL,
					method: "GET",
					transport: "curl"
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
				traceResponseData: true,
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
