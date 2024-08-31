import { env, serve } from "bun";

import { pid } from "node:process";

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { BlankSchema } from "hono/types";

import { owner } from "./apis/owner";
import { exceptionFilter } from "./exception/exception-filter";
import { safeInteger } from "./utils/common";

function main(): Hono<Var, BlankSchema, "/"> {

	const api = new Hono<Var>();

	api.use(async (c, next) => {
		c.set("todayAt", Date.now());
		await next();
	});
	api.use(secureHeaders({
		crossOriginOpenerPolicy: false,
		crossOriginResourcePolicy: false,
		originAgentCluster: false,
		xDnsPrefetchControl: false,
		xDownloadOptions: false,
		xFrameOptions: "DENY",
		xPermittedCrossDomainPolicies: false
	}));
	api.use(prettyJSON({ space: 4 }));

	api.notFound(() => new Response(null, { status: 404 }));

	api.onError(exceptionFilter);

	api.get("/status", c => c.text("OK"));

	api.basePath("/v1").route("/owners", owner());

	return api;
}

const server = serve({
	fetch(req, server): Response | Promise<Response> {
		return main().fetch(req, { ip: server.requestIP(req) });
	},
	port: safeInteger(env.PORT) || 9220,
	maxRequestBodySize: safeInteger(env.MAX_SIZE_BODY_REQUEST) || 32768
});

console.log(pid, "Server listening on", server.url.toString());