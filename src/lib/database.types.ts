
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "bank_label": string | null,"budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"kind": Database["public"]['Enums']["account_kind"],"name": string,"revision": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bank_label"?: string | null,"budget_id": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"kind": Database["public"]['Enums']["account_kind"],"name": string,"revision"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "bank_label"?: string | null,"budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"name"?: string,"revision"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_invitations": {
                  Row: {
                    "budget_id": string,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_invitations_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_invitations_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_members": {
                  Row: {
                    "budget_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_members_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_members_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"budgets": {
                  Row: {
                    "created_at": string,"end_date": string | null,"id": string,"name": string,"owner_id": string,"primary_income_id": string,"primary_since_seq": number,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date"?: string | null,"id"?: string,"name": string,"owner_id": string,"primary_income_id": string,"primary_since_seq"?: number,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string,"primary_income_id"?: string,"primary_since_seq"?: number,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_primary_income_fk"
      columns: ["primary_income_id","id"]
isOneToOne: false
      referencedRelation: "income_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "budgets_primary_income_fk"
      columns: ["primary_income_id","id"]
isOneToOne: false
      referencedRelation: "incomes"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"is_group": boolean,"is_to_categorise": boolean,"name": string,"parent_id": string | null,"revision": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"is_group"?: boolean,"is_to_categorise"?: boolean,"name": string,"parent_id"?: string | null,"revision"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"is_group"?: boolean,"is_to_categorise"?: boolean,"name"?: string,"parent_id"?: string | null,"revision"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_fk"
      columns: ["parent_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "categories_parent_fk"
      columns: ["parent_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"category_expectations": {
                  Row: {
                    "amount": number,"budget_id": string,"cadence": Database["public"]['Enums']["expectation_cadence"],"category_id": string,"created_at": string,"effective_from_seq": number,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"budget_id": string,"cadence"?: Database["public"]['Enums']["expectation_cadence"],"category_id": string,"created_at"?: string,"effective_from_seq": number,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"budget_id"?: string,"cadence"?: Database["public"]['Enums']["expectation_cadence"],"category_id"?: string,"created_at"?: string,"effective_from_seq"?: number,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_expectations_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "category_expectations_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"debt_adjustments": {
                  Row: {
                    "amount": number,"budget_id": string,"created_at": string,"created_by": string | null,"date": string,"debt_id": string,"id": string,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"budget_id": string,"created_at"?: string,"created_by"?: string | null,"date": string,"debt_id": string,"id"?: string,"note"?: string | null
                  }
                  Update: {
                    "amount"?: number,"budget_id"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"debt_id"?: string,"id"?: string,"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_adjustments_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_adjustments_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_adjustments_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debt_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_adjustments_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"debt_interest": {
                  Row: {
                    "amount": number,"balance": number,"budget_id": string,"created_at": string,"debt_id": string,"id": string,"period_id": string,"rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"balance": number,"budget_id": string,"created_at"?: string,"debt_id": string,"id"?: string,"period_id": string,"rate": number
                  }
                  Update: {
                    "amount"?: number,"balance"?: number,"budget_id"?: string,"created_at"?: string,"debt_id"?: string,"id"?: string,"period_id"?: string,"rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_interest_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_interest_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_interest_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debt_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_interest_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_interest_period_fk"
      columns: ["period_id","budget_id"]
isOneToOne: false
      referencedRelation: "period_summaries"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_interest_period_fk"
      columns: ["period_id","budget_id"]
isOneToOne: false
      referencedRelation: "periods"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"debt_versions": {
                  Row: {
                    "budget_id": string,"category_id": string,"created_at": string,"debt_id": string,"effective_from_seq": number,"id": string,"interest_rate": number,"monthly_payment": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"category_id": string,"created_at"?: string,"debt_id": string,"effective_from_seq": number,"id"?: string,"interest_rate"?: number,"monthly_payment": number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"category_id"?: string,"created_at"?: string,"debt_id"?: string,"effective_from_seq"?: number,"id"?: string,"interest_rate"?: number,"monthly_payment"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_versions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_versions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_versions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_versions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_versions_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debt_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "debt_versions_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"name": string,"opened_on": string,"principal": number,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"name": string,"opened_on": string,"principal": number,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"name"?: string,"opened_on"?: string,"principal"?: number,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "budget_id": string,"charges_confirmed_count": number,"chosen_skip_count": number,"chunk_count": number,"created_at": string,"created_by": string | null,"duplicate_count": number,"flagged_count": number,"id": string,"imported_count": number,"invalid_count": number,"matched_count": number,"row_count": number,"source": string,"statement_from": string | null,"statement_to": string | null,"token_id": string | null,"token_name": string | null,"undone_at": string | null,"undone_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"charges_confirmed_count"?: number,"chosen_skip_count"?: number,"chunk_count"?: number,"created_at"?: string,"created_by"?: string | null,"duplicate_count"?: number,"flagged_count"?: number,"id": string,"imported_count"?: number,"invalid_count"?: number,"matched_count"?: number,"row_count"?: number,"source": string,"statement_from"?: string | null,"statement_to"?: string | null,"token_id"?: string | null,"token_name"?: string | null,"undone_at"?: string | null,"undone_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"charges_confirmed_count"?: number,"chosen_skip_count"?: number,"chunk_count"?: number,"created_at"?: string,"created_by"?: string | null,"duplicate_count"?: number,"flagged_count"?: number,"id"?: string,"imported_count"?: number,"invalid_count"?: number,"matched_count"?: number,"row_count"?: number,"source"?: string,"statement_from"?: string | null,"statement_to"?: string | null,"token_id"?: string | null,"token_name"?: string | null,"undone_at"?: string | null,"undone_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_batches_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "import_token_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "import_tokens"
      referencedColumns: ["id"]
    }
                  ]
                },"import_choices": {
                  Row: {
                    "budget_id": string,"choice": string,"counterparty_key": string,"flag": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"choice": string,"counterparty_key": string,"flag": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "budget_id"?: string,"choice"?: string,"counterparty_key"?: string,"flag"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_choices_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_choices_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"import_skipped_rows": {
                  Row: {
                    "batch_id": string,"budget_id": string,"chunk": number,"created_at": string,"detail": string | null,"duplicate_of": string | null,"id": string,"imported_at": string | null,"imported_transaction_id": string | null,"match_of": string | null,"reason": string,"row_data": NonNullable<Json>,"row_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"budget_id": string,"chunk": number,"created_at"?: string,"detail"?: string | null,"duplicate_of"?: string | null,"id"?: string,"imported_at"?: string | null,"imported_transaction_id"?: string | null,"match_of"?: string | null,"reason": string,"row_data": NonNullable<Json>,"row_no": number
                  }
                  Update: {
                    "batch_id"?: string,"budget_id"?: string,"chunk"?: number,"created_at"?: string,"detail"?: string | null,"duplicate_of"?: string | null,"id"?: string,"imported_at"?: string | null,"imported_transaction_id"?: string | null,"match_of"?: string | null,"reason"?: string,"row_data"?: NonNullable<Json>,"row_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_skipped_rows_batch_fk"
      columns: ["batch_id","budget_id"]
isOneToOne: false
      referencedRelation: "import_batch_list"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "import_skipped_rows_batch_fk"
      columns: ["batch_id","budget_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "import_skipped_rows_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_skipped_rows_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_skipped_rows_imported_transaction_id_fkey"
      columns: ["imported_transaction_id"]
isOneToOne: false
      referencedRelation: "transaction_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_skipped_rows_imported_transaction_id_fkey"
      columns: ["imported_transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"import_tokens": {
                  Row: {
                    "budget_id": string,"created_at": string,"created_by": string | null,"expires_at": string,"id": string,"last_used_at": string | null,"name": string,"revoked_at": string | null,"revoked_by": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"id"?: string,"last_used_at"?: string | null,"name": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"token_hash": string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"last_used_at"?: string | null,"name"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_tokens_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_tokens_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"income_versions": {
                  Row: {
                    "account_id": string | null,"amount": number,"budget_id": string,"created_at": string,"effective_from_seq": number,"id": string,"income_id": string,"pay_day": number,"updated_at": string,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount": number,"budget_id": string,"created_at"?: string,"effective_from_seq": number,"id"?: string,"income_id": string,"pay_day": number,"updated_at"?: string,"weekend_rule"?: Database["public"]['Enums']["weekend_rule"]
                  }
                  Update: {
                    "account_id"?: string | null,"amount"?: number,"budget_id"?: string,"created_at"?: string,"effective_from_seq"?: number,"id"?: string,"income_id"?: string,"pay_day"?: number,"updated_at"?: string,"weekend_rule"?: Database["public"]['Enums']["weekend_rule"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "income_versions_account_fk"
      columns: ["account_id","budget_id"]
isOneToOne: false
      referencedRelation: "account_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "income_versions_account_fk"
      columns: ["account_id","budget_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "income_versions_income_fk"
      columns: ["income_id","budget_id"]
isOneToOne: false
      referencedRelation: "income_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "income_versions_income_fk"
      columns: ["income_id","budget_id"]
isOneToOne: false
      referencedRelation: "incomes"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"incomes": {
                  Row: {
                    "budget_id": string,"created_at": string,"end_seq": number | null,"ended_after_last": boolean,"ended_on": string | null,"first_seq": number,"id": string,"name": string,"revision": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"ended_after_last"?: boolean,"ended_on"?: string | null,"first_seq": number,"id"?: string,"name": string,"revision"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"ended_after_last"?: boolean,"ended_on"?: string | null,"first_seq"?: number,"id"?: string,"name"?: string,"revision"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "incomes_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incomes_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"merchant_rules": {
                  Row: {
                    "budget_id": string,"category_id": string,"created_at": string,"created_by": string | null,"fragment": string,"id": string,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"category_id": string,"created_at"?: string,"created_by"?: string | null,"fragment": string,"id"?: string,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"fragment"?: string,"id"?: string,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "merchant_rules_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "merchant_rules_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "merchant_rules_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "merchant_rules_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"periods": {
                  Row: {
                    "budget_id": string,"created_at": string,"end_date": string,"end_is_manual": boolean,"id": string,"revision": number,"seq": number,"start_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_date": string,"end_is_manual"?: boolean,"id"?: string,"revision"?: number,"seq": number,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_date"?: string,"end_is_manual"?: boolean,"id"?: string,"revision"?: number,"seq"?: number,"start_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "periods_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "periods_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"email": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscription_versions": {
                  Row: {
                    "anchor_date": string,"budget_id": string,"cadence": Database["public"]['Enums']["subscription_cadence"],"category_id": string,"charge_day": number,"created_at": string,"effective_from_seq": number,"id": string,"price": number,"subscription_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date": string,"budget_id": string,"cadence": Database["public"]['Enums']["subscription_cadence"],"category_id": string,"charge_day": number,"created_at"?: string,"effective_from_seq": number,"id"?: string,"price": number,"subscription_id": string,"updated_at"?: string
                  }
                  Update: {
                    "anchor_date"?: string,"budget_id"?: string,"cadence"?: Database["public"]['Enums']["subscription_cadence"],"category_id"?: string,"charge_day"?: number,"created_at"?: string,"effective_from_seq"?: number,"id"?: string,"price"?: number,"subscription_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_versions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_versions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_versions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "subscription_versions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "subscription_versions_subscription_fk"
      columns: ["subscription_id","budget_id"]
isOneToOne: false
      referencedRelation: "subscription_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "subscription_versions_subscription_fk"
      columns: ["subscription_id","budget_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "budget_id": string,"charged_through": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"name": string,"next_due": string | null,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"charged_through": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"name": string,"next_due"?: string | null,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"charged_through"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"name"?: string,"next_due"?: string | null,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "amount": number,"bank_transaction_id": string | null,"budget_id": string,"category_id": string | null,"charge_date": string | null,"created_at": string,"date": string,"debt_id": string | null,"description": string | null,"details": Json | null,"id": string,"import_amount": number | null,"import_batch_id": string | null,"import_date": string | null,"import_description": string | null,"kind": Database["public"]['Enums']["transaction_kind"],"merchant": string | null,"merchant_key": string | null,"recorded_by": string | null,"review_state": Database["public"]['Enums']["review_state"],"revision": number,"subscription_id": string | null,"transfer_occurrence_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"bank_transaction_id"?: string | null,"budget_id": string,"category_id"?: string | null,"charge_date"?: string | null,"created_at"?: string,"date": string,"debt_id"?: string | null,"description"?: string | null,"details"?: Json | null,"id"?: string,"import_amount"?: number | null,"import_batch_id"?: string | null,"import_date"?: string | null,"import_description"?: string | null,"kind"?: Database["public"]['Enums']["transaction_kind"],"merchant"?: string | null,"merchant_key"?: string | null,"recorded_by"?: string | null,"review_state"?: Database["public"]['Enums']["review_state"],"revision"?: number,"subscription_id"?: string | null,"transfer_occurrence_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"bank_transaction_id"?: string | null,"budget_id"?: string,"category_id"?: string | null,"charge_date"?: string | null,"created_at"?: string,"date"?: string,"debt_id"?: string | null,"description"?: string | null,"details"?: Json | null,"id"?: string,"import_amount"?: number | null,"import_batch_id"?: string | null,"import_date"?: string | null,"import_description"?: string | null,"kind"?: Database["public"]['Enums']["transaction_kind"],"merchant"?: string | null,"merchant_key"?: string | null,"recorded_by"?: string | null,"review_state"?: Database["public"]['Enums']["review_state"],"revision"?: number,"subscription_id"?: string | null,"transfer_occurrence_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debt_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_import_batch_fk"
      columns: ["import_batch_id","budget_id"]
isOneToOne: false
      referencedRelation: "import_batch_list"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_import_batch_fk"
      columns: ["import_batch_id","budget_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_subscription_fk"
      columns: ["subscription_id","budget_id"]
isOneToOne: false
      referencedRelation: "subscription_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_subscription_fk"
      columns: ["subscription_id","budget_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_transfer_fk"
      columns: ["transfer_occurrence_id","budget_id"]
isOneToOne: false
      referencedRelation: "transfer_occurrences"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"transfer_occurrences": {
                  Row: {
                    "amount": number | null,"budget_id": string,"by_catch_up": boolean,"created_at": string,"done_on": string | null,"id": string,"kind": Database["public"]['Enums']["transfer_occurrence_kind"],"mark": Database["public"]['Enums']["transfer_mark"],"occurrence_date": string | null,"occurrence_seq": number | null,"recorded_by": string | null,"revision": number,"transfer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"budget_id": string,"by_catch_up"?: boolean,"created_at"?: string,"done_on"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["transfer_occurrence_kind"],"mark": Database["public"]['Enums']["transfer_mark"],"occurrence_date"?: string | null,"occurrence_seq"?: number | null,"recorded_by"?: string | null,"revision"?: number,"transfer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number | null,"budget_id"?: string,"by_catch_up"?: boolean,"created_at"?: string,"done_on"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["transfer_occurrence_kind"],"mark"?: Database["public"]['Enums']["transfer_mark"],"occurrence_date"?: string | null,"occurrence_seq"?: number | null,"recorded_by"?: string | null,"revision"?: number,"transfer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfer_occurrences_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_occurrences_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_occurrences_transfer_fk"
      columns: ["transfer_id","budget_id"]
isOneToOne: false
      referencedRelation: "transfer_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_occurrences_transfer_fk"
      columns: ["transfer_id","budget_id"]
isOneToOne: false
      referencedRelation: "transfers"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"transfer_versions": {
                  Row: {
                    "amount": number,"anchor_date": string | null,"budget_id": string,"cadence": Database["public"]['Enums']["subscription_cadence"] | null,"category_id": string | null,"created_at": string,"day_of_month": number | null,"effective_from_seq": number,"from_account_id": string,"id": string,"income_gone": boolean,"income_id": string | null,"is_automatic": boolean,"offset_days": number | null,"schedule": Database["public"]['Enums']["transfer_schedule"],"to_account_id": string,"transfer_id": string,"updated_at": string,"weekend_rule": Database["public"]['Enums']["weekend_rule"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"anchor_date"?: string | null,"budget_id": string,"cadence"?: Database["public"]['Enums']["subscription_cadence"] | null,"category_id"?: string | null,"created_at"?: string,"day_of_month"?: number | null,"effective_from_seq": number,"from_account_id": string,"id"?: string,"income_gone"?: boolean,"income_id"?: string | null,"is_automatic": boolean,"offset_days"?: number | null,"schedule": Database["public"]['Enums']["transfer_schedule"],"to_account_id": string,"transfer_id": string,"updated_at"?: string,"weekend_rule"?: Database["public"]['Enums']["weekend_rule"] | null
                  }
                  Update: {
                    "amount"?: number,"anchor_date"?: string | null,"budget_id"?: string,"cadence"?: Database["public"]['Enums']["subscription_cadence"] | null,"category_id"?: string | null,"created_at"?: string,"day_of_month"?: number | null,"effective_from_seq"?: number,"from_account_id"?: string,"id"?: string,"income_gone"?: boolean,"income_id"?: string | null,"is_automatic"?: boolean,"offset_days"?: number | null,"schedule"?: Database["public"]['Enums']["transfer_schedule"],"to_account_id"?: string,"transfer_id"?: string,"updated_at"?: string,"weekend_rule"?: Database["public"]['Enums']["weekend_rule"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfer_versions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_versions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_versions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_from_fk"
      columns: ["from_account_id","budget_id"]
isOneToOne: false
      referencedRelation: "account_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_from_fk"
      columns: ["from_account_id","budget_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_income_fk"
      columns: ["income_id"]
isOneToOne: false
      referencedRelation: "income_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_versions_income_fk"
      columns: ["income_id"]
isOneToOne: false
      referencedRelation: "incomes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_versions_to_fk"
      columns: ["to_account_id","budget_id"]
isOneToOne: false
      referencedRelation: "account_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_to_fk"
      columns: ["to_account_id","budget_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_transfer_fk"
      columns: ["transfer_id","budget_id"]
isOneToOne: false
      referencedRelation: "transfer_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transfer_versions_transfer_fk"
      columns: ["transfer_id","budget_id"]
isOneToOne: false
      referencedRelation: "transfers"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"transfers": {
                  Row: {
                    "budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"income_gone_on": string | null,"income_gone_seq": number | null,"name": string,"needs_check": boolean,"next_due": string | null,"revision": number,"settled_through": string,"starts_on": string,"starts_seq": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"income_gone_on"?: string | null,"income_gone_seq"?: number | null,"name": string,"needs_check"?: boolean,"next_due"?: string | null,"revision"?: number,"settled_through": string,"starts_on": string,"starts_seq": number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"income_gone_on"?: string | null,"income_gone_seq"?: number | null,"name"?: string,"needs_check"?: boolean,"next_due"?: string | null,"revision"?: number,"settled_through"?: string,"starts_on"?: string,"starts_seq"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfers_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "account_overview": {
                  Row: {
                    "bank_label": string | null,"budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"in_use": boolean | null,"is_active": boolean | null,"kind": Database["public"]['Enums']["account_kind"],"name": string,"removal_deletes": boolean | null,"revision": number,"updated_at": string,"user_display_name": string | null,"user_id": string | null,"user_is_member": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "accounts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_member_list": {
                  Row: {
                    "budget_id": string,"display_name": string | null,"email": string | null,"joined_at": string,"role": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "budget_members_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_members_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"category_overview": {
                  Row: {
                    "amount": number | null,"budget_id": string,"cadence": Database["public"]['Enums']["expectation_cadence"] | null,"committed_amount": number | null,"created_at": string,"end_seq": number | null,"first_seq": number,"has_transactions": boolean | null,"id": string,"in_use": boolean | null,"is_active": boolean | null,"is_group": boolean,"is_to_categorise": boolean,"monthly_amount": number | null,"name": string,"parent_id": string | null,"removal_deletes": boolean | null,"revision": number,"sort_order": number,"terms_from_seq": number | null,"transfer_committed_amount": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "categories_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_fk"
      columns: ["parent_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "categories_parent_fk"
      columns: ["parent_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"debt_overview": {
                  Row: {
                    "adjustment_total": number | null,"budget_id": string,"category_id": string,"category_name": string | null,"created_at": string,"end_seq": number | null,"expected_end_after_budget_end": boolean | null,"expected_end_date": string | null,"first_seq": number,"has_history": boolean | null,"id": string,"interest_rate": number,"interest_total": number | null,"is_active": boolean | null,"monthly_payment": number,"name": string,"opened_on": string,"overpaid_by": number | null,"paid_percent": number | null,"paid_total": number | null,"parent_category_id": string | null,"parent_category_name": string | null,"payments_left": number | null,"payoff": Database["public"]['Enums']["debt_payoff"] | null,"principal": number,"remaining": number | null,"removal_deletes": boolean | null,"revision": number,"terms_from_seq": number,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "debts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_totals": {
                  Row: {
                    "budget_id": string,"owing_count": number | null,"remaining_total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "debts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batch_list": {
                  Row: {
                    "budget_id": string,"charges_confirmed_count": number,"chosen_skip_count": number,"chunk_count": number,"created_at": string,"created_by": string | null,"created_by_name": string | null,"duplicate_count": number,"flagged_count": number,"id": string,"imported_count": number,"invalid_count": number,"matched_count": number,"row_count": number,"source": string,"statement_from": string | null,"statement_to": string | null,"to_review_count": number | null,"token_id": string | null,"token_name": string | null,"undone_at": string | null,"undone_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "budget_id"?: string | null,"charges_confirmed_count"?: number | null,"chosen_skip_count"?: number | null,"chunk_count"?: number | null,"created_at"?: string | null,"created_by"?: string | null,"created_by_name"?: never,"duplicate_count"?: number | null,"flagged_count"?: number | null,"id"?: string | null,"imported_count"?: number | null,"invalid_count"?: number | null,"matched_count"?: number | null,"row_count"?: number | null,"source"?: string | null,"statement_from"?: string | null,"statement_to"?: string | null,"to_review_count"?: never,"token_id"?: string | null,"token_name"?: string | null,"undone_at"?: string | null,"undone_by"?: string | null
                         }
                        Update: {
                           "budget_id"?: string | null,"charges_confirmed_count"?: number | null,"chosen_skip_count"?: number | null,"chunk_count"?: number | null,"created_at"?: string | null,"created_by"?: string | null,"created_by_name"?: never,"duplicate_count"?: number | null,"flagged_count"?: number | null,"id"?: string | null,"imported_count"?: number | null,"invalid_count"?: number | null,"matched_count"?: number | null,"row_count"?: number | null,"source"?: string | null,"statement_from"?: string | null,"statement_to"?: string | null,"to_review_count"?: never,"token_id"?: string | null,"token_name"?: string | null,"undone_at"?: string | null,"undone_by"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "import_batches_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "import_token_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "import_tokens"
      referencedColumns: ["id"]
    }
                  ]
                },"import_token_list": {
                  Row: {
                    "budget_id": string,"created_at": string,"created_by": string | null,"created_by_name": string | null,"expires_at": string,"id": string,"is_active": boolean | null,"last_used_at": string | null,"name": string,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "import_tokens_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_tokens_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"income_overview": {
                  Row: {
                    "account_id": string | null,"account_name": string | null,"amount": number,"budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"is_active": boolean | null,"is_primary": boolean | null,"name": string,"next_pay_date": string | null,"pay_day": number,"revision": number,"terms_from_seq": number,"updated_at": string,"user_display_name": string | null,"user_id": string | null,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "incomes_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incomes_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"merchant_rule_list": {
                  Row: {
                    "budget_id": string,"category_id": string,"category_in_force": boolean | null,"category_name": string,"created_at": string,"created_by": string | null,"fragment": string,"id": string,"parent_category_id": string | null,"parent_category_name": string | null,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "merchant_rules_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "merchant_rules_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "merchant_rules_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "merchant_rules_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"my_budgets": {
                  Row: {
                    "caught_up": boolean | null,"charges_awaiting": number | null,"created_at": string,"end_date": string | null,"end_date_entered": string | null,"first_period_start": string | null,"id": string,"is_owner": boolean | null,"name": string,"owner_id": string,"primary_income_id": string,"revision": number,"to_categorise_category_id": string | null,"to_review": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "budgets_primary_income_fk"
      columns: ["primary_income_id","id"]
isOneToOne: false
      referencedRelation: "income_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "budgets_primary_income_fk"
      columns: ["primary_income_id","id"]
isOneToOne: false
      referencedRelation: "incomes"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"period_summaries": {
                  Row: {
                    "budget_id": string,"committed_total": number | null,"end_date": string,"end_is_manual": boolean,"expected_total": number | null,"extra_income_total": number | null,"id": string,"income_total": number | null,"is_current": boolean | null,"left_to_assign": number | null,"result": number | null,"revision": number,"salary_total": number | null,"seq": number,"spent_total": number | null,"start_date": string,"today": string | null,"transfer_committed_total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "periods_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "periods_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_overview": {
                  Row: {
                    "anchor_date": string,"awaiting_count": number | null,"budget_id": string,"cadence": Database["public"]['Enums']["subscription_cadence"],"category_id": string,"category_name": string | null,"charge_count": number | null,"charge_day": number,"charged_through": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"is_active": boolean | null,"monthly_cost": number | null,"name": string,"next_charge_date": string | null,"parent_category_id": string | null,"parent_category_name": string | null,"price": number,"removal_deletes": boolean | null,"revision": number,"terms_from_seq": number,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_list": {
                  Row: {
                    "amount": number,"bank_transaction_id": string | null,"budget_id": string,"category_id": string | null,"category_name": string | null,"charge_date": string | null,"created_at": string,"date": string,"debt_ended": boolean | null,"debt_id": string | null,"debt_name": string | null,"description": string | null,"details": Json | null,"id": string,"import_batch_id": string | null,"import_source": string | null,"in_to_categorise": boolean | null,"kind": Database["public"]['Enums']["transaction_kind"],"merchant": string | null,"merchant_key": string | null,"parent_category_id": string | null,"parent_category_name": string | null,"period_id": string | null,"recorded_by": string | null,"recorded_by_name": string | null,"review_state": Database["public"]['Enums']["review_state"],"revision": number,"subscription_id": string | null,"subscription_name": string | null,"transfer_id": string | null,"transfer_name": string | null,"transfer_occurrence_date": string | null,"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,"transfer_occurrence_seq": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "transactions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_category_fk"
      columns: ["category_id","budget_id"]
isOneToOne: false
      referencedRelation: "category_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debt_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_debt_fk"
      columns: ["debt_id","budget_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_import_batch_fk"
      columns: ["import_batch_id","budget_id"]
isOneToOne: false
      referencedRelation: "import_batch_list"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_import_batch_fk"
      columns: ["import_batch_id","budget_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_subscription_fk"
      columns: ["subscription_id","budget_id"]
isOneToOne: false
      referencedRelation: "subscription_overview"
      referencedColumns: ["id","budget_id"]
    },{
      foreignKeyName: "transactions_subscription_fk"
      columns: ["subscription_id","budget_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id","budget_id"]
    }
                  ]
                },"transfer_overview": {
                  Row: {
                    "amount": number,"budget_id": string,"cadence": Database["public"]['Enums']["subscription_cadence"] | null,"category_id": string | null,"category_name": string | null,"created_at": string,"day_of_month": number | null,"end_seq": number | null,"first_date": string | null,"first_seq": number,"follows_primary": boolean | null,"from_account_id": string,"from_account_name": string,"has_history": boolean | null,"id": string,"income_id": string | null,"income_name": string | null,"is_active": boolean | null,"is_automatic": boolean,"monthly_amount": number | null,"name": string,"next_due_date": string | null,"offset_days": number | null,"parent_category_id": string | null,"parent_category_name": string | null,"removal_deletes": boolean | null,"revision": number,"schedule": Database["public"]['Enums']["transfer_schedule"],"starts_on": string,"starts_seq": number,"terms_from_seq": number,"to_account_id": string,"to_account_name": string,"transaction_count": number | null,"updated_at": string,"weekend_rule": Database["public"]['Enums']["weekend_rule"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "transfer_versions_income_fk"
      columns: ["income_id"]
isOneToOne: false
      referencedRelation: "income_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_versions_income_fk"
      columns: ["income_id"]
isOneToOne: false
      referencedRelation: "incomes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfers_budget_id_fkey"
      columns: ["budget_id"]
isOneToOne: false
      referencedRelation: "my_budgets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_invitation_id": string }; Returns: string
                           },
"add_income":
{ Args: { "p_account_id"?: string,"p_amount": number,"p_budget_id": string,"p_client_id"?: string,"p_from_period_id"?: string,"p_name": string,"p_pay_day": number,"p_user_id"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: string
                           },
"add_transaction":
{ Args: { "p_amount": number,"p_budget_id": string,"p_category_id"?: string,"p_client_id"?: string,"p_date": string,"p_debt_id"?: string,"p_description"?: string,"p_kind": Database["public"]['Enums']["transaction_kind"],"p_subscription_id"?: string }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"adjust_debt_balance":
{ Args: { "p_balance": number,"p_date"?: string,"p_debt_id": string,"p_expected_revision": number,"p_note"?: string }; Returns: {
              "adjustment_total": number | null,
"budget_id": string,
"category_id": string,
"category_name": string | null,
"created_at": string,
"end_seq": number | null,
"expected_end_after_budget_end": boolean | null,
"expected_end_date": string | null,
"first_seq": number,
"has_history": boolean | null,
"id": string,
"interest_rate": number,
"interest_total": number | null,
"is_active": boolean | null,
"monthly_payment": number,
"name": string,
"opened_on": string,
"overpaid_by": number | null,
"paid_percent": number | null,
"paid_total": number | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"payments_left": number | null,
"payoff": Database["public"]['Enums']["debt_payoff"] | null,
"principal": number,
"remaining": number | null,
"removal_deletes": boolean | null,
"revision": number,
"terms_from_seq": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "debt_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"cancel_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"close_account":
{ Args: { "p_account_id": string,"p_expected_revision": number,"p_from_period_id"?: string }; Returns: string
                           },
"confirm_import":
{ Args: { "p_expected_revision": number,"p_transaction_id": string }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"confirm_imports":
{ Args: { "p_batch_id"?: string,"p_budget_id": string }; Returns: {
              "confirmed": number,"left_to_categorise": number
            }[]
                           },
"confirm_subscription_charge":
{ Args: { "p_expected_revision": number,"p_transaction_id": string }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"confirm_subscription_charges":
{ Args: { "p_budget_id": string,"p_through_date"?: string }; Returns: number
                           },
"create_account":
{ Args: { "p_bank_label"?: string,"p_budget_id": string,"p_client_id"?: string,"p_from_period_id"?: string,"p_kind": Database["public"]['Enums']["account_kind"],"p_name": string,"p_user_id"?: string }; Returns: {
              "bank_label": string | null,
"budget_id": string,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"id": string,
"in_use": boolean | null,
"is_active": boolean | null,
"kind": Database["public"]['Enums']["account_kind"],
"name": string,
"removal_deletes": boolean | null,
"revision": number,
"updated_at": string,
"user_display_name": string | null,
"user_id": string | null,
"user_is_member": boolean | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "account_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_budget":
{ Args: { "p_amount": number,"p_end_date"?: string,"p_income_name": string,"p_name": string,"p_pay_day": number,"p_start_month"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: string
                           },
"create_category":
{ Args: { "p_amount"?: number,"p_budget_id": string,"p_cadence"?: Database["public"]['Enums']["expectation_cadence"],"p_client_id"?: string,"p_from_period_id"?: string,"p_name": string,"p_other_name"?: string,"p_parent_id"?: string }; Returns: {
              "amount": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["expectation_cadence"] | null,
"committed_amount": number | null,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"has_transactions": boolean | null,
"id": string,
"in_use": boolean | null,
"is_active": boolean | null,
"is_group": boolean,
"is_to_categorise": boolean,
"monthly_amount": number | null,
"name": string,
"parent_id": string | null,
"removal_deletes": boolean | null,
"revision": number,
"sort_order": number,
"terms_from_seq": number | null,
"transfer_committed_amount": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "category_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_debt":
{ Args: { "p_budget_id": string,"p_category_id": string,"p_client_id"?: string,"p_from_period_id"?: string,"p_interest_rate"?: number,"p_monthly_payment": number,"p_name": string,"p_principal": number }; Returns: {
              "adjustment_total": number | null,
"budget_id": string,
"category_id": string,
"category_name": string | null,
"created_at": string,
"end_seq": number | null,
"expected_end_after_budget_end": boolean | null,
"expected_end_date": string | null,
"first_seq": number,
"has_history": boolean | null,
"id": string,
"interest_rate": number,
"interest_total": number | null,
"is_active": boolean | null,
"monthly_payment": number,
"name": string,
"opened_on": string,
"overpaid_by": number | null,
"paid_percent": number | null,
"paid_total": number | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"payments_left": number | null,
"payoff": Database["public"]['Enums']["debt_payoff"] | null,
"principal": number,
"remaining": number | null,
"removal_deletes": boolean | null,
"revision": number,
"terms_from_seq": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "debt_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_import_token":
{ Args: { "p_budget_id": string,"p_expires_in_days"?: number,"p_name": string }; Returns: {
              "expires_at": string,"token": string,"token_id": string
            }[]
                           },
"create_merchant_rule":
{ Args: { "p_apply"?: boolean,"p_budget_id": string,"p_category_id": string,"p_fragment": string }; Returns: {
              "fragment": string,"moved": number,"revision": number,"rule_id": string
            }[]
                           },
"create_subscription":
{ Args: { "p_budget_id": string,"p_cadence": Database["public"]['Enums']["subscription_cadence"],"p_category_id": string,"p_client_id"?: string,"p_first_charge_date": string,"p_from_period_id"?: string,"p_name": string,"p_price": number }; Returns: {
              "anchor_date": string,
"awaiting_count": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["subscription_cadence"],
"category_id": string,
"category_name": string | null,
"charge_count": number | null,
"charge_day": number,
"charged_through": string,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"id": string,
"is_active": boolean | null,
"monthly_cost": number | null,
"name": string,
"next_charge_date": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"price": number,
"removal_deletes": boolean | null,
"revision": number,
"terms_from_seq": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "subscription_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_transfer":
{ Args: { "p_amount": number,"p_budget_id": string,"p_cadence"?: Database["public"]['Enums']["subscription_cadence"],"p_category_id"?: string,"p_client_id"?: string,"p_day_of_month"?: number,"p_first_date"?: string,"p_from_account_id": string,"p_from_period_id"?: string,"p_income_id"?: string,"p_is_automatic"?: boolean,"p_name": string,"p_offset_days"?: number,"p_schedule": Database["public"]['Enums']["transfer_schedule"],"p_to_account_id": string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "amount": number,
"budget_id": string,
"cadence": Database["public"]['Enums']["subscription_cadence"] | null,
"category_id": string | null,
"category_name": string | null,
"created_at": string,
"day_of_month": number | null,
"end_seq": number | null,
"first_date": string | null,
"first_seq": number,
"follows_primary": boolean | null,
"from_account_id": string,
"from_account_name": string,
"has_history": boolean | null,
"id": string,
"income_id": string | null,
"income_name": string | null,
"is_active": boolean | null,
"is_automatic": boolean,
"monthly_amount": number | null,
"name": string,
"next_due_date": string | null,
"offset_days": number | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"removal_deletes": boolean | null,
"revision": number,
"schedule": Database["public"]['Enums']["transfer_schedule"],
"starts_on": string,
"starts_seq": number,
"terms_from_seq": number,
"to_account_id": string,
"to_account_name": string,
"transaction_count": number | null,
"updated_at": string,
"weekend_rule": Database["public"]['Enums']["weekend_rule"] | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "transfer_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"decline_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"delete_budget":
{ Args: { "p_budget_id": string }; Returns: undefined
                           },
"delete_debt_adjustment":
{ Args: { "p_adjustment_id": string,"p_expected_revision": number }; Returns: {
              "adjustment_total": number | null,
"budget_id": string,
"category_id": string,
"category_name": string | null,
"created_at": string,
"end_seq": number | null,
"expected_end_after_budget_end": boolean | null,
"expected_end_date": string | null,
"first_seq": number,
"has_history": boolean | null,
"id": string,
"interest_rate": number,
"interest_total": number | null,
"is_active": boolean | null,
"monthly_payment": number,
"name": string,
"opened_on": string,
"overpaid_by": number | null,
"paid_percent": number | null,
"paid_total": number | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"payments_left": number | null,
"payoff": Database["public"]['Enums']["debt_payoff"] | null,
"principal": number,
"remaining": number | null,
"removal_deletes": boolean | null,
"revision": number,
"terms_from_seq": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "debt_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"delete_import_token":
{ Args: { "p_token_id": string }; Returns: undefined
                           },
"delete_merchant_rule":
{ Args: { "p_expected_revision": number,"p_rule_id": string }; Returns: undefined
                           },
"delete_transaction":
{ Args: { "p_expected_revision": number,"p_transaction_id": string }; Returns: undefined
                           },
"dismiss_subscription_charge":
{ Args: { "p_expected_revision": number,"p_transaction_id": string }; Returns: undefined
                           },
"end_category":
{ Args: { "p_category_id": string,"p_expected_revision": number,"p_from_period_id"?: string }; Returns: string
                           },
"end_subscription":
{ Args: { "p_expected_revision": number,"p_from_period_id"?: string,"p_subscription_id": string }; Returns: string
                           },
"end_transfer":
{ Args: { "p_expected_revision": number,"p_from_period_id"?: string,"p_transfer_id": string }; Returns: string
                           },
"ensure_periods":
{ Args: { "p_budget_id": string }; Returns: number
                           },
"extend_category":
{ Args: { "p_amount"?: number,"p_cadence"?: Database["public"]['Enums']["expectation_cadence"],"p_category_id": string,"p_expected_revision": number,"p_from_period_id": string }; Returns: {
              "amount": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["expectation_cadence"] | null,
"committed_amount": number | null,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"has_transactions": boolean | null,
"id": string,
"in_use": boolean | null,
"is_active": boolean | null,
"is_group": boolean,
"is_to_categorise": boolean,
"monthly_amount": number | null,
"name": string,
"parent_id": string | null,
"removal_deletes": boolean | null,
"revision": number,
"sort_order": number,
"terms_from_seq": number | null,
"transfer_committed_amount": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "category_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"forget_import_choice":
{ Args: { "p_budget_id": string,"p_counterparty_key": string,"p_flag": string }; Returns: boolean
                           },
"get_category_terms":
{ Args: { "p_category_id": string,"p_period_id": string }; Returns: {
              "amount": number,"cadence": Database["public"]['Enums']["expectation_cadence"],"in_force": boolean,"period_id": string,"terms_from_period_id": string,"until_period_id": string
            }[]
                           },
"get_category_trend":
{ Args: { "p_budget_id": string,"p_count"?: number }; Returns: {
              "active_average_spent": number,"active_count": number,"average_spent": number,"category_id": string,"committed": (number)[],"completed_count": number,"display_order": number,"in_force": (boolean)[],"is_group": boolean,"is_overspent": (boolean)[],"name": string,"parent_id": string,"period_ids": (string)[],"planned": (number)[],"spent": (number)[],"transaction_count": (number)[],"transfer_committed": (number)[]
            }[]
                           },
"get_current_period":
{ Args: { "p_budget_id": string }; Returns: {
              "budget_id": string,
"committed_total": number | null,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"revision": number,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null,
"transfer_committed_total": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_debt_history":
{ Args: { "p_after_created_at"?: string,"p_after_date"?: string,"p_after_id"?: string,"p_after_kind"?: string,"p_debt_id": string,"p_limit"?: number,"p_newest_first"?: boolean }; Returns: Database["public"]['CompositeTypes']["debt_history_row"][]
                          SetofOptions: {
        from: "*"
        to: "debt_history_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_debt_terms":
{ Args: { "p_debt_id": string,"p_period_id": string }; Returns: {
              "category_id": string,"in_force": boolean,"interest_rate": number,"monthly_payment": number,"period_id": string,"terms_from_period_id": string,"until_period_id": string
            }[]
                           },
"get_import_batch":
{ Args: { "p_batch_id": string }; Returns: {
              "budget_id": string,
"charges_confirmed_count": number,
"chosen_skip_count": number,
"chunk_count": number,
"created_at": string,
"created_by": string | null,
"created_by_name": string | null,
"duplicate_count": number,
"flagged_count": number,
"id": string,
"imported_count": number,
"invalid_count": number,
"matched_count": number,
"row_count": number,
"source": string,
"statement_from": string | null,
"statement_to": string | null,
"to_review_count": number | null,
"token_id": string | null,
"token_name": string | null,
"undone_at": string | null,
"undone_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "import_batch_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_income_terms":
{ Args: { "p_income_id": string,"p_period_id": string }; Returns: {
              "account_id": string,"amount": number,"in_force": boolean,"pay_day": number,"period_id": string,"terms_from_period_id": string,"until_period_id": string,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
            }[]
                           },
"get_money_flow":
{ Args: { "p_budget_id": string,"p_period_id"?: string }; Returns: {
              "account_kind": Database["public"]['Enums']["account_kind"],"actual_spending": number,"amount": number,"cadence": Database["public"]['Enums']["subscription_cadence"],"created_at": string,"display_order": number,"expected": number,"id": string,"inflow": number,"is_automatic": boolean,"is_negative": boolean,"left_amount": number,"name": string,"not_planned": number,"outflow": number,"period_id": string,"planned_amount": number,"planned_spending": number,"row_kind": string,"set_aside": number,"source_id": string,"spendable": boolean,"spendable_amount": number,"spending_rows_omitted": number,"spent": number,"stays": number,"target_id": string,"transfer_share": number,"transfer_spent": number,"user_id": string,"yearly_amount": number
            }[]
                           },
"get_period_comparison":
{ Args: { "p_budget_id": string,"p_period_a_id"?: string,"p_period_b_id"?: string }; Returns: {
              "a_committed": number,"a_days": number,"a_end_date": string,"a_in_force": boolean,"a_income": number,"a_is_completed": boolean,"a_is_current": boolean,"a_is_overspent": boolean,"a_period_id": string,"a_planned": number,"a_result": number,"a_spent": number,"a_start_date": string,"a_transaction_count": number,"a_transfer_committed": number,"b_committed": number,"b_days": number,"b_end_date": string,"b_in_force": boolean,"b_income": number,"b_is_completed": boolean,"b_is_current": boolean,"b_is_overspent": boolean,"b_period_id": string,"b_planned": number,"b_result": number,"b_spent": number,"b_start_date": string,"b_transaction_count": number,"b_transfer_committed": number,"category_id": string,"committed_difference": number,"display_order": number,"income_difference": number,"is_group": boolean,"kind": string,"name": string,"parent_id": string,"planned_difference": number,"result_difference": number,"spent_difference": number,"transfer_committed_difference": number
            }[]
                           },
"get_period_progress":
{ Args: { "p_period_id": string }; Returns: Database["public"]['CompositeTypes']["category_progress_row"][]
                          SetofOptions: {
        from: "*"
        to: "category_progress_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_period_trend":
{ Args: { "p_budget_id": string,"p_count"?: number }; Returns: {
              "average_income": number,"average_result": number,"average_spent": number,"committed_total": number,"completed_count": number,"days": number,"end_date": string,"expected_total": number,"extra_income_total": number,"income_total": number,"is_completed": boolean,"is_current": boolean,"period_id": string,"result": number,"salary_total": number,"seq": number,"spent_total": number,"start_date": string,"transfer_committed_total": number
            }[]
                           },
"get_start_months":
{ Args: { "p_pay_day": number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "is_default": boolean,"month": string,"start_date": string,"today": string
            }[]
                           },
"get_subscription_terms":
{ Args: { "p_period_id": string,"p_subscription_id": string }; Returns: {
              "anchor_date": string,"cadence": Database["public"]['Enums']["subscription_cadence"],"category_id": string,"charge_day": number,"in_force": boolean,"period_id": string,"price": number,"terms_from_period_id": string,"until_period_id": string
            }[]
                           },
"get_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_transfer_checklist":
{ Args: { "p_period_id": string }; Returns: Database["public"]['CompositeTypes']["transfer_checklist_row"][]
                          SetofOptions: {
        from: "*"
        to: "transfer_checklist_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_transfer_terms":
{ Args: { "p_period_id": string,"p_transfer_id": string }; Returns: {
              "amount": number,"cadence": Database["public"]['Enums']["subscription_cadence"],"category_id": string,"day_of_month": number,"first_date": string,"from_account_id": string,"in_force": boolean,"income_id": string,"is_automatic": boolean,"offset_days": number,"period_id": string,"schedule": Database["public"]['Enums']["transfer_schedule"],"terms_from_period_id": string,"to_account_id": string,"until_period_id": string,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
            }[]
                           },
"get_transfers_to_do":
{ Args: { "p_budget_id": string }; Returns: {
              "transfers_overdue": number,"transfers_to_do": number
            }[]
                           },
"import_skipped_anyway":
{ Args: { "p_batch_id": string,"p_skipped_row_ids"?: (string)[] }; Returns: Database["public"]['CompositeTypes']["import_row_result"][]
                          SetofOptions: {
        from: "*"
        to: "import_row_result"
        isOneToOne: false
        isSetofReturn: true
      } },
"import_transactions":
{ Args: { "p_batch_id": string,"p_budget_id": string,"p_chunk": number,"p_rows": Json,"p_source": string,"p_statement_from"?: string,"p_statement_to"?: string,"p_to_categorise_name"?: string }; Returns: Database["public"]['CompositeTypes']["import_row_result"][]
                          SetofOptions: {
        from: "*"
        to: "import_row_result"
        isOneToOne: false
        isSetofReturn: true
      } },
"import_with_token":
{ Args: { "p_batch_id": string,"p_chunk": string,"p_rows": Json,"p_source"?: string,"p_statement_from"?: string,"p_statement_to"?: string,"p_token": string }; Returns: {
              "error": string,"received": number,"refused": number,"refused_rows": Json
            }[]
                           },
"invite_member":
{ Args: { "p_budget_id": string,"p_email": string }; Returns: string
                           },
"leave_budget":
{ Args: { "p_budget_id": string }; Returns: undefined
                           },
"link_transaction":
{ Args: { "p_debt_id"?: string,"p_expected_revision": number,"p_subscription_id"?: string,"p_transaction_id": string }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_categories_for_date":
{ Args: { "p_budget_id": string,"p_date": string }; Returns: Database["public"]['CompositeTypes']["category_choice"][]
                          SetofOptions: {
        from: "*"
        to: "category_choice"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_charges_awaiting_confirmation":
{ Args: { "p_budget_id": string,"p_limit"?: number }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_import_batches":
{ Args: { "p_before_created_at"?: string,"p_before_id"?: string,"p_budget_id": string,"p_limit"?: number }; Returns: {
              "budget_id": string,
"charges_confirmed_count": number,
"chosen_skip_count": number,
"chunk_count": number,
"created_at": string,
"created_by": string | null,
"created_by_name": string | null,
"duplicate_count": number,
"flagged_count": number,
"id": string,
"imported_count": number,
"invalid_count": number,
"matched_count": number,
"row_count": number,
"source": string,
"statement_from": string | null,
"statement_to": string | null,
"to_review_count": number | null,
"token_id": string | null,
"token_name": string | null,
"undone_at": string | null,
"undone_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "import_batch_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_import_choices":
{ Args: { "p_after_flag"?: string,"p_after_key"?: string,"p_budget_id": string,"p_limit"?: number }; Returns: {
              "budget_id": string,
"choice": string,
"counterparty_key": string,
"flag": string,
"updated_at": string,
"updated_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "import_choices"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_import_skipped_rows":
{ Args: { "p_after_chunk"?: number,"p_after_row_no"?: number,"p_batch_id": string,"p_limit"?: number }; Returns: {
              "batch_id": string,
"budget_id": string,
"chunk": number,
"created_at": string,
"detail": string | null,
"duplicate_of": string | null,
"id": string,
"imported_at": string | null,
"imported_transaction_id": string | null,
"match_of": string | null,
"reason": string,
"row_data": NonNullable<Json>,
"row_no": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "import_skipped_rows"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_my_invitations":
{ Args: { "p_after_created_at"?: string,"p_after_id"?: string,"p_limit"?: number }; Returns: {
              "budget_id": string,"budget_name": string,"created_at": string,"expires_at": string,"id": string,"invited_by_email": string,"invited_by_name": string
            }[]
                           },
"list_periods":
{ Args: { "p_before_seq"?: number,"p_budget_id": string,"p_limit"?: number }; Returns: {
              "budget_id": string,
"committed_total": number | null,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"revision": number,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null,
"transfer_committed_total": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_transactions":
{ Args: { "p_awaiting_only"?: boolean,"p_before_created_at"?: string,"p_before_date"?: string,"p_before_id"?: string,"p_budget_id": string,"p_category_id"?: string,"p_debt_id"?: string,"p_from_date"?: string,"p_import_batch_id"?: string,"p_kind"?: Database["public"]['Enums']["transaction_kind"],"p_limit"?: number,"p_subscription_id"?: string,"p_to_date"?: string,"p_to_review_only"?: boolean,"p_transfer_id"?: string }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"mark_transfer_done":
{ Args: { "p_amount"?: number,"p_done_on"?: string,"p_expected_revision": number,"p_occurrence_date"?: string,"p_occurrence_kind"?: Database["public"]['Enums']["transfer_occurrence_kind"],"p_occurrence_seq"?: number,"p_period_id": string,"p_transfer_id": string }; Returns: Database["public"]['CompositeTypes']["transfer_checklist_row"][]
                          SetofOptions: {
        from: "*"
        to: "transfer_checklist_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"mark_transfer_not_done":
{ Args: { "p_expected_revision": number,"p_occurrence_date"?: string,"p_occurrence_kind"?: Database["public"]['Enums']["transfer_occurrence_kind"],"p_occurrence_seq"?: number,"p_period_id": string,"p_transfer_id": string }; Returns: Database["public"]['CompositeTypes']["transfer_checklist_row"][]
                          SetofOptions: {
        from: "*"
        to: "transfer_checklist_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"move_period_start":
{ Args: { "p_expected_revision": number,"p_period_id": string,"p_start_date"?: string }; Returns: undefined
                           },
"pay_date":
{ Args: { "p_month": number,"p_pay_day": number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"],"p_year": number }; Returns: string
                           },
"preview_close_account":
{ Args: { "p_account_id": string,"p_from_period_id"?: string }; Returns: {
              "outcome": string,"refusal": string,"used_by": Json
            }[]
                           },
"preview_create_subscription":
{ Args: { "p_budget_id": string,"p_cadence": Database["public"]['Enums']["subscription_cadence"],"p_count"?: number,"p_first_charge_date": string,"p_from_period_id"?: string }; Returns: {
              "charge_date": string,"charged_at_once": boolean
            }[]
                           },
"preview_create_transfer":
{ Args: { "p_amount": number,"p_budget_id": string,"p_cadence"?: Database["public"]['Enums']["subscription_cadence"],"p_category_id"?: string,"p_count"?: number,"p_day_of_month"?: number,"p_first_date"?: string,"p_from_account_id": string,"p_from_period_id"?: string,"p_income_id"?: string,"p_is_automatic"?: boolean,"p_offset_days"?: number,"p_schedule": Database["public"]['Enums']["transfer_schedule"],"p_to_account_id": string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "already_recorded": boolean,"amount": number,"category_id": string,"created_at_once": boolean,"created_at_once_count": number,"due_date": string,"end_date": string,"follows_primary": boolean,"is_automatic": boolean,"marks_unplanned_count": number,"occurrence_date": string,"occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"],"occurrence_seq": number,"period_id": string,"projected": boolean,"start_date": string,"transactions_moved_count": number,"transactions_removed_count": number
            }[]
                           },
"preview_end_subscription":
{ Args: { "p_from_period_id"?: string,"p_subscription_id": string }; Returns: {
              "outcome": string,"refusal": string
            }[]
                           },
"preview_end_transfer":
{ Args: { "p_from_period_id"?: string,"p_transfer_id": string }; Returns: {
              "marks_kept": number,"occurrences_removed": number,"outcome": string,"refusal": string,"transactions_kept": number
            }[]
                           },
"preview_import":
{ Args: { "p_batch_id": string,"p_budget_id": string,"p_rows": Json }; Returns: Database["public"]['CompositeTypes']["import_row_result"][]
                          SetofOptions: {
        from: "*"
        to: "import_row_result"
        isOneToOne: false
        isSetofReturn: true
      } },
"preview_import_part":
{ Args: { "p_batch_id": string,"p_budget_id": string,"p_part": number,"p_rows": Json }; Returns: Json
                           },
"preview_merchant_rule":
{ Args: { "p_budget_id": string,"p_category_id"?: string,"p_fragment": string }; Returns: {
              "covered_by_fragment": string,"covered_by_rule_id": string,"fragment": string,"rule_exists": boolean,"would_move": number
            }[]
                           },
"preview_move_period_start":
{ Args: { "p_period_id": string,"p_start_date"?: string }; Returns: {
              "accepted": boolean,"interest_removed": number,"period_id": string,"refusal": string,"scheduled_start": string,"transfer_marks_unplanned": number,"transfer_transactions_created": number,"transfer_transactions_moved": number,"transfer_transactions_removed": number
            }[]
                           },
"preview_record_early_pay_date":
{ Args: { "p_budget_id": string,"p_pay_date": string }; Returns: {
              "accepted": boolean,"period_id": string,"refusal": string,"transfer_marks_unplanned": number,"transfer_transactions_created": number,"transfer_transactions_moved": number,"transfer_transactions_removed": number
            }[]
                           },
"preview_remove_debt":
{ Args: { "p_debt_id": string,"p_from_period_id"?: string }; Returns: {
              "outcome": string,"refusal": string
            }[]
                           },
"preview_reopen":
{ Args: { "p_budget_id": string,"p_pay_date"?: string }; Returns: {
              "change": string,"record_id": string,"record_kind": string,"record_name": string,"replaces_previous": boolean
            }[]
                           },
"preview_set_expected_pay_date":
{ Args: { "p_budget_id": string,"p_pay_date"?: string }; Returns: {
              "accepted": boolean,"period_id": string,"refusal": string,"transfer_marks_unplanned": number,"transfer_transactions_created": number,"transfer_transactions_moved": number,"transfer_transactions_removed": number
            }[]
                           },
"preview_set_primary_income":
{ Args: { "p_income_id": string }; Returns: {
              "end_date": string,"end_is_manual": boolean,"expected_pay_date": string,"period_id": string,"transfer_marks_unplanned": number,"transfer_transactions_created": number,"transfer_transactions_moved": number,"transfer_transactions_removed": number
            }[]
                           },
"preview_update_income":
{ Args: { "p_amount"?: number,"p_from_period_id"?: string,"p_income_id": string,"p_pay_day"?: number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "end_date": string,"end_is_manual": boolean,"expected_pay_date": string,"period_id": string,"transfer_marks_unplanned": number,"transfer_transactions_created": number,"transfer_transactions_moved": number,"transfer_transactions_removed": number
            }[]
                           },
"preview_update_subscription":
{ Args: { "p_cadence"?: Database["public"]['Enums']["subscription_cadence"],"p_category_id"?: string,"p_count"?: number,"p_from_period_id"?: string,"p_next_charge_date"?: string,"p_price"?: number,"p_subscription_id": string }; Returns: string[]
                           },
"preview_update_transfer":
{ Args: { "p_amount"?: number,"p_cadence"?: Database["public"]['Enums']["subscription_cadence"],"p_category_id"?: string,"p_clear_category"?: boolean,"p_clear_income"?: boolean,"p_count"?: number,"p_day_of_month"?: number,"p_first_date"?: string,"p_from_account_id"?: string,"p_from_period_id"?: string,"p_income_id"?: string,"p_is_automatic"?: boolean,"p_offset_days"?: number,"p_schedule"?: Database["public"]['Enums']["transfer_schedule"],"p_to_account_id"?: string,"p_transfer_id": string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "already_recorded": boolean,"amount": number,"category_id": string,"created_at_once": boolean,"created_at_once_count": number,"due_date": string,"end_date": string,"follows_primary": boolean,"is_automatic": boolean,"marks_unplanned_count": number,"occurrence_date": string,"occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"],"occurrence_seq": number,"period_id": string,"projected": boolean,"start_date": string,"transactions_moved_count": number,"transactions_removed_count": number
            }[]
                           },
"record_early_pay_date":
{ Args: { "p_budget_id": string,"p_expected_revision": number,"p_pay_date": string,"p_period_id": string }; Returns: {
              "budget_id": string,
"committed_total": number | null,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"revision": number,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null,
"transfer_committed_total": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"remove_debt":
{ Args: { "p_debt_id": string,"p_expected_revision": number,"p_from_period_id"?: string }; Returns: string
                           },
"remove_income":
{ Args: { "p_expected_revision": number,"p_from_period_id"?: string,"p_income_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_budget_id": string,"p_user_id": string }; Returns: undefined
                           },
"rename_budget":
{ Args: { "p_budget_id": string,"p_expected_revision": number,"p_name": string }; Returns: number
                           },
"reopen_previous_period":
{ Args: { "p_budget_id": string,"p_expected_revision": number,"p_pay_date"?: string,"p_period_id": string }; Returns: {
              "budget_id": string,
"committed_total": number | null,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"revision": number,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null,
"transfer_committed_total": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"reorder_categories":
{ Args: { "p_budget_id": string,"p_category_ids": (string)[],"p_parent_id"?: string }; Returns: undefined
                           },
"restore_category":
{ Args: { "p_amount"?: number,"p_cadence"?: Database["public"]['Enums']["expectation_cadence"],"p_category_id": string,"p_expected_revision": number,"p_from_period_id"?: string }; Returns: {
              "amount": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["expectation_cadence"] | null,
"committed_amount": number | null,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"has_transactions": boolean | null,
"id": string,
"in_use": boolean | null,
"is_active": boolean | null,
"is_group": boolean,
"is_to_categorise": boolean,
"monthly_amount": number | null,
"name": string,
"parent_id": string | null,
"removal_deletes": boolean | null,
"revision": number,
"sort_order": number,
"terms_from_seq": number | null,
"transfer_committed_amount": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "category_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"revoke_import_token":
{ Args: { "p_token_id": string }; Returns: undefined
                           },
"set_budget_end_date":
{ Args: { "p_budget_id": string,"p_end_date"?: string,"p_expected_revision": number }; Returns: {
              "caught_up": boolean | null,
"charges_awaiting": number | null,
"created_at": string,
"end_date": string | null,
"end_date_entered": string | null,
"first_period_start": string | null,
"id": string,
"is_owner": boolean | null,
"name": string,
"owner_id": string,
"primary_income_id": string,
"revision": number,
"to_categorise_category_id": string | null,
"to_review": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "my_budgets"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_expected_pay_date":
{ Args: { "p_budget_id": string,"p_expected_revision": number,"p_pay_date"?: string,"p_period_id": string }; Returns: {
              "budget_id": string,
"committed_total": number | null,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"revision": number,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null,
"transfer_committed_total": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_primary_income":
{ Args: { "p_expected_revision": number,"p_income_id": string,"p_previewed_end_date"?: string }; Returns: undefined
                           },
"skip_transfer":
{ Args: { "p_expected_revision": number,"p_occurrence_date"?: string,"p_occurrence_kind"?: Database["public"]['Enums']["transfer_occurrence_kind"],"p_occurrence_seq"?: number,"p_period_id": string,"p_transfer_id": string }; Returns: Database["public"]['CompositeTypes']["transfer_checklist_row"][]
                          SetofOptions: {
        from: "*"
        to: "transfer_checklist_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"subscription_charge_dates":
{ Args: { "p_cadence": Database["public"]['Enums']["subscription_cadence"],"p_count"?: number,"p_first_charge_date": string,"p_from"?: string }; Returns: string[]
                           },
"undo_import_batch":
{ Args: { "p_batch_id": string }; Returns: {
              "charges_confirmed": number,"deleted": number,"kept_confirmed": number,"kept_linked": number
            }[]
                           },
"undo_transfer_mark":
{ Args: { "p_expected_revision": number,"p_occurrence_date"?: string,"p_occurrence_kind"?: Database["public"]['Enums']["transfer_occurrence_kind"],"p_occurrence_seq"?: number,"p_period_id": string,"p_transfer_id": string }; Returns: Database["public"]['CompositeTypes']["transfer_checklist_row"][]
                          SetofOptions: {
        from: "*"
        to: "transfer_checklist_row"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_account":
{ Args: { "p_account_id": string,"p_bank_label"?: string,"p_clear_bank_label"?: boolean,"p_clear_user"?: boolean,"p_expected_revision": number,"p_kind"?: Database["public"]['Enums']["account_kind"],"p_name"?: string,"p_user_id"?: string }; Returns: {
              "bank_label": string | null,
"budget_id": string,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"id": string,
"in_use": boolean | null,
"is_active": boolean | null,
"kind": Database["public"]['Enums']["account_kind"],
"name": string,
"removal_deletes": boolean | null,
"revision": number,
"updated_at": string,
"user_display_name": string | null,
"user_id": string | null,
"user_is_member": boolean | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "account_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_category":
{ Args: { "p_amount"?: number,"p_cadence"?: Database["public"]['Enums']["expectation_cadence"],"p_category_id": string,"p_expected_revision": number,"p_from_period_id"?: string,"p_name"?: string }; Returns: {
              "amount": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["expectation_cadence"] | null,
"committed_amount": number | null,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"has_transactions": boolean | null,
"id": string,
"in_use": boolean | null,
"is_active": boolean | null,
"is_group": boolean,
"is_to_categorise": boolean,
"monthly_amount": number | null,
"name": string,
"parent_id": string | null,
"removal_deletes": boolean | null,
"revision": number,
"sort_order": number,
"terms_from_seq": number | null,
"transfer_committed_amount": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "category_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_debt":
{ Args: { "p_category_id"?: string,"p_debt_id": string,"p_expected_revision": number,"p_from_period_id"?: string,"p_interest_rate"?: number,"p_monthly_payment"?: number,"p_name"?: string,"p_principal"?: number }; Returns: {
              "adjustment_total": number | null,
"budget_id": string,
"category_id": string,
"category_name": string | null,
"created_at": string,
"end_seq": number | null,
"expected_end_after_budget_end": boolean | null,
"expected_end_date": string | null,
"first_seq": number,
"has_history": boolean | null,
"id": string,
"interest_rate": number,
"interest_total": number | null,
"is_active": boolean | null,
"monthly_payment": number,
"name": string,
"opened_on": string,
"overpaid_by": number | null,
"paid_percent": number | null,
"paid_total": number | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"payments_left": number | null,
"payoff": Database["public"]['Enums']["debt_payoff"] | null,
"principal": number,
"remaining": number | null,
"removal_deletes": boolean | null,
"revision": number,
"terms_from_seq": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "debt_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_income":
{ Args: { "p_account_id"?: string,"p_amount"?: number,"p_clear_account"?: boolean,"p_expected_revision": number,"p_from_period_id"?: string,"p_income_id": string,"p_name"?: string,"p_pay_day"?: number,"p_previewed_end_date"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: number
                           },
"update_merchant_rule":
{ Args: { "p_apply"?: boolean,"p_category_id"?: string,"p_expected_revision": number,"p_fragment"?: string,"p_rule_id": string }; Returns: {
              "fragment": string,"moved": number,"revision": number,"rule_id": string
            }[]
                           },
"update_subscription":
{ Args: { "p_cadence"?: Database["public"]['Enums']["subscription_cadence"],"p_category_id"?: string,"p_expected_revision": number,"p_from_period_id"?: string,"p_name"?: string,"p_next_charge_date"?: string,"p_price"?: number,"p_subscription_id": string }; Returns: {
              "anchor_date": string,
"awaiting_count": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["subscription_cadence"],
"category_id": string,
"category_name": string | null,
"charge_count": number | null,
"charge_day": number,
"charged_through": string,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"id": string,
"is_active": boolean | null,
"monthly_cost": number | null,
"name": string,
"next_charge_date": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"price": number,
"removal_deletes": boolean | null,
"revision": number,
"terms_from_seq": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "subscription_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_transaction":
{ Args: { "p_amount": number,"p_category_id"?: string,"p_date": string,"p_debt_id"?: string,"p_description"?: string,"p_expected_revision": number,"p_kind": Database["public"]['Enums']["transaction_kind"],"p_relink"?: boolean,"p_subscription_id"?: string,"p_transaction_id": string }; Returns: {
              "amount": number,
"bank_transaction_id": string | null,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"charge_date": string | null,
"created_at": string,
"date": string,
"debt_ended": boolean | null,
"debt_id": string | null,
"debt_name": string | null,
"description": string | null,
"details": Json | null,
"id": string,
"import_batch_id": string | null,
"import_source": string | null,
"in_to_categorise": boolean | null,
"kind": Database["public"]['Enums']["transaction_kind"],
"merchant": string | null,
"merchant_key": string | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"review_state": Database["public"]['Enums']["review_state"],
"revision": number,
"subscription_id": string | null,
"subscription_name": string | null,
"transfer_id": string | null,
"transfer_name": string | null,
"transfer_occurrence_date": string | null,
"transfer_occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,
"transfer_occurrence_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_transfer":
{ Args: { "p_amount"?: number,"p_cadence"?: Database["public"]['Enums']["subscription_cadence"],"p_category_id"?: string,"p_clear_category"?: boolean,"p_clear_income"?: boolean,"p_day_of_month"?: number,"p_expected_revision": number,"p_first_date"?: string,"p_from_account_id"?: string,"p_from_period_id"?: string,"p_income_id"?: string,"p_is_automatic"?: boolean,"p_name"?: string,"p_offset_days"?: number,"p_schedule"?: Database["public"]['Enums']["transfer_schedule"],"p_to_account_id"?: string,"p_transfer_id": string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "amount": number,
"budget_id": string,
"cadence": Database["public"]['Enums']["subscription_cadence"] | null,
"category_id": string | null,
"category_name": string | null,
"created_at": string,
"day_of_month": number | null,
"end_seq": number | null,
"first_date": string | null,
"first_seq": number,
"follows_primary": boolean | null,
"from_account_id": string,
"from_account_name": string,
"has_history": boolean | null,
"id": string,
"income_id": string | null,
"income_name": string | null,
"is_active": boolean | null,
"is_automatic": boolean,
"monthly_amount": number | null,
"name": string,
"next_due_date": string | null,
"offset_days": number | null,
"parent_category_id": string | null,
"parent_category_name": string | null,
"removal_deletes": boolean | null,
"revision": number,
"schedule": Database["public"]['Enums']["transfer_schedule"],
"starts_on": string,
"starts_seq": number,
"terms_from_seq": number,
"to_account_id": string,
"to_account_name": string,
"transaction_count": number | null,
"updated_at": string,
"weekend_rule": Database["public"]['Enums']["weekend_rule"] | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "transfer_overview"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            "account_kind": "current"|"savings"|"third_pillar"|"tax_reserve"|"investment"|"cash"|"credit_card"|"other","debt_payoff": "paid_off"|"ends"|"never","expectation_cadence": "monthly"|"yearly","review_state": "confirmed"|"awaiting_confirmation"|"to_review","subscription_cadence": "monthly"|"quarterly"|"half_yearly"|"yearly","transaction_kind": "expense"|"refund"|"extra_income","transfer_mark": "done"|"skipped"|"not_done","transfer_occurrence_kind": "period"|"income_payday"|"fixed_day","transfer_schedule": "pay_date"|"day_of_month","weekend_rule": "nearest"|"previous"|"next"|"none"
          }
          CompositeTypes: {
            "category_choice": {
                        "category_id": string | null,"parent_id": string | null,"name": string | null,"parent_name": string | null,"display_order": number | null
                      },"category_progress_row": {
                        "category_id": string | null,"parent_id": string | null,"name": string | null,"is_group": boolean | null,"in_force": boolean | null,"amount": number | null,"cadence": Database["public"]['Enums']["expectation_cadence"] | null,"expected": number | null,"spent": number | null,"result": number | null,"is_overspent": boolean | null,"transaction_count": number | null,"display_order": number | null,"committed": number | null,"transfer_committed": number | null
                      },"debt_history_row": {
                        "entry_id": string | null,"kind": string | null,"date": string | null,"amount": number | null,"balance": number | null,"period_id": string | null,"description": string | null,"created_at": string | null
                      },"import_row_result": {
                        "row_no": number | null,"valid": boolean | null,"reason": string | null,"action": string | null,"kind": Database["public"]['Enums']["transaction_kind"] | null,"category_id": string | null,"category_source": string | null,"rule_id": string | null,"date": string | null,"amount": number | null,"direction": string | null,"description": string | null,"merchant_key": string | null,"flag": string | null,"remembered_choice": string | null,"duplicate_of": string | null,"match_of": string | null,"match_is_charge": boolean | null,"salary_income_id": string | null,"salary_income_amount": number | null,"transaction_id": string | null,"chunk": number | null,"choice_key": string | null
                      },"transfer_checklist_row": {
                        "transfer_id": string | null,"period_id": string | null,"occurrence_date": string | null,"name": string | null,"from_account_id": string | null,"from_account_name": string | null,"to_account_id": string | null,"to_account_name": string | null,"amount": number | null,"due_date": string | null,"is_automatic": boolean | null,"category_id": string | null,"category_name": string | null,"status": string | null,"is_overdue": boolean | null,"held_back": boolean | null,"follows_primary": boolean | null,"done_on": string | null,"amount_moved": number | null,"transaction_id": string | null,"transaction_revision": number | null,"mark_revision": number | null,"recorded_by": string | null,"recorded_by_name": string | null,"is_ended": boolean | null,"planned": boolean | null,"cadence": Database["public"]['Enums']["subscription_cadence"] | null,"assumed": boolean | null,"occurrence_kind": Database["public"]['Enums']["transfer_occurrence_kind"] | null,"occurrence_seq": number | null,"income_id": string | null,"income_name": string | null
                      }
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_kind": ["current", "savings", "third_pillar", "tax_reserve", "investment", "cash", "credit_card", "other"],"debt_payoff": ["paid_off", "ends", "never"],"expectation_cadence": ["monthly", "yearly"],"review_state": ["confirmed", "awaiting_confirmation", "to_review"],"subscription_cadence": ["monthly", "quarterly", "half_yearly", "yearly"],"transaction_kind": ["expense", "refund", "extra_income"],"transfer_mark": ["done", "skipped", "not_done"],"transfer_occurrence_kind": ["period", "income_payday", "fixed_day"],"transfer_schedule": ["pay_date", "day_of_month"],"weekend_rule": ["nearest", "previous", "next", "none"]
          }
        }
} as const
