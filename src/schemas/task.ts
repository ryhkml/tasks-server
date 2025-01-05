import { existsSync } from "node:fs";

import { addMilliseconds, addSeconds, isAfter, isBefore } from "date-fns";
import { z } from "zod";

import { inRange } from "../utils/common";

const recordStringSchema = z.record(
	z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9\$\_\.\-\[\]]{1,64}$/, {
			message: "Invalid key format"
		}),
	z.string().min(1).max(1024)
);

const authHttpSchema = z.strictObject({
	username: z.string().min(1).max(64),
	password: z.string().min(1).max(256)
});

const urlHttpSchema = z
	.string()
	.url()
	.max(1024)
	.transform((v) => new URL(v).toString())
	.refine(
		(v) => {
			try {
				const last = v.charAt(v.length - 1);
				if (last == "/" || last == "?") {
					return false;
				}
				const { protocol } = new URL(v);
				return protocol == "http:" || protocol == "https:";
			} catch (_) {
				return false;
			}
		},
		{
			message: "URL must start with either http or https and cannot use / and ? at the end"
		}
	);

const dateSchema = z.date();

export const taskSchema = z
	.strictObject({
		httpRequest: z.strictObject({
			url: urlHttpSchema,
			method: z
				.string()
				.toUpperCase()
				.pipe(
					z.union([z.literal("GET"), z.literal("POST"), z.literal("DELETE"), z.literal("PUT"), z.literal("PATCH")])
				),
			// Payload
			query: z.optional(recordStringSchema),
			headers: z.optional(recordStringSchema),
			data: z.optional(
				z.union([
					z.string().min(1).max(4096),
					z
						.array(
							z.strictObject({
								name: z.string().min(1).max(64),
								value: z.string().min(1).max(4096)
							})
						)
						.nonempty()
						.min(1)
						.max(64),
					z.record(
						z
							.string()
							.min(1)
							.max(64)
							.regex(/^[a-zA-Z0-9\$\_\.\-\[\]]{1,64}$/),
						z.union([
							z.union([z.string().max(4096), z.number(), z.boolean(), z.null()]),
							z.record(
								z
									.string()
									.min(1)
									.max(64)
									.regex(/^[a-zA-Z0-9\$\_\.\-\[\]]{1,64}$/),
								z.union([
									z.union([z.string().max(4096), z.number(), z.boolean(), z.null()]),
									z.record(
										z
											.string()
											.min(1)
											.max(64)
											.regex(/^[a-zA-Z0-9\$\_\.\-\[\]]{1,64}$/),
										z.union([z.string().max(4096), z.number(), z.boolean(), z.null()])
									)
								])
							)
						])
					)
				])
			),
			cookie: z.optional(
				z.union([
					z.string().base64(),
					z
						.array(
							z.strictObject({
								name: z.string().min(1).max(64),
								value: z.string().min(1).max(512)
							})
						)
						.nonempty()
						.min(1)
						.max(16)
				])
			),
			// Auth
			authNtlm: z.optional(authHttpSchema),
			authBasic: z.optional(authHttpSchema),
			authDigest: z.optional(authHttpSchema),
			authAwsSigv4: z.optional(
				z.strictObject({
					provider1: z.string().min(3),
					provider2: z.string().min(3),
					region: z.string().min(1).max(128),
					service: z.string().min(1).max(128),
					key: z.string().min(1).max(256),
					secret: z.string().min(1).max(256)
				})
			),
			// Transport
			transport: z.optional(z.union([z.literal("fetch"), z.literal("curl"), z.null()]))
		}),
		//
		config: z
			.strictObject({
				executionDelay: z.optional(z.number().gte(0).lte(Number.MAX_SAFE_INTEGER)).default(1),
				executeAt: z.optional(
					z
						.union([
							z.string().refine((v) => dateSchema.safeParse(new Date(v)).success, {
								message: "Invalid execute date"
							}),
							z.number().refine((v) => dateSchema.safeParse(new Date(v)).success, {
								message: "Invalid execute date"
							})
						])
						.refine((v) => isAfter(new Date(v), new Date().getTime()), {
							message: "Execution date must be greater than today"
						})
				),
				executeImmediately: z.optional(z.boolean()).default(false),
				retry: z.optional(z.number().gte(0).lte(Number.MAX_SAFE_INTEGER)).default(0),
				retryAt: z.optional(
					z.union([
						z.string().refine((v) => dateSchema.safeParse(new Date(v)).success, {
							message: "Invalid retry date"
						}),
						z.number().refine((v) => dateSchema.safeParse(new Date(v)).success, {
							message: "Invalid retry date"
						})
					])
				),
				retryInterval: z.optional(z.number().gte(1).lte(Number.MAX_SAFE_INTEGER)).default(1),
				retryExponential: z.optional(z.boolean()).default(true),
				ignoreStatusCode: z.optional(z.array(z.number().gte(400).lte(599)).max(40)).default([]),
				timeout: z.optional(z.number().gte(1000).lte(Number.MAX_SAFE_INTEGER)).default(30000),
				timeoutAt: z.optional(
					z.union([
						z.string().refine((v) => dateSchema.safeParse(new Date(v)).success, {
							message: "Invalid timeout date"
						}),
						z.number().refine((v) => dateSchema.safeParse(new Date(v)).success, {
							message: "Invalid timeout date"
						})
					])
				),
				// HTTP config
				httpVersion: z
					.optional(
						z.union([
							z.literal("0.9"),
							z.literal("1.0"),
							z.literal("1.1"),
							z.literal("2"),
							z.literal("2-prior-knowledge")
						])
					)
					.default("1.1"),
				userAgent: z
					.optional(z.string().min(8).max(256))
					.default("Tasks-Server/1.0 (compatible; Linux x86_64; +http://tasks-server)"),
				ipVersion: z.optional(z.union([z.literal(4), z.literal(6)])).default(4),
				credentials: z.optional(z.union([z.literal("include"), z.literal("omit"), z.literal("same-origin")])),
				refererUrl: z
					.optional(z.union([urlHttpSchema, z.string().toUpperCase().pipe(z.literal("AUTO"))]))
					.default("AUTO"),
				referrerPolicy: z.optional(
					z.union([
						z.literal(""),
						z.literal("no-referrer"),
						z.literal("no-referrer-when-downgrade"),
						z.literal("origin"),
						z.literal("origin-when-cross-origin"),
						z.literal("same-origin"),
						z.literal("strict-origin"),
						z.literal("strict-origin-when-cross-origin"),
						z.literal("unsafe-url")
					])
				),
				mode: z.optional(z.union([z.literal("cors"), z.literal("no-cors"), z.literal("same-origin")])),
				keepAliveDuration: z.optional(z.number().gte(0).lte(259200)).default(30),
				hsts: z.optional(z.union([z.string().base64(), z.boolean()])),
				sessionId: z.optional(z.boolean()).default(true),
				insecure: z.optional(z.boolean()).default(false),
				traceResponseData: z.optional(z.boolean()).default(true),
				// Cert and key config
				ca: z.optional(
					z.union([
						z
							.string()
							.max(256)
							.refine(
								(v) => {
									const split = v.split(".");
									if (split.length) {
										try {
											return existsSync(v);
										} catch (_) {
											return false;
										}
									}
									return false;
								},
								{
									message: "CA file does not exist"
								}
							),
						z
							.string()
							.trim()
							.min(1)
							.base64()
							.refine((v) => {
								try {
									return /^[\x00-\x7F]*$/.test(atob(v));
								} catch (_) {
									return false;
								}
							})
					])
				),
				cert: z.optional(
					z.strictObject({
						value: z.union([
							z
								.string()
								.max(256)
								.refine(
									(v) => {
										const split = v.split(".");
										if (split.length) {
											try {
												return existsSync(v);
											} catch (_) {
												return false;
											}
										}
										return false;
									},
									{
										message: "Cert file does not exist"
									}
								),
							z
								.string()
								.trim()
								.min(1)
								.base64()
								.refine((v) => {
									try {
										return /^[\x00-\x7F]*$/.test(atob(v));
									} catch (_) {
										return false;
									}
								})
						]),
						password: z.optional(z.string().min(1).max(1024))
					})
				),
				certType: z.optional(
					z
						.string()
						.toUpperCase()
						.pipe(z.union([z.literal("DER"), z.literal("ENG"), z.literal("P12"), z.literal("PEM")]))
				),
				certStatus: z.optional(z.boolean()),
				key: z.optional(
					z.union([
						z
							.string()
							.max(256)
							.refine(
								(v) => {
									const split = v.split(".");
									if (split.length) {
										try {
											return existsSync(v);
										} catch (_) {
											return false;
										}
									}
									return false;
								},
								{
									message: "Key file does not exist"
								}
							),
						z
							.string()
							.trim()
							.min(1)
							.base64()
							.refine((v) => {
								try {
									return /^[\x00-\x7F]*$/.test(atob(v));
								} catch (_) {
									return false;
								}
							})
					])
				),
				keyType: z.optional(
					z
						.string()
						.toUpperCase()
						.pipe(z.union([z.literal("DER"), z.literal("ENG"), z.literal("PEM")]))
				),
				// Redirection config
				location: z.optional(z.boolean()).default(true),
				locationTrusted: z.optional(authHttpSchema),
				redirectAttempts: z.optional(z.number().gte(0).lte(32)).default(8),
				// Proto config
				proto: z.optional(
					z
						.string()
						.toLowerCase()
						.pipe(z.union([z.literal("http"), z.literal("https")]))
				),
				protoRedirect: z.optional(
					z
						.string()
						.toLowerCase()
						.pipe(z.union([z.literal("http"), z.literal("https")]))
				),
				// DNS config
				dnsServer: z.optional(z.array(z.string().ip()).nonempty().min(1).max(4)),
				resolve: z.optional(
					z
						.array(
							z.strictObject({
								host: z.union([
									z
										.string()
										.min(1)
										.max(1024)
										.regex(
											/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])+$/
										),
									z.literal("*")
								]),
								port: z
									.number()
									.gte(1)
									.lte(65535)
									.refine((v) => v != 22),
								address: z.array(z.string().ip()).nonempty().min(1).max(4)
							})
						)
						.nonempty()
						.min(1)
						.max(4)
				),
				// DOH URL config
				dohUrl: z.optional(urlHttpSchema),
				dohInsecure: z.optional(z.boolean()),
				// TLS config
				tlsVersion: z.optional(z.union([z.literal("1.0"), z.literal("1.1"), z.literal("1.2"), z.literal("1.3")])),
				tlsMaxVersion: z.optional(z.union([z.literal("1.0"), z.literal("1.1"), z.literal("1.2"), z.literal("1.3")])),
				// Proxy config
				proxy: z.optional(
					z.strictObject({
						protocol: z
							.string()
							.toLowerCase()
							.pipe(z.union([z.literal("http"), z.literal("https")])),
						host: z.union([
							z.string().ip({
								version: "v4"
							}),
							z
								.string()
								.min(1)
								.max(128)
								.regex(
									/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])+$/
								)
						]),
						port: z.optional(
							z
								.number()
								.gte(1)
								.lte(65535)
								.refine(
									(v) => ![20, 21, 22, 23, 25, 53].includes(v),
									() => ({ message: "Invalid proxy port" })
								)
						)
					})
				),
				proxyHeaders: z.optional(recordStringSchema),
				proxyInsecure: z.optional(z.boolean()),
				proxyHttpVersion: z.optional(z.union([z.literal("1.0"), z.literal("1.1")])).default("1.1"),
				proxyAuthNtlm: z.optional(authHttpSchema),
				proxyAuthBasic: z.optional(authHttpSchema),
				proxyAuthDigest: z.optional(authHttpSchema),
				// Haproxy
				haProxyClientIp: z.optional(z.string().ip()),
				haProxyProtocol: z.optional(z.boolean())
			})
			.default({}),
		metadata: z.optional(
			z
				.record(
					z
						.string()
						.min(1)
						.max(64)
						.regex(/^[a-zA-Z0-9\$\_\.\-\[\]]{1,64}$/),
					z.string().min(1).max(512)
				)
				.refine((v) => inRange(Object.keys(v).length, 1, 8))
		)
	})
	// Validate date with custom error
	.superRefine(({ httpRequest, config }, ctx) => {
		const estimateExecutionDate = !!config.executeAt
			? addSeconds(new Date(config.executeAt), 1)
			: addSeconds(addMilliseconds(new Date().getTime(), config.executionDelay), 1);
		// Validation retryAt
		if (config.retryAt) {
			if (isBefore(new Date(config.retryAt), estimateExecutionDate)) {
				ctx.addIssue({
					message: "Retry date must be greater than execution date",
					code: z.ZodIssueCode.custom,
					path: ["config", "retryAt"]
				});
			}
		}
		// Validation timeoutAt
		if (config.timeoutAt && config.retryAt == null) {
			if (isBefore(new Date(config.timeoutAt), estimateExecutionDate)) {
				ctx.addIssue({
					message: "Timeout date must be greater than execution date",
					code: z.ZodIssueCode.custom,
					path: ["config", "timeoutAt"]
				});
			}
		}
		if (httpRequest.transport == "curl") {
			if (config.credentials) {
				ctx.addIssue({
					message: "Invalid curl option",
					code: z.ZodIssueCode.custom,
					path: ["config", "credentials"]
				});
			}
			if (config.referrerPolicy) {
				ctx.addIssue({
					message: "Invalid curl option",
					code: z.ZodIssueCode.custom,
					path: ["config", "referrerPolicy"]
				});
			}
			if (config.mode) {
				ctx.addIssue({
					message: "Invalid curl option",
					code: z.ZodIssueCode.custom,
					path: ["config", "mode"]
				});
			}
		}
	})
	.transform((v) => {
		if (v.httpRequest.method == "GET" || v.httpRequest.method == "DELETE") {
			v.httpRequest.data = undefined;
		}
		if (v.config.executeAt) {
			v.config.executionDelay = 0;
		}
		if (v.config.retryAt) {
			v.config.retry = 1;
			v.config.retryInterval = 0;
		}
		if (v.config.retry == 0 || v.config.retry == 1) {
			v.config.retryExponential = false;
		}
		if (v.httpRequest.transport != "curl" && v.config.refererUrl == "AUTO") {
			// @ts-expect-error
			v.config.refererUrl = undefined;
		}
		return v;
	});
