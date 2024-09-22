import { BunFile, env, file, hash, serve, SocketAddress } from "bun";

import { exit } from "node:process";

import cluster from "node:cluster";

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { BlankSchema } from "hono/types";

import { owner } from "./apis/owner";
import { queue } from "./apis/queue";
import { tasksDb } from "./db/db";
import { exceptionFilter } from "./middlewares/exception-filter";
import { throttle } from "./middlewares/throttle";
import { isEmpty, safeInteger } from "./utils/common";
import { MAX_INSTANCES } from "./utils/cluster";
import { logInfo, logWarn } from "./utils/logger";

type Socket = {
	Bindings: {
		ip: SocketAddress;
	};
};

function main(): Hono<Var & Socket, BlankSchema, "/"> {

	const api = new Hono<Var & Socket>();

	api.use(secureHeaders({
		crossOriginOpenerPolicy: false,
		crossOriginResourcePolicy: false,
		originAgentCluster: false,
		xDnsPrefetchControl: false,
		xDownloadOptions: false,
		xFrameOptions: "DENY",
		xPermittedCrossDomainPolicies: false
	}));
	api.use(async (c, next) => {
		c.set("clientId", hash(c.env.ip.address).toString());
		c.set("ip", c.env.ip.address);
		c.set("todayAt", new Date().getTime());
		c.set("userAgent", c.req.header("User-Agent") ?? null);
		await next();
	});

	api.notFound(() => new Response(null, { status: 404 }));
	api.onError(exceptionFilter);

	api.use(prettyJSON({ space: 4 }));
	api.use(throttle);

	api.get("/status", c => c.text("OK"));

	api.basePath("/v1").route("/owners", owner());
	api.basePath("/v1").route("/queues", queue());

	return api;
}

function read(path?: string): BunFile | undefined {
	try {
		if (isEmpty(path)) {
			return undefined;
		}
		// @ts-expect-error
		return file(path);
	} catch (e) {
		logWarn(String(e));
		return undefined;
	}
}

/**
 * Note that currently.
 * 
 * reusePort is only effective on Linux.
 * On Windows and macOS, the operating system does not load balance HTTP connections as one would expect.
*/
function startServer(reusePort?: boolean): void {
	const server = serve({
		fetch: (req, server) => main().fetch(req, { ip: server.requestIP(req) }),
		reusePort,
		port: safeInteger(env.PORT) || 9220,
		maxRequestBodySize: safeInteger(env.MAX_SIZE_BODY_REQUEST) || 32768,
		cert: read(env.PATH_TLS_CERT),
		key: read(env.PATH_TLS_KEY),
		ca: read(env.PATH_TLS_CA)
	});
	logInfo("Server listening on", server.url.toString(), JSON.stringify({
		pid: process.pid
	}));
}

if (env.CLUSTER_MODE == "1") {
	if (cluster.isPrimary) {
		logInfo("Starting cluster mode");
		let workerCount = 0;
		const send = (data: RecordString): void => {
			for (const id in cluster.workers) {
				if (cluster.workers[id]) {
					cluster.workers[id].send(data);
				}
			}
		};
		for (let i = 0; i < MAX_INSTANCES; i++) {
			const worker = cluster.fork({
				SPAWN_INSTANCE: i.toString()
			});
			worker.on("message", message => {
				if (typeof message === "number" && message == 1) {
					workerCount += 1;
					if (workerCount == MAX_INSTANCES) {
						tasksDb.run("UPDATE timeframe SET data = ? WHERE id = 1", [null]);
					}
				} else {
					send(message);
				}
			});
		}
		cluster.on("exit", (worker) => logWarn("Worker died", worker.process.pid));
	} else {
		startServer(true);
	}
} else {
	startServer();
}