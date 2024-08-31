import { CryptoHasher } from "bun";

import { createCipheriv, createDecipheriv } from "node:crypto";

export function enc(data: string, key: string): string {
    const cipher = createCipheriv("aes-256-gcm", buffKey(key), buffIv(key));
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTagHex = cipher.getAuthTag().toString("hex");
    return buffIv(key).toString("hex") + ":" + encrypted + ":" + authTagHex;
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

function buffIv(v: string): Buffer {
	const hasher = new CryptoHasher("sha256");
	hasher.update(v);
	const iv = Buffer.alloc(12);
	hasher.digest().copy(iv, 0, 0, 12);
	return iv;
}