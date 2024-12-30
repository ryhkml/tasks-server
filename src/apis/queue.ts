import { env, write } from "bun";

import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { zValidator } from "@hono/zod-validator";
import { addMilliseconds, differenceInMilliseconds, isAfter } from "date-fns";
import {
	catchError,
	defer,
	delayWhen,
	EMPTY,
	exhaustMap,
	expand,
	filter,
	finalize,
	interval,
	map,
	of,
	retry,
	take,
	tap,
	throwError,
	timer
} from "rxjs";
import { z } from "zod";

import cluster from "node:cluster";
import Cron from "croner";

import { tasksAuth } from "../middlewares/auth";
import { tasksDb } from "../db/db";
import { taskSchema } from "../schemas/task";
import { queueIdSchema, queuesQuerySchema } from "../schemas/queue";
import { backupDb } from "../utils/backup";
import { safeInteger } from "../utils/common";
import { connectivity } from "../utils/connectivity";
import { dec, enc } from "../utils/crypto";
import { http } from "../utils/http";
import { logError, logInfo, logWarn } from "../utils/logger";
import { clusterMode, MAX_INSTANCES } from "../utils/cluster";
import { subscriptionManager } from "../utils/subscription";

type TaskRequest = z.infer<typeof taskSchema>;
type HttpRequest = TaskRequest["httpRequest"];
type Config = TaskRequest["config"];

type Queue = Omit<QueueTable, "ownerId" | "metadata"> & { metadata: RecordString | null };
type QueueHistory = Pick<QueueTable, "ownerId" | "estimateEndAt" | "estimateExecutionAt" | "metadata"> & ConfigTable;
type QueueResumable = {
	queueId: string;
	ownerId: string;
	dueTime: number | Date;
	estimateExecutionAt: number;
	metadata: RecordString | null;
	body: TaskRequest;
};

const queue = new Hono<Var>();

queue.get(
	"/",
	tasksAuth(),
	zValidator("query", queuesQuerySchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		let sql = "SELECT id, state, createdAt, statusCode, estimateEndAt, estimateExecutionAt FROM queue WHERE ownerId = ?1";
		const ownerId = c.get("ownerId");
		const { limit, offset, order, sort, state } = c.req.valid("query")!;
		if (state) {
			sql += " AND state = ?2";
		}
		if (sort == "asc") {
			sql += " ORDER BY ?3 ASC";
		} else {
			sql += " ORDER BY ?3 DESC";
		}
		sql += " LIMIT ?4 OFFSET ?5";
		const raw = tasksDb.query<
			Omit<QueueTable, "ownerId" | "metadata" | "response">,
			[string, TaskState | null, string, number, number]
		>(sql);
		return c.json(raw.all(ownerId, state || null, order, limit, offset));
	}
);

queue.get(
	"/:queueId",
	tasksAuth(),
	zValidator("param", queueIdSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const { queueId } = c.req.valid("param");
		const raw = tasksDb.query<Omit<QueueTable, "ownerId">, string>(`
			SELECT id, state, createdAt, statusCode, estimateEndAt, estimateExecutionAt, response, metadata
			FROM queue
			WHERE id = ?
			LIMIT 1
		`);
		const queue = raw.get(queueId);
		if (queue == null) {
			return c.json({}, 404);
		}
		if (queue.response) {
			queue.response = dec(queue.response, cipherKeyGen(queueId));
		}
		if (queue.metadata) {
			queue.metadata = JSON.parse(dec(queue.metadata, cipherKeyGen(queueId)));
		}
		return c.json(queue);
	}
);

queue.post(
	"/register",
	tasksAuth(),
	zValidator("json", taskSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	async (c, next) => {
		const stmtTasksInQueue = tasksDb.query<{ status: "Ok" }, string>(`
			SELECT 'Ok' AS status
			FROM owner
			WHERE id = ? AND tasksInQueue < tasksInQueueLimit
		`);
		const status = stmtTasksInQueue.get(c.get("ownerId"));
		if (status == null) {
			throw new HTTPException(422, {
				cause: "Tasks in queue has reached it's limit"
			});
		}
		await next();
	},
	(c) => {
		const queue = registerTask(c.req.valid("json"), c.get("todayAt"), c.get("ownerId"));
		return c.json(queue, 201);
	}
);

queue.patch(
	"/:queueId/pause",
	tasksAuth(),
	zValidator("param", queueIdSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const { queueId } = c.req.valid("param");
		const raw = tasksDb.query<{ status: "Ok" }, [string, TaskState]>(`
			SELECT 'Done' AS status
			FROM queue
			WHERE id = ?1 AND state = ?2
			LIMIT 1
		`);
		const status = raw.get(queueId, "RUNNING");
		if (status == null) {
			throw new HTTPException(422);
		}
		tasksDb.run<[TaskState, number, string]>(
			`
			UPDATE queue
			SET state = ?1, estimateEndAt = ?2
			WHERE id = ?3
		`,
			["PAUSED", c.get("todayAt"), queueId]
		);
		if (clusterMode == "ACTIVE" && process.send) {
			process.send({
				emit: "REVOKE",
				queueId
			});
		} else {
			subscriptionManager.unsubscribe(queueId);
		}
		return c.json(status);
	}
);

queue.patch(
	"/:queueId/resume",
	tasksAuth(),
	zValidator("param", queueIdSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const { queueId } = c.req.valid("param");
		const raw1 = tasksDb.query<QueueHistory, [string, TaskState]>(`
			SELECT q.ownerId, q.estimateEndAt, q.estimateExecutionAt, q.metadata, c.*
			FROM queue AS q
			JOIN config AS c ON q.id = c.id
			WHERE q.id = ?1 AND q.state = ?2
			LIMIT 1
		`);
		const queue = raw1.get(queueId, "PAUSED");
		if (queue == null) {
			throw new HTTPException(422);
		}
		const { body, dueTime, estimateExecutionAt } = resume(queue, queue.estimateEndAt);
		const raw2 = tasksDb.query<QueueTable, [TaskState, 0, number, string]>(`
			UPDATE queue
			SET state = ?1, estimateEndAt = ?2, estimateExecutionAt = ?3
			WHERE id = ?4
			RETURNING id, state, statusCode, createdAt, estimateEndAt, estimateExecutionAt, response, metadata
		`);
		const currentQueue = raw2.get("RUNNING", 0, estimateExecutionAt, queueId)!;
		setScheduler(body, dueTime, queueId);
		if (currentQueue.metadata) {
			currentQueue.metadata = JSON.parse(dec(currentQueue.metadata, cipherKeyGen(queueId)));
		}
		return c.json(currentQueue);
	}
);

queue.patch(
	"/:queueId/revoke",
	tasksAuth(),
	zValidator("param", queueIdSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const { queueId } = c.req.valid("param");
		const raw = tasksDb.query<{ status: "Done" }, [string, TaskState, TaskState]>(`
			SELECT 'Done' AS status
			FROM queue
			WHERE id = ?1 AND state IN (?2, ?3)
			LIMIT 1
		`);
		const queue = raw.get(queueId, "RUNNING", "PAUSED");
		if (queue == null) {
			throw new HTTPException(422);
		}
		const stmtQueue = tasksDb.query<void, [TaskState, number, string | null, number, string]>(`
			UPDATE queue
			SET state = ?1, statusCode = ?2, response = ?3, estimateEndAt = ?4
			WHERE id = ?5
		`);
		const stmtRetryCount = tasksDb.query<Pick<ConfigTable, "retryCount" | "retryLimit">, [number, string]>(`
			UPDATE config
			SET retrying = ?1
			WHERE id = ?2
			RETURNING retryCount, retryLimit
		`);
		tasksDb.transaction(() => {
			stmtQueue.run("REVOKED", 0, null, c.get("todayAt"), queueId);
			stmtRetryCount.run(0, queueId);
		})();
		if (clusterMode == "ACTIVE" && process.send) {
			process.send({
				emit: "REVOKE",
				queueId
			});
		} else {
			subscriptionManager.unsubscribe(queueId);
		}
		return c.json(queue);
	}
);

queue.delete(
	"/:queueId",
	tasksAuth(),
	zValidator("param", queueIdSchema, (result) => {
		if (!result.success) {
			const errors = result.error.format();
			throw new HTTPException(400, {
				cause: errors
			});
		}
	}),
	(c) => {
		const { queueId } = c.req.valid("param");
		const raw = tasksDb.query<Queue, string>(`
			DELETE FROM queue
			WHERE id = ?
			RETURNING 'Done' AS status
		`);
		const deleted = raw.get(queueId);
		if (deleted == null) {
			throw new HTTPException(422);
		}
		if (clusterMode == "ACTIVE" && process.send) {
			process.send({
				emit: "REVOKE",
				queueId
			});
		} else {
			subscriptionManager.unsubscribe(queueId);
		}
		return c.json(deleted);
	}
);

function registerTask(body: TaskRequest, todayAt: number, ownerId: string): Queue {
	let rawColumn = "INSERT INTO config (";
	let rawValues = "VALUES (";
	const queueId = todayAt.toString(16).toUpperCase() + todayAt.toString();
	const cipherKey = cipherKeyGen(queueId);
	const dueTime = !!body.config.executeAt ? new Date(body.config.executeAt) : body.config.executionDelay;
	const estimateExecutionAt = typeof dueTime === "number" ? addMilliseconds(todayAt, dueTime).getTime() : dueTime.getTime();
	//
	const rawBindings = [] as (string | number)[];
	// Id
	rawColumn += "id, ";
	rawValues += "?, ";
	rawBindings.push(queueId);
	// URL
	rawColumn += "url, ";
	rawValues += "?, ";
	rawBindings.push(enc(body.httpRequest.url, cipherKey));
	// Method
	rawColumn += "method, ";
	rawValues += "?, ";
	rawBindings.push(body.httpRequest.method);
	// Execute
	if (body.config.executeAt) {
		rawColumn += "executeAt, ";
		rawValues += "?, ";
		rawBindings.push(body.config.executeAt.toString());
		if (body.config.executeImmediately) {
			rawColumn += "executeImmediately, ";
			rawValues += "?, ";
			rawBindings.push(1);
		}
	} else {
		rawColumn += "executionDelay, ";
		rawValues += "?, ";
		rawBindings.push(body.config.executionDelay.toString());
	}
	if (body.httpRequest.data) {
		rawColumn += "data, ";
		rawValues += "?, ";
		if (typeof body.httpRequest.data === "string") {
			rawBindings.push(enc(body.httpRequest.data, cipherKey));
		} else {
			rawBindings.push(enc(JSON.stringify(body.httpRequest.data), cipherKey));
		}
	}
	if (body.httpRequest.query) {
		rawColumn += "query, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.httpRequest.query), cipherKey));
	}
	if (body.httpRequest.cookie) {
		rawColumn += "cookie, ";
		rawValues += "?, ";
		if (typeof body.httpRequest.cookie === "string") {
			rawBindings.push(enc(body.httpRequest.cookie, cipherKey));
		} else {
			rawBindings.push(enc(JSON.stringify(body.httpRequest.cookie), cipherKey));
		}
	}
	if (body.httpRequest.headers) {
		rawColumn += "headers, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.httpRequest.headers), cipherKey));
	}
	if (body.httpRequest.authBasic) {
		rawColumn += "authBasic, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.httpRequest.authBasic), cipherKey));
	}
	if (body.httpRequest.authDigest) {
		rawColumn += "authDigest, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.httpRequest.authDigest), cipherKey));
	}
	if (body.httpRequest.authNtlm) {
		rawColumn += "authNtlm, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.httpRequest.authNtlm), cipherKey));
	}
	if (body.httpRequest.authAwsSigv4) {
		rawColumn += "authAwsSigv4, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.httpRequest.authAwsSigv4), cipherKey));
	}
	if (body.config.retryAt) {
		rawColumn += "retry, retryAt, retryLimit, retryExponential, ";
		rawValues += "?, ?, ?, ?, ";
		rawBindings.push(1);
		rawBindings.push(body.config.retryAt.toString());
		rawBindings.push(1);
		rawBindings.push(0);
	} else {
		const retryExponential = body.config.retryExponential ? 1 : 0;
		rawColumn += "retry, retryLimit, retryInterval, retryExponential, ";
		rawValues += "?, ?, ?, ?, ";
		rawBindings.push(body.config.retry);
		rawBindings.push(body.config.retry);
		rawBindings.push(body.config.retryInterval);
		rawBindings.push(retryExponential);
	}
	if (body.config.ignoreStatusCode.length) {
		rawColumn += "ignoreStatusCode, ";
		rawValues += "?, ";
		rawBindings.push(JSON.stringify(body.config.ignoreStatusCode));
	}
	// Timeout
	rawColumn += "timeout, ";
	rawValues += "?, ";
	rawBindings.push(body.config.timeout);
	//
	if (body.config.timeoutAt) {
		rawColumn += "timeoutAt, ";
		rawValues += "?, ";
		rawBindings.push(body.config.timeoutAt.toString());
	}
	if (body.config.proto) {
		rawColumn += "proto, ";
		rawValues += "?, ";
		rawBindings.push(body.config.proto);
	}
	if (body.config.ca) {
		rawColumn += "ca, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.config.ca), cipherKey));
	}
	if (body.config.cert?.value) {
		rawColumn += "cert, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.config.cert), cipherKey));
		if (body.config.certType) {
			rawColumn += "certType, ";
			rawValues += "?, ";
			rawBindings.push(enc(body.config.certType, cipherKey));
		}
	}
	if (body.config.certStatus) {
		rawColumn += "certStatus, ";
		rawValues += "?, ";
		rawBindings.push(1);
	}
	if (body.config.key) {
		rawColumn += "key, ";
		rawValues += "?, ";
		rawBindings.push(enc(body.config.key, cipherKey));
		if (body.config.keyType) {
			rawColumn += "keyType, ";
			rawValues += "?, ";
			rawBindings.push(enc(body.config.keyType, cipherKey));
		}
	}
	if (body.config.location) {
		rawColumn += "location, ";
		rawValues += "?, ";
		rawBindings.push(1);
		if (body.config.redirectAttempts != 8) {
			rawColumn += "redirectAttempts, ";
			rawValues += "?, ";
			rawBindings.push(body.config.redirectAttempts);
		}
		if (body.config.protoRedirect) {
			rawColumn += "protoRedirect, ";
			rawValues += "?, ";
			rawBindings.push(body.config.protoRedirect);
		}
		if (body.config.locationTrusted) {
			rawColumn += "locationTrusted, ";
			rawValues += "?, ";
			rawBindings.push(enc(JSON.stringify(body.config.locationTrusted), cipherKey));
		}
	}
	if (body.config.dnsServer) {
		rawColumn += "dnsServer, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.config.dnsServer), cipherKey));
	}
	if (body.config.dohUrl) {
		rawColumn += "dohUrl, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.config.dohUrl), cipherKey));
	}
	if (body.config.dohInsecure) {
		rawColumn += "dohInsecure, ";
		rawValues += "?, ";
		rawBindings.push(1);
	}
	if (body.config.httpVersion != "1.1") {
		rawColumn += "httpVersion, ";
		rawValues += "?, ";
		rawBindings.push(body.config.httpVersion);
	}
	if (body.config.insecure) {
		rawColumn += "insecure, ";
		rawValues += "?, ";
		rawBindings.push(1);
	}
	if (body.config.refererUrl) {
		rawColumn += "refererUrl, ";
		rawValues += "?, ";
		rawBindings.push(enc(body.config.refererUrl, cipherKey));
	}
	if (body.config.keepAliveDuration != 30) {
		rawColumn += "keepAliveDuration, ";
		rawValues += "?, ";
		rawBindings.push(body.config.keepAliveDuration);
	}
	if (body.config.resolve) {
		rawColumn += "resolve, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.config.resolve), cipherKey));
	}
	// IP version
	rawColumn += "ipVersion, ";
	rawValues += "?, ";
	rawBindings.push(body.config.ipVersion);
	//
	if (body.config.hsts) {
		rawColumn += "hsts, ";
		rawValues += "?, ";
		if (typeof body.config.hsts === "string") {
			rawBindings.push(enc(JSON.stringify(body.config.hsts), cipherKey));
		} else {
			rawBindings.push(1);
		}
	}
	if (!body.config.sessionId) {
		rawColumn += "sessionId, ";
		rawValues += "?, ";
		rawBindings.push(0);
	}
	if (body.config.tlsVersion) {
		rawColumn += "tlsVersion, ";
		rawValues += "?, ";
		rawBindings.push(body.config.tlsVersion);
	}
	if (body.config.tlsMaxVersion) {
		rawColumn += "tlsMaxVersion, ";
		rawValues += "?, ";
		rawBindings.push(body.config.tlsMaxVersion);
	}
	if (body.config.haProxyClientIp) {
		rawColumn += "haProxyClientIp, ";
		rawValues += "?, ";
		rawBindings.push(enc(body.config.haProxyClientIp, cipherKey));
	}
	if (body.config.haProxyProtocol) {
		rawColumn += "haProxyClientIp, ";
		rawValues += "?, ";
		rawBindings.push(1);
	}
	if (body.config.proxy) {
		rawColumn += "proxy, ";
		rawValues += "?, ";
		rawBindings.push(enc(JSON.stringify(body.config.proxy), cipherKey));
		if (body.config.proxyHttpVersion) {
			rawColumn += "proxyHttpVersion, ";
			rawValues += "?, ";
			rawBindings.push(body.config.proxyHttpVersion);
		}
		if (body.config.proxyAuthBasic) {
			rawColumn += "proxyAuthBasic, ";
			rawValues += "?, ";
			rawBindings.push(enc(JSON.stringify(body.config.proxyAuthBasic), cipherKey));
		}
		if (body.config.proxyAuthDigest) {
			rawColumn += "proxyAuthDigest, ";
			rawValues += "?, ";
			rawBindings.push(enc(JSON.stringify(body.config.proxyAuthDigest), cipherKey));
		}
		if (body.config.proxyAuthNtlm) {
			rawColumn += "proxyAuthNtlm, ";
			rawValues += "?, ";
			rawBindings.push(enc(JSON.stringify(body.config.proxyAuthNtlm), cipherKey));
		}
		if (body.config.proxyHeaders) {
			rawColumn += "proxyHeaders, ";
			rawValues += "?, ";
			rawBindings.push(enc(JSON.stringify(body.config.proxyHeaders), cipherKey));
		}
		if (body.config.proxyInsecure) {
			rawColumn += "proxyInsecure, ";
			rawValues += "?, ";
			rawBindings.push(1);
		}
	}
	if (!body.config.traceResponseData) {
		rawColumn += "traceResponseData, ";
		rawValues += "?, ";
		rawBindings.push(0);
	}
	//
	rawColumn = rawColumn.substring(0, rawColumn.length - 2) + ")";
	rawValues = rawValues.substring(0, rawValues.length - 2) + ")";
	//
	const metadata = !!body.metadata ? enc(JSON.stringify(body.metadata), cipherKey) : null;
	tasksDb.transaction(() => {
		tasksDb.run(
			`
			INSERT INTO queue (id, ownerId, createdAt, estimateExecutionAt, metadata)
			VALUES (?1, ?2, ?3, ?4, ?5)
		`,
			[queueId, ownerId, todayAt, estimateExecutionAt, metadata]
		);
		tasksDb.run(rawColumn + " " + rawValues, rawBindings);
	})();
	//
	setScheduler(body, dueTime, queueId);
	//
	return {
		id: queueId,
		state: "RUNNING",
		createdAt: todayAt,
		statusCode: 0,
		estimateEndAt: 0,
		estimateExecutionAt,
		response: null,
		metadata: body.metadata ?? null
	};
}

function setScheduler(body: TaskRequest, dueTime: number | Date, queueId: string): void {
	let httpId = "";
	const stmtQueue = tasksDb.prepare<void, [TaskState, number, string | null, number, string]>(`
		UPDATE queue
		SET state = ?1, statusCode = ?2, response = ?3, estimateEndAt = ?4
		WHERE id = ?5
	`);
	dueTime = typeof dueTime === "number" ? addMilliseconds(dueTime, -1).getTime() : addMilliseconds(dueTime, -1);
	subscriptionManager.add(
		queueId,
		timer(dueTime)
			.pipe(
				expand((_, i) =>
					defer(() => connectivity()).pipe(
						tap((connectivity) => {
							if (env.LOG == "1") {
								if (connectivity == "ONLINE") {
									logInfo("Connectivity online");
								} else {
									logWarn("Connectivity offline");
								}
							}
						}),
						delayWhen(() => (i == 0 ? timer(0) : timer(5000)))
					)
				),
				filter((connectivity) => connectivity == "ONLINE"),
				take(1),
				exhaustMap(() => {
					let additionalHeaders = { "X-Tasks-Queue-Id": queueId } as RecordString;
					return defer(() => http(body, additionalHeaders)).pipe(
						map((res) => {
							if (res.data) {
								return { ...res, data: enc(res.data, cipherKeyGen(queueId)) };
							}
							return res;
						}),
						tap({
							next(res) {
								httpId = res.id;
							},
							error(err: CurlHttpResponse) {
								httpId = err.id;
							}
						}),
						catchError((err: CurlHttpResponse) => {
							if (err.data) {
								err.data = enc(err.data, cipherKeyGen(queueId));
							}
							const ignore = body.config.ignoreStatusCode.some((code) => code == err.status);
							if (ignore) {
								return of(err);
							}
							return throwError(() => err);
						}),
						retry({
							count: body.config.retry,
							delay(error: CurlHttpResponse) {
								let retryDueTime = 0 as number | Date;
								let estimateNextRetryAt = 0;
								const retryingAt = new Date().getTime();
								const stmtRetryCount = tasksDb.prepare<
									Pick<ConfigTable, "retryCount" | "retryLimit">,
									[number, string]
								>(`
								    UPDATE config
								    SET retrying = ?1
								    WHERE id = ?2
								    RETURNING retryCount, retryLimit
							    `);
								const { retryCount, retryLimit } = stmtRetryCount.get(1, queueId)!;
								if (body.config.retryAt) {
									retryDueTime = new Date(body.config.retryAt);
									estimateNextRetryAt = new Date(body.config.retryAt).getTime();
								} else {
									retryDueTime = body.config.retryExponential
										? body.config.retryInterval * retryCount
										: body.config.retryInterval;
									estimateNextRetryAt = addMilliseconds(retryingAt, retryDueTime).getTime();
								}
								body.config.timeoutAt = undefined;
								additionalHeaders = {
									...additionalHeaders,
									"X-Tasks-Retry-Count": retryCount.toString(),
									"X-Tasks-Retry-Limit": retryLimit.toString(),
									"X-Tasks-Estimate-Next-Retry-At": estimateNextRetryAt.toString()
								};
								const stmtQueueError = tasksDb.prepare<void, [number, string, string]>(`
								    UPDATE queue
								    SET statusCode = ?1, response = ?2
								    WHERE id = ?3
							    `);
								const stmtRetryCountError = tasksDb.prepare<void, [string, number, string]>(`
								    UPDATE config
								    SET headers = ?1, estimateNextRetryAt = ?2
								    WHERE id = ?3
							    `);
								tasksDb.transaction(() => {
									stmtQueueError.run(error.status, error.data!, queueId);
									stmtRetryCountError.run(
										enc(JSON.stringify(additionalHeaders), cipherKeyGen(queueId)),
										estimateNextRetryAt,
										queueId
									);
								})();
								if (env.LOG == "1") {
									logWarn(
										"Task",
										queueId,
										"retrying",
										JSON.stringify({
											count: retryCount,
											estimateNextRetryAt: new Date(estimateNextRetryAt).toLocaleString(),
											statusCode: error.status
										})
									);
								}
								return timer(retryDueTime).pipe(
									finalize(() => {
										stmtRetryCount.finalize();
										stmtQueueError.finalize();
										stmtRetryCountError.finalize();
									})
								);
							}
						})
					);
				}),
				finalize(() => {
					rmSync("/tmp/" + httpId, {
						recursive: true,
						force: true
					});
					subscriptionManager.unsubscribe(queueId);
					stmtQueue.finalize();
				})
			)
			.subscribe({
				next(res) {
					stmtQueue.run(res.state, res.status, res.data, new Date().getTime(), queueId);
					if (env.LOG == "1") {
						logInfo(
							"Task",
							queueId,
							"done",
							JSON.stringify({
								state: res.state,
								statusCode: res.status
							})
						);
					}
				},
				error(err: CurlHttpResponse) {
					stmtQueue.run("ERROR", err.status, err.data, new Date().getTime(), queueId);
					if (env.LOG == "1") {
						logError(
							"Task",
							queueId,
							"error",
							JSON.stringify({
								state: err.state,
								statusCode: err.status
							})
						);
					}
				}
			})
	);
}

function resume(q: QueueHistory, endAt: number): QueueResumable {
	let immediately = false;
	const resumeAt = new Date().getTime();
	const cipherKey = cipherKeyGen(q.id);
	// Utils
	const parseData = (): string | Exclude<HttpRequest["data"], string> | undefined => {
		if (q.data) {
			if (typeof q.data === "string") {
				return dec(q.data, cipherKey);
			}
			return JSON.parse(dec(q.data, cipherKey));
		}
		return undefined;
	};
	const parseCookie = (): string | Exclude<HttpRequest["cookie"], string> | undefined => {
		if (q.cookie) {
			if (typeof q.cookie === "string") {
				return dec(q.cookie, cipherKey);
			}
			return JSON.parse(dec(q.cookie, cipherKey));
		}
		return undefined;
	};
	const parseHsts = (): string | boolean | undefined => {
		if (q.hsts) {
			if (q.hsts == "0" || q.hsts == "1") {
				return !!safeInteger(q.hsts);
			}
			return dec(q.hsts, cipherKey);
		}
		return undefined;
	};
	const parseDate = (v: string | null): string | number | undefined => {
		if (v) {
			const state = safeInteger(v);
			if (state == 0) {
				return v as string;
			}
			return state;
		}
		return undefined;
	};
	// Initialize body
	const body: TaskRequest = {
		httpRequest: {
			url: dec(q.url, cipherKey),
			method: q.method,
			data: parseData(),
			query: !!q.query ? JSON.parse(dec(q.query, cipherKey)) : undefined,
			cookie: parseCookie(),
			headers: !!q.headers ? JSON.parse(dec(q.headers, cipherKey)) : undefined,
			authBasic: !!q.authBasic ? JSON.parse(dec(q.authBasic, cipherKey)) : undefined,
			authDigest: !!q.authDigest ? JSON.parse(dec(q.authDigest, cipherKey)) : undefined,
			authNtlm: !!q.authNtlm ? JSON.parse(dec(q.authNtlm, cipherKey)) : undefined,
			authAwsSigv4: !!q.authAwsSigv4 ? JSON.parse(dec(q.authAwsSigv4, cipherKey)) : undefined
		},
		config: {
			executionDelay: q.executionDelay,
			executeAt: parseDate(q.executeAt),
			executeImmediately: !!q.executeImmediately,
			retry: q.retry,
			retryAt: parseDate(q.retryAt),
			retryInterval: q.retryInterval,
			retryExponential: !!q.retryExponential,
			ignoreStatusCode: JSON.parse(q.ignoreStatusCode),
			timeout: q.timeout,
			timeoutAt: parseDate(q.timeoutAt),
			ca: !!q.ca ? JSON.parse(dec(q.ca, cipherKey)) : undefined,
			cert: !!q.cert ? JSON.parse(dec(q.cert, cipherKey)) : undefined,
			certType: !!q.certType ? (dec(q.certType, cipherKey) as Config["certType"]) : undefined,
			certStatus: !!q.certStatus,
			key: !!q.key ? dec(q.key, cipherKey) : undefined,
			keyType: !!q.keyType ? (dec(q.keyType, cipherKey) as Config["keyType"]) : undefined,
			userAgent: q.userAgent,
			location: !!q.location,
			locationTrusted: !!q.locationTrusted ? JSON.parse(dec(q.locationTrusted, cipherKey)) : undefined,
			proto: (q.proto as Config["proto"]) ?? undefined,
			protoRedirect: (q.protoRedirect as Config["protoRedirect"]) ?? undefined,
			dnsServer: !!q.dnsServer ? JSON.parse(dec(q.dnsServer, cipherKey)) : undefined,
			dohUrl: !!q.dohUrl ? dec(q.dohUrl, cipherKey) : undefined,
			dohInsecure: !!q.dohInsecure,
			httpVersion: q.httpVersion,
			insecure: !!q.insecure,
			refererUrl: !!q.refererUrl ? dec(q.refererUrl, cipherKey) : "AUTO",
			redirectAttempts: q.redirectAttempts,
			keepAliveDuration: q.keepAliveDuration,
			resolve: !!q.resolve ? JSON.parse(dec(q.resolve, cipherKey)) : undefined,
			ipVersion: q.ipVersion,
			hsts: parseHsts(),
			sessionId: !!q.sessionId,
			tlsVersion: (q.tlsVersion as Config["tlsVersion"]) ?? undefined,
			tlsMaxVersion: (q.tlsMaxVersion as Config["tlsMaxVersion"]) ?? undefined,
			haProxyClientIp: !!q.haProxyClientIp ? dec(q.haProxyClientIp, cipherKey) : undefined,
			haProxyProtocol: !!q.haProxyProtocol,
			proxy: !!q.proxy ? JSON.parse(dec(q.proxy, cipherKey)) : undefined,
			proxyAuthBasic: !!q.proxyAuthBasic ? JSON.parse(dec(q.proxyAuthBasic, cipherKey)) : undefined,
			proxyAuthDigest: !!q.proxyAuthDigest ? JSON.parse(dec(q.proxyAuthDigest, cipherKey)) : undefined,
			proxyAuthNtlm: !!q.proxyAuthNtlm ? JSON.parse(dec(q.proxyAuthNtlm, cipherKey)) : undefined,
			proxyHeaders: !!q.proxyAuthBasic ? JSON.parse(dec(q.proxyAuthBasic, cipherKey)) : undefined,
			proxyHttpVersion: (q.proxyHttpVersion as Config["proxyHttpVersion"]) ?? undefined,
			proxyInsecure: !!q.proxyInsecure,
			traceResponseData: !!q.traceResponseData
		},
		metadata: !!q.metadata ? JSON.parse(dec(q.metadata, cipherKey)) : undefined
	};
	if (q.executeAt) {
		const executeAt = parseDate(q.executeAt)!;
		immediately = body.config.executeImmediately && isAfter(new Date().getTime(), new Date(executeAt));
		if (q.retrying) {
			if (q.retryAt == null) {
				body.config.retry = q.retryLimit - q.retryCount;
			}
			const delay = Math.abs(differenceInMilliseconds(q.estimateNextRetryAt, endAt));
			body.config.executeAt = addMilliseconds(resumeAt, delay).getTime();
		} else {
			const diffMs = Math.abs(differenceInMilliseconds(q.estimateExecutionAt, endAt));
			body.config.executeAt = addMilliseconds(resumeAt, diffMs).getTime();
		}
	} else {
		if (q.retrying) {
			if (q.retryAt == null) {
				body.config.retry = q.retryLimit - q.retryCount;
			}
			const delay = Math.abs(differenceInMilliseconds(q.estimateNextRetryAt, endAt));
			body.config.executionDelay = delay;
		} else {
			const diffMs = Math.abs(differenceInMilliseconds(q.estimateExecutionAt, endAt));
			body.config.executionDelay = diffMs;
		}
	}
	if (q.retrying && body.config.timeoutAt) {
		body.config.timeoutAt = undefined;
	}
	const parseDueTime = (): number | Date => {
		if (body.config.executeAt) {
			if (immediately) {
				return 1;
			}
			return new Date(body.config.executeAt);
		}
		return body.config.executionDelay;
	};
	const dueTime = parseDueTime();
	const estimateExecutionAt = typeof dueTime === "number" ? addMilliseconds(resumeAt, dueTime).getTime() : dueTime.getTime();
	return {
		queueId: q.id,
		ownerId: q.ownerId,
		estimateExecutionAt,
		metadata: body.metadata ?? null,
		dueTime,
		body
	};
}

function chunk(qs: QueueResumable[]): QueueResumable[][] {
	let save = [] as QueueResumable[][];
	const queuePerWorker = Math.ceil(qs.length / MAX_INSTANCES);
	for (let i = 0; i < MAX_INSTANCES; i++) {
		const start = i * queuePerWorker;
		const end = start + queuePerWorker;
		const splitQueues = qs.slice(start, end);
		save.push(splitQueues);
	}
	return save;
}

function cipherKeyGen(id: string): string {
	return "cipher://" + id + env.CIPHER_KEY;
}

function reschedule(): void {
	let backupJob: Cron | null = Cron(
		env.BACKUP_CRON_PATTERN_SQLITE || "0 0 * * *",
		{
			timezone: env.BACKUP_CRON_TZ_SQLITE || env.TZ,
			protect: true,
			paused: true,
			name: "backup-db"
		},
		async () => {
			try {
				await backupDb(env.BACKUP_METHOD_SQLITE);
				logInfo("Backup done");
			} catch (err) {
				logError(String(err));
			}
		}
	);
	if (clusterMode == "ACTIVE" && cluster.isWorker) {
		runMessageEmitter();
		backupJob.stop();
		backupJob = null;
	}
	const raw = tasksDb.query<{ count: number; lastRecordAt: number; exit: 0 | 1 }, TaskState>(`
		SELECT
		    (SELECT COUNT(*) FROM queue WHERE state = ?) AS count,
            lastRecordAt,
            exit
        FROM timeframe
        WHERE id = 1
        LIMIT 1
	`);
	let { count, lastRecordAt, exit } = raw.get("RUNNING")!;
	if (!exit) {
		const ms = readLastRecord();
		if (ms) {
			lastRecordAt = ms;
		}
	}
	if (count == 0) {
		if (clusterMode == "ACTIVE" && cluster.isPrimary) {
			backupJob?.resume();
		}
		if (clusterMode == "INACTIVE") {
			backupJob?.resume();
		}
		updateLastRecord();
		return;
	}
	let queuesResumable: QueueResumable[] | null = [];
	const batchSize = 500;
	//
	if (clusterMode == "ACTIVE") {
		if (cluster.isPrimary) {
			const stmtQueuesHistory = tasksDb.prepare<QueueHistory, [TaskState, number, number]>(`
				SELECT q.ownerId, q.estimateEndAt, q.estimateExecutionAt, q.metadata, c.*
				FROM queue AS q JOIN config AS c ON q.id = c.id
				WHERE q.state = ?1
				LIMIT ?2
				OFFSET ?3
			`);
			const stmtQueueResumable = tasksDb.prepare<void, [TaskState, 0, number, string]>(`
				UPDATE queue
				SET state = ?1, estimateEndAt = ?2, estimateExecutionAt = ?3
				WHERE id = ?4
			`);
			for (let i = 0; i < Math.max(Math.ceil(count / batchSize), 1); i++) {
				const offset = i * batchSize;
				const queuesHistory = stmtQueuesHistory.all("RUNNING", Math.min(batchSize, count - offset), offset);
				for (let ii = 0; ii < queuesHistory.length; ii++) {
					const queueHistory = queuesHistory[ii];
					const queue = resume(queueHistory, lastRecordAt);
					queuesResumable.push(queue);
				}
			}
			tasksDb.run("UPDATE timeframe SET data = ? WHERE id = 1", [
				Buffer.from(JSON.stringify(queuesResumable)).toString("base64")
			]);
			if (queuesResumable.length == 1) {
				logInfo("Reschedule 1 task");
				const queue = queuesResumable[0];
				stmtQueueResumable.run("RUNNING", 0, queue.estimateExecutionAt, queue.queueId);
			} else {
				logInfo("Reschedule", queuesResumable.length, "tasks");
				tasksDb.transaction(() => {
					for (let i = 0; i < queuesResumable!.length; i++) {
						const queue = queuesResumable![i];
						stmtQueueResumable.run("RUNNING", 0, queue.estimateExecutionAt, queue.queueId);
					}
				})();
			}
			setImmediate(() => {
				backupJob?.resume();
				stmtQueuesHistory.finalize();
				stmtQueueResumable.finalize();
				queuesResumable = null;
				updateLastRecord();
			});
		}
		if (cluster.isWorker) {
			const raw = tasksDb.query<{ data: string }, []>(`
				SELECT data
				FROM timeframe
				WHERE id = 1
				LIMIT 1
			`);
			const { data } = raw.get()!;
			queuesResumable = JSON.parse(Buffer.from(data, "base64").toString()) as QueueResumable[];
			const workerIndex = safeInteger(env.SPAWN_INSTANCE);
			if (queuesResumable.length == 1) {
				if (workerIndex == 0) {
					const queue = queuesResumable[0];
					setScheduler(queue.body, queue.dueTime, queue.queueId);
				}
			} else {
				const queuesDistribute = chunk(queuesResumable);
				for (let i = 0; i < queuesDistribute.length; i++) {
					const slices = queuesDistribute[i];
					if (slices.length) {
						for (let ii = 0; ii < slices.length; ii++) {
							if (i == workerIndex) {
								const queue = slices[ii];
								setScheduler(queue.body, queue.dueTime, queue.queueId);
							}
						}
					}
				}
			}
			setImmediate(() => {
				if (process.send) {
					process.send(1);
				}
				queuesResumable = null;
			});
		}
	}
	//
	if (clusterMode == "INACTIVE") {
		const stmtQueuesHistory = tasksDb.prepare<QueueHistory, [TaskState, number, number]>(`
			SELECT q.ownerId, q.estimateEndAt, q.estimateExecutionAt, q.metadata, c.*
			FROM queue AS q JOIN config AS c ON q.id = c.id
			WHERE q.state = ?1
			LIMIT ?2
			OFFSET ?3
		`);
		const stmtQueueResumable = tasksDb.prepare<void, [TaskState, 0, number, string]>(`
			UPDATE queue
			SET state = ?1, estimateEndAt = ?2, estimateExecutionAt = ?3
			WHERE id = ?4
		`);
		for (let i = 0; i < Math.max(Math.ceil(count / batchSize), 1); i++) {
			const offset = i * batchSize;
			const queuesHistory = stmtQueuesHistory.all("RUNNING", Math.min(batchSize, count - offset), offset);
			for (let ii = 0; ii < queuesHistory.length; ii++) {
				const queueHistory = queuesHistory[ii];
				const queue = resume(queueHistory, lastRecordAt);
				queuesResumable.push(queue);
			}
		}
		if (queuesResumable.length == 1) {
			logInfo("Reschedule 1 task");
			const queue = queuesResumable[0];
			stmtQueueResumable.run("RUNNING", 0, queue.estimateExecutionAt, queue.queueId);
			setScheduler(queue.body, queue.dueTime, queue.queueId);
		} else {
			logInfo("Reschedule", queuesResumable.length, "tasks");
			tasksDb.transaction(() => {
				for (let i = 0; i < queuesResumable!.length; i++) {
					const queue = queuesResumable![i];
					stmtQueueResumable.run("RUNNING", 0, queue.estimateExecutionAt, queue.queueId);
				}
			})();
			for (let i = 0; i < queuesResumable.length; i++) {
				const queue = queuesResumable![i];
				setScheduler(queue.body, queue.dueTime, queue.queueId);
			}
		}
		setImmediate(() => {
			backupJob?.resume();
			stmtQueuesHistory.finalize();
			stmtQueueResumable.finalize();
			queuesResumable = null;
			updateLastRecord();
		});
	}
	raw.finalize();
}

function runMessageEmitter(): void {
	process.on("message", (message: RecordString) => {
		if (message.emit == "REVOKE") {
			subscriptionManager.unsubscribe(message.queueId);
		}
	});
}

function updateLastRecord(): void {
	tasksDb.run("UPDATE timeframe SET exit = ? WHERE id = 1", [0]);
	interval(1000)
		.pipe(
			map(() => new Date().getTime().toString()),
			exhaustMap((ms) =>
				defer(() => write(dirname(env.PATH_SQLITE) + "/.lastrecordkeep", ms, { mode: 440 })).pipe(
					catchError(() => EMPTY)
				)
			)
		)
		.subscribe();
}

function readLastRecord(): number {
	try {
		const ms = readFileSync(dirname(env.PATH_SQLITE) + "/.lastrecordkeep")
			.toString()
			.trim();
		return safeInteger(ms);
	} catch (_) {
		return 0;
	}
}

reschedule();

export default queue;
