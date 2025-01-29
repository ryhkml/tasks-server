import { env, hash, readableStreamToText, spawn, write } from "bun";

import { randomBytes } from "node:crypto";

import { Observable, TimeoutError, catchError, concatMap, defer, map, of, throwError, timeout } from "rxjs";
import { z } from "zod";

import { inRange, isPlainObject, safeInteger } from "./common";
import { taskSchema } from "../schemas/task";

type TaskRequest = z.infer<typeof taskSchema>;

export function http(req: TaskRequest, additionalHeaders?: RecordString): Observable<HttpResponse> {
	const MAX_SIZE_DATA_RESPONSE = safeInteger(env.MAX_SIZE_DATA_RESPONSE) || 32768;

	const httpId = hash(req.httpRequest.url).toString() + randomBytes(16).toString("hex");
	const url = !!req.httpRequest.query
		? req.httpRequest.url + "?" + new URLSearchParams(req.httpRequest.query).toString()
		: req.httpRequest.url;

	if (req.httpRequest.transport != "curl") {
		let body: BodyInit;
		const headers = new Headers();
		// Body
		if (req.httpRequest.data) {
			if (isPlainObject(req.httpRequest.data)) {
				body = JSON.stringify(req.httpRequest.data);
				headers.append("content-type", "application/json");
			} else if (Array.isArray(req.httpRequest.data)) {
				const form = new FormData();
				for (let i = 0; i < req.httpRequest.data.length; i++) {
					const { name, value } = req.httpRequest.data[i];
					form.append(name, value);
				}
				body = form;
			} else {
				body = String(req.httpRequest.data);
				headers.append("content-type", "plain/text");
			}
		}
		// Headers
		if (req.httpRequest.headers) {
			for (const [key, value] of Object.entries(req.httpRequest.headers)) {
				if (key.toLowerCase().includes("user-agent")) {
					continue;
				}
				headers.append(key, value);
			}
		}
		if (additionalHeaders) {
			for (const [key, value] of Object.entries(additionalHeaders)) {
				headers.append(key, value);
			}
		}
		headers.append("user-agent", req.config.userAgent);
		const source = defer(() =>
			fetch(url, {
				body,
				method: req.httpRequest.method,
				headers,
				cache: "no-cache",
				keepalive: !!req.config.keepAliveDuration,
				mode: req.config.mode,
				credentials: req.config.credentials,
				referrer: req.config.refererUrl,
				referrerPolicy: req.config.referrerPolicy
			})
		).pipe(
			timeout({
				first: !!req.config.timeoutAt ? new Date(req.config.timeoutAt) : undefined,
				each: req.config.timeout
			}),
			catchError((error) => {
				if (error instanceof TimeoutError) {
					return throwError(() => ({
						id: httpId,
						data: Buffer.from(String(error)).toString("base64"),
						state: "ERROR",
						status: 408,
						statusText: "Timeout error"
					}));
				}
				return throwError(() => ({
					id: httpId,
					data: Buffer.from(String(error)).toString("base64"),
					state: "ERROR",
					status: 500,
					statusText: "Internal server error"
				}));
			})
		);
		// @ts-expect-error
		return source.pipe(
			concatMap((res) => {
				const source = defer(() => res.text()).pipe(
					map((text) => {
						const encoder = new TextEncoder();
						return {
							data: Buffer.from(text).toString("base64"),
							size: encoder.encode(text).length
						};
					}),
					catchError((error) =>
						of({
							data: Buffer.from(String(error)).toString("base64"),
							size: 0
						})
					)
				);
				return source.pipe(
					map(({ data, size }) => {
						if (size > MAX_SIZE_DATA_RESPONSE) {
							throw {
								id: httpId,
								data: Buffer.from(
									"The response size cannot be more than " + MAX_SIZE_DATA_RESPONSE.toString()
								).toString("base64"),
								state: "ERROR",
								status: 422,
								statusText: "Unprocessable data, the response payload too large"
							};
						}
						if (inRange(res.status, 400, 599)) {
							throw {
								id: httpId,
								data,
								state: "ERROR",
								status: res.status,
								statusText: "Error 4xx-5xx"
							};
						}
						return {
							id: httpId,
							data: req.config.traceResponseData ? data : null,
							state: "SUCCESS",
							status: res.status,
							statusText: "Ok"
						};
					}),
					catchError((error) => throwError(() => error))
				);
			})
		);
	}

	const options = ["-s", "-N"];
	// Method
	if (req.httpRequest.method) {
		options.push("-X");
		options.push(req.httpRequest.method);
	}
	// IP. Use IP addresses only when resolving hostnames
	options.push("-" + req.config.ipVersion.toString());
	// No trace response data
	if (!req.config.traceResponseData) {
		options.push("-o");
		options.push("/dev/null");
	}
	// Proto. By default, proto only enables http and https
	if (req.config.proto) {
		options.push("--proto");
		options.push("=" + req.config.proto);
	} else {
		options.push("--proto");
		options.push("-all,http,https");
	}
	// CA
	if (req.config.ca) {
		const split = req.config.ca.split(".");
		if (split.length) {
			options.push("--cacert");
			options.push(req.config.ca);
		} else {
			const dataCa = Buffer.from(req.config.ca, "base64").toString("utf-8");
			const pathCa = "/tmp/tasks/" + httpId + "/ca/ca.crt";
			write(pathCa, dataCa, { mode: 440 });
			options.push("--cacert");
			options.push(pathCa);
		}
	}
	// Cert
	if (req.config.cert?.value) {
		let type = "pem";
		let password = "";
		const split = req.config.cert.value.split(".");
		if (req.config.certType) {
			type = req.config.certType.toLowerCase();
			options.push("--cert-type");
			options.push(req.config.certType);
		}
		if (req.config.cert.password) {
			password = req.config.cert.password.replace(/:/g, "\\:").replace(/"/g, '\\"');
		}
		if (split.length) {
			options.push("--cert");
			if (password) {
				options.push(req.config.cert.value + ":" + password);
			} else {
				options.push(req.config.cert.value);
			}
		} else {
			const dataCert = Buffer.from(req.config.cert.value, "base64").toString("utf-8");
			const pathCert = "/tmp/tasks/" + httpId + "/cert/cert." + type;
			write(pathCert, dataCert, { mode: 440 });
			options.push("--cert");
			if (password) {
				options.push(pathCert + ":" + password);
			} else {
				options.push(pathCert);
			}
		}
	}
	if (req.config.certStatus) {
		options.push("--cert-status");
	}
	// Key
	if (req.config.key) {
		let type = "pem";
		const split = req.config.key.split(".");
		if (req.config.keyType) {
			type = req.config.keyType.toLowerCase();
			options.push("--key-type");
			options.push(req.config.keyType);
		}
		if (split.length) {
			options.push("--key");
			options.push(req.config.key);
		} else {
			const dataKey = Buffer.from(req.config.key, "base64").toString("utf-8");
			const pathKey = "/tmp/tasks/" + httpId + "/cert/key." + type;
			write(pathKey, dataKey, { mode: 440 });
			options.push("--key");
			options.push(pathKey);
		}
	}
	// Location
	if (req.config.location) {
		options.push("-L");
		// Max Redirect
		if (req.config.redirectAttempts) {
			options.push("--max-redirs");
			options.push(req.config.redirectAttempts.toString());
		} else {
			options.push("--max-redirs");
			options.push("8");
		}
		// Proto redirect. By default, proto redirect only enables http and https
		if (req.config.protoRedirect) {
			options.push("--proto-redir");
			options.push("=" + req.config.protoRedirect);
		} else {
			options.push("--proto-redir");
			options.push("-all,http,https");
		}
		// Location trusted
		if (req.config.locationTrusted) {
			const { username, password } = req.config.locationTrusted;
			options.push("--location-trusted");
			options.push("-u");
			options.push(username + ":" + password);
		}
	}
	// TLS version
	if (req.config.tlsMaxVersion) {
		if (req.config.tlsMaxVersion == "1.0") {
			options.push("--tls-max");
			options.push("1.0");
		} else if (req.config.tlsMaxVersion == "1.1") {
			options.push("--tls-max");
			options.push("1.1");
		} else if (req.config.tlsMaxVersion == "1.2") {
			options.push("--tls-max");
			options.push("1.2");
		} else if (req.config.tlsMaxVersion == "1.3") {
			options.push("--tls-max");
			options.push("1.3");
		}
	}
	if (req.config.tlsVersion) {
		if (req.config.tlsVersion == "1.0") {
			options.push("--tlsv1.0");
		} else if (req.config.tlsVersion == "1.1") {
			options.push("--tlsv1.1");
		} else if (req.config.tlsVersion == "1.2") {
			options.push("--tlsv1.2");
		} else if (req.config.tlsVersion == "1.3") {
			options.push("--tlsv1.3");
		}
	}
	// HTTP basic authentication
	if (req.httpRequest.authBasic) {
		const { username, password } = req.httpRequest.authBasic;
		options.push("-u");
		options.push(username + ":" + password);
		options.push("--basic");
	}
	// HTTP digest authentication
	if (req.httpRequest.authDigest) {
		const { username, password } = req.httpRequest.authDigest;
		options.push("-u");
		options.push(username + ":" + password);
		options.push("--digest");
	}
	// HTTP NTLM authentication
	if (req.httpRequest.authNtlm) {
		const { username, password } = req.httpRequest.authNtlm;
		options.push("-u");
		options.push(username + ":" + password);
		options.push("--ntlm");
	}
	// HTTP AWS V4 signature authentication
	if (req.httpRequest.authAwsSigv4) {
		const { provider1, provider2, region, service, key, secret } = req.httpRequest.authAwsSigv4;
		options.push("--aws-sigv4");
		options.push(provider1 + ":" + provider2 + ":" + region + ":" + service);
		options.push("--user");
		options.push(key + ":" + secret);
	}
	// Headers
	if (req.httpRequest.headers) {
		for (const [key, value] of Object.entries(req.httpRequest.headers)) {
			if (key.toLowerCase().includes("user-agent")) {
				continue;
			}
			options.push("-H");
			options.push(key + ": " + value);
		}
	}
	if (additionalHeaders) {
		for (const [key, value] of Object.entries(additionalHeaders)) {
			options.push("-H");
			options.push(key + ": " + value);
		}
	}
	// Data
	if (req.httpRequest.data) {
		if (isPlainObject(req.httpRequest.data)) {
			options.push("-H");
			options.push("content-type: application/json");
			options.push("-d");
			const escapeJsonStr = JSON.stringify(req.httpRequest.data)
				.replace(/\\n/g, "\\n")
				.replace(/\\'/g, "\\'")
				.replace(/\\"/g, '\\"')
				.replace(/\\&/g, "\\&")
				.replace(/\\r/g, "\\r")
				.replace(/\\t/g, "\\t")
				.replace(/\\b/g, "\\b")
				.replace(/\\f/g, "\\f");
			options.push(escapeJsonStr);
		} else if (Array.isArray(req.httpRequest.data)) {
			for (let i = 0; i < req.httpRequest.data.length; i++) {
				const { name, value } = req.httpRequest.data[i];
				options.push("--form-string");
				options.push(name + "=" + value);
			}
		} else {
			options.push("-H");
			options.push("content-type: plain/text");
			options.push("-d");
			options.push(String(req.httpRequest.data));
		}
	}
	// Cookie
	if (req.httpRequest.cookie) {
		if (Array.isArray(req.httpRequest.cookie)) {
			for (let i = 0; i < req.httpRequest.cookie.length; i++) {
				const { name, value } = req.httpRequest.cookie[i];
				options.push("-b");
				options.push(name + "=" + value);
			}
		} else {
			const dataCookie = Buffer.from(req.httpRequest.cookie, "base64").toString("utf-8");
			const pathCookie = "/tmp/tasks/" + httpId + "/storage/cookie.txt";
			write(pathCookie, dataCookie, { mode: 440 });
			options.push("-b");
			options.push(pathCookie);
		}
	}
	// User-Agent
	options.push("-A");
	options.push(req.config.userAgent);
	// DNS Server
	if (req.config.dnsServer) {
		options.push("--dns-servers");
		options.push(req.config.dnsServer.join(","));
	}
	// DOH URL
	if (req.config.dohUrl) {
		options.push("--doh-url");
		options.push(req.config.dohUrl);
	}
	// DOH Insecure
	if (req.config.dohInsecure) {
		options.push("--doh-insecure");
	}
	// HTTP Version
	if (req.config.httpVersion) {
		if (req.config.httpVersion == "0.9") {
			options.push("--http0.9");
		}
		if (req.config.httpVersion == "1.0") {
			options.push("--http1.0");
		}
		if (req.config.httpVersion == "1.1") {
			options.push("--http1.1");
		}
		if (req.config.httpVersion == "2") {
			options.push("--http2");
		}
		if (req.config.httpVersion == "2-prior-knowledge") {
			options.push("--http2-prior-knowledge");
		}
	} else {
		options.push("--http1.1");
	}
	// Insecure
	if (req.config.insecure) {
		options.push("-k");
	}
	// Referer URL
	if (req.config.refererUrl) {
		if (req.config.refererUrl == "AUTO") {
			options.push("-e");
			options.push(";auto");
		} else {
			options.push("-e");
			options.push(req.config.refererUrl);
		}
	}
	// Keep Alive Duration
	if (req.config.keepAliveDuration) {
		if (req.config.keepAliveDuration == 0) {
			options.push("--no-keepalive");
		} else {
			options.push("--keepalive-time");
			options.push(req.config.keepAliveDuration.toString());
		}
	} else {
		options.push("--keepalive-time");
		options.push("30");
	}
	// Resolve
	if (req.config.resolve) {
		const resolves = req.config.resolve.map((r) => `${r.host}:${r.port.toString()}:${r.address.join(",")}`);
		for (let i = 0; i < resolves.length; i++) {
			const resolve = resolves[i];
			options.push("--resolve");
			options.push(resolve);
		}
	}
	// HSTS
	if (req.config.hsts) {
		options.push("--hsts");
		if (typeof req.config.hsts === "string") {
			const dataHsts = Buffer.from(req.config.hsts, "base64").toString("utf-8");
			const pathHsts = "/tmp/tasks/" + httpId + "/hsts/hsts.txt";
			write(pathHsts, dataHsts, { mode: 440 });
			options.push(pathHsts);
		} else {
			options.push("/dev/null");
		}
	}
	// Session id
	if (!req.config.sessionId) {
		options.push("--no-sessionid");
	}
	// HaProxy
	if (req.config.haProxyClientIp) {
		options.push("--haproxy-clientip");
		options.push(req.config.haProxyClientIp);
	}
	if (req.config.haProxyProtocol) {
		options.push("--haproxy-protocol");
	}
	// Proxy
	if (req.config.proxy) {
		if (req.config.proxyHttpVersion == "1.0") {
			options.push("--proxy1.0");
		} else {
			options.push("-x");
		}
		const { protocol, host, port } = req.config.proxy;
		if (port && req.config.proxyHttpVersion == "1.1") {
			options.push(protocol + "://" + host + ":" + port.toString());
		} else {
			options.push(protocol + "://" + host);
		}
		// Proxy auth basic
		if (req.config.proxyAuthBasic) {
			options.push("--proxy-basic");
			options.push("-U");
			const { username, password } = req.config.proxyAuthBasic;
			options.push(username + ":" + password);
		}
		// Proxy auth digest
		if (req.config.proxyAuthDigest) {
			options.push("--proxy-digest");
			options.push("-U");
			const { username, password } = req.config.proxyAuthDigest;
			options.push(username + ":" + password);
		}
		// Proxy auth digest
		if (req.config.proxyAuthNtlm) {
			options.push("--proxy-ntlm");
			options.push("-U");
			const { username, password } = req.config.proxyAuthNtlm;
			options.push(username + ":" + password);
		}
		// Proxy headers
		if (req.config.proxyHeaders) {
			for (const [key, value] of Object.entries(req.config.proxyHeaders)) {
				options.push("--proxy-header");
				options.push(key + ": " + value);
			}
		}
		// Proxy insecure
		if (req.config.proxyInsecure) {
			options.push("--proxy-insecure");
		}
	}
	options.push("-w");
	options.push("&&SPLIT&&%{response_code}&&SPLIT&&%{size_download}");
	options.push("--url");
	options.push(url);
	return defer(() => curl(options)).pipe(
		map((text) => {
			const [payload, code, sizeData] = text.split("&&SPLIT&&") as [string, string, string];
			const status = safeInteger(code);
			const data = !!payload ? Buffer.from(payload).toString("base64") : null;
			if (safeInteger(sizeData) > MAX_SIZE_DATA_RESPONSE) {
				throw {
					id: httpId,
					data: Buffer.from("The response size cannot be more than " + MAX_SIZE_DATA_RESPONSE.toString()).toString(
						"base64"
					),
					state: "ERROR",
					status: 422,
					statusText: "Unprocessable data, the response payload too large"
				};
			}
			if (inRange(status, 400, 599)) {
				throw {
					id: httpId,
					data,
					state: "ERROR",
					status,
					statusText: "Error 4xx-5xx"
				};
			}
			return {
				id: httpId,
				data,
				state: "SUCCESS",
				status,
				statusText: "Ok"
			};
		}),
		// @ts-expect-error
		timeout({
			first: !!req.config.timeoutAt ? new Date(req.config.timeoutAt) : undefined,
			each: req.config.timeout
		}),
		catchError((error) => {
			if (isPlainObject(error)) {
				if ("data" in error && "status" in error) {
					return throwError(() => error);
				}
				if ("info" in error) {
					return throwError(() => ({
						id: httpId,
						data: Buffer.from(String(error.info.stderr)).toString("base64"),
						state: "ERROR",
						status: 501,
						statusText: "Not implemented"
					}));
				}
			}
			if (error instanceof TimeoutError) {
				return throwError(() => ({
					id: httpId,
					data: Buffer.from(String(error)).toString("base64"),
					state: "ERROR",
					status: 408,
					statusText: "Timeout error"
				}));
			}
			return throwError(() => ({
				id: httpId,
				data: Buffer.from(String(error)).toString("base64"),
				state: "ERROR",
				status: 500,
				statusText: "Internal server error"
			}));
		})
	);
}

function curl(options: Array<string>): Promise<string> {
	const proc = spawn(["curl", ...options], {
		env: {}
	});
	return readableStreamToText(proc.stdout);
}
