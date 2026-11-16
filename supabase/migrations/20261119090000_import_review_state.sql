-- Step 6, import: the third review state, in a migration of its own (a value added to an enum
-- can be used only once the migration that adds it has committed). R-IMPORT-004, D-118
alter type public.review_state add value if not exists 'to_review';
