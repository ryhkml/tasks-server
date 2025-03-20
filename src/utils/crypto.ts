import { CryptoHasher } from "bun";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function enc(data: string, key: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", buffKey(key), iv);
	let encrypted = cipher.update(data, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTagHex = cipher.getAuthTag().toString("hex");
	return iv.toString("hex") + ":" + encrypted + ":" + authTagHex;
}

export function dec(encryptedData: string, key: string): string {
	const [ivHex, encrypted, authTagHex] = encryptedData.split(":");
	const decipher = createDecipheriv("aes-256-gcm", buffKey(key), Buffer.from(ivHex, "hex"));
	decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

function buffKey(v: string): Buffer {
	const hasher = new CryptoHasher("sha256");
	hasher.update(v);
	return hasher.digest();
}
