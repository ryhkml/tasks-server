import { env } from "bun";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import cluster, { Worker } from "node:cluster";
import { cpus } from "node:os";

import { logWarn } from "./logger";

describe("TEST CLUSTER", () => {
	logWarn("Windows and macOS ignore the reusePort option. This is an operating system limitation with SO_REUSEPORT");
	logWarn("For more information, visit https://lwn.net/Articles/542629");

	describe.if(navigator.platform == "Linux x86_64")("Linux", () => {
		describe("env variables", () => {
			it("should successfully defined CLUSTER_MODE and MAX_INSTANCES", () => {
				expect(env.CLUSTER_MODE).not.toBeNil();
				expect(env.MAX_INSTANCES).not.toBeNil();
			});
		});

		describe("worker", () => {
			const workers = [] as Worker[];
			beforeEach(() => {
				for (let i = 0; i < cpus().length; i++) {
					workers.push(cluster.fork());
				}
			});
			it("should successfully fork", () => {
				expect(workers).toBeArrayOfSize(cpus().length);
			});
			afterEach(() => {
				for (let i = 0; i < workers.length; i++) {
					workers[i].kill();
				}
			});
		});
	});
});