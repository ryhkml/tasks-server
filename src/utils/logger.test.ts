import { describe, expect, it,mock } from "bun:test";

import { logError, logInfo, logWarn } from "./logger";

describe("TEST LOGGER", () => {

	const info = mock(() => logInfo("This is info"));
	const warn = mock(() => logWarn("This is warning"));
	const error = mock(() => logError("This is error"));

	it("should successfully log info", () => {
		info();
		expect(info).toHaveBeenCalled();
	});

	it("should successfully log warn", () => {
		warn();
		expect(warn).toHaveBeenCalled();
	});

	it("should successfully log error", () => {
		error();
		expect(error).toHaveBeenCalled();
	});
});