import { env, hash, serve, SocketAddress } from "bun";

import { pid } from "node:process";

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { BlankSchema } from "hono/types";

import { UTCDate } from "@date-fns/utc";

import { owner } from "./apis/owner";
import { queue } from "./apis/queue";
import { exceptionFilter } from "./exception/exception-filter";
import { throttle } from "./middlewares/throttle";
import { safeInteger } from "./utils/common";
import { logInfo } from "./utils/logger";

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
		c.set("todayAt", new UTCDate().getTime());
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

const server = serve({
	fetch(req, server): Response | Promise<Response> {
		return main().fetch(req, { ip: server.requestIP(req) });
	},
	port: safeInteger(env.PORT) || 9220,
	maxRequestBodySize: safeInteger(env.MAX_SIZE_BODY_REQUEST) || 32768
});

logInfo("Server listening on", server.url.toString(), JSON.stringify({ pid }));