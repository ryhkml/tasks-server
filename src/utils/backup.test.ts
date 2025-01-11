import { env, file, S3Client, sleep, write } from "bun";
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { basename, dirname } from "node:path";
import { rm } from "node:fs/promises";

import { extract } from "tar";

import { backupDb } from "./backup";
import { logInfo } from "./logger";

describe("TEST BACKUP", () => {
	logInfo(`The backup method uses ${env.BACKUP_METHOD_SQLITE}. In addition, the test will be skipped`);

	describe.if(env.BACKUP_METHOD_SQLITE == "LOCAL")("", () => {
		it("should successfully defined env variables for local backup", () => {
			expect(env.PATH_SQLITE).toBeDefined();
			expect(env.BACKUP_PATH_DIR_SQLITE).toBeDefined();
			expect(env.BACKUP_METHOD_SQLITE).toBe("LOCAL");
		});
	});

	describe.if(env.BACKUP_METHOD_SQLITE == "OBJECT_STORAGE")("", () => {
		it("should successfully defined env variables for object storage backup", () => {
			expect(env.PATH_SQLITE).toBeDefined();
			expect(env.BACKUP_METHOD_SQLITE).toBe("OBJECT_STORAGE");
			expect(env.BACKUP_OBJECT_STORAGE_ENDPOINT).toBeDefined();
			expect(env.BACKUP_OBJECT_STORAGE_ACCESS_KEY).toBeDefined();
			expect(env.BACKUP_OBJECT_STORAGE_SECRET_KEY).toBeDefined();
			expect(env.BACKUP_OBJECT_STORAGE_BUCKET_NAME).toBeDefined();
			expect(env.BACKUP_OBJECT_STORAGE_PATH).toBeDefined();
		});
	});

	describe.if(env.BACKUP_METHOD_SQLITE == "LOCAL")("", () => {
		let pathBakDb = "";
		beforeAll(async () => {
			pathBakDb = await backupDb();
		});
		it("should successfully backup the database file to another directory", async () => {
			const isExistsBakDb = await file(pathBakDb).exists();
			expect(isExistsBakDb).toBe(true);
			expect(pathBakDb).toEndWith(".db.tar.gz");
		});
		it("should successfully restore the database file", async () => {
			await extract({
				file: pathBakDb,
				cwd: dirname(pathBakDb)
			});
			// Tasks
			const pathDb1 = env.BACKUP_PATH_DIR_SQLITE + "/" + basename(env.PATH_SQLITE);
			const db1 = new Database(pathDb1, { strict: true, create: false });
			const raw1 = db1.query<{ name: string }, [string, string]>(
				"SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2"
			);
			const owner = raw1.get("table", "owner");
			expect(owner).not.toBeNull();
			expect(owner?.name).toBe("owner");
			const queue = raw1.get("table", "queue");
			expect(queue).not.toBeNull();
			expect(queue?.name).toBe("queue");
			const config = raw1.get("table", "config");
			expect(config).not.toBeNull();
			expect(config?.name).toBe("config");
			const timeframe = raw1.get("table", "timeframe");
			expect(timeframe).not.toBeNull();
			expect(timeframe?.name).toBe("timeframe");
			// Throttle
			const pathDb2 = env.BACKUP_PATH_DIR_SQLITE + "/" + basename(env.PATH_SQLITE).replace(".db", "-throttle.db");
			const db2 = new Database(pathDb2, { strict: true, create: false });
			const raw2 = db2.query<{ name: string }, [string, string]>(
				"SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2"
			);
			const control = raw2.get("table", "control");
			expect(control).not.toBeNull();
			expect(control?.name).toBe("control");
		});
		afterAll(async () => {
			await rm(dirname(pathBakDb), {
				force: true,
				recursive: true
			});
		});
	});

	describe.if(env.BACKUP_METHOD_SQLITE == "OBJECT_STORAGE")("", () => {
		let filename = "";
		let client: S3Client;
		const { hostname } = new URL(env.BACKUP_OBJECT_STORAGE_ENDPOINT || "http://localhost");
		beforeAll(async () => {
			filename = await backupDb("OBJECT_STORAGE");
			client = new S3Client({
				accessKeyId: env.BACKUP_OBJECT_STORAGE_ACCESS_KEY,
				secretAccessKey: env.BACKUP_OBJECT_STORAGE_SECRET_KEY,
				bucket: env.BACKUP_OBJECT_STORAGE_BUCKET_NAME,
				endpoint: env.BACKUP_OBJECT_STORAGE_ENDPOINT,
				region: env.S3_REGION || env.AWS_REGION,
				sessionToken: env.S3_SESSION_TOKEN || env.AWS_SESSION_TOKEN
			});
		});
		it("should successfully backup the database file to object storage (" + hostname + ")", async () => {
			const exists = await client.file(env.BACKUP_OBJECT_STORAGE_PATH + "/" + filename).exists();
			expect(exists).toBeTrue();
		});
		it("should successfully restore the database file from object storage (" + hostname + ")", async () => {
			const targz = await client.file(env.BACKUP_OBJECT_STORAGE_PATH + "/" + filename).arrayBuffer();
			await write("/tmp/tasks/os/" + filename, targz);
			await sleep(1);
			await extract({
				file: "/tmp/tasks/os/" + filename,
				cwd: "/tmp/tasks/os"
			});
			const pathDb1 = "/tmp/tasks/os/" + basename(env.PATH_SQLITE);
			const db1 = new Database(pathDb1, { strict: true, create: false });
			const raw1 = db1.query<{ name: string }, [string, string]>(
				"SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2"
			);
			const owner = raw1.get("table", "owner");
			expect(owner).not.toBeNull();
			expect(owner?.name).toBe("owner");
			const queue = raw1.get("table", "queue");
			expect(queue).not.toBeNull();
			expect(queue?.name).toBe("queue");
			const config = raw1.get("table", "config");
			expect(config).not.toBeNull();
			expect(config?.name).toBe("config");
			const timeframe = raw1.get("table", "timeframe");
			expect(timeframe).not.toBeNull();
			expect(timeframe?.name).toBe("timeframe");
			// Throttle
			const pathDb2 = "/tmp/tasks/os/" + basename(env.PATH_SQLITE).replace(".db", "-throttle.db");
			const db2 = new Database(pathDb2, { strict: true, create: false });
			const raw2 = db2.query<{ name: string }, [string, string]>(
				"SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2"
			);
			const control = raw2.get("table", "control");
			expect(control).not.toBeNull();
			expect(control?.name).toBe("control");
		});
		afterAll(async () => {
			await Promise.all([
				client.file(env.BACKUP_OBJECT_STORAGE_PATH + "/" + filename).unlink(),
				rm("/tmp/tasks/os", {
					force: true,
					recursive: true
				})
			]);
		});
	});
});
