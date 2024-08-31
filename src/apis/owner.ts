import { password } from "bun";

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { BlankSchema } from "hono/types";

import { zValidator } from "@hono/zod-validator";
import { nanoid  } from "nanoid";
import { ulid } from "ulid";

import { tasksAuth } from "../auth/auth";
import { tasksDb } from "../db/db";
import { ownerName } from "../schemas/owner";

const stmtIsRegistered = tasksDb.prepare<{ isRegistered: 0 | 1 }, string>("SELECT EXISTS (SELECT 1 FROM owner WHERE name = ?) AS isRegistered");

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
			const { name } = c.req.valid("json") as { name: string };
			const owner = stmtIsRegistered.get(name);
			if (owner?.isRegistered) {
				throw new HTTPException(409, {
					cause: "Owner has already registered"
				});
			}
			await next();
		}),
		async (c) => {
			const { name } = c.req.valid("json");
			const todayAt = c.get("todayAt");
			const id = ulid(todayAt);
			const key = nanoid(42);
			const secretKey = await password.hash(key);
			tasksDb.run("INSERT INTO owner (id, key, name, createdAt) VALUES (?1, ?2, ?3, ?4)", [
				id,
				secretKey,
				name,
				todayAt
			]);
			return c.json({ id, key }, 201);
		}
	);

	owner.get(
		"/:name",
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
			const id = c.get("ownerId");
			const { name } = c.req.valid("param");
			const owner = tasksDb.query<Omit<OwnerTable, "key">, [string, string]>("SELECT id, name, createdAt, tasksInQueue, tasksInQueueLimit FROM owner WHERE id = ?1 AND name = ?2").get(id, name);
			if (owner == null) {
				return c.json({}, 404);
			}
			return c.json(owner);
		}
	);

	owner.delete(
		"/:name",
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
			const id = c.get("ownerId");
			const { name } = c.req.valid("param");
			const owner = tasksDb.query<{ deleted: "Done" }, [string, string]>("DELETE FROM owner WHERE id = ?1 AND name = ?2 AND tasksInQueue = 0 RETURNING 'Done' AS deleted").get(id, name);
			if (owner == null) {
				throw new HTTPException(422);
			}
			return c.json({ status: owner.deleted });
		}
	);

	return owner;
}