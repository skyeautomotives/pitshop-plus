-- The customer's phone number is optional on bills and complaints. Run after 0028.
-- Left empty, it is saved as an empty text; a number that is given still needs 10 to 13 digits.

alter table public.bills drop constraint if exists bills_phone_check;
alter table public.bills add constraint bills_phone_check
  check (length(regexp_replace(phone, '\D', '', 'g')) = 0 or length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13);

alter table public.complaints drop constraint if exists complaints_phone_check;
alter table public.complaints add constraint complaints_phone_check
  check (length(regexp_replace(phone, '\D', '', 'g')) = 0 or length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13);
