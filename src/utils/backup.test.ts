import { env, file, sleep, write } from "bun";
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { basename, dirname } from "node:path";
import { rm } from "node:fs/promises";

import { Bucket, Storage } from "@google-cloud/storage";
import { extract } from "tar";

import { backupDb } from "./backup";
import { logInfo } from "./logger";

describe("TEST BACKUP", () => {

	logInfo(`The backup method uses ${env.BACKUP_METHOD_SQLITE}. In addition, the test will be skipped`);

	describe.if(env.BACKUP_METHOD_SQLITE == "LOCAL")("", () => {
		it("should successfully defined env variables for local backup", () => {
			expect(env.PATH_SQLITE).toBeDefined();
            expect(env.BACKUP_DIR_SQLITE).toBeDefined();
            expect(env.BACKUP_METHOD_SQLITE).toBeDefined();
            expect(env.BACKUP_METHOD_SQLITE).toBe("LOCAL");
		});
	});

	describe.if(env.BACKUP_METHOD_SQLITE == "GOOGLE_CLOUD_STORAGE")("", () => {
		it("should successfully defined env variables for Google Cloud Storage backup", () => {
			expect(env.PATH_SQLITE).toBeDefined();
			expect(env.BACKUP_METHOD_SQLITE).toBeDefined();
            expect(env.BACKUP_METHOD_SQLITE).toBe("GOOGLE_CLOUD_STORAGE");
			expect(env.BACKUP_GCS_PROJECT_ID_SQLITE).toBeDefined();
			expect(env.BACKUP_GCS_PRIVATE_KEY_SQLITE).toBeDefined();
			expect(env.BACKUP_GCS_CLIENT_ID_SQLITE).toBeDefined();
			expect(env.BACKUP_GCS_CLIENT_EMAIL_SQLITE).toBeDefined();
			expect(env.BACKUP_BUCKET_NAME_SQLITE).toBeDefined();
			expect(env.BACKUP_BUCKET_DIR_SQLITE).toBeDefined();
		});
	});

	describe.if(env.BACKUP_METHOD_SQLITE == "LOCAL")("", () => {
		let pathBakDb = "";
		beforeAll(async () => {
			const path = await backupDb();
			pathBakDb = path;
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
			const pathDb1 = env.BACKUP_DIR_SQLITE + "/" + basename(env.PATH_SQLITE);
			const db1 = new Database(pathDb1, { strict: true, create: false });
			const raw1 = db1.prepare<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const owner = raw1.get("table", "owner");
			expect(owner).not.toBeNull();
			expect(owner?.name).toBe("owner");
			const queue = raw1.get("table", "queue");
			expect(queue).not.toBeNull();
			expect(queue?.name).toBe("queue");
			const config = raw1.get("table", "config");
			expect(config).not.toBeNull();
			expect(config?.name).toBe("config");
			// Throttle
			const pathDb2 = env.BACKUP_DIR_SQLITE + "/" + basename(env.PATH_SQLITE).replace(".db", "-throttle.db");
			const db2 = new Database(pathDb2, { strict: true, create: false });
			const raw2 = db2.query<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const control = raw2.get("table", "control");
			expect(control).not.toBeNull();
			expect(control?.name).toBe("control");
			// Timeframe
			const pathDb3 = env.BACKUP_DIR_SQLITE + "/" + basename(env.PATH_SQLITE).replace(".db", "-timeframe.db");
			const db3 = new Database(pathDb3, { strict: true, create: false });
			const raw3 = db3.query<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const timeframe = raw3.get("table", "timeframe");
			expect(timeframe).not.toBeNull();
			expect(timeframe?.name).toBe("timeframe");
		});
		afterAll(async () => {
			await rm(dirname(pathBakDb), {
				force: true,
				recursive: true
			});
		});
	});

	describe.if(env.BACKUP_METHOD_SQLITE == "GOOGLE_CLOUD_STORAGE")("", () => {
		let pathBakDb = "";
		let bucket: Bucket;
		beforeAll(async () => {
			const storage = new Storage({
				projectId: env.BACKUP_GCS_PROJECT_ID_SQLITE,
				credentials: {
					private_key: env.BACKUP_GCS_PRIVATE_KEY_SQLITE,
					client_id: env.BACKUP_GCS_CLIENT_ID_SQLITE,
					client_email: env.BACKUP_GCS_CLIENT_EMAIL_SQLITE,
					type: "service_account"
				},
				timeout: 30000
			});
			bucket = storage.bucket(env.BACKUP_BUCKET_NAME_SQLITE!);
			const path = await backupDb("GOOGLE_CLOUD_STORAGE");
			pathBakDb = path;
		});
		it("should successfully backup the database file to Google Cloud Storage", async () => {
			const [exists] = await bucket.file(env.BACKUP_BUCKET_DIR_SQLITE + "/" + basename(pathBakDb)).exists();
			expect(exists).toBeTrue();
		});
		it("should successfully restore the database file from Google Cloud Storage", async () => {
			const pathBucketBakDb = env.BACKUP_BUCKET_DIR_SQLITE + "/" + basename(pathBakDb);
			const [buffer] = await bucket.file(pathBucketBakDb).download();
			await write("/tmp/tasks/gcs/" + basename(pathBakDb), buffer);
			await sleep(1);
			await extract({
				file: pathBakDb,
				cwd: "/tmp/tasks/gcs"
			});
			// Tasks
			const pathDb1 = "/tmp/tasks/gcs/" + basename(env.PATH_SQLITE);
			const db1 = new Database(pathDb1, { strict: true, create: false });
			const raw1 = db1.prepare<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const owner = raw1.get("table", "owner");
			expect(owner).not.toBeNull();
			expect(owner?.name).toBe("owner");
			const queue = raw1.get("table", "queue");
			expect(queue).not.toBeNull();
			expect(queue?.name).toBe("queue");
			const config = raw1.get("table", "config");
			expect(config).not.toBeNull();
			expect(config?.name).toBe("config");
			// Throttle
			const pathDb2 = "/tmp/tasks/gcs/" + basename(env.PATH_SQLITE).replace(".db", "-throttle.db");
			const db2 = new Database(pathDb2, { strict: true, create: false });
			const raw2 = db2.query<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const control = raw2.get("table", "control");
			expect(control).not.toBeNull();
			expect(control?.name).toBe("control");
			// Timeframe
			const pathDb3 = "/tmp/tasks/gcs/" + basename(env.PATH_SQLITE).replace(".db", "-timeframe.db");
			const db3 = new Database(pathDb3, { strict: true, create: false });
			const raw3 = db3.query<{ name: string }, [string, string]>("SELECT name FROM sqlite_master WHERE type = ?1 AND name = ?2");
			const timeframe = raw3.get("table", "timeframe");
			expect(timeframe).not.toBeNull();
			expect(timeframe?.name).toBe("timeframe");
		});
		afterAll(async () => {
			await Promise.all([
				bucket.file(env.BACKUP_BUCKET_DIR_SQLITE + "/" + basename(pathBakDb)).delete(),
				rm("/tmp/tasks/gcs", {
					force: true,
					recursive: true
				})
			]);
		});
	});
});