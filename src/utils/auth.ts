import { password } from "bun";

import { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";

import { z } from "zod";

import { query } from "./db";

export function tasksAuth(path?: string): MiddlewareHandler {
	return bearerAuth({
		async verifyToken(token, c) {
			const schema = z.string().regex(/^[a-zA-Z0-9_-]{42}$/);
			const result = schema.safeParse(token);
			if (result.success) {
				// @ts-expect-error
				const ownerId = c.req.valid("header")["x-tasks-owner-id"] as string;
				const owner = query<{ key: string }>(`SELECT key FROM owner WHERE id = '${ownerId}'`, path);
				if (owner == null) {
					throw new HTTPException(403);
				}
				return await password.verify(token, owner[0].key);
			}
			throw new HTTPException(403);
		}
	});
}