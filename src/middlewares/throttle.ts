import { env } from "bun";
import { Database } from "bun:sqlite";

import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

import { millisecondsToSeconds } from "date-fns";

import { safeInteger } from "../utils/common";
import { logWarn } from "../utils/logger";

export async function throttle(c: Context<Var>, next: Next): Promise<void> {
	const MAX_REQUEST = safeInteger(env.MAX_THROTTLE_REQUEST);
	const TIME_WINDOW = safeInteger(env.MAX_THROTTLE_TIME_WINDOW);

	if (MAX_REQUEST == 0 && TIME_WINDOW == 0) {
		await next();
	} else {
		const db = new Database(env.PATH_SQLITE.replace(".db", "-throttle.db"), {
			create: false,
			strict: true
		});
		const id = c.get("clientId");
		const todayAt = c.get("todayAt");
		const stmtControl = db.query<Omit<ControlTable, "id">, string>(`
            SELECT requestCount, lastRequestAt
            FROM control
            WHERE id = ?
            LIMIT 1
	    `);
		const control = stmtControl.get(id);

		c.header("RateLimit-Policy", MAX_REQUEST.toString() + ";w=" + millisecondsToSeconds(TIME_WINDOW).toString());
		c.header("RateLimit-Limit", MAX_REQUEST.toString());

		if (control) {
			if (todayAt - control.lastRequestAt < TIME_WINDOW) {
				if (control.requestCount >= MAX_REQUEST) {
					const retryAfter = Math.ceil((TIME_WINDOW - (todayAt - control.lastRequestAt)) / 1000);
					c.header("RateLimit-Remaining", "0");
					c.header("RateLimit-Reset", retryAfter.toString());
					logWarn(
						"(429) Request temporarily blocked",
						JSON.stringify({
							userAgent: c.get("userAgent")
						})
					);
					throw new HTTPException(429);
				}
				const stmtRequestCount = db.query<Pick<ControlTable, "requestCount">, string>(`
				    UPDATE control
				    SET requestCount = requestCount + 1
				    WHERE id = ?
				    RETURNING requestCount
			    `);
				const { requestCount } = stmtRequestCount.get(id)!;
				c.header("RateLimit-Remaining", (MAX_REQUEST - requestCount).toString());
			} else {
				db.run("UPDATE control SET requestCount = 1, lastRequestAt = ?1 WHERE id = ?2", [todayAt, id]);
				c.header("RateLimit-Remaining", (MAX_REQUEST - 1).toString());
			}
		} else {
			db.run("INSERT INTO control (id, requestCount, lastRequestAt) VALUES (?1, ?2, ?3)", [id, 1, todayAt]);
			c.header("RateLimit-Remaining", (MAX_REQUEST - 1).toString());
		}

		await next();
	}
}
