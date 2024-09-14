import { UTCDate } from "@date-fns/utc";
import { env, write } from "bun";

import { rmSync } from "node:fs";
import { basename, dirname } from "node:path";

import { Storage } from "@google-cloud/storage";
import { create } from "tar";

export async function backupDb(method: SqliteBackupMethod = "LOCAL"): Promise<string> {
	const filename = basename(env.PATH_SQLITE).replace(".db", "-" + new UTCDate().toISOString()) + ".db.tar.gz";
	if (method == "GOOGLE_CLOUD_STORAGE") {
		const pathBakDb = "/tmp/tasks/gcs/" + filename;
		await write("/tmp/tasks/gcs/.keep", "OK");
		await create({
			cwd: dirname(env.PATH_SQLITE),
			file: pathBakDb,
			follow: false,
			gzip: true,
			filter: path => !path.includes(".gitkeep")
		}, ["./"]);
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
		await storage.bucket(env.BACKUP_BUCKET_NAME_SQLITE).upload(pathBakDb, {
			destination: env.BACKUP_BUCKET_DIR_SQLITE + "/" + filename,
			metadata: {
				contentType: "application/tar+gzip"
			}
		});
		rmSync(dirname(pathBakDb), {
			force: true,
			recursive: true
		});
		return pathBakDb;
	}
	const pathBakDb = env.BACKUP_DIR_SQLITE + "/" + filename;
	await write(env.BACKUP_DIR_SQLITE + "/.keep", "OK");
	await create({
		cwd: dirname(env.PATH_SQLITE),
		file: pathBakDb,
		follow: false,
		gzip: true,
		filter: path => !path.includes(".gitkeep")
	}, ["./"]);
	return pathBakDb;
}