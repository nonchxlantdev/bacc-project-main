-- Phase 3: approvals, checklist instances, notifications.
-- Do not run from the app. Timezone for due logic is America/Belize (UTC−6).

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('checklist_submission','work_order')),
  entity_id uuid not null,
  approval_role text not null
    check (approval_role in ('om_acknowledgment','om_coo_verification','cec_clearance')),
  assigned_to uuid references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  signature_image_path text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  template_version text not null,
  assignment_rule_id uuid references public.checklist_assignment_rules(id),
  assigned_role text,
  assigned_department text,
  assigned_user uuid references auth.users(id),
  location_id uuid,
  period_start date not null,
  period_end date not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','overdue','missed')),
  submission_id uuid references public.checklist_submissions(id),
  created_at timestamptz not null default now(),
  unique (assignment_rule_id, period_start)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists approvals_assignee_idx on public.approvals (assigned_to, status, created_at desc);
create index if not exists instances_due_idx on public.checklist_instances (due_at, status);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
