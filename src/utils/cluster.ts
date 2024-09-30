import { env } from "bun";

import { cpus } from "node:os";

import { inRange, safeInteger } from "./common";

export const MAX_INSTANCES = getInstances();
export const clusterMode = getMode();

function getInstances(): number {
	if (env.CLUSTER_MODE == "1") {
		if (env.MAX_INSTANCES == "MAX") {
			return cpus().length;
		}
		const size = safeInteger(env.MAX_INSTANCES);
		if (inRange(size, 2, cpus().length)) {
			return size;
		}
		return cpus().length;
	}
	return 1;
}

function getMode(): ClusterMode {
	const size = getInstances();
	if (env.CLUSTER_MODE == "1" && inRange(size, 2, cpus().length)) {
		return "ACTIVE";
	}
	return "INACTIVE";
}