ALTER TABLE "library_item" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_kind_check" CHECK ("library_item"."kind" IS NULL OR "library_item"."kind" IN ('procedure','checklist'));--> statement-breakpoint
-- Backfill (consolidación SOP + Checklist en una sola entidad operativa):
-- 1) Los SOPs existentes pasan a ser la variante 'procedure' (procedimiento ordenado).
UPDATE "library_item" SET "kind" = 'procedure' WHERE "type" = 'sop' AND "kind" IS NULL AND "archived" = false;--> statement-breakpoint
-- 2) Los checklists existentes se reclasifican: dejan de ser un type aparte y pasan a
--    ser type='sop' + kind='checklist'. Solo los activos (los archivados quedan como
--    estaban; el type 'checklist' sigue siendo válido en el CHECK para esas filas).
UPDATE "library_item" SET "type" = 'sop', "kind" = 'checklist' WHERE "type" = 'checklist' AND "archived" = false;