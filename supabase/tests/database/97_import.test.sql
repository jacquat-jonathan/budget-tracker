-- Step 6, import: one implementation behind the preview, the write, the token and "import
-- anyway"; validation, duplicates by count, flags and remembered choices, salaries, possible
-- matches, merchant rules and the one-click rule, the "to categorise" category, review,
-- undo, chunks and idempotency, tokens.
begin;
select plan(107);

select tests.create_user('ivy', 'Ivy');
select tests.create_user('jon', 'Jon');
select tests.set_today('2026-11-16');
select tests.authenticate_as('ivy');
select tests.remember('b', public.create_budget('Imports', 'Salary', 500000, 25, 'nearest', '2026-09-01'));
select tests.remember('p1', (select id from public.periods where budget_id = tests.id('b') and seq = 1));
select tests.remember('food', (select id from public.create_category(tests.id('b'), 'Food', p_amount => 60000, p_from_period_id => tests.id('p1'))));
select tests.remember('fun', (select id from public.create_category(tests.id('b'), 'Fun', p_from_period_id => tests.id('p1'))));
select tests.remember('typed', (select id from public.add_transaction(tests.id('b'), 'expense', 1250, '2026-11-02', tests.id('food'), 'Coop Lausanne')));
create temp table spent_before on commit drop as
  select seq, spent_total from public.period_summaries where budget_id = tests.id('b');
grant select on spent_before to authenticated;

create temp table rows1 (j jsonb) on commit drop;
insert into rows1 values ('[
 {"date": "2026-11-02", "amount": 1250, "direction": "debit", "description": "Coop Lausanne"},
 {"date": "2026-11-02", "amount": 1250, "direction": "debit", "description": "Coop Lausanne"},
 {"date": "2026-11-03", "amount": 990, "direction": "debit", "description": "Achat PayUp *Shop 03.11.2026", "merchant": "PAYUP *SHOP",
  "details": {"purchase_time": "12:04", "card": "512345******9876", "original_currency": "EUR", "original_amount": "10.20", "exchange_rate": "0.9705"}},
 {"date": "2026-10-27", "amount": 500000, "direction": "credit", "description": "Paiement de salaire ACME"},
 {"date": "2026-11-05", "amount": 20000, "direction": "debit", "description": "Paiement Viseca", "merchant": "Viseca Payment Services SA", "hint": "card_bill_payment"},
 {"date": "2026-11-30", "amount": 100, "direction": "debit"},
 {"date": "2026-11-06", "amount": 1.5, "direction": "debit"},
 {"date": "2026-11-06", "amount": 300, "direction": "credit", "description": "Crédit TWINT Muster, Anna"},
 {"date": "2026-11-07", "amount": 4200, "direction": "debit", "description": "Achat Kino", "bank_transaction_id": "0400001234567890"},
 {"date": "2026-11-07", "amount": 77, "direction": "debit", "description": "Frais", "hint": "fee"},
 {"date": "2026-11-08", "amount": 15000, "direction": "debit", "description": "Achat ETF plan", "hint": "securities_purchase"},
 {"date": "2026-11-08", "amount": 15, "direction": "debit", "description": "Intérêts", "hint": "interest"}
]');
grant select on rows1 to authenticated;
select tests.remember('batch1', gen_random_uuid());

-- ===========================================================================
-- The preview and the write are one implementation (R-IMPORT-001, R-TRANSACTION-005)
-- ===========================================================================
create temp table pre1 on commit drop as
  select * from public.preview_import(tests.id('b'), tests.id('batch1'), (select j from rows1));
create temp table out1 on commit drop as
  select * from public.import_transactions(tests.id('b'), tests.id('batch1'), 1, (select j from rows1), 'csv',
                                           '2026-10-25', '2026-11-16', 'To categorise');
grant select on pre1, out1 to authenticated;
select is((select array_agg(row(row_no, valid, reason, action, kind, rule_id, duplicate_of, match_of, flag)::text order by row_no) from out1),
          (select array_agg(row(row_no, valid, reason, action, kind, rule_id, duplicate_of, match_of, flag)::text order by row_no) from pre1),
  'R-IMPORT-001 R-TRANSACTION-005: the write does exactly what the preview said, row by row');
select is((select array_agg(action order by row_no) from out1),
          array['skip_duplicate', 'import', 'import', 'skip_flagged', 'skip_flagged', 'invalid', 'invalid', 'import', 'import', 'import', 'import', 'import'],
  'R-IMPORT-001: the actions of a statement');

-- ===========================================================================
-- Validation with add_transaction's checks (R-IMPORT-002)
-- ===========================================================================
select is((select reason from out1 where row_no = 6), 'date_outside_periods', 'R-IMPORT-002: a date after today is refused like by add_transaction');
select is((select reason from out1 where row_no = 7), 'invalid_amount', 'R-IMPORT-002: an amount that is not whole rappen is refused');
select is((select array_agg(reason order by n) from (
             select 1 as n, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2026-02-30", "amount": 1, "direction": "debit"}]')) as reason
             union all select 2, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-01", "amount": 1, "direction": "out"}]'))
             union all select 3, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-01", "amount": 1, "direction": "debit", "colour": "red"}]'))
             union all select 4, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-01", "amount": 1, "direction": "debit", "details": {"iban": "CH00"}}]'))
             union all select 5, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-01", "amount": 1, "direction": "debit", "kind": "refund"}]'))
             union all select 6, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2020-01-01", "amount": 1, "direction": "debit"}]'))
             union all select 7, (select reason from public.preview_import(tests.id('b'), null, '[{"date": "2026-11-01", "amount": 1000000001, "direction": "debit"}]'))
             union all select 8, (select reason from public.preview_import(tests.id('b'), null, format('[{"date": "2026-11-01", "amount": 1, "direction": "debit", "category_id": "%s"}]', tests.id('b'))::jsonb))
           ) as x),
          array['invalid_date', 'invalid_direction', 'invalid_row', 'invalid_details', 'invalid_kind', 'date_outside_periods', 'invalid_amount', 'category_not_found'],
  'R-IMPORT-002: impossible date, direction, unknown field, unknown extra data, a debit as a refund, before the first period, over the maximum, a category not of the budget');
select throws_ok(format('select * from public.preview_import(%L, null, %L)', tests.id('b'), '{"date": "2026-11-01"}'), 'P0001', 'invalid_rows',
  'R-IMPORT-002: rows are a JSON array');
select throws_ok(format('select * from public.preview_import(%L, null, %L)', tests.id('b'),
                        (select jsonb_agg('{"date": "2026-11-01", "amount": 1, "direction": "debit"}'::jsonb) from generate_series(1, 501))),
  'P0001', 'invalid_rows', 'R-IMPORT-208: at most 500 rows a call');

-- ===========================================================================
-- Imported transactions: to review, counted at once, with their extra data
-- ===========================================================================
select is((select array_agg(distinct review_state::text) from public.transactions where import_batch_id = tests.id('batch1')), array['to_review'],
  'R-IMPORT-004: every imported transaction is to review');
select is((select spent_total from public.period_summaries where budget_id = tests.id('b') and private.today() between start_date and end_date),
          (select spent_total from spent_before where seq = (select seq from public.periods where budget_id = tests.id('b') and private.today() between start_date and end_date))
          + 1250 + 990 - 300 + 4200 + 77 + 15000 + 15,
  'R-IMPORT-080: and counts in the totals at once (a credit as a refund lowers the spending)');
select is((select row(merchant, merchant_key, details ->> 'original_currency', import_source, in_to_categorise)::text
           from public.transaction_list where id = (select transaction_id from out1 where row_no = 3)),
          row('PAYUP *SHOP', 'shop', 'EUR', 'csv', true)::text,
  'R-IMPORT-102 R-IMPORT-201: the merchant, its key without the processor prefix, the extra data as given, the source');
select is((select row(kind, category_id)::text from public.transactions where id = (select transaction_id from out1 where row_no = 11)),
          row('expense', (select to_categorise_category_id from public.my_budgets where id = tests.id('b')))::text,
  'R-IMPORT-095: a securities purchase is an ordinary expense to categorise');
select is((select count(*)::integer from public.transactions where id in (select transaction_id from out1 where row_no in (10, 12))), 2,
  'R-IMPORT-096: fee and interest lines are imported as transactions');

-- ===========================================================================
-- The "to categorise" category (R-IMPORT-200, R-CATEGORY-200)
-- ===========================================================================
select is((select row(name, is_to_categorise, parent_id, end_seq, first_seq)::text from public.categories
           where id = (select to_categorise_category_id from public.my_budgets where id = tests.id('b'))),
          row('To categorise', true, null::uuid, null::integer, 1)::text,
  'R-IMPORT-200: created at the first import that needs it, with the name the caller gave, from the first period');
select is((select count(*)::integer from public.transactions where import_batch_id = tests.id('batch1')
           and category_id = (select to_categorise_category_id from public.my_budgets where id = tests.id('b'))), 7,
  'R-IMPORT-200: rows without a rule land there');
select throws_ok(format('select public.create_category(%L, %L, %L)', tests.id('b'), 'Sub', (select to_categorise_category_id from public.my_budgets where id = tests.id('b'))),
  'P0001', 'category_to_categorise', 'R-CATEGORY-200: it takes no subcategory');
select throws_ok(format('select public.update_category(%L, %s, p_amount => 100)', (select to_categorise_category_id from public.my_budgets where id = tests.id('b')),
                        (select revision from public.categories where id = (select to_categorise_category_id from public.my_budgets where id = tests.id('b')))),
  'P0001', 'category_to_categorise', 'R-CATEGORY-200: it takes no expectation');
select throws_ok(format('select public.end_category(%L, %s)', (select to_categorise_category_id from public.my_budgets where id = tests.id('b')),
                        (select revision from public.categories where id = (select to_categorise_category_id from public.my_budgets where id = tests.id('b')))),
  'P0001', 'category_to_categorise', 'R-CATEGORY-200: it cannot end while it holds transactions');
select lives_ok(format('select public.update_category(%L, %s, %L)', (select to_categorise_category_id from public.my_budgets where id = tests.id('b')),
                       (select revision from public.categories where id = (select to_categorise_category_id from public.my_budgets where id = tests.id('b'))), 'Inbox'),
  'R-CATEGORY-200: it can be renamed');
select is_empty($$select p.seq from public.period_summaries as p
                  where p.budget_id = tests.id('b')
                    and p.spent_total <> (select coalesce(sum(g.spent), 0) from public.get_period_progress(p.id) as g where g.parent_id is null)$$,
  'R-IMPORT-200 R-PROGRESS-002: every period''s category rows still add up to its spending');

-- ===========================================================================
-- Duplicates, counted (R-IMPORT-003, R-IMPORT-070, R-IMPORT-071, R-IMPORT-072, R-IMPORT-073)
-- ===========================================================================
select is((select duplicate_of from out1 where row_no = 1), tests.id('typed'), 'R-IMPORT-070: the same date, amount and description as a typed transaction');
select is((select action from out1 where row_no = 2), 'import',
  'R-IMPORT-003: two identical rows against one existing transaction: one skipped, one imported');
create temp table out2 on commit drop as
  select * from public.import_transactions(tests.id('b'), gen_random_uuid(), 1, (select j from rows1), 'csv');
grant select on out2 to authenticated;
select is((select count(*)::integer from out2 where action = 'import'), 0,
  'R-IMPORT-003: importing the same statement twice imports nothing the second time');
select is((select array_agg(action order by row_no) from out2 where row_no in (1, 2, 3, 9)),
          array['skip_duplicate', 'skip_duplicate', 'skip_duplicate', 'skip_duplicate'], 'R-IMPORT-070: each row absorbed by one transaction');
select is((select row(action, duplicate_of)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-09", "amount": 9999, "direction": "debit", "description": "other text", "bank_transaction_id": "0400001234567890"}]')),
          row('skip_duplicate', (select transaction_id from out1 where row_no = 9))::text,
  'R-IMPORT-071: the same bank transaction id is a duplicate whatever the rest');
select is((select array_agg(row(chunk, row_no, reason, detail)::text order by chunk, row_no) from public.list_import_skipped_rows(tests.id('batch1'))),
          array[row(1, 1, 'duplicate', null::text)::text, row(1, 4, 'flagged', 'salary')::text, row(1, 5, 'flagged', 'card_bill_payment')::text,
                row(1, 6, 'invalid', 'date_outside_periods')::text, row(1, 7, 'invalid', 'invalid_amount')::text],
  'R-IMPORT-072: the skipped rows are listed, with why');
select is((select count(*)::integer from public.list_import_skipped_rows(tests.id('batch1'), 2)), 2, 'R-APP-170: a page of skipped rows');
select is((select array_agg(row_no order by row_no) from public.list_import_skipped_rows(tests.id('batch1'), 2, 1, 4)), array[5, 6],
  'R-APP-170: the next page after the last row');
-- import anyway: one row, then all the rest
select is((select array_agg(action) from public.import_skipped_anyway(tests.id('batch1'),
            array[(select id from public.list_import_skipped_rows(tests.id('batch1')) where row_no = 1)])), array['import'],
  'R-IMPORT-073 R-IMPORT-204: a row skipped as a duplicate is imported anyway, by itself');
select is((select array_agg(action order by row_no) from public.import_skipped_anyway(tests.id('batch1'))), array['import', 'import'],
  'R-IMPORT-073 R-IMPORT-204: and all the other skipped rows at once (the invalid ones stay)');
select is((select count(*)::integer from public.list_import_skipped_rows(tests.id('batch1')) where imported_transaction_id is not null), 3,
  'R-IMPORT-204: each skipped row says what it became');
select is((select kind from public.transactions where id = (select imported_transaction_id from public.list_import_skipped_rows(tests.id('batch1'))
           where row_no = 4)), 'extra_income',
  'R-IMPORT-093: a salary imported anyway is extra income');

-- ===========================================================================
-- Flags, remembered choices, salaries, credits (R-IMPORT-091 to R-IMPORT-094)
-- ===========================================================================
select is((select row(flag, salary_income_amount, amount)::text from out1 where row_no = 4),
          row('salary', 500000::bigint, 500000::bigint)::text,
  'R-IMPORT-093: a credit of an income''s amount near its period''s start is a salary, with both amounts shown');
select is((select row(flag, action)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-12", "amount": 500000, "direction": "credit", "description": "Transfer from savings"}]')),
          row(null::text, 'import')::text, 'R-IMPORT-093: an income''s amount far from the period''s start is not a salary');
select is((select row(flag, action)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-10", "amount": 480000, "direction": "credit", "description": "Paiement de salaire ACME", "hint": "salary"}]')),
          row('salary', 'skip_flagged')::text, 'R-IMPORT-093: or one the source calls a salary');
select is((select row(kind, action)::text from out1 where row_no = 8), row('refund', 'import')::text,
  'R-IMPORT-094: another credit is a refund to review');
select is((select row(kind, category_id is null)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-10", "amount": 300, "direction": "credit", "kind": "extra_income"}]')),
          row('extra_income', true)::text, 'R-IMPORT-094: or extra income when the member says so');
select is((select row(flag, remembered_choice, action)::text from out1 where row_no = 5),
          row('card_bill_payment', null::text, 'skip_flagged')::text, 'R-IMPORT-091: a card-bill payment is flagged and skipped by default');
-- the member imports one anyway: remembered for that counterparty, per budget
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  '[{"date": "2026-11-12", "amount": 20500, "direction": "debit", "description": "Paiement Viseca", "merchant": "Viseca Payment Services SA", "hint": "card_bill_payment", "action": "import"}]', 'csv');
select is((select row(remembered_choice, action)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-13", "amount": 21000, "direction": "debit", "merchant": "Viseca Payment Services SA", "hint": "card_bill_payment"}]')),
          row('import', 'import')::text, 'R-IMPORT-092: the choice is remembered and proposed next time');
select is((select row(flag, action)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-13", "amount": 2000, "direction": "debit", "merchant": "Muster, Anna", "hint": "transfer_to_person"}]')),
          row('transfer_to_person', 'import')::text, 'R-IMPORT-091: a transfer to another person is an expense unless skipped');
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  '[{"date": "2026-11-13", "amount": 2000, "direction": "debit", "merchant": "Muster, Anna", "hint": "transfer_to_person", "action": "skip"}]', 'csv');
select is((select action from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-14", "amount": 2500, "direction": "debit", "merchant": "Muster, Anna", "hint": "transfer_to_person"}]')),
          'skip_flagged', 'R-IMPORT-092: once skipped, skipped next time');

-- ===========================================================================
-- Possible matches (R-IMPORT-203)
-- ===========================================================================
select tests.remember('gym', (select id from public.create_subscription(tests.id('b'), 'Gym', 4900, 'monthly', tests.id('fun'), '2026-11-15')));
select tests.remember('gym_charge', (select id from public.transactions where subscription_id = tests.id('gym') and charge_date = '2026-11-15'));
select tests.remember('cinema', (select id from public.add_transaction(tests.id('b'), 'expense', 3300, '2026-11-11', tests.id('fun'), 'cinema')));
create temp table m on commit drop as select * from public.preview_import(tests.id('b'), null, '[
 {"date": "2026-11-16", "amount": 4900, "direction": "debit", "description": "FITNESS PARK"},
 {"date": "2026-11-13", "amount": 3300, "direction": "debit", "description": "KINO REX"},
 {"date": "2026-11-13", "amount": 3300, "direction": "debit", "description": "KINO REX 2"}]');
grant select on m to authenticated;
select is((select array_agg(row(action, match_of, match_is_charge)::text order by row_no) from m),
          array[row('confirm_match', tests.id('gym_charge'), true)::text, row('skip_matched', tests.id('cinema'), false)::text,
                row('import', null::uuid, null::boolean)::text],
  'R-IMPORT-203: within three days, same amount: a charge awaiting confirmation is confirmed, a typed one absorbs one row');
select is((select row(action, match_of)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-15", "amount": 3300, "direction": "debit", "description": "KINO REX"}]')),
          row('import', null::uuid)::text, 'R-IMPORT-203: four days apart is not a match');
select count(*) from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  '[{"date": "2026-11-16", "amount": 4900, "direction": "debit", "description": "FITNESS PARK"}]', 'csv');
select is((select review_state::text from public.transactions where id = tests.id('gym_charge')), 'confirmed',
  'R-IMPORT-203: the statement shows the charge went through: it is confirmed');

-- ===========================================================================
-- Merchant rules and the one-click rule (R-IMPORT-078, R-IMPORT-079, R-IMPORT-007, R-IMPORT-201, R-IMPORT-202)
-- ===========================================================================
-- a to-review transaction of that merchant already in a real category stays where it is
create temp table shop_food on commit drop as select * from public.import_transactions(tests.id('b'), gen_random_uuid(), 1,
  format('[{"date": "2026-11-14", "amount": 640, "direction": "debit", "merchant": "PayUp *Shop", "category_id": "%s"}]', tests.id('food'))::jsonb, 'csv');
grant select on shop_food to authenticated;
select is((select row(fragment, moved)::text from public.create_merchant_rule(tests.id('b'), 'Shop', tests.id('fun'), true)),
          row('shop', 1)::text, 'R-IMPORT-007 R-IMPORT-202: the one-click rule moves the waiting transactions of that merchant');
select is((select category_id from public.transactions where id = (select transaction_id from out1 where row_no = 3)), tests.id('fun'),
  'R-IMPORT-202: into the rule''s category');
select is((select category_id from public.transactions where id = (select transaction_id from shop_food)), tests.id('food'),
  'R-IMPORT-202: only those waiting in "to categorise" move');
select create_merchant_rule from public.create_merchant_rule(tests.id('b'), 'coop', tests.id('food'));
select create_merchant_rule from public.create_merchant_rule(tests.id('b'), 'coop lausanne', tests.id('fun'));
select is((select row(category_source, category_id)::text from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-11-15", "amount": 870, "direction": "debit", "description": "Achat COOP Lausanne Gare"}]')),
          row('rule', tests.id('fun'))::text, 'R-IMPORT-079 R-IMPORT-201: a rule matches when the key contains its fragment; the longest wins');
select throws_ok(format('select public.create_merchant_rule(%L, %L, %L)', tests.id('b'), 'COOP', tests.id('food')), 'P0001', 'merchant_rule_exists',
  'R-IMPORT-078: one rule per fragment');
select throws_ok(format('select public.create_merchant_rule(%L, %L, %L)', tests.id('b'), 'x', (select to_categorise_category_id from public.my_budgets where id = tests.id('b'))),
  'P0001', 'category_to_categorise', 'R-IMPORT-078: a rule never points to "to categorise"');
select lives_ok(format('select public.update_merchant_rule(%L, %s, p_category_id => %L)',
                       (select id from public.merchant_rules where budget_id = tests.id('b') and fragment = 'coop'),
                       (select revision from public.merchant_rules where budget_id = tests.id('b') and fragment = 'coop'), tests.id('fun')),
  'R-IMPORT-078: a rule is edited with its revision');
select throws_ok(format('select public.update_merchant_rule(%L, 1, p_category_id => %L)',
                        (select id from public.merchant_rules where budget_id = tests.id('b') and fragment = 'coop'), tests.id('food')),
  'P0001', 'record_changed', 'R-IMPORT-078: a stale edit is refused');
-- a rule whose category has ended does not apply from then on
select tests.remember('old_cat', (select id from public.create_category(tests.id('b'), 'Old', p_from_period_id => tests.id('p1'))));
select create_merchant_rule from public.create_merchant_rule(tests.id('b'), 'kiosk', tests.id('old_cat'));
select public.end_category(tests.id('old_cat'), (select revision from public.categories where id = tests.id('old_cat')),
  (select id from public.periods where budget_id = tests.id('b') and seq = 3));
select is((select array_agg(category_source order by row_no) from public.preview_import(tests.id('b'), null,
           '[{"date": "2026-09-28", "amount": 400, "direction": "debit", "description": "Kiosk"}, {"date": "2026-11-15", "amount": 400, "direction": "debit", "description": "Kiosk"}]')),
          array['rule', 'to_categorise'], 'R-IMPORT-201: a rule applies only where its category is in force');
-- the first subcategory moves the rules to "Other"
select tests.remember('sub', (select id from public.create_category(tests.id('b'), 'Cinema', tests.id('fun'), p_other_name => 'Other fun')));
select is((select array_agg(distinct c.name) from public.merchant_rules as r join public.categories as c on c.id = r.category_id
           where r.budget_id = tests.id('b') and r.fragment in ('shop', 'coop', 'coop lausanne')), array['Other fun'],
  'R-IMPORT-207: a category''s first subcategory moves its rules to "Other"');
select lives_ok(format('select public.delete_merchant_rule(%L, %s)', (select id from public.merchant_rules where budget_id = tests.id('b') and fragment = 'kiosk'),
                       (select revision from public.merchant_rules where budget_id = tests.id('b') and fragment = 'kiosk')),
  'R-IMPORT-078: a rule is deleted');

-- ===========================================================================
-- Review (R-IMPORT-081, R-IMPORT-209)
-- ===========================================================================
select throws_ok(format('select public.confirm_import(%L, %s)', (select transaction_id from out1 where row_no = 2),
                        (select revision from public.transactions where id = (select transaction_id from out1 where row_no = 2))),
  'P0001', 'category_to_categorise', 'R-IMPORT-081: a transaction in "to categorise" cannot be confirmed');
select lives_ok(format('select public.confirm_import(%L, %s)', (select transaction_id from out1 where row_no = 3),
                       (select revision from public.transactions where id = (select transaction_id from out1 where row_no = 3))),
  'R-IMPORT-081: one with a real category is confirmed');
select throws_ok(format('select public.confirm_import(%L, %s)', tests.id('typed'), (select revision from public.transactions where id = tests.id('typed'))),
  'P0001', 'not_to_review', 'R-IMPORT-209: only a transaction to review');
select is((select count(*)::integer from public.list_transactions(tests.id('b'), 200, p_to_review_only => true)),
          (select to_review from public.my_budgets where id = tests.id('b')),
  'R-IMPORT-209: the to-review filter lists what my_budgets counts');
select is((select count(*)::integer from public.list_transactions(tests.id('b'), 200, p_to_review_only => true) where review_state <> 'to_review'), 0,
  'R-IMPORT-209: and only those');
select is((select count(*)::integer from public.list_transactions(tests.id('b'), 200, p_import_batch_id => tests.id('batch1'))),
          (select count(*)::integer from public.transactions where import_batch_id = tests.id('batch1')), 'R-IMPORT-209: one batch''s transactions');
select is((select row(confirmed > 0, left_to_categorise)::text from public.confirm_imports(tests.id('b'))),
          row(true, (select count(*)::integer from public.transactions where budget_id = tests.id('b') and review_state = 'to_review'
                     and category_id = (select to_categorise_category_id from public.my_budgets where id = tests.id('b'))))::text,
  'R-IMPORT-209: confirm all at once, except those still to categorise');

-- ===========================================================================
-- Chunks, idempotency, limits, undo (R-IMPORT-208, R-IMPORT-206)
-- ===========================================================================
select tests.remember('batch3', gen_random_uuid());
create temp table c1 on commit drop as select * from public.import_transactions(tests.id('b'), tests.id('batch3'), 1,
  format('[{"date": "2026-11-14", "amount": 111, "direction": "debit", "description": "chunk one", "category_id": "%s"}]', tests.id('food'))::jsonb, 'yuh');
create temp table c1b on commit drop as select * from public.import_transactions(tests.id('b'), tests.id('batch3'), 1,
  '[{"date": "2026-11-14", "amount": 222, "direction": "debit", "description": "anything"}]', 'yuh');
grant select on c1, c1b to authenticated;
select is((select array_agg(row(row_no, action, transaction_id)::text) from c1b), (select array_agg(row(row_no, action, transaction_id)::text) from c1),
  'R-IMPORT-208: a chunk sent again answers what it answered and records nothing');
select is((select count(*)::integer from public.transactions where import_batch_id = tests.id('batch3')), 1, 'R-IMPORT-208: once');
select count(*) from public.import_transactions(tests.id('b'), tests.id('batch3'), 2,
  format('[{"date": "2026-11-14", "amount": 111, "direction": "debit", "description": "chunk one", "category_id": "%s"}]', tests.id('food'))::jsonb, 'yuh');
select is((select count(*)::integer from public.transactions where import_batch_id = tests.id('batch3')), 2,
  'R-IMPORT-208: rows of one batch are never duplicates of each other, across chunks too');
select throws_ok(format('select * from public.import_transactions(%L, %L, 101, %L, %L)', tests.id('b'), gen_random_uuid(), '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]', 'csv'),
  'P0001', 'invalid_chunk', 'R-IMPORT-208: at most 100 chunks a batch');
select is((select row(imported_count, chunk_count, source)::text from public.list_import_batches(tests.id('b')) where id = tests.id('batch3')),
          row(2, 2, 'yuh')::text, 'R-IMPORT-208: the batch counts its chunks and rows');
-- the transaction limit: refused before anything is written, saying how many fit
select tests.clear_authentication();
create temp table room on commit drop as select count(*)::integer as n from public.transactions where budget_id = tests.id('b');
do $$ begin
  execute format('create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select %s $f$', (select n + 1 from room));
end $$;
select tests.authenticate_as('ivy');
select throws_ok(format('select * from public.import_transactions(%L, %L, 1, %L, %L)', tests.id('b'), gen_random_uuid(),
                        '[{"date": "2026-11-14", "amount": 1, "direction": "debit", "description": "a"}, {"date": "2026-11-14", "amount": 2, "direction": "debit", "description": "b"}]', 'csv'),
  'P0001', 'transaction_limit_reached', 'R-IMPORT-208: an import over the transaction limit is refused whole');
select tests.clear_authentication();
do $$ begin
  execute 'create or replace function private.limit_transactions() returns integer language sql immutable set search_path = '''' as $f$ select 50000 $f$';
end $$;
select tests.authenticate_as('ivy');
-- undo: what is still to review goes, what was confirmed stays
select public.confirm_import(t.id, t.revision) from public.transactions as t
where t.import_batch_id = tests.id('batch3') order by t.amount, t.id limit 1;
select is((select row(deleted, kept_confirmed)::text from public.undo_import_batch(tests.id('batch3'))), row(1, 1)::text,
  'R-IMPORT-206: undo deletes what is still to review and keeps the confirmed');
select throws_ok(format('select * from public.undo_import_batch(%L)', tests.id('batch3')), 'P0001', 'batch_undone', 'R-IMPORT-206: once');
select throws_ok(format('select * from public.import_transactions(%L, %L, 3, %L, %L)', tests.id('b'), tests.id('batch3'), '[{"date": "2026-11-14", "amount": 1, "direction": "debit"}]', 'yuh'),
  'P0001', 'batch_undone', 'R-IMPORT-206: an undone batch takes no more chunks');
select tests.remember('batch4', gen_random_uuid());
select count(*) from public.import_transactions(tests.id('b'), tests.id('batch4'), 1,
  '[{"date": "2026-11-14", "amount": 333, "direction": "debit", "description": "to undo"}, {"date": "2026-11-14", "amount": 334, "direction": "debit", "description": "to undo 2"}]', 'csv');
select is((select row(deleted, kept_confirmed)::text from public.undo_import_batch(tests.id('batch4'))), row(2, 0)::text,
  'R-IMPORT-206: a batch still to review is undone whole');

-- ===========================================================================
-- Tokens (R-IMPORT-074 to R-IMPORT-077, R-IMPORT-205, R-IMPORT-006)
-- ===========================================================================
select tests.remember('gym2', (select id from public.create_subscription(tests.id('b'), 'Pool', 4800, 'monthly', tests.id('food'), '2026-11-14')));
create temp table tok on commit drop as select * from public.create_import_token(tests.id('b'), 'Claude session', 7);
grant select on tok to authenticated, anon;
select is((select row(name, is_active, created_by)::text from public.import_token_list where id = (select token_id from tok)),
          row('Claude session', true, tests.get_user_id('ivy'))::text, 'R-IMPORT-074: a member creates a token; the list shows it');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.import_token_list where id = (select token_id from tok)),
  'R-IMPORT-074: with its expiry');
select throws_ok('select token_hash from public.import_tokens', '42501', null, 'R-IMPORT-074: the secret''s hash is never readable');
select throws_ok(format('select public.create_import_token(%L, %L, 366)', tests.id('b'), 'Too long'), 'P0001', 'invalid_expiry', 'R-IMPORT-074: a year at most');
-- the token imports with default choices, answers counts only
select tests.authenticate_as_anon();
select tests.remember('tbatch', gen_random_uuid());
select is((select row(received, refused, refused_rows)::text from public.import_with_token((select token from tok), tests.id('tbatch'), 1, '[
  {"date": "2026-11-15", "amount": 999, "direction": "debit", "description": "Coop Lausanne"},
  {"date": "2026-11-02", "amount": 1250, "direction": "debit", "description": "Coop Lausanne"},
  {"date": "2026-11-15", "amount": 1.5, "direction": "debit"},
  {"date": "2030-01-01", "amount": 5, "direction": "debit"},
  {"date": "2026-11-15", "amount": 4800, "direction": "debit"}]')),
          row(4, 1, '[{"row": 3, "reason": "invalid_amount"}]'::jsonb)::text,
  'R-IMPORT-076 R-IMPORT-006: a token''s answer is counts, and reasons that depend only on the row sent');
select is((select refused_rows from public.import_with_token((select token from tok), gen_random_uuid(), 1,
           '[{"date": "2026-11-15", "amount": 5, "direction": "debit", "action": "import"}]')),
          '[{"row": 1, "reason": "choice_not_allowed"}]'::jsonb, 'R-IMPORT-205: a token imports with the default choices only');
select tests.authenticate_as('ivy');
select is((select row(budget_id, token_name, created_by)::text from public.list_import_batches(tests.id('b')) where id = tests.id('tbatch')),
          row(tests.id('b'), 'Claude session', null::uuid)::text, 'R-IMPORT-075: into the token''s budget, recorded as the token');
select tests.clear_authentication();
select is((select array_agg(action order by row_no) from jsonb_populate_recordset(null::public.import_row_result,
            (select result from private.import_chunks where batch_id = tests.id('tbatch')))),
          array['import', 'skip_duplicate', 'invalid', 'invalid', 'skip_matched'],
  'R-IMPORT-205: with a token a possible match is skipped and left for the member, never confirmed');
select is((select review_state::text from public.transactions where subscription_id = tests.id('gym2')), 'awaiting_confirmation',
  'R-IMPORT-205: the charge a token''s row matches still awaits the member');
select tests.authenticate_as('ivy');
select public.revoke_import_token((select token_id from tok));
select tests.authenticate_as_anon();
select throws_ok(format('select * from public.import_with_token(%L, %L, 1, %L)', (select token from tok), gen_random_uuid(), '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]'),
  'P0001', 'invalid_token', 'R-IMPORT-077: a revoked token is refused');
select throws_ok(format('select * from public.import_with_token(%L, %L, 1, %L)', 'bti_' || repeat('0', 64), gen_random_uuid(), '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]'),
  'P0001', 'invalid_token', 'R-IMPORT-205: an unknown token gets the same refusal');
select tests.clear_authentication();
select tests.authenticate_as('ivy');
create temp table tok2 on commit drop as select * from public.create_import_token(tests.id('b'), 'Short', 1);
grant select on tok2 to anon;
select tests.clear_authentication();
update public.import_tokens set expires_at = now() - interval '1 second' where id = (select token_id from tok2);
select tests.authenticate_as_anon();
select throws_ok(format('select * from public.import_with_token(%L, %L, 1, %L)', (select token from tok2), gen_random_uuid(), '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]'),
  'P0001', 'invalid_token', 'R-IMPORT-205: so does an expired one');
-- rate limits
select tests.authenticate_as('ivy');
create temp table tok3 on commit drop as select * from public.create_import_token(tests.id('b'), 'Busy');
grant select on tok3 to anon;
select tests.clear_authentication();
insert into private.import_token_usage (token_id, minute, calls, rows) values ((select token_id from tok3), date_trunc('minute', clock_timestamp()) - interval '30 minutes', 60, 10);
select tests.authenticate_as_anon();
select is((select error from public.import_with_token((select token from tok3), gen_random_uuid(), 1, '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]')),
  'token_rate_limited', 'R-IMPORT-205: at most 60 calls an hour');
-- a member removed takes the tokens they created with them
select tests.authenticate_as('ivy');
select tests.remember('inv', public.invite_member(tests.id('b'), tests.get_user_email('jon')));
select tests.authenticate_as('jon');
select public.accept_invitation(tests.id('inv'));
create temp table tok4 on commit drop as select * from public.create_import_token(tests.id('b'), 'Jon''s');
grant select on tok4 to authenticated;
select public.leave_budget(tests.id('b'));
select tests.authenticate_as('ivy');
select is((select is_active from public.import_token_list where id = (select token_id from tok4)), false,
  'R-IMPORT-205: a member who leaves revokes the tokens they created');

-- ===========================================================================
-- Access: another user, a member of another budget, a visitor (C-DBTEST-002, C-DBTEST-003)
-- ===========================================================================
select tests.clear_authentication();
select tests.create_user('kim', 'Kim');
select tests.authenticate_as('kim');
select tests.remember('kb', public.create_budget('Kim''s', 'Salary', 100000, 25));
create temp table kim_calls (sql text, message text) on commit drop;
insert into kim_calls values
  (format('select * from public.preview_import(%L, null, %L)', tests.id('b'), '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]'), 'budget_not_found'),
  (format('select * from public.import_transactions(%L, %L, 1, %L, %L)', tests.id('b'), gen_random_uuid(), '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]', 'csv'), 'budget_not_found'),
  (format('select * from public.import_transactions(%L, %L, 2, %L, %L)', tests.id('kb'), tests.id('batch1'), '[{"date": "2026-11-15", "amount": 5, "direction": "debit"}]', 'csv'), 'import_batch_conflict'),
  (format('select * from public.import_skipped_anyway(%L)', tests.id('batch1')), 'import_batch_not_found'),
  (format('select * from public.undo_import_batch(%L)', tests.id('batch1')), 'import_batch_not_found'),
  (format('select * from public.list_import_skipped_rows(%L)', tests.id('batch1')), 'import_batch_not_found'),
  (format('select * from public.list_import_batches(%L)', tests.id('b')), 'budget_not_found'),
  (format('select * from public.confirm_imports(%L)', tests.id('b')), 'budget_not_found'),
  (format('select * from public.confirm_import(%L, 1)', (select transaction_id from out1 where row_no = 2)), 'transaction_not_found'),
  (format('select * from public.create_import_token(%L, %L)', tests.id('b'), 'x'), 'budget_not_found'),
  (format('select public.revoke_import_token(%L)', (select token_id from tok3)), 'token_not_found'),
  (format('select * from public.create_merchant_rule(%L, %L, %L)', tests.id('b'), 'x', tests.id('food')), 'budget_not_found'),
  (format('select * from public.create_merchant_rule(%L, %L, %L)', tests.id('kb'), 'x', tests.id('food')), 'category_not_found'),
  (format('select * from public.update_merchant_rule(%L, 1, %L)', (select id from public.merchant_rules where fragment = 'shop' and budget_id = tests.id('b')), 'y'), 'merchant_rule_not_found'),
  (format('select public.delete_merchant_rule(%L, 1)', (select id from public.merchant_rules where fragment = 'shop' and budget_id = tests.id('b'))), 'merchant_rule_not_found');
select throws_ok(sql, 'P0001', message, 'R-SECURITY-002 R-SECURITY-004: another user: ' || message) from kim_calls;
select is((select count(*)::integer from (
             select id from public.merchant_rules where budget_id = tests.id('b') union all
             select id from public.import_tokens where budget_id = tests.id('b') union all
             select id from public.merchant_rule_list where budget_id = tests.id('b') union all
             select id from public.import_token_list where budget_id = tests.id('b')) as x), 0,
  'R-SECURITY-002: another user reads nothing of the import tables');
select throws_ok('select count(*) from public.import_choices', '42501', null, 'R-IMPORT-257: nor the remembered choices (paged reads only)');
select tests.authenticate_as_anon();
select throws_ok(format('select * from public.preview_import(%L, null, %L)', tests.id('b'), '[]'), '42501', null,
  'R-SECURITY-003 R-SECURITY-200: a visitor cannot call the member import');
select throws_ok('select count(*) from public.import_batches', '42501', null, 'R-SECURITY-003: nor read batches');
select throws_ok('select count(*) from public.merchant_rules', '42501', null, 'R-SECURITY-003: nor rules');
select throws_ok('select count(*) from public.import_tokens', '42501', null, 'R-SECURITY-003: nor tokens');
select throws_ok(format('select * from public.create_import_token(%L, %L)', tests.id('b'), 'x'), '42501', null, 'R-SECURITY-200: nor create a token');
select tests.clear_authentication();

select * from finish();
rollback;
