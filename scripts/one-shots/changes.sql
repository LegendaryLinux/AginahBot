START TRANSACTION;

/* Update statements here */
ALTER TABLE guild_data
ADD gCalendarId VARCHAR(128);

ALTER TABLE scheduled_events
ADD gEventId VARCHAR(128);

/* Testing queries here */

/* Clean up your tests */
-- TRUNCATE TABLE newTable;

COMMIT;