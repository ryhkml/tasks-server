declare module "bun" {
	interface Env {
		PORT: string;
		LOG: "0" | "1";
		// DB
		PATH_SQLITE: string;
		// DB Backup
		BACKUP_METHOD_SQLITE: "LOCAL" | "GOOGLE_CLOUD_STORAGE";
		BACKUP_DIR_SQLITE: string;
		BACKUP_GCS_PROJECT_ID_SQLITE: string;
		BACKUP_GCS_PRIVATE_KEY_SQLITE: string;
		BACKUP_GCS_CLIENT_ID_SQLITE: string;
		BACKUP_GCS_CLIENT_EMAIL_SQLITE: string;
		BACKUP_BUCKET_NAME_SQLITE: string;
		BACKUP_BUCKET_DIR_SQLITE: string;
		BACKUP_CRON_PATTERN_SQLITE: string;
		BACKUP_CRON_TZ_SQLITE: string;
		// 
		CONNECTIVITY_HOSTNAME: string;
		MAX_SIZE_BODY_REQUEST: string;
		MAX_SIZE_DATA_RESPONSE: string;
	}
}

type Var = {
	Variables: {
		ownerId: string;
		todayAt: number;
	}
}

type TaskState = "SUCCESS" | "ERROR" | "PAUSED" | "RUNNING";

interface OwnerTable {
	id: string;
	name: string;
	createdAt: number;
	key: string;
	tasksInQueue: number;
	tasksInQueueLimit: number;
}

interface QueueTable {
	id: string;
	ownerId: string;
	state: TaskState;
	statusCode: number;
	createdAt: number;
	expiredAt: number;
	estimateEndAt: number;
	estimateExecutionAt: number;
	response: string | null;
}