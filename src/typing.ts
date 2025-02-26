declare module "bun" {
	interface Env {
		LOG: "0" | "1";
		LOG_TZ: string;
		PORT: string;
		SWAGGER_UI: "0" | "1";
		CIPHER_KEY: string;
		CLUSTER_MODE?: "0" | "1";
		MAX_INSTANCES?: string;
		// DB
		PATH_SQLITE: string;
		// DB Backup
		BACKUP_METHOD_SQLITE: "LOCAL" | "OBJECT_STORAGE";
		BACKUP_PATH_DIR_SQLITE: string;
		BACKUP_OBJECT_STORAGE_ENDPOINT: string;
		BACKUP_OBJECT_STORAGE_ACCESS_KEY: string;
		BACKUP_OBJECT_STORAGE_SECRET_KEY: string;
		BACKUP_OBJECT_STORAGE_BUCKET_NAME: string;
		BACKUP_OBJECT_STORAGE_PATH: string;
		BACKUP_CRON_PATTERN_SQLITE: string;
		BACKUP_CRON_TZ_SQLITE: string;
		//
		CONNECTIVITY_HOSTNAME: string;
		CONNECTIVITY_CHECK_INTERVAL: string;
		MAX_SIZE_BODY_REQUEST: string;
		MAX_SIZE_DATA_RESPONSE: string;
		MAX_THROTTLE_REQUEST: string;
		MAX_THROTTLE_TIME_WINDOW: string;
		DUMMY_TARGET_URL: string;
		// TLS/SSL
		PATH_TLS_CA?: string;
		PATH_TLS_KEY?: string;
		PATH_TLS_CERT?: string;
	}
}

type Var = {
	Variables: {
		clientId: string;
		ip: string;
		taskId: string;
		todayAt: number;
		userAgent: string | null;
	};
};

type RecordString = Record<string, string>;
type TaskState = "SUCCESS" | "REVOKED" | "ERROR" | "PAUSED" | "RUNNING";
type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type HttpVersion = "0.9" | "1.0" | "1.1" | "2" | "2-prior-knowledge";
type TlsVersion = "1.0" | "1.1" | "1.2" | "1.3";

type ClusterMode = "ACTIVE" | "INACTIVE";
type ConnectivityStatus = "ONLINE" | "OFFLINE";
type SqliteBackupMethod = "LOCAL" | "OBJECT_STORAGE";

interface TaskTable {
	id: string;
	name: string;
	createdAt: number;
	key: string;
	tasksInQueue: number;
	tasksInQueueLimit: number;
}

interface QueueTable {
	id: string;
	taskId: string;
	state: TaskState;
	statusCode: number;
	createdAt: number;
	estimateEndAt: number;
	estimateExecutionAt: number;
	response: string | null;
	metadata: string | null;
}

type ConfigTable = {
	id: string;
	/**
	 * ATTENTION
	 *
	 * `url` property must be decrypt first to become readable plain url
	 *
	 * @example decr(url, env.CHIPER_KEY)
	 */
	url: string;
	method: HttpMethod;
	/**
	 * ATTENTION
	 *
	 * `data` property must be decrypt first and then parse into an object
	 *
	 * @example JSON.parse(decr(data, env.CHIPER_KEY))
	 */
	data: string | null;
	/**
	 * ATTENTION
	 *
	 * `queryStringify` property must be decrypt first and then parse into an object
	 *
	 * @example JSON.parse(decr(queryStringify, env.CHIPER_KEY))
	 */
	query: string | null;
	/**
	 * ATTENTION
	 *
	 * `cookie` property must be decrypt first to become readable plain text
	 */
	cookie: string | null;
	/**
	 * ATTENTION
	 *
	 * `headersStringify` property must be decrypt first and then parse into an object
	 *
	 * @example JSON.parse(decr(headersStringify, env.CHIPER_KEY))
	 */
	headers: string | null;
	/**
	 * ATTENTION
	 *
	 * `authBasic` property must be decrypt first and then parse into an object
	 */
	authBasic: string | null;
	/**
	 * ATTENTION
	 *
	 * `authDigest` property must be decrypt first and then parse into an object
	 */
	authDigest: string | null;
	/**
	 * ATTENTION
	 *
	 * `authNtlm` property must be decrypt first and then parse into an object
	 */
	authNtlm: string | null;
	/**
	 * ATTENTION
	 *
	 * `authAwsSigv4` property must be decrypt first and then parse into an object
	 */
	authAwsSigv4: string | null;
	//
	transport: "fetch" | "curl" | null;
	executionDelay: number;
	executeAt: string | null;
	executeImmediately: number;
	retry: number;
	retryAt: string | null;
	retrying: number;
	retryCount: number;
	retryLimit: number;
	retryInterval: number;
	retryExponential: number;
	/**
	 * ATTENTION
	 *
	 * `ignoreStatusCode` property must be parse first to be an array number
	 *
	 * @example JSON.parse(ignoreStatusCode)
	 */
	ignoreStatusCode: string;
	estimateNextRetryAt: number;
	timeout: number;
	timeoutAt: string | null;
	//
	ca: string | null;
	/**
	 * ATTENTION
	 *
	 * `cert` property must be decrypt first and then parse into an object
	 */
	cert: string | null;
	certType: string | null;
	certStatus: number;
	key: string | null;
	keyType: string | null;
	//
	userAgent: string;
	traceResponseData: number;
	location: number | null;
	locationTrusted: string | null;
	proto: string | null;
	protoRedirect: string | null;
	/**
	 * ATTENTION
	 *
	 * `dnsServer` property must be decrypt first and then parse into an array string
	 */
	dnsServer: string | null;
	/**
	 * ATTENTION
	 *
	 * `dohUrl` property must be decrypt first to become readable plain url
	 */
	dohUrl: string | null;
	dohInsecure: number;
	httpVersion: HttpVersion;
	/**
	 * ATTENTION
	 *
	 * `refererUrl` property must be decrypt first to become readable plain url
	 */
	insecure: number;
	credentials: "include" | "omit" | "same-origin" | null;
	refererUrl: string | null;
	referrerPolicy:
		| ""
		| "no-referrer"
		| "no-referrer-when-downgrade"
		| "origin"
		| "origin-when-cross-origin"
		| "same-origin"
		| "strict-origin"
		| "strict-origin-when-cross-origin"
		| "unsafe-url"
		| null;
	mode: "cors" | "no-cors" | "same-origin" | null;
	redirectAttempts: number;
	keepAliveDuration: number;
	/**
	 * ATTENTION
	 *
	 * `resolve` property must be decrypt first and then parse into an array string
	 */
	resolve: string | null;
	ipVersion: 4 | 6;
	hsts: string | null;
	sessionId: number;
	tlsVersion: string | null;
	tlsMaxVersion: string | null;
	//
	haProxyClientIp: string | null;
	haProxyProtocol: number | null;
	//
	proxy: string | null;
	proxyAuthBasic: string | null;
	proxyAuthDigest: string | null;
	proxyAuthNtlm: string | null;
	proxyHeaders: string | null;
	proxyHttpVersion: string;
	proxyInsecure: number | null;
};

interface ControlTable {
	id: string;
	requestCount: number;
	lastRequestAt: number;
}

type StateHttpResponse = Extract<TaskState, "SUCCESS" | "ERROR">;
type HttpResponse = {
	/**
	 * This id is an http response identifier
	 */
	id: string;
	/**
	 * @returns string base64
	 */
	data: string | null;
	state: StateHttpResponse;
	status: number;
	statusText: string;
};
