import { password } from "bun";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { BlankSchema } from "hono/types";

import { zValidator } from "@hono/zod-validator";
import { customAlphabet  } from "nanoid";
import { ulid } from "ulid";

import { tasksAuth } from "../middlewares/auth";
import { tasksDb } from "../db/db";
import { ownerNameSchema } from "../schemas/owner";

const stmtIsRegistered = tasksDb.query<{ isRegistered: 0 | 1 }, string>("SELECT EXISTS (SELECT 1 FROM owner WHERE name = ?) AS isRegistered");

export function owner(): Hono<Var, BlankSchema, "/"> {

	const owner = new Hono<Var>();

	owner.post(
		"/register",
		zValidator("json", ownerNameSchema, (result) => {
			if (!result.success) {
				const errors = result.error.format();
				throw new HTTPException(400, {
					cause: errors
				});
			}
		}),
		async (c, next) => {
			const { name } = c.req.valid("json")
			const owner = stmtIsRegistered.get(name);
			if (owner?.isRegistered) {
				throw new HTTPException(409, {
					cause: "Owner has already registered"
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
				tasksDb.run(`
					INSERT INTO owner (id, key, name, createdAt)
					VALUES (?1, ?2, ?3, ?4)
				`, [
					id,
					secretKey,
					name,
					todayAt
				]);
			} catch (err) {
				throw new HTTPException(422);
			}
			return c.json({ id, key }, 201);
		}
	);

	owner.get(
		"/:name",
		tasksAuth(),
		zValidator("param", ownerNameSchema, (result) => {
			if (!result.success) {
				const errors = result.error.format();
				throw new HTTPException(400, {
					cause: errors
				});
			}
		}),
		(c) => {
			const id = c.get("ownerId");
			const { name } = c.req.valid("param");
			const raw = tasksDb.query<Omit<OwnerTable, "key">, [string, string]>(`
				SELECT id, name, createdAt, tasksInQueue, tasksInQueueLimit
				FROM owner
				WHERE id = ?1 AND name = ?2
				LIMIT 1
			`)
			const owner = raw.get(id, name);
			if (owner == null) {
				return c.json({}, 404);
			}
			return c.json(owner);
		}
	);

	owner.delete(
		"/:name",
		tasksAuth(),
		zValidator("param", ownerNameSchema, (result) => {
			if (!result.success) {
				const errors = result.error.format();
				throw new HTTPException(400, {
					cause: errors
				});
			}
		}),
		(c) => {
			const id = c.get("ownerId");
			const { name } = c.req.valid("param");
			const raw = tasksDb.query<{ status: "Done" }, [string, string]>(`
				DELETE FROM owner
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

	return owner;
}