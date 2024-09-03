import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { HTTPResponseError, TypedResponse } from "hono/types";
import { StatusCode } from "hono/utils/http-status";
import { InvalidJSONValue, JSONParsed, JSONValue, SimplifyDeepArray } from "hono/utils/types";

type JSONRespondReturn<T extends JSONValue | SimplifyDeepArray<unknown> | InvalidJSONValue, U extends StatusCode> = Response & TypedResponse<SimplifyDeepArray<T> extends JSONValue ? JSONValue extends SimplifyDeepArray<T> ? never : JSONParsed<T> : never, U, "json">;
type JSONRespondExceptionFilter = JSONRespondReturn<{ action: string, message: string | object }, StatusCode>;

export function exceptionFilter(e: Error | HTTPResponseError, c: Context): JSONRespondExceptionFilter {
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
		if (e.status == 429) {
			return c.json({
				action: "Please wait until the server restore your connection",
				message: e.cause || "Too many requests in a given amount of time"
			}, 429);
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
}