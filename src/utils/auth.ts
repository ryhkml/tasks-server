import { password } from "bun";

import { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { query } from "./db";
import { ownerId } from "../schemas/auth";

export function tasksAuth(path?: string): MiddlewareHandler {
	return every(
		zValidator("header", ownerId, (result) => {
			if (!result.success) {
				throw new HTTPException(403);
			}
		}),
		createMiddleware<Var>(async (c, next) => {
			// @ts-expect-error
			c.set("ownerId", c.req.valid("header")["x-tasks-owner-id"]);
			await next();
		}),
		bearerAuth({
			async verifyToken(token, c: Context<Var>) {
				const schema = z.string().regex(/^[a-zA-Z0-9_-]{42}$/);
				const result = schema.safeParse(token);
				if (result.success) {
					const id = c.get("ownerId");
					const owner = query<{ key: string }>(`SELECT key FROM owner WHERE id = '${id}'`, path);
					if (owner == null) {
						throw new HTTPException(403);
					}
					return await password.verify(token, owner[0].key);
				}
				throw new HTTPException(403);
			}
		})
	);
}