/**
 * This method is in the experimental stage for Tasks Server
 * Do not use in Docker environment
*/
import { env, spawn, Subprocess } from "bun";

// Get CPU cores
const cpus = navigator.hardwareConcurrency;
const buns = new Array(cpus) as Subprocess<"inherit">[];

for (let i = 0; i < cpus; i++) {
	buns[i] = spawn({
		cmd: ["./tasks-server"],
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
		env: {
			...env,
			SPAWN_INSTANCE: i.toString(),
			CLUSTER_MODE: "1",
			NODE_ENV: "production"
		}
	});
}

function kill(): void {
	for (let i = 0; i < buns.length; i++) {
		const bun = buns[i];
		bun.kill();	
	}
}

process.on("SIGINT", kill);
process.on("exit", kill);