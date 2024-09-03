PRAGMA foreign_keys = ON;
PRAGMA synchronous = FULL;
PRAGMA temp_store = MEMORY;
PRAGMA page_size = 8192;

CREATE TABLE owner (
	id					TEXT UNIQUE PRIMARY KEY,
	key					TEXT NOT NULL,
	name				TEXT UNIQUE NOT NULL,
	createdAt			INTEGER NOT NULL,
	tasksInQueue		INTEGER NULL DEFAULT 0,
	tasksInQueueLimit	INTEGER NULL DEFAULT 1000
);

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
	expiredAt 				INTEGER NULL DEFAULT 0,
	estimateEndAt 			INTEGER NULL DEFAULT 0,
	estimateExecutionAt 	INTEGER NOT NULL,
	response				TEXT NULL,
	FOREIGN KEY (ownerId) REFERENCES owner(id)
);

CREATE INDEX idxOwnerId ON queue(ownerId);
CREATE INDEX idxState ON queue(state);
CREATE INDEX idxIdOwnerId ON queue(id, ownerId);
CREATE INDEX idxIdState ON queue(id, state);
CREATE INDEX idxStateExpiredAt ON queue(state, expiredAt);

CREATE TRIGGER incrementTasksInQueue
AFTER INSERT ON queue
WHEN NEW.state = 'RUNNING'
BEGIN
	UPDATE owner SET tasksInQueue = tasksInQueue + 1 WHERE id = NEW.ownerId;
END;

CREATE TRIGGER decrementTasksInQueue
AFTER UPDATE OF state ON queue
WHEN NEW.state IN ('SUCCESS', 'ERROR') AND OLD.state = 'RUNNING'
BEGIN
	UPDATE owner SET tasksInQueue = tasksInQueue - 1 WHERE id = NEW.ownerId;
	UPDATE queue SET expiredAt = (STRFTIME('%s', 'now') * 1000) + 1296000000 WHERE id = NEW.id;
	UPDATE config SET retrying = 0, estimateNextRetryAt = 0 WHERE id = NEW.id AND retrying = 1;
END;

CREATE TRIGGER deleteUnusedConfig
AFTER DELETE ON queue
BEGIN
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
	executeAt 				INTEGER NULL DEFAULT 0,
	retry 					INTEGER NULL DEFAULT 0,
	retryAt 				INTEGER NULL DEFAULT 0,
	retrying 				INTEGER NULL DEFAULT 0,
	retryCount 				INTEGER NULL DEFAULT 0,
	retryLimit 				INTEGER NULL DEFAULT 0,
	retryInterval 			INTEGER NULL DEFAULT 0,
	retryStatusCode 		TEXT NULL DEFAULT '[]',
	retryExponential 		INTEGER NULL DEFAULT 1,
	estimateNextRetryAt 	INTEGER NULL DEFAULT 0,
	timeout 				INTEGER NULL DEFAULT 30000,
	timeoutAt 				INTEGER NULL DEFAULT 0,
	ca						TEXT NULL,
	cert					TEXT NULL,
	certType				TEXT NULL,
	certStatus				INTEGER NULL,
	key						TEXT NULL,
	keyType					TEXT NULL,
	location				INTEGER NULL DEFAULT 0,
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
	FOREIGN KEY (id) REFERENCES queue(id)
);

CREATE INDEX idxIdRetrying ON config(id, retrying);

CREATE TRIGGER incrementRetryCount
AFTER UPDATE OF retrying ON config
WHEN NEW.retrying = 1
BEGIN
	UPDATE config SET retryCount = retryCount + 1 WHERE id = NEW.id;
END;