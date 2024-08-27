import { env, serve } from "bun";

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { requestId, RequestIdVariables } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { BlankSchema } from "hono/types";

import { owner } from "./apis/owner";
import { exceptionFilter } from "./exception/exception-filter";
import { toSafeInteger } from "./utils/common";

const PORT = toSafeInteger(env.PORT) || 9220;

function main(): Hono<Var & { Variables: RequestIdVariables }, BlankSchema, "/"> {
	const api = new Hono<Var & { Variables: RequestIdVariables }>();

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
	api.use(requestId());
	api.use(prettyJSON({ space: 4 }));

	api.notFound(() => new Response(null, { status: 404 }));

	api.onError(exceptionFilter);

	api.get("/status", c => c.text("OK"));

	api.basePath("/v1").route("/owners", owner());

	return api;
}

serve({
	fetch(req, server): Response | Promise<Response> {
		return main().fetch(req, { ip: server.requestIP(req) });
	},
	port: PORT,
	maxRequestBodySize: toSafeInteger(env.MAX_SIZE_BODY_REQUEST) || 32768
});

console.log("Server listening on port", PORT);