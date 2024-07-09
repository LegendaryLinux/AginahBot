START TRANSACTION;

/* Update statements here */
ALTER TABLE guild_data
ADD googleCalendarId VARCHAR(128);

ALTER TABLE scheduled_events
ADD googleEventId VARCHAR(128);

/* Testing queries here */

/* Clean up your tests */
-- TRUNCATE TABLE newTable;

COMMIT;