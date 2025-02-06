import { password } from "bun";

import { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { zValidator } from "@hono/zod-validator";

import { tasksDb } from "../db/db";
import { taskHeadersSchema } from "../schemas/auth";

export function tasksAuth(): MiddlewareHandler {
	return every(
		zValidator("header", taskHeadersSchema, (result) => {
			if (!result.success) {
				throw new HTTPException(403);
			}
		}),
		createMiddleware(async (c, next) => {
			// @ts-expect-error
			c.set("taskId", c.req.valid("header")["x-task-id"]);
			await next();
		}),
		bearerAuth({
			async verifyToken(token, c: Context<Var>) {
				const id = c.get("taskId");
				const stmtKey = tasksDb.query<{ key: string }, string>(`
					SELECT key
					FROM task
					WHERE id = ?
					LIMIT 1
				`);
				const task = stmtKey.get(id);
				if (task == null) {
					throw new HTTPException(403);
				}
				return await password.verify(token, task.key);
			}
		})
	);
}
