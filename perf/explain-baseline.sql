\pset pager off
\timing on

\echo '==================== Q1: DEALS LIST (cursor pagination) ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM deal
WHERE portal_id='cif2iq142k61o6oaqooceeem' AND archived=false
ORDER BY created_at DESC, id DESC LIMIT 51;

\echo '==================== Q2: CONTACTS LIST (cursor pagination) ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM contact
WHERE portal_id='cif2iq142k61o6oaqooceeem' AND archived=false
ORDER BY created_at DESC, id DESC LIMIT 51;

\echo '==================== Q4: FINANCE SUMMARY - fetch invoices in period (actual code) ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM invoice
WHERE portal_id='cif2iq142k61o6oaqooceeem' AND archived=false
  AND issue_date BETWEEN (now()-interval '365 days')::date AND now()::date;

\echo '==================== Q4b: FINANCE SUMMARY - same as SQL aggregation (proposed) ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT status, COUNT(*), SUM(amount_base) FROM invoice
WHERE portal_id='cif2iq142k61o6oaqooceeem' AND archived=false
  AND issue_date BETWEEN (now()-interval '365 days')::date AND now()::date
GROUP BY status;

\echo '==================== Q5: OUTSTANDING - open invoices + payments join (proposed SQL) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT SUM(i.amount_base - COALESCE(p.total,0))
FROM invoice i
LEFT JOIN (SELECT invoice_id, SUM(amount_base) total FROM payment GROUP BY invoice_id) p ON i.id=p.invoice_id
WHERE i.portal_id='cif2iq142k61o6oaqooceeem' AND i.archived=false AND i.status IN ('sent','overdue');

\echo '==================== Q6a: TIMELINE - email_send by deal_id (no index?) ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM email_send
WHERE portal_id='cif2iq142k61o6oaqooceeem' AND deal_id='seedd100'
ORDER BY sent_at DESC LIMIT 100;

\echo '==================== Q6b: TIMELINE - email_event per email (N+1 unit) ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT type FROM email_event WHERE email_id='seedes100' LIMIT 50;

\echo '==================== Q6c: TIMELINE - notes by deal ===================='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM note WHERE deal_id='seedd100' ORDER BY created_at DESC;

\echo '==================== Q7: FOCUS - last activity per open deal (calls) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT deal_id, MAX(occurred_at) FROM call
WHERE portal_id='cif2iq142k61o6oaqooceeem'
GROUP BY deal_id;

\echo '==================== Q8: DASHBOARD - pipeline funnel (deals by stage) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT ps.id, COUNT(d.id), COALESCE(SUM(d.amount),0)
FROM pipeline_stage ps
INNER JOIN pipeline p ON ps.pipeline_id=p.id AND p.portal_id='cif2iq142k61o6oaqooceeem' AND p.archived=false
LEFT JOIN deal d ON d.stage_id=ps.id AND d.archived=false
GROUP BY ps.id, ps.display_order ORDER BY ps.display_order;

\echo '==================== Q9: REPORTS - conversion by source (JSONB group by) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT COALESCE(NULLIF(TRIM(custom->>'source'),''),'Sin fuente') src,
       COUNT(*), COUNT(*) FILTER (WHERE lifecycle_stage='customer')
FROM contact WHERE portal_id='cif2iq142k61o6oaqooceeem' AND archived=false
GROUP BY 1 ORDER BY 2 DESC;

\echo '==================== Q10: FINANCE - monthly income (to_char group by) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT to_char(paid_at,'YYYY-MM'), SUM(amount_base) FROM payment
WHERE portal_id='cif2iq142k61o6oaqooceeem' AND paid_at >= now()-interval '365 days'
GROUP BY 1;

\echo '==================== Q11: RECORD_HISTORY by entity (timeline/audit) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM record_history
WHERE entity_type='deal' AND entity_id='seedd100' ORDER BY changed_at DESC;

\echo '==================== Q12: TASKS list (200 cap, order createdAt) ===================='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM task WHERE portal_id='cif2iq142k61o6oaqooceeem'
ORDER BY created_at DESC LIMIT 200;
