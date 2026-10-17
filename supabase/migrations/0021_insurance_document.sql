-- Insurance can be ticked under "Documents received" on a complaint. Run after 0020.

alter table public.complaints drop constraint if exists complaints_documents_check;
alter table public.complaints add constraint complaints_documents_check
  check (documents <@ array['rc', 'pollution', 'licence', 'insurance']::text[]);
