import { env } from "bun";

import { inRange, safeInteger } from "./common";

export const MAX_INSTANCES = getInstances();
export const clusterMode = getMode();

function getInstances(): number {
	if (env.CLUSTER_MODE == "1") {
		if (env.MAX_INSTANCES == "MAX") {
			return navigator.hardwareConcurrency;
		}
		const size = safeInteger(env.MAX_INSTANCES);
		if (inRange(size, 2, navigator.hardwareConcurrency)) {
			return size;
		}
		return navigator.hardwareConcurrency;
	}
	return 1;
}

function getMode(): ClusterMode {
	const size = getInstances();
	if (env.CLUSTER_MODE == "1" && inRange(size, 2, navigator.hardwareConcurrency)) {
		return "ACTIVE";
	}
	return "INACTIVE";
}