START TRANSACTION;

/* Update statements here */
ALTER TABLE guild_data ADD COLUMN googleCalendarId VARCHAR(256);

ALTER TABLE scheduled_events ADD COLUMN googleEventId VARCHAR(256);

/* Testing queries here */

/* Clean up your tests */
-- TRUNCATE TABLE newTable;

COMMIT;