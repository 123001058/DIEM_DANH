# Group task assignments

## What it does

Group tasks appear for every current member of the task's team, including members added after the task was created. Workshop-wide tasks are assigned to every student. A student must claim an unclaimed workshop-wide task before completing it; only that student can claim it at a time. The claimant can release the task before it is completed. After completion, it is marked complete for everyone.

## Where it lives

- `supabase/migrations/20261011090000_sync_group_tasks_for_members.sql`
- `supabase/migrations/20261011100000_global_workshop_tasks.sql`
- `supabase/migrations/20261011110000_claim_global_tasks.sql`
- `supabase/migrations/20261011120000_release_global_task.sql`
- `supabase/schema.sql`
- `checkin.html` loads a student's tasks through `get_my_tasks()`.
- `admin.html` shows pending group tasks in the overview banner.

## How it works

`team_task_assignments` is the per-student link that lets `get_my_tasks()` find a task. A backfill repairs missing links for current group members. A trigger assigns existing group tasks to members who join later. Global tasks are linked to every student when created, and new student records are linked through a second trigger. `ON CONFLICT DO NOTHING` keeps existing progress intact. Completing a group or global task marks the shared task complete for everyone. Global-task claims are serialized by locking the task row, so two students cannot both claim the same task concurrently. Admin task cards and the Overview banner show who currently holds an active claim.

## Common mistake

Adding a member trigger only fixes future membership changes. Existing members need the one-time backfill too, or old tasks can remain invisible.
