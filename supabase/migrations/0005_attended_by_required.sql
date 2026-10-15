-- Every complaint must record the staff member who attended the customer.
-- Run in Supabase -> SQL Editor after 0004.

-- Complaints saved before this rule without a name are marked so the rule can apply to all rows.
update public.complaints
set attended_by = 'Not recorded'
where attended_by is null or btrim(attended_by) = '';

alter table public.complaints alter column attended_by set not null;
alter table public.complaints
  add constraint complaints_attended_by_required check (length(btrim(attended_by)) between 1 and 100);
