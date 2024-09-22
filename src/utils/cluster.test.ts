import { env } from "bun";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import cluster, { Worker } from "node:cluster";

import { logWarn } from "./logger";

describe("TEST CLUSTER", () => {

	logWarn("macOS and Windows ignore the reusePort option. This is an operating system limitation with SO_REUSEPORT");

	describe.if(navigator.platform == "Linux x86_64")("Linux", () => {
		describe("env variables", () => {
			it("should successfully defined CLUSTER_MODE and MAX_INSTANCES", () => {
				expect(env.CLUSTER_MODE).not.toBeNil();
				expect(env.MAX_INSTANCES).not.toBeNil();
			});
		});

		describe("worker", () => {
			let workers = [] as Worker[];
			beforeEach(() => {
				for (let i = 0; i < navigator.hardwareConcurrency; i++) {
					workers.push(cluster.fork());
				}
			});
			it("should successfully fork", () => {
				expect(workers).toBeArrayOfSize(navigator.hardwareConcurrency);
			});
			afterEach(() => {
				workers.forEach(w => w.kill());
			});
		});
	});

	describe.if(navigator.platform == "MacIntel")("macOS", () => {
		it("should successfully works on Mac", () => {
			// Skip
		});
	});

	describe.if(navigator.platform == "Win32")("Windows", () => {
		it("should successfully works on Windows", () => {
			// Skip
		});
	});
});