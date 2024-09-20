import { BunFile, env, file, hash, serve, SocketAddress } from "bun";

import cluster from "node:cluster";

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { BlankSchema } from "hono/types";

import { owner } from "./apis/owner";
import { queue } from "./apis/queue";
import { exceptionFilter } from "./middlewares/exception-filter";
import { throttle } from "./middlewares/throttle";
import { isEmpty, safeInteger } from "./utils/common";
import { logInfo, logWarn } from "./utils/logger";

type Socket = {
	Bindings: {
		ip: SocketAddress;
	};
};

const MAX_INSTANCES = env.MAX_INSTANCES == "MAX"
	? navigator.hardwareConcurrency
	: safeInteger(env.MAX_INSTANCES);

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
	logInfo("Server listening on", server.url.toString(), JSON.stringify({ pid: process.pid }));
}

function inRangeInstances(amount: number): boolean {
	return (
		Math.min(2, navigator.hardwareConcurrency) <= amount &&
		amount <= Math.max(2, navigator.hardwareConcurrency)
	);
}

if (env.CLUSTER_MODE == "1" && inRangeInstances(MAX_INSTANCES)) {
	if (cluster.isPrimary) {
		logInfo("Starting cluster mode");
		const send = (data: RecordString): void => {
			for (const id in cluster.workers) {
				cluster.workers[id]?.send(data);
			}
		};
		for (let i = 0; i < MAX_INSTANCES; i++) {
			const worker = cluster.fork({
				SPAWN_INSTANCE: i.toString()
			});
			worker.on("message", send);
		}
		cluster.on("exit", (worker) => {
			logWarn("Worker died", worker.process.pid);
		});
	} else {
		startServer(true);
	}
} else {
	startServer();
}