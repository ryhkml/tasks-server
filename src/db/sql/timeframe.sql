PRAGMA journal_mode = WAL;
PRAGMA wal_checkpoint(FULL);
PRAGMA synchronous = FULL;
PRAGMA temp_store = MEMORY;

CREATE TABLE timeframe (
	id 				INTEGER PRIMARY KEY,
	lastRecordAt	INTEGER NOT NULL
);