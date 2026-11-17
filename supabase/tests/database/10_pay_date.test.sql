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
  ('R-PAYDATE-001: Saturday, nearest -> Friday',            2025, 1, 25, 'nearest',  '2025-01-24'),
  ('R-PAYDATE-003: Saturday, previous -> Friday',           2025, 1, 25, 'previous', '2025-01-24'),
  ('R-PAYDATE-004: Saturday, next -> Monday',               2025, 1, 25, 'next',     '2025-01-27'),
  ('R-PAYDATE-005: Saturday, none -> Saturday',             2025, 1, 25, 'none',     '2025-01-25'),
  -- 25 May 2025 is a Sunday
  ('R-PAYDATE-002: Sunday, nearest -> Monday',              2025, 5, 25, 'nearest',  '2025-05-26'),
  ('R-PAYDATE-003: Sunday, previous -> Friday',             2025, 5, 25, 'previous', '2025-05-23'),
  ('R-PAYDATE-004: Sunday, next -> Monday',                 2025, 5, 25, 'next',     '2025-05-26'),
  ('R-PAYDATE-005: Sunday, none -> Sunday',                 2025, 5, 25, 'none',     '2025-05-25'),
  -- weekday: no change whatever the rule
  ('R-PAYDATE-007: weekday, nearest unchanged',             2026, 11, 25, 'nearest', '2026-11-25'),
  ('R-PAYDATE-004 R-PAYDATE-007: weekday, next unchanged',                2026, 11, 25, 'next',    '2026-11-25'),
  -- month-end clamping
  ('R-PAYDATE-006: 31 in Feb 2025 -> 28 Feb (Friday)',      2025, 2, 31, 'nearest',  '2025-02-28'),
  ('R-PAYDATE-006: 30 in Feb 2025 -> 28 Feb',               2025, 2, 30, 'nearest',  '2025-02-28'),
  ('R-PAYDATE-006: 29 in Feb 2025 -> 28 Feb',               2025, 2, 29, 'nearest',  '2025-02-28'),
  ('R-PAYDATE-006: 29 in Feb 2024 (leap) -> 29 Feb',        2024, 2, 29, 'nearest',  '2024-02-29'),
  ('R-PAYDATE-006: 31 in Feb 2024 (leap) -> 29 Feb',        2024, 2, 31, 'nearest',  '2024-02-29'),
  ('R-PAYDATE-006: 30 in Feb 2023 -> 28 Feb (Tuesday)',     2023, 2, 30, 'none',     '2023-02-28'),
  ('R-PAYDATE-006: 31 in April -> 30 April',                2026, 4, 31, 'none',     '2026-04-30'),
  ('R-PAYDATE-006: clamp then weekend: 31 Feb 2026 = Sat 28 -> Fri 27',
                                             2026, 2, 31, 'nearest',  '2026-02-27'),
  ('R-PAYDATE-004 R-PAYDATE-006: clamp then weekend: 31 Feb 2026, next -> Mon 2 Mar',
                                             2026, 2, 31, 'next',     '2026-03-02'),
  -- the 1st shifting into the previous month
  ('R-PAYDATE-001: 1 Nov 2025 (Sat), nearest -> 31 Oct',    2025, 11, 1, 'nearest',  '2025-10-31'),
  ('R-PAYDATE-003: 1 Feb 2026 (Sun), previous -> 30 Jan',   2026, 2, 1, 'previous',  '2026-01-30'),
  ('R-PAYDATE-002: 1 Feb 2026 (Sun), nearest -> 2 Feb',     2026, 2, 1, 'nearest',   '2026-02-02'),
  -- year boundaries
  ('R-PAYDATE-001: 1 Jan 2028 (Sat), nearest -> 31 Dec 2027', 2028, 1, 1, 'nearest', '2027-12-31'),
  ('R-PAYDATE-004: 31 Dec 2028 (Sun), next -> 1 Jan 2029',  2028, 12, 31, 'next',    '2029-01-01'),
  ('R-PAYDATE-003: 31 Dec 2028 (Sun), previous -> 29 Dec',  2028, 12, 31, 'previous', '2028-12-29');

select plan((select count(*)::integer from cases) + 7);

select is(public.pay_date(year, month, pay_day, rule), expected, label) from cases;

select is(
  public.pay_date(2026, 11, 25),
  '2026-11-25'::date,
  'R-INCOME-005 R-PAYDATE-007 C-LOGIC-002: the weekend rule defaults to nearest'
);
select throws_ok(
  'select public.pay_date(2026, 11, 32)',
  'P0001',
  'invalid_pay_day',
  'R-INCOME-004: a pay day above 31 is rejected'
);
select throws_ok(
  'select public.pay_date(2026, 13, 1)',
  'P0001',
  'invalid_pay_day',
  'R-INCOME-004: a month above 12 is rejected'
);

-- "Today" is the Europe/Zurich calendar date, decided by the database.
select is(
  private.today(),
  (now() at time zone 'Europe/Zurich')::date,
  'R-PERIOD-017: private.today() is the current date in Europe/Zurich'
);
select matches(
  (select prosrc from pg_proc where oid = 'private.today()'::regprocedure),
  'Europe/Zurich',
  'R-PERIOD-017: private.today() is defined in the Europe/Zurich time zone, not the server''s or UTC'
);

-- Whatever the session's time zone, today is Zurich's date: at any moment the date at
-- UTC+14 or the one at UTC-11 differs from Zurich's, so current_date would fail one of these.
set local timezone = 'Pacific/Kiritimati';
select is(private.today(), (now() at time zone 'Europe/Zurich')::date,
  'R-PERIOD-017: today does not follow a session time zone of UTC+14');
set local timezone = 'Pacific/Pago_Pago';
select is(private.today(), (now() at time zone 'Europe/Zurich')::date,
  'R-PERIOD-017: nor one of UTC-11');
reset timezone;

select * from finish();
rollback;
