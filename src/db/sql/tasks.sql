PRAGMA journal_mode = WAL;
PRAGMA wal_checkpoint(FULL);
PRAGMA foreign_keys = ON;
PRAGMA synchronous = FULL;
PRAGMA temp_store = MEMORY;
PRAGMA page_size = 8192;
PRAGMA busy_timeout = 30000;

CREATE TABLE owner (
	id					TEXT UNIQUE PRIMARY KEY,
	key					TEXT NOT NULL,
	name				TEXT UNIQUE NOT NULL,
	createdAt			INTEGER NOT NULL,
	tasksInQueue		INTEGER NULL DEFAULT 0,
	tasksInQueueLimit	INTEGER NULL DEFAULT 1000
);

CREATE INDEX idxIdName ON owner(id, name);
CREATE INDEX idxIdNameTasksInQueue ON owner(id, name, tasksInQueue);
CREATE INDEX idxIdTasksInQueueLimit ON owner(id, tasksInQueue, tasksInQueueLimit);

CREATE TRIGGER deleteUnusedQueue
AFTER DELETE ON owner
BEGIN
	DELETE FROM queue WHERE ownerId = OLD.id;
END;

--

CREATE TABLE queue (
	id						TEXT UNIQUE PRIMARY KEY,
	ownerId 				TEXT NOT NULL,
	state 					TEXT NULL DEFAULT 'RUNNING',
	statusCode 				INTEGER NULL DEFAULT 0,
	createdAt 				INTEGER NOT NULL,
	estimateEndAt 			INTEGER NULL DEFAULT 0,
	estimateExecutionAt 	INTEGER NOT NULL,
	response				TEXT NULL,
	metadata				TEXT NULL,
	FOREIGN KEY (ownerId) REFERENCES owner(id)
);

CREATE INDEX idxOwnerId ON queue(ownerId);
CREATE INDEX idxState ON queue(state);
CREATE INDEX idxIdStateOwnerId ON queue(id, state);

CREATE TRIGGER incrementTasksInQueue
BEFORE INSERT ON queue
WHEN NEW.state = 'RUNNING'
BEGIN
	UPDATE owner SET tasksInQueue = tasksInQueue + 1 WHERE id = NEW.ownerId;
END;

CREATE TRIGGER decrementTasksInQueue
BEFORE UPDATE OF state ON queue
WHEN NEW.state IN ('SUCCESS', 'REVOKED', 'ERROR') AND OLD.state = 'RUNNING'
BEGIN
	UPDATE owner SET tasksInQueue = tasksInQueue - 1 WHERE id = NEW.ownerId;
	UPDATE config SET retrying = 0, estimateNextRetryAt = 0 WHERE id = NEW.id AND retrying = 1;
END;

CREATE TRIGGER deleteUnusedConfig
AFTER DELETE ON queue
BEGIN
	UPDATE owner SET tasksInQueue = tasksInQueue - 1 WHERE id = OLD.ownerId AND OLD.state IN ('RUNNING', 'PAUSED');
	DELETE FROM config WHERE id = OLD.id;
END;

--

CREATE TABLE config (
	id						TEXT UNIQUE PRIMARY KEY,
	url 					TEXT NULL,
	method 					TEXT NULL,
	data 					TEXT NULL,
	cookie 					TEXT NULL,
	query 					TEXT NULL,
	headers 				TEXT NULL,
	authBasic 				TEXT NULL,
	authDigest 				TEXT NULL,
	authNtlm 				TEXT NULL,
	authAwsSigv4			TEXT NULL,
	executionDelay 			INTEGER NULL DEFAULT 1,
	executeAt 				TEXT NULL,
	executeImmediately 		INTEGER NULL DEFAULT 0,
	retry 					INTEGER NULL DEFAULT 0,
	retryAt 				TEXT NULL,
	retrying 				INTEGER NULL DEFAULT 0,
	retryCount 				INTEGER NULL DEFAULT 0,
	retryLimit 				INTEGER NULL DEFAULT 0,
	retryInterval 			INTEGER NULL DEFAULT 0,
	retryExponential 		INTEGER NULL DEFAULT 1,
	ignoreStatusCode 		TEXT NULL DEFAULT '[]',
	estimateNextRetryAt 	INTEGER NULL DEFAULT 0,
	timeout 				INTEGER NULL DEFAULT 30000,
	timeoutAt 				TEXT NULL,
	ca						TEXT NULL,
	cert					TEXT NULL,
	certType				TEXT NULL,
	certStatus				INTEGER NULL,
	key						TEXT NULL,
	keyType					TEXT NULL,
	location				INTEGER NULL DEFAULT 1,
	locationTrusted			TEXT NULL,
	proto					TEXT NULL,
	protoRedirect			TEXT NULL,
	dnsServer				TEXT NULL,
	dohUrl					TEXT NULL,
	dohInsecure				INTEGER NULL DEFAULT 0,
	httpVersion				TEXT NULL DEFAULT '1.1',
	insecure				INTEGER NULL DEFAULT 0,
	refererUrl				TEXT NULL,
	redirectAttempts		INTEGER NULL DEFAULT 8,
	keepAliveDuration		INTEGER NULL DEFAULT 30,
	resolve					TEXT NULL,
	ipVersion				INTEGER,
	hsts					TEXT NULL,
	sessionId				INTEGER NULL DEFAULT 1,
	tlsVersion				TEXT NULL,
	tlsMaxVersion			TEXT NULL,
	haProxyClientIp			TEXT NULL,
	haProxyProtocol			INTEGER NULL,
	proxy					TEXT NULL,
	proxyAuthBasic			TEXT NULL,
	proxyAuthDigest			TEXT NULL,
	proxyAuthNtlm			TEXT NULL,
	proxyHeaders			TEXT NULL,
	proxyHttpVersion		TEXT NULL DEFAULT '1.1',
	proxyInsecure			INTEGER NULL DEFAULT 0,
	traceResponseData		INTEGER NULL DEFAULT 1,
	FOREIGN KEY (id) REFERENCES queue(id)
);

CREATE INDEX idxIdRetrying ON config(id, retrying);

CREATE TRIGGER incrementRetryCount
BEFORE UPDATE OF retrying ON config
WHEN NEW.retrying = 1
BEGIN
	UPDATE config SET retryCount = retryCount + 1 WHERE id = NEW.id;
END;

--

CREATE TABLE timeframe (
	id 				INTEGER PRIMARY KEY,
	lastRecordAt	INTEGER NOT NULL,
	data			TEXT NULL,
    exit            INTEGER NULL DEFAULT NULL
);