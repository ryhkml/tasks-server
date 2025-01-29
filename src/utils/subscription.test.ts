import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

import { timer } from "rxjs";

import { subscriptionManager } from "./subscription";

describe("TEST SUBSCRIPTION", () => {
	const mock1Add = mock(() => {
		return subscriptionManager.add("someid", timer(5000).subscribe());
	});
	const mock2Add = mock(() => {
		return subscriptionManager.add("someid", timer(5000).subscribe());
	});
	const mock3Add = mock(() => {
		for (let i = 1; i <= 10; i++) {
			subscriptionManager.add("someid-" + i.toString(), timer(5000).subscribe());
		}
		return true;
	});

	describe("", () => {
		it("should successfully add subscription", () => {
			const added = mock1Add();
			expect(added).toBeTrue();
			expect(mock1Add).toHaveBeenCalledTimes(1);
		});
		it("should unsuccessfully add subscription", () => {
			const added = mock2Add();
			expect(added).toBeFalse();
			expect(mock2Add).toHaveBeenCalledTimes(1);
		});
	});

	describe("", () => {
		it("should successfully unsubscribe subscription", () => {
			const unsubscribed = subscriptionManager.unsubscribe("someid");
			expect(unsubscribed).toBeTrue();
		});
		it("should unsuccessfully unsubscribe subscription", () => {
			const unsubscribed = subscriptionManager.unsubscribe("someid");
			expect(unsubscribed).toBeFalse();
		});
		afterAll(() => {
			subscriptionManager.unsubscribeAll();
		});
	});

	describe("", () => {
		beforeEach(() => {
			mock3Add();
		});
		it("should successfully subscribe multiple subscription", () => {
			expect(subscriptionManager.size()).toBe(10);
		});
	});

	describe("", () => {
		beforeEach(() => {
			subscriptionManager.unsubscribeAll();
		});
		it("should successfully unsubscribe and clear subscription", () => {
			expect(subscriptionManager.size()).toBe(0);
		});
	});
});
