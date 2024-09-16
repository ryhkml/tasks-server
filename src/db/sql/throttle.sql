PRAGMA journal_mode = WAL;
PRAGMA wal_checkpoint(FULL);
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 30000;

CREATE TABLE control (
	id					TEXT UNIQUE PRIMARY KEY,
	requestCount		INTEGER NOT NULL,
	lastRequestAt		INTEGER NOT NULL
);