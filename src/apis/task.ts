import { password } from "bun";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { zValidator } from "@hono/zod-validator";
import { customAlphabet } from "nanoid";
import { ulid } from "ulid";

import { tasksAuth } from "../middlewares/auth";
import { tasksDb } from "../db/db";
import { taskNameSchema } from "../schemas/auth";

const tasks = new Hono<Var>();

tasks.post(
	"/register",
	zValidator("json", taskNameSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	async (c, next) => {
		const { name } = c.req.valid("json");
		const stmtIsRegistered = tasksDb.query<{ isRegistered: 0 | 1 }, string>(`
			SELECT EXISTS
			(SELECT 1 FROM task WHERE name = ?) AS isRegistered
		`);
		const task = stmtIsRegistered.get(name);
		if (task?.isRegistered) {
			throw new HTTPException(409, {
				cause: "Task name has already registered"
			});
		}
		await next();
	},
	async (c) => {
		const { name } = c.req.valid("json");
		const todayAt = c.get("todayAt");
		const id = ulid(todayAt);
		const alphabet = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 64);
		const key = alphabet();
		const secretKey = await password.hash(key);
		try {
			tasksDb.run(
				`
				INSERT INTO task (id, key, name, createdAt)
				VALUES (?1, ?2, ?3, ?4)
			`,
				[id, secretKey, name, todayAt]
			);
		} catch (err) {
			throw new HTTPException(422);
		}
		return c.json({ id, key }, 201);
	}
);

tasks.get(
	"/:name",
	tasksAuth(),
	zValidator("param", taskNameSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const id = c.get("taskId");
		const { name } = c.req.valid("param");
		const raw = tasksDb.query<Omit<TaskTable, "key">, [string, string]>(`
			SELECT id, name, createdAt, tasksInQueue, tasksInQueueLimit
			FROM task
			WHERE id = ?1 AND name = ?2
			LIMIT 1
		`);
		const task = raw.get(id, name);
		if (task == null) {
			return c.json({}, 404);
		}
		return c.json(task);
	}
);

tasks.delete(
	"/:name",
	tasksAuth(),
	zValidator("param", taskNameSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const id = c.get("taskId");
		const { name } = c.req.valid("param");
		const raw = tasksDb.query<{ status: "Done" }, [string, string]>(`
			DELETE FROM task
			WHERE id = ?1 AND name = ?2 AND tasksInQueue = 0
			RETURNING 'Done' AS status
		`);
		const deleted = raw.get(id, name);
		if (deleted == null) {
			throw new HTTPException(422);
		}
		return c.json(deleted);
	}
);

export default tasks;
