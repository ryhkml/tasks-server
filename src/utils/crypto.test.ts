import { beforeAll, describe, expect, it } from "bun:test";

import { dec, enc } from "./crypto";

describe("TEST CRYPTO", () => {

	const data = JSON.stringify({
		username: "admin",
		password: "admin"
	});
	const key = "secret-key";

	let encryptedData = "";

	beforeAll(() => {
		encryptedData = enc(data, key);
	});

	it("should successfully encrypted data", () => {
		expect(encryptedData).not.toBeEmpty();
		expect(encryptedData.split(":")).toBeArrayOfSize(3);
	});
	
	it("should successfully decrypted data", () => {
		const decrypted = dec(encryptedData, key);
		expect(decrypted).toBeDefined();
		expect(JSON.parse(decrypted)).toStrictEqual({
			username: "admin",
			password: "admin"
		});
	});
});