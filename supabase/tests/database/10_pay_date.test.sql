-- Pay-date calculation (public.pay_date), as a table of cases. Pure: no data involved.
begin;

create temp table cases (
  label text,
  year integer,
  month integer,
  pay_day integer,
  rule public.weekend_rule,
  expected date
) on commit drop;

insert into cases values
  -- 25 Jan 2025 is a Saturday
  ('Saturday, nearest -> Friday',            2025, 1, 25, 'nearest',  '2025-01-24'),
  ('Saturday, previous -> Friday',           2025, 1, 25, 'previous', '2025-01-24'),
  ('Saturday, next -> Monday',               2025, 1, 25, 'next',     '2025-01-27'),
  ('Saturday, none -> Saturday',             2025, 1, 25, 'none',     '2025-01-25'),
  -- 25 May 2025 is a Sunday
  ('Sunday, nearest -> Monday',              2025, 5, 25, 'nearest',  '2025-05-26'),
  ('Sunday, previous -> Friday',             2025, 5, 25, 'previous', '2025-05-23'),
  ('Sunday, next -> Monday',                 2025, 5, 25, 'next',     '2025-05-26'),
  ('Sunday, none -> Sunday',                 2025, 5, 25, 'none',     '2025-05-25'),
  -- weekday: no change whatever the rule
  ('weekday, nearest unchanged',             2026, 11, 25, 'nearest', '2026-11-25'),
  ('weekday, next unchanged',                2026, 11, 25, 'next',    '2026-11-25'),
  -- month-end clamping
  ('31 in Feb 2025 -> 28 Feb (Friday)',      2025, 2, 31, 'nearest',  '2025-02-28'),
  ('30 in Feb 2025 -> 28 Feb',               2025, 2, 30, 'nearest',  '2025-02-28'),
  ('29 in Feb 2025 -> 28 Feb',               2025, 2, 29, 'nearest',  '2025-02-28'),
  ('29 in Feb 2024 (leap) -> 29 Feb',        2024, 2, 29, 'nearest',  '2024-02-29'),
  ('31 in Feb 2024 (leap) -> 29 Feb',        2024, 2, 31, 'nearest',  '2024-02-29'),
  ('30 in Feb 2023 -> 28 Feb (Tuesday)',     2023, 2, 30, 'none',     '2023-02-28'),
  ('31 in April -> 30 April',                2026, 4, 31, 'none',     '2026-04-30'),
  ('clamp then weekend: 31 Feb 2026 = Sat 28 -> Fri 27',
                                             2026, 2, 31, 'nearest',  '2026-02-27'),
  ('clamp then weekend: 31 Feb 2026, next -> Mon 2 Mar',
                                             2026, 2, 31, 'next',     '2026-03-02'),
  -- the 1st shifting into the previous month
  ('1 Nov 2025 (Sat), nearest -> 31 Oct',    2025, 11, 1, 'nearest',  '2025-10-31'),
  ('1 Feb 2026 (Sun), previous -> 30 Jan',   2026, 2, 1, 'previous',  '2026-01-30'),
  ('1 Feb 2026 (Sun), nearest -> 2 Feb',     2026, 2, 1, 'nearest',   '2026-02-02'),
  -- year boundaries
  ('1 Jan 2028 (Sat), nearest -> 31 Dec 2027', 2028, 1, 1, 'nearest', '2027-12-31'),
  ('31 Dec 2028 (Sun), next -> 1 Jan 2029',  2028, 12, 31, 'next',    '2029-01-01'),
  ('31 Dec 2028 (Sun), previous -> 29 Dec',  2028, 12, 31, 'previous', '2028-12-29');

select plan((select count(*)::integer from cases) + 3);

select is(public.pay_date(year, month, pay_day, rule), expected, label) from cases;

select is(
  public.pay_date(2026, 11, 25),
  '2026-11-25'::date,
  'the weekend rule defaults to nearest'
);
select throws_ok(
  'select public.pay_date(2026, 11, 32)',
  'P0001',
  'invalid_pay_day',
  'a pay day above 31 is rejected'
);
select throws_ok(
  'select public.pay_date(2026, 13, 1)',
  'P0001',
  'invalid_pay_day',
  'a month above 12 is rejected'
);

select * from finish();
rollback;
