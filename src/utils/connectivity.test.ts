import { env } from "bun";
import { beforeEach, describe, expect, it } from "bun:test";

import { connectivity } from "./connectivity";

describe("Test CONNECTIVITY", () => {
	describe("", () => {
		it("should connected to the internet", async () => {
			const res = await connectivity();
			expect(res).toBe("ONLINE");
		});
	});

	describe("", () => {
		beforeEach(() => {
			// @ts-expect-error
			env.CONNECTIVITY_HOSTNAME = undefined;
		});
		it("should disconnected to the internet", async () => {
			const res = await connectivity();
			expect(res).toBe("OFFLINE");
		});
	});
});