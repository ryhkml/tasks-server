import { env, file, S3Client, write } from "bun";

import { rm } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { create } from "tar";

import { logError } from "./logger";

export async function backupDb(method: SqliteBackupMethod = "LOCAL"): Promise<string> {
	try {
		const filename = basename(env.PATH_SQLITE).replace(".db", "-" + new Date().toISOString()) + ".db.tar.gz";
		if (method == "OBJECT_STORAGE") {
			const pathBakDb = "/tmp/tasks/os/" + filename;
			await write("/tmp/tasks/os/.keep", "OK");
			await create(
				{
					cwd: dirname(env.PATH_SQLITE),
					file: pathBakDb,
					follow: false,
					gzip: true,
					filter: (path) => !path.includes(".gitkeep")
				},
				["./"]
			);
			const client = new S3Client({
				accessKeyId: env.BACKUP_OBJECT_STORAGE_ACCESS_KEY,
				secretAccessKey: env.BACKUP_OBJECT_STORAGE_SECRET_KEY,
				bucket: env.BACKUP_OBJECT_STORAGE_BUCKET_NAME,
				endpoint: env.BACKUP_OBJECT_STORAGE_ENDPOINT,
				region: env.S3_REGION || env.AWS_REGION,
				sessionToken: env.S3_SESSION_TOKEN || env.AWS_SESSION_TOKEN
			});
			const bakDbFile = file(pathBakDb);
			await client.file(env.BACKUP_OBJECT_STORAGE_PATH + "/" + filename).write(bakDbFile, {
				type: "application/tar+gzip"
			});
			await bakDbFile.unlink();
			return filename;
		}
		const pathBakDb = env.BACKUP_DIR_SQLITE + "/" + filename;
		await write(env.BACKUP_DIR_SQLITE + "/.keep", "OK");
		await create(
			{
				cwd: dirname(env.PATH_SQLITE),
				file: pathBakDb,
				follow: false,
				gzip: true,
				filter: (path) => !path.includes(".gitkeep")
			},
			["./"]
		);
		return pathBakDb;
	} catch (e) {
		rm("/tmp/tasks/os", {
			force: true,
			recursive: true
		});
		logError(String(e));
		throw e;
	}
}
