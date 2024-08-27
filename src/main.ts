import { env, serve } from "bun";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prettyJSON } from "hono/pretty-json";
import { requestId, RequestIdVariables } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { BlankSchema } from "hono/types";

import { owner } from "./apis/owner";
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

	api.onError((e, c) => {
		if (e instanceof HTTPException) {
			if (e.status == 400) {
				return c.json({
					action: "Do not retry without fixing the problem",
					message: e.cause || "A request includes an invalid credential or value"
				}, 400);
			}
			if (e.status == 401) {
				return c.json({
					action: "The request should not be repeated",
					message: "The request did not include valid authentication"
				}, 401);
			}
			if (e.status == 403) {
				return c.json({
					action: "The request should not be repeated",
					message: "The server did not accept valid authentication"
				}, 403);
			}
			if (e.status == 409) {
				return c.json({
					action: "Do not retry without fixing the problem",
					message: e.cause || "The request cannot be completed due to a conflict"
				}, 409);
			}
			if (e.status == 413) {
				return c.json({
					action: "Do not retry without fixing the problem",
					message: e.cause || "The request is too large"
				}, 413);
			}
			if (e.status == 422) {
				return c.json({
					action: "Do not retry without fixing the problem",
					message: e.cause || "The request did not meet one of it's preconditions"
				}, 422);
			}
			return c.json({
				action: "Do not retry this request more than once",
				message: e.cause || "Internal server error"
			}, 500);
		}
		return c.json({
			action: "Do not retry this request more than once",
			message: "Internal server error"
		}, 500);
	});

	api.get("/status", c => c.text("OK"));

	api.basePath("/v1").route("/owners", owner());

	return api;
}

serve({
	async fetch(req, server): Promise<Response> {
		return main().fetch(req, { ip: server.requestIP(req) });
	},
	port: PORT,
	maxRequestBodySize: toSafeInteger(env.MAX_SIZE_BODY_REQUEST) || 32768
});

console.log("Server listening on port", PORT);