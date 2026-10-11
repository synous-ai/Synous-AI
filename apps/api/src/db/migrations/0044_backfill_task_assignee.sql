-- Backfill: cada tarea con responsable primario (task.assigned_to) pasa a tener
-- su fila en task_assignee. Idempotente (ON CONFLICT DO NOTHING).
INSERT INTO "task_assignee" ("task_id", "hub_user_id")
SELECT "id", "assigned_to" FROM "task" WHERE "assigned_to" IS NOT NULL
ON CONFLICT DO NOTHING;
