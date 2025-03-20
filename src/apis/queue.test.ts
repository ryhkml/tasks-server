import { env, fetch, password, sleep, write } from "bun";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { rm } from "node:fs/promises";

import { Hono } from "hono";

import { addSeconds, format } from "date-fns";
import { customAlphabet } from "nanoid";
import { ulid } from "ulid";
import { z } from "zod";

import { tasksDb } from "../db/db";
import { exceptionFilter } from "../middlewares/exception-filter";
import { taskSchema } from "../schemas/task";
import { queuesQuerySchema } from "../schemas/queue";
import { logWarn } from "../utils/logger";

import queue from "./queue";

type TaskRequest = z.infer<typeof taskSchema>;
type Queue = Omit<QueueTable, "taskId" | "metadata"> & { metadata: RecordString | null };

describe("TEST QUEUE", () => {
	logWarn("If an error occurs during this test, ensure your internet connection is stable");

	let taskId = "";
	let key = "";

	const taskName = "notif-handler";
	const todayAt = new Date().getTime();

	const stmtQueue = tasksDb.prepare<QueueTable, string>("SELECT * FROM queue WHERE id = ?");
	const stmtRetryCount = tasksDb.prepare<Pick<ConfigTable, "retryCount">, string>(
		"SELECT retryCount FROM config WHERE id = ?"
	);

	const api = new Hono<Var>();

	api.use(async (c, next) => {
		c.set("todayAt", new Date().getTime());
		await next();
	});

	api.onError(exceptionFilter);

	api.basePath("/v1").route("/queues", queue);

	beforeAll(async () => {
		taskId = ulid(todayAt);
		const alphabet = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 64);
		key = alphabet();
		const secretKey = await password.hash(key);
		tasksDb.run("INSERT INTO task (id, key, name, createdAt) VALUES (?1, ?2, ?3, ?4)", [
			taskId,
			secretKey,
			taskName,
			todayAt
		]);
		for (let i = 1; i <= 3; i++) {
			await fetch(env.DUMMY_TARGET_URL, {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json"
				}),
				keepalive: true
			});
			await sleep(1);
		}
	});

	describe("GET /v1/queues", () => {
		describe("", () => {
			it("should successfully get queues with default query params", async () => {
				const query = queuesQuerySchema.safeParse({}).data!;
				expect(query).toStrictEqual({
					limit: 10,
					offset: 0,
					order: "createdAt",
					sort: "asc"
				});
				const urlSp = new URLSearchParams();
				urlSp.append("limit", query.limit.toString());
				urlSp.append("offset", query.offset.toString());
				urlSp.append("order", query.order);
				urlSp.append("sort", query.sort);
				const res = await api.request("/v1/queues?" + urlSp.toString(), {
					method: "GET",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queues = (await res.json()) as Queue[];
				expect(res.status).toBe(200);
				expect(queues).toStrictEqual([]);
			});
		});

		describe("", () => {
			it("should successfully get queues with custom query params", async () => {
				const query = queuesQuerySchema.safeParse({
					limit: "20",
					offset: "0",
					order: "createdAt",
					sort: "asc",
					state: "SUCCESS"
				}).data!;
				expect(query).toStrictEqual({
					limit: 20,
					offset: 0,
					order: "createdAt",
					sort: "asc",
					state: "SUCCESS"
				});
				const urlSp = new URLSearchParams();
				urlSp.append("limit", query.limit.toString());
				urlSp.append("offset", query.offset.toString());
				urlSp.append("order", query.order);
				urlSp.append("sort", query.sort);
				urlSp.append("state", query.state!);
				const res = await api.request("/v1/queues?" + urlSp.toString(), {
					method: "GET",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queues = (await res.json()) as Queue[];
				expect(res.status).toBe(200);
				expect(queues).toStrictEqual([]);
			});
		});

		describe("", () => {
			it("should unsuccessfully get queues due to invalid query", async () => {
				const res = await api.request("/v1/queues?limit=10000", {
					method: "GET",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(400);
			});
		});
	});

	describe("GET /v1/queues/:queueId", () => {
		describe("", () => {
			let queueId = "";
			beforeEach(async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
			});
			it("should successfully get queue", async () => {
				const res = await api.request("/v1/queues/" + queueId, {
					method: "GET",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(200);
			});
		});

		describe("", () => {
			it("should unsuccessfully get due to invalid queue id", async () => {
				const res = await api.request("/v1/queues/invalid-queue-id", {
					method: "GET",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(400);
			});
		});

		describe("", () => {
			it("should unsuccessfully get due to unavailable task", async () => {
				// Using dummy queue id
				const res = await api.request("/v1/queues/191E27DB6911726081775249", {
					method: "GET",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(404);
			});
		});
	});

	describe("POST /v1/queues/register", () => {
		describe("", () => {
			it("should successfully register and return success", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				expect(queue.state).toBe("RUNNING");
				expect(queue.response).toBeNull();
				expect(queue.estimateEndAt).toBe(0);
				await sleep(2000);
				const currentQueue = stmtQueue.get(queue.id)!;
				expect(currentQueue.state).toBe("SUCCESS");
				expect(currentQueue.statusCode).toBeGreaterThanOrEqual(200);
				expect(currentQueue.statusCode).toBeLessThanOrEqual(299);
				expect(currentQueue.response).not.toBeNull();
				expect(currentQueue.estimateEndAt).not.toBe(0);
			});
		});

		describe("", () => {
			it("should successfully register and return error", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL + "/error",
						method: "GET"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				expect(queue.state).toBe("RUNNING");
				expect(queue.response).toBeNull();
				expect(queue.estimateEndAt).toBe(0);
				await sleep(1000);
				const currentQueue = stmtQueue.get(queue.id)!;
				expect(currentQueue.state).toBe("ERROR");
				expect(currentQueue.statusCode).toBeGreaterThanOrEqual(400);
				expect(currentQueue.statusCode).toBeLessThanOrEqual(499);
				expect(currentQueue.response).not.toBeNull();
				expect(currentQueue.estimateEndAt).not.toBe(0);
			});
		});

		describe("", () => {
			it("should successfully register and ignore additional payload due to GET or DELETE method", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET",
						data: "Ignore data"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				expect(queue.state).toBe("RUNNING");
				expect(queue.response).toBeNull();
				expect(queue.estimateEndAt).toBe(0);
			});
		});

		describe("", () => {
			it("should successfully register with additional string payload", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "POST",
						data: "Test string data"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
		});

		describe("", () => {
			it("should successfully register with additional multipart/form-data payload", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "POST",
						data: [
							{
								name: "label",
								value: "Test multipart/form-data"
							}
						]
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
		});

		describe("", () => {
			it("should successfully register with additional json payload", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "POST",
						data: {
							name: "Test json data",
							value: 1,
							nested: {
								name: "Nested 2",
								value: true,
								nested: {
									name: "Nested 3",
									value: null
								}
							}
						}
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
		});

		describe("", () => {
			it("should successfully register with additional cookie payload", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "POST",
						cookie: [
							{
								name: "name",
								value: "value"
							}
						]
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
		});

		describe("", () => {
			it("should successfully register with additional query payload", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET",
						query: {
							q: "Test query"
						}
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
		});

		describe("", () => {
			it("should successfully register with additional headers payload", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET",
						headers: {
							"X-Custom-Id": "Test header"
						}
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
		});

		describe("", () => {
			it("should successfully register with additional metadata", async () => {
				// @ts-expect-error
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					metadata: {
						username: "test",
						tag: "checkout-notification"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
				const queue = (await res.json()) as Queue;
				expect(queue.metadata).toStrictEqual({
					username: "test",
					tag: "checkout-notification"
				});
			});
		});

		describe("", () => {
			// Create a dummy CA
			beforeEach(async () => {
				await write("/tmp/ca.crt", "", { mode: 440 });
			});
			it("should successfully register with additional custom CA", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						ca: "/tmp/ca.crt"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
			afterEach(async () => {
				await rm("/tmp/ca.crt", { force: true });
			});
		});

		describe("", () => {
			// Create a dummy cert
			beforeEach(async () => {
				await write("/tmp/fullchain.pem", "", { mode: 440 });
			});
			it("should successfully register with additional custom cert", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						cert: {
							value: "/tmp/fullchain.pem"
						}
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
			afterEach(async () => {
				await rm("/tmp/fullchain.pem", { force: true });
			});
		});

		describe("", () => {
			// Create a dummy key
			beforeEach(async () => {
				await write("/tmp/key.pem", "", { mode: 440 });
			});
			it("should successfully register with additional custom key", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						cert: {
							value: "/tmp/key.pem"
						}
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(201);
			});
			afterEach(async () => {
				await rm("/tmp/key.pem", { force: true });
			});
		});

		describe("", () => {
			it("should successfully register and ignore error status code", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL + "/error",
						method: "GET"
					},
					// @ts-expect-error
					config: {
						ignoreStatusCode: [404]
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				await sleep(1000);
				const currentQueue = stmtQueue.get(queue.id)!;
				expect(currentQueue.state).toBe("ERROR");
				expect(currentQueue.statusCode).toBe(404);
			});
		});

		describe("", () => {
			it("should successfully register and ignore error status code", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL + "/error",
						method: "GET"
					},
					// @ts-expect-error
					config: {
						ignoreStatusCode: [404]
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				await sleep(1000);
				const currentQueue = stmtQueue.get(queue.id)!;
				expect(currentQueue.state).toBe("ERROR");
				expect(currentQueue.statusCode).toBe(404);
			});
		});

		describe("", () => {
			it("should successfully register and retry 1 time", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL + "/error",
						method: "GET"
					},
					// @ts-expect-error
					config: {
						retry: 1,
						retryInterval: 1000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				await sleep(3000);
				const currentQueue = stmtQueue.get(queue.id);
				expect(currentQueue?.state).toBe("ERROR");
				const currentConfig = stmtRetryCount.get(queue.id);
				expect(currentConfig?.retryCount).toBe(1);
			});
		});

		describe("", () => {
			it("should successfully register and retry with specific date", async () => {
				const next3Seconds = addSeconds(new Date(), 3);
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL + "/error",
						method: "GET"
					},
					// @ts-expect-error
					config: {
						retryAt: format(next3Seconds, "LLL d yyyy pp")
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(201);
				await sleep(5000);
				const currentQueue = stmtQueue.get(queue.id);
				expect(currentQueue?.state).toBe("ERROR");
				const currentConfig = stmtRetryCount.get(queue.id);
				expect(currentConfig?.retryCount).toBe(1);
			});
		});

		describe("", () => {
			it("should unsuccessfully register due to execution date is a previous date", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executeAt: "Dec 12 2024"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(400);
			});
		});

		describe("", () => {
			it("should unsuccessfully register due to retry date is a previous execution date", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 1,
						retryAt: "Dec 12 2024"
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(400);
			});
		});

		it("should unsuccessfully register due to timeout date is a previous execution date", async () => {
			const body: TaskRequest = {
				httpRequest: {
					url: env.DUMMY_TARGET_URL,
					method: "GET"
				},
				// @ts-expect-error
				config: {
					executionDelay: 1,
					timeoutAt: "Dec 12 2012"
				}
			};
			const res = await api.request("/v1/queues/register", {
				method: "POST",
				cache: "no-cache",
				body: JSON.stringify(body),
				headers: new Headers({
					Authorization: "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Task-Id": taskId
				})
			});
			expect(res.status).toBe(400);
		});

		describe("", () => {
			beforeEach(() => {
				tasksDb.run("UPDATE task SET tasksInQueue = ?1 WHERE id = ?2", [1000, taskId]);
			});
			it("should unsuccessfully register due to number of tasks in queue is greater than the limit", async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 1
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				expect(res.status).toBe(422);
			});
			afterEach(async () => {
				tasksDb.run("UPDATE task SET tasksInQueue = ?1 WHERE id = ?2", [0, taskId]);
				await sleep(1);
			});
		});
	});

	describe("POST /v1/queues/:queueId/execute", () => {
		let queueId = "";
		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "POST",
						data: "Some data"
					},
					// @ts-expect-error
					config: {
						executionDelay: 60000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const data = (await res.json()) as Queue;
				queueId = data.id;
			});
			it("should successfully force execute a task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/execute", {
					method: "POST",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const data = (await res.json()) as { status: "Done" };
				expect(data).toStrictEqual({ status: "Done" });
				await sleep(1000);
				const raw = tasksDb.query<{ state: "SUCCESS" }, [string]>("SELECT state FROM queue WHERE id = ?");
				const value = raw.get(queueId);
				expect(value?.state).toBe("SUCCESS");
			});
		});

		describe("", () => {
			it("should unsuccessfully force execute a task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/execute", {
					method: "POST",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				await res.json();
				expect(res.status).toBe(422);
			});
		});
	});

	describe("PATCH /v1/queues/:queueId/pause", () => {
		let queueId = "";
		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 5000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
			});
			it("should successfully pause a task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/pause", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as { status: "Done" };
				expect(res.status).toBe(200);
				expect(queue).toStrictEqual({ status: "Done" });
				const currentQueue = stmtQueue.get(queueId)!;
				expect(currentQueue.state).toBe("PAUSED");
			});
			afterEach(async () => {
				await api.request("/v1/queues/" + queueId, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
		});

		describe("", () => {
			it("should unsuccessfully pause a task due to invalid queue id", async () => {
				const res = await api.request("/v1/queues/invalid-queue-id/pause", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(400);
			});
		});

		describe("", () => {
			it("should unsuccessfully pause a task due to unavailable task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/pause", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(422);
			});
		});
	});

	describe("PATCH /v1/queues/:queueId/resume", () => {
		let queueId = "";
		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 5000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
				await api.request("/v1/queues/" + queueId + "/pause", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
			it("should successfully resume", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/resume", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(200);
				expect(queue.state).toBe("RUNNING");
			});
			afterEach(async () => {
				await api.request("/v1/queues/" + queueId, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
		});

		describe("", () => {
			let queueId = "";
			beforeEach(async () => {
				const next3Seconds = addSeconds(new Date(), 3);
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executeAt: format(next3Seconds, "LLL d yyyy pp"),
						// “executeImmediately” is an execution that has exceeded the original execution date.
						// This happens during resume, if the execution date exceeds the date during resume, the task will still be executed.
						// Make sure you set “executeImmediately” to true
						executeImmediately: true
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
				await api.request("/v1/queues/" + queueId + "/pause", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
			it("should successfully resume with execute immediately", async () => {
				await sleep(5000);
				const res = await api.request("/v1/queues/" + queueId + "/resume", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				expect(res.status).toBe(200);
				expect(queue.state).toBe("RUNNING");
				await sleep(1000);
				const currentQueue = stmtQueue.get(queueId)!;
				expect(currentQueue.state).toBe("SUCCESS");
			});
			afterEach(async () => {
				await api.request("/v1/queues/" + queueId, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
		});

		describe("", () => {
			it("should unsuccessfully resume due to invalid queue id", async () => {
				const res = await api.request("/v1/queues/invalid-queue-id/resume", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(400);
			});
		});

		describe("", () => {
			it("should unsuccessfully resume due to unavailable task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/resume", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(422);
			});
		});
	});

	describe("PATCH /v1/queues/:queueId/revoke", () => {
		let queueId = "";
		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 5000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
			});
			it("should successfully revoke a task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/revoke", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as { status: "Done" };
				expect(res.status).toBe(200);
				expect(queue).toStrictEqual({ status: "Done" });
				const currentQueue = stmtQueue.get(queueId)!;
				expect(currentQueue.state).toBe("REVOKED");
			});
		});

		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 5000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
				await api.request("/v1/queues/" + queueId + "/pause", {
					method: "PATCH",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
			it("should successfully revoke while it is paused", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/revoke", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as { status: "Done" };
				expect(res.status).toBe(200);
				expect(queue).toStrictEqual({ status: "Done" });
				const currentQueue = stmtQueue.get(queueId)!;
				expect(currentQueue.state).toBe("REVOKED");
			});
			afterEach(async () => {
				tasksDb.run("DELETE FROM queue WHERE id = ?", [queueId]);
				await sleep(1);
			});
		});

		describe("", () => {
			it("should unsuccessfully revoke due to invalid queue id", async () => {
				const res = await api.request("/v1/queues/invalid-queue-id/revoke", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(400);
			});
		});

		describe("", () => {
			it("should unsuccessfully revoke due to unavailable task", async () => {
				const res = await api.request("/v1/queues/" + queueId + "/revoke", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(422);
			});
		});
	});

	describe("DELETE /v1/queues/:queueId", () => {
		let queueId = "";
		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 5000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
			});
			it("should successfully delete while it is running", async () => {
				const res = await api.request("/v1/queues/" + queueId, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as { status: "Done" };
				expect(res.status).toBe(200);
				expect(queue).toStrictEqual({ status: "Done" });
				const currentQueue = stmtQueue.get(queueId);
				expect(currentQueue).toBeNull();
			});
		});

		describe("", () => {
			beforeEach(async () => {
				const body: TaskRequest = {
					httpRequest: {
						url: env.DUMMY_TARGET_URL,
						method: "GET"
					},
					// @ts-expect-error
					config: {
						executionDelay: 5000
					}
				};
				const res = await api.request("/v1/queues/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify(body),
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as Queue;
				queueId = queue.id;
				await api.request("/v1/queues/" + queueId + "/pause", {
					method: "PATCH",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
			});
			it("should successfully delete while it is paused", async () => {
				const res = await api.request("/v1/queues/" + queueId, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const queue = (await res.json()) as { status: "Done" };
				expect(res.status).toBe(200);
				expect(queue).toStrictEqual({ status: "Done" });
				const currentQueue = stmtQueue.get(queueId);
				expect(currentQueue).toBeNull();
			});
		});

		describe("", () => {
			it("should unsuccessfully delete due to invalid queue id", async () => {
				const res = await api.request("/v1/queues/invalid-queue-id", {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(400);
			});
		});

		describe("", () => {
			it("should unsuccessfully delete due to unavailable task", async () => {
				const res = await api.request("/v1/queues/" + queueId, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				(await res.json()) as Queue;
				expect(res.status).toBe(422);
			});
		});
	});
});
