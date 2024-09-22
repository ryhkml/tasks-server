import { describe, expect, it } from "bun:test";

import { inRange, isEmpty, isPlainObject, safeInteger } from "./common";

describe("TEST COMMON", () => {	
	describe("lang", () => {
		describe("isEmpty", () => {
			it("should return true if a value is empty", () => {
				const value1 = "";
				// @ts-expect-error
				const value2 = [];
				const value3 = {};
				const value5 = undefined;
				const value4 = null;
				const check1 = isEmpty(value1);
				// @ts-expect-error
				const check2 = isEmpty(value2);
				const check3 = isEmpty(value3);
				const check4 = isEmpty(value4);
				const check5 = isEmpty(value5);
				expect(check1).toBeTrue();
				expect(check2).toBeTrue();
				expect(check3).toBeTrue();
				expect(check4).toBeTrue();
				expect(check5).toBeTrue();
			});
			it("should return false if there is a value", () => {
				const value1 = "1";
				const value2 = [""];
				const value3 = { id: 1 };
				const check1 = isEmpty(value1);
				const check2 = isEmpty(value2);
				const check3 = isEmpty(value3);
				expect(check1).toBeFalse();
				expect(check2).toBeFalse();
				expect(check3).toBeFalse();
			});
		});

		describe("inRange", () => {
			it("should return true if a value is in range", () => {
				const value = 1;
				expect(inRange(value, 1, 68)).toBeTrue();
			});
			it("should return false if a value is not in range", () => {
				const value = 69;
				expect(inRange(value, 1, 68)).toBeFalse();
			});
		});
		
		describe("safeInteger", () => {
			it("should return a positive integer value of 0 to MAX_SAFE_INTEGER", () => {
				const value1 = 0;
				const value2 = -1;
				const value3 = 1.5;
				const value4 = Number.MIN_SAFE_INTEGER;
				const value5 = NaN;
				const check1 = safeInteger(value1);
				const check2 = safeInteger(value2);
				const check3 = safeInteger(value3);
				const check4 = safeInteger(value4);
				const check5 = safeInteger(value5);
				expect(check1).toBe(0);
				expect(check2).toBe(1);
				expect(check2).toBeGreaterThanOrEqual(0);
				expect(check3).toBe(1);
				expect(check4).toBe(Number.MAX_SAFE_INTEGER);
				expect(check4).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
				expect(check5).toBe(0);
				expect(check5).toBeGreaterThanOrEqual(0);
			});
		});
	});
	
	describe("object", () => {
		describe("isPlainObject", () => {
			it("should return true if the value is a plain object", () => {
				const value1 = {};
				const value2 = { id: 1 };
				const value3 = Object.create(null);
				const value4 = Object.assign({}, value2);
				const check1 = isPlainObject(value1);
				const check2 = isPlainObject(value2);
				const check3 = isPlainObject(value3);
				const check4 = isPlainObject(value4);
				expect(check1).toBeTrue();
				expect(check2).toBeTrue();
				expect(check3).toBeTrue();
				expect(check4).toBeTrue();
			});
			it("should return false if the value is not a plain object", () => {
				const value1 = [{}];
				class Test {};
				const value2 = new Test();
				function noop() {};
				const check1 = isPlainObject(value1);
				const check2 = isPlainObject(value2);
				const check3 = isPlainObject(noop);
				expect(check1).toBeFalse();
				expect(check2).toBeFalse();
				expect(check3).toBeFalse();
			});
		});
	});
});