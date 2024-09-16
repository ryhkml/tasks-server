import { env, sleep } from "bun";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { connectivity } from "./connectivity";

describe("Test CONNECTIVITY", () => {
	describe("", () => {
		it("should connected to the internet", async () => {
			const res = await connectivity();
			expect(res).toBe("ONLINE");
		});
	});

	describe("", () => {
		let save = "";
		beforeEach(() => {
			save = env.CONNECTIVITY_HOSTNAME;
			// @ts-expect-error
			env.CONNECTIVITY_HOSTNAME = undefined;
		});
		it("should disconnected to the internet", async () => {
			const res = await connectivity();
			expect(res).toBe("OFFLINE");
		});
		afterEach(async () => {
			env.CONNECTIVITY_HOSTNAME = save;
			await sleep(1);
		});
	});
});