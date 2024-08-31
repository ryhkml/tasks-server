PRAGMA synchronous = FULL;
PRAGMA temp_store = MEMORY;

CREATE TABLE timeframe (
	id 				INTEGER PRIMARY KEY,
	lastRecordAt	INTEGER NOT NULL
);