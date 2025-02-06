import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { Hono } from "hono";

import { tasksDb } from "../db/db";
import { exceptionFilter } from "../middlewares/exception-filter";

import tasks from "./task";

describe("TEST TASK", () => {
	const taskName = "new-notif-handler";
	let taskId = "";
	let key = "";

	const api = new Hono<Var>();

	api.use(async (c, next) => {
		c.set("todayAt", new Date().getTime());
		await next();
	});

	api.onError(exceptionFilter);

	api.basePath("/v1").route("/tasks", tasks);

	describe("POST /v1/tasks/register", () => {
		it("should unsuccessfully register task name", async () => {
			const res = await api.request("/v1/tasks/register", {
				method: "POST",
				cache: "no-cache",
				body: JSON.stringify({
					name: "invalid task name"
				}),
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json"
				})
			});
			const task = await res.json();
			expect(res.status).toBe(400);
			expect(task).toHaveProperty("action");
			expect(task).toHaveProperty("message");
		});

		describe("", () => {
			let taskId = "";
			beforeEach(async () => {
				const res = await api.request("/v1/tasks/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify({
						name: "same-task-name"
					}),
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json"
					})
				});
				const task = await res.json();
				taskId = task.id;
			});
			it("should unsuccessfully register with same task name", async () => {
				const res = await api.request("/v1/tasks/register", {
					method: "POST",
					cache: "no-cache",
					body: JSON.stringify({
						name: "same-task-name"
					}),
					headers: new Headers({
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json"
					})
				});
				const task = await res.json();
				expect(res.status).toBe(409);
				expect(task).toHaveProperty("action");
				expect(task).toHaveProperty("message");
			});
			afterEach(() => {
				tasksDb.run("DELETE FROM task WHERE id = ?", [taskId]);
			});
		});

		it("should successfully register task name", async () => {
			const res = await api.request("/v1/tasks/register", {
				method: "POST",
				cache: "no-cache",
				body: JSON.stringify({
					name: taskName
				}),
				headers: new Headers({
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json"
				})
			});
			const task = await res.json();
			taskId = task.id;
			key = task.key;
			expect(res.status).toBe(201);
			expect(task).toHaveProperty("id");
			expect(task).toHaveProperty("key");
			expect(task.id).toBeTypeOf("string");
			expect(task.key).toBeTypeOf("string");
		});
	});

	describe("GET /v1/tasks/:name", () => {
		it("should unsuccessfully get task name", async () => {
			const res = await api.request("/v1/tasks/test", {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					Authorization: "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Task-Id": taskId
				})
			});
			const task = await res.json();
			expect(res.status).toBe(400);
			expect(task).toHaveProperty("action");
			expect(task).toHaveProperty("message");
		});

		it("should successfully get unavailable task name", async () => {
			const res = await api.request("/v1/tasks/unavailable-task", {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					Authorization: "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Task-Id": taskId
				})
			});
			const task = await res.json();
			expect(res.status).toBe(404);
			expect(task).toStrictEqual({});
		});

		it("should successfully get task name", async () => {
			const res = await api.request("/v1/tasks/" + taskName, {
				method: "GET",
				cache: "no-cache",
				headers: new Headers({
					Authorization: "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Task-Id": taskId
				})
			});
			const task = (await res.json()) as Omit<TaskTable, "key">;
			expect(res.status).toBe(200);
			expect(task).toHaveProperty("id");
			expect(task).toHaveProperty("name");
			expect(task).toHaveProperty("createdAt");
			expect(task).toHaveProperty("tasksInQueue");
			expect(task).toHaveProperty("tasksInQueueLimit");
		});
	});

	describe("DELETE /v1/tasks/:name", () => {
		it("should unsuccessfully delete task name", async () => {
			const res = await api.request("/v1/tasks/test", {
				method: "DELETE",
				cache: "no-cache",
				headers: new Headers({
					Authorization: "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Task-Id": taskId
				})
			});
			const task = await res.json();
			expect(res.status).toBe(400);
			expect(task).toHaveProperty("action");
			expect(task).toHaveProperty("message");
		});

		describe("", () => {
			beforeEach(() => {
				tasksDb.run("UPDATE task SET tasksInQueue = tasksInQueue + 1 WHERE id = ?", [taskId]);
			});
			it("should unsuccessfully delete task name", async () => {
				const res = await api.request("/v1/tasks/" + taskName, {
					method: "DELETE",
					cache: "no-cache",
					headers: new Headers({
						Authorization: "Bearer " + key,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Content-Type": "application/json",
						"X-Task-Id": taskId
					})
				});
				const task = await res.json();
				expect(res.status).toBe(422);
				expect(task).toHaveProperty("action");
				expect(task).toHaveProperty("message");
			});
			afterEach(() => {
				tasksDb.run("UPDATE task SET tasksInQueue = 0 WHERE id = ?", [taskId]);
			});
		});

		it("should successfully delete task name", async () => {
			const res = await api.request("/v1/tasks/" + taskName, {
				method: "DELETE",
				cache: "no-cache",
				headers: new Headers({
					Authorization: "Bearer " + key,
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Content-Type": "application/json",
					"X-Task-Id": taskId
				})
			});
			const task = await res.json();
			expect(res.status).toBe(200);
			expect(task).toStrictEqual({ status: "Done" });
		});
	});
});
