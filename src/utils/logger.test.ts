import { env } from "bun";
import { describe, expect, it, spyOn } from "bun:test";

import { logError, logInfo, logWarn } from "./logger";

import { format } from "date-fns";

describe("TEST LOGGER", () => {

	const startWithDate = (): string => {
		const locale = new Date().toLocaleString("en-US", { timeZone: env.LOG_TZ || env.TZ });
		return format(new Date(locale), "MMM/d/yyyy.hh:mm:ss.a");
	};

	const spyLogInfo = spyOn(console, "log").mockImplementation(() => {});
	const spyLogWarn = spyOn(console, "warn").mockImplementation(() => {});
	const spyLogError = spyOn(console, "error").mockImplementation(() => {});

	it("should successfully log info", () => {
		logInfo("test123");
		const expectedWithDate = new RegExp(`[${startWithDate()}]`);
		expect(spyLogInfo).toHaveBeenCalledWith(
			expect.stringMatching(expectedWithDate),
			expect.stringContaining("INFO"),
			"—",
			"test123"
		);
	});

	it("should successfully log warn", () => {
		logWarn("test456");
		const expectedWithDate = new RegExp(`[${startWithDate()}]`);
		expect(spyLogWarn).toHaveBeenCalledWith(
			expect.stringMatching(expectedWithDate),
			expect.stringContaining("WARNING"),
			"—",
			"test456"
		);
	});

	it("should successfully log error", () => {
		logError("test789");
		const expectedWithDate = new RegExp(`[${startWithDate()}]`);
		expect(spyLogError).toHaveBeenCalledWith(
			expect.stringMatching(expectedWithDate),
			expect.stringContaining("ERROR"),
			"—",
			"test789"
		);
	});
});