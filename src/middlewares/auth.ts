import { password } from "bun";

import { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { every } from "hono/combine";
import { HTTPException } from "hono/http-exception";

import { zValidator } from "@hono/zod-validator";

import { tasksDb } from "../db/db";
import { ownerHeadersSchema } from "../schemas/auth";

const stmtKey = tasksDb.query<{ key: string }, string>("SELECT key FROM owner WHERE id = ? LIMIT 1");

export function tasksAuth(): MiddlewareHandler {
	return every(
		zValidator("header", ownerHeadersSchema, (result) => {
			if (!result.success) {
				throw new HTTPException(403);
			}
		}),
		async (c, next) => {
			// @ts-expect-error
			c.set("ownerId", c.req.valid("header")["x-tasks-owner-id"]);
			await next();
		},
		bearerAuth({
			async verifyToken(token, c: Context<Var>) {
				const id = c.get("ownerId");
				const owner = stmtKey.get(id);
				if (owner == null) {
					throw new HTTPException(403);
				}
				return await password.verify(token, owner.key);
			}
		})
	);
}