-- 0014_member_preferences_rename
--
-- Renames `preferences.seniorsFriendly` to `preferences.ageGroupFriendly` in
-- existing `member` rows. The schema default (`member.preferences`) was changed
-- to `ageGroupFriendly` in commit 8932808 but no data migration was shipped,
-- so any rows inserted before that change still carry the old key. See
-- GitHub issue #61.
--
-- The CASE/`json('true'|'false')` dance preserves the JSON boolean type:
-- `json_extract` returns SQLite integers (0/1) for JSON booleans, and
-- feeding that integer back into `json_set` would store `1`/`0`, not
-- `true`/`false`.

UPDATE `member`
SET `preferences` = json_remove(
    json_set(
      `preferences`,
      '$.ageGroupFriendly',
      json(CASE json_extract(`preferences`, '$.seniorsFriendly') WHEN 1 THEN 'true' ELSE 'false' END)
    ),
    '$.seniorsFriendly'
  )
WHERE json_extract(`preferences`, '$.seniorsFriendly') IS NOT NULL;
