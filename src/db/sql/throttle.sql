PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;

CREATE TABLE control (
	id					TEXT UNIQUE PRIMARY KEY,
	requestCount		INTEGER NOT NULL,
	lastRequestAt		INTEGER NOT NULL
);