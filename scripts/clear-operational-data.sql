-- Clean slate: wipe filed work, keep catalogue + staff.
-- Run in Supabase Dashboard → SQL Editor (service role / postgres).
-- Does NOT delete profiles, checklist_templates, or assignment_rules.

begin;

-- Bypass immutability triggers for this session
set local session_replication_role = replica;

truncate table
  public.incident_attachments,
  public.incident_updates,
  public.work_order_signoffs,
  public.work_orders,
  public.incidents,
  public.approvals,
  public.notifications,
  public.checklist_signoffs,
  public.checklist_items,
  public.checklist_submissions,
  public.checklist_instances,
  public.incident_year_counters,
  public.work_order_year_counters
restart identity cascade;

-- Operational audit only (keep app_settings overrides)
delete from public.audit_log
where entity_type in (
  'checklist_submission',
  'incident',
  'work_order',
  'approval',
  'notification',
  'checklist_instance'
);

set local session_replication_role = origin;

commit;

-- Sanity check
select
  (select count(*) from public.checklist_submissions) as submissions,
  (select count(*) from public.incidents) as incidents,
  (select count(*) from public.checklist_templates) as templates,
  (select count(*) from public.profiles) as profiles;
