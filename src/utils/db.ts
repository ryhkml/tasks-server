import { env, spawnSync } from "bun";
import { Database } from "bun:sqlite";

import { isEmpty } from "./common";

export function query<T>(raw: string): T[] | null {
	const options = ["-bail", "-nofollow", "-noheader", "-json"];
	const { stdout, success } = spawnSync(["sqlcipher", env.PATH_SQLITE, ...options, `PRAGMA key = '${env.PRAGMA_KEY_SQLITE}'`, raw], {
		env: {}
	});
	if (success) {
		const res = stdout.toString().trim().split("\n").filter((v, i) => !!v && i != 0).join("");
		if (isEmpty(res)) {
			return null;
		}
		return JSON.parse(res) as T[];
	}
	return null;
}

export function timeframeDb(path: string): Database {
	return new Database(path, { strict: true });
}