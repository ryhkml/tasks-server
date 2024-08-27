import { password } from "bun";

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { BlankSchema } from "hono/types";

import { zValidator } from "@hono/zod-validator";
import { nanoid  } from "nanoid";
import { ulid } from "ulid";

import { ownerId } from "../schemas/auth";
import { ownerName } from "../schemas/owner";
import { tasksAuth } from "../utils/auth";
import { query } from "../utils/db";

export function owner(): Hono<Var, BlankSchema, "/"> {
	const owner = new Hono<Var>();

	owner.post(
		"/register",
		zValidator("json", ownerName, (result) => {
			if (!result.success) {
				const errors = result.error.format();
				// @ts-expect-error
				errors._errors = undefined;
				throw new HTTPException(400, {
					cause: errors
				});
			}
		}),
		// Check registered owner
		createMiddleware(async (c, next) => {
			// @ts-expect-error
			const name = c.req.valid("json").name as string;
			const owner = query<{ isRegistered: 0 | 1 }>(`
				SELECT EXISTS (SELECT 1 FROM owner WHERE name = '${name}') AS isRegistered;	
			`);
			if (owner == null) {
				throw new HTTPException(500);
			}
			if (!!owner[0].isRegistered) {
				throw new HTTPException(409, {
					cause: "Owner has already registered"
				});
			}
			await next();
		}),
		async (c) => {
			const name = c.req.valid("json").name;
			const todayAt = c.get("todayAt");
			const id = ulid(todayAt);
			const key = nanoid(42);
			const secretKey = await password.hash(key);
			const owner = query<{ id: string }>(`
				INSERT INTO owner (id, key, name, createdAt) 
				VALUES ('${id}', '${secretKey}', '${name}', ${todayAt}) 
				RETURNING id;
			`);
			if (owner == null) {
				throw new HTTPException(500);
			}
			return c.json({ id, key }, 201);
		}
	);

	owner.get(
		"/:name",
		zValidator("header", ownerId, (result) => {
			if (!result.success) {
				throw new HTTPException(403);
			}
		}),
		tasksAuth(),
		zValidator("param", ownerName, (result) => {
			if (!result.success) {
				const errors = result.error.format();
				// @ts-expect-error
				errors._errors = undefined;
				throw new HTTPException(400, {
					cause: errors
				});
			}
		}),
		(c) => {
			const id = c.req.valid("header")["x-tasks-owner-id"];
			const name = c.req.valid("param").name;
			const owner = query<Omit<OwnerTable, "key">>(`
				SELECT id, name, createdAt, tasksInQueue, tasksInQueueLimit FROM owner 
				WHERE id = '${id}' AND name = '${name}';
			`);
			if (owner == null) {
				return c.json({}, 404);
			}
			return c.json(owner[0]);
		}
	);

	owner.delete(
		"/:name",
		zValidator("header", ownerId, (result) => {
			if (!result.success) {
				throw new HTTPException(403);
			}
		}),
		tasksAuth(),
		zValidator("param", ownerName, (result) => {
			if (!result.success) {
				const errors = result.error.format();
				// @ts-expect-error
				errors._errors = undefined;
				throw new HTTPException(400, {
					cause: errors
				});
			}
		}),
		(c) => {
			const id = c.req.valid("header")["x-tasks-owner-id"];
			const name = c.req.valid("param").name;
			const owner = query<{ deleted: "Done" }>(`
				DELETE FROM owner 
				WHERE id = '${id}' AND name = '${name}' AND tasksInQueue = 0 
				RETURNING 'Done' AS deleted;
			`);
			if (owner == null) {
				throw new HTTPException(422);
			}
			return c.json({ status: owner[0].deleted });
		}
	);

	return owner;
}