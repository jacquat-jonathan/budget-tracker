
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
            "budget_invitations": {
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
                    "budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"is_group": boolean,"name": string,"parent_id": string | null,"revision": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"is_group"?: boolean,"name": string,"parent_id"?: string | null,"revision"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"is_group"?: boolean,"name"?: string,"parent_id"?: string | null,"revision"?: number,"sort_order"?: number,"updated_at"?: string
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
                },"income_versions": {
                  Row: {
                    "amount": number,"budget_id": string,"created_at": string,"effective_from_seq": number,"id": string,"income_id": string,"pay_day": number,"updated_at": string,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"budget_id": string,"created_at"?: string,"effective_from_seq": number,"id"?: string,"income_id": string,"pay_day": number,"updated_at"?: string,"weekend_rule"?: Database["public"]['Enums']["weekend_rule"]
                  }
                  Update: {
                    "amount"?: number,"budget_id"?: string,"created_at"?: string,"effective_from_seq"?: number,"id"?: string,"income_id"?: string,"pay_day"?: number,"updated_at"?: string,"weekend_rule"?: Database["public"]['Enums']["weekend_rule"]
                  }
                  Relationships: [
                    {
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
                    "budget_id": string,"created_at": string,"end_seq": number | null,"ended_after_last": boolean,"first_seq": number,"id": string,"name": string,"revision": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"ended_after_last"?: boolean,"first_seq": number,"id"?: string,"name": string,"revision"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"ended_after_last"?: boolean,"first_seq"?: number,"id"?: string,"name"?: string,"revision"?: number,"updated_at"?: string,"user_id"?: string | null
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
                },"periods": {
                  Row: {
                    "budget_id": string,"created_at": string,"end_date": string,"end_is_manual": boolean,"id": string,"seq": number,"start_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_date": string,"end_is_manual"?: boolean,"id"?: string,"seq": number,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_date"?: string,"end_is_manual"?: boolean,"id"?: string,"seq"?: number,"start_date"?: string,"updated_at"?: string
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
                },"transactions": {
                  Row: {
                    "amount": number,"budget_id": string,"category_id": string | null,"created_at": string,"date": string,"description": string | null,"id": string,"kind": Database["public"]['Enums']["transaction_kind"],"recorded_by": string | null,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"budget_id": string,"category_id"?: string | null,"created_at"?: string,"date": string,"description"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["transaction_kind"],"recorded_by"?: string | null,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"budget_id"?: string,"category_id"?: string | null,"created_at"?: string,"date"?: string,"description"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["transaction_kind"],"recorded_by"?: string | null,"revision"?: number,"updated_at"?: string
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
    }
                  ]
                }
          }
          Views: {
            "budget_member_list": {
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
                    "amount": number | null,"budget_id": string,"cadence": Database["public"]['Enums']["expectation_cadence"] | null,"created_at": string,"end_seq": number | null,"first_seq": number,"has_transactions": boolean | null,"id": string,"is_active": boolean | null,"is_group": boolean,"monthly_amount": number | null,"name": string,"parent_id": string | null,"removal_deletes": boolean | null,"revision": number,"sort_order": number,"terms_from_seq": number | null,"updated_at": string
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
                },"income_overview": {
                  Row: {
                    "amount": number,"budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"is_active": boolean | null,"is_primary": boolean | null,"name": string,"next_pay_date": string | null,"pay_day": number,"revision": number,"terms_from_seq": number,"updated_at": string,"user_display_name": string | null,"user_id": string | null,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
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
                },"my_budgets": {
                  Row: {
                    "created_at": string,"end_date": string | null,"end_date_entered": string | null,"id": string,"is_owner": boolean | null,"name": string,"owner_id": string,"primary_income_id": string,"revision": number,"updated_at": string
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
                    "budget_id": string,"end_date": string,"end_is_manual": boolean,"expected_total": number | null,"extra_income_total": number | null,"id": string,"income_total": number | null,"is_current": boolean | null,"left_to_assign": number | null,"result": number | null,"salary_total": number | null,"seq": number,"spent_total": number | null,"start_date": string,"today": string | null
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
                },"transaction_list": {
                  Row: {
                    "amount": number,"budget_id": string,"category_id": string | null,"category_name": string | null,"created_at": string,"date": string,"description": string | null,"id": string,"kind": Database["public"]['Enums']["transaction_kind"],"parent_category_id": string | null,"parent_category_name": string | null,"period_id": string | null,"recorded_by": string | null,"recorded_by_name": string | null,"revision": number,"updated_at": string
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
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_invitation_id": string }; Returns: string
                           },
"add_income":
{ Args: { "p_amount": number,"p_budget_id": string,"p_from_period_id"?: string,"p_name": string,"p_pay_day": number,"p_user_id"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: string
                           },
"add_transaction":
{ Args: { "p_amount": number,"p_budget_id": string,"p_category_id"?: string,"p_date": string,"p_description"?: string,"p_kind": Database["public"]['Enums']["transaction_kind"] }; Returns: {
              "amount": number,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"created_at": string,
"date": string,
"description": string | null,
"id": string,
"kind": Database["public"]['Enums']["transaction_kind"],
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"revision": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"cancel_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"create_budget":
{ Args: { "p_amount": number,"p_end_date"?: string,"p_income_name": string,"p_name": string,"p_pay_day": number,"p_start_month"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: string
                           },
"create_category":
{ Args: { "p_amount"?: number,"p_budget_id": string,"p_cadence"?: Database["public"]['Enums']["expectation_cadence"],"p_from_period_id"?: string,"p_name": string,"p_other_name"?: string,"p_parent_id"?: string }; Returns: {
              "amount": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["expectation_cadence"] | null,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"has_transactions": boolean | null,
"id": string,
"is_active": boolean | null,
"is_group": boolean,
"monthly_amount": number | null,
"name": string,
"parent_id": string | null,
"removal_deletes": boolean | null,
"revision": number,
"sort_order": number,
"terms_from_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "category_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"decline_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"delete_budget":
{ Args: { "p_budget_id": string }; Returns: undefined
                           },
"delete_transaction":
{ Args: { "p_expected_revision": number,"p_transaction_id": string }; Returns: undefined
                           },
"end_category":
{ Args: { "p_category_id": string,"p_expected_revision": number,"p_from_period_id"?: string }; Returns: string
                           },
"ensure_periods":
{ Args: { "p_budget_id": string }; Returns: number
                           },
"get_current_period":
{ Args: { "p_budget_id": string }; Returns: {
              "budget_id": string,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_period_progress":
{ Args: { "p_period_id": string }; Returns: {
              "amount": number,"cadence": Database["public"]['Enums']["expectation_cadence"],"category_id": string,"display_order": number,"expected": number,"in_force": boolean,"is_group": boolean,"is_overspent": boolean,"name": string,"parent_id": string,"result": number,"spent": number,"transaction_count": number
            }[]
                           },
"get_start_months":
{ Args: { "p_pay_day": number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "is_default": boolean,"month": string,"start_date": string,"today": string
            }[]
                           },
"get_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"invite_member":
{ Args: { "p_budget_id": string,"p_email": string }; Returns: string
                           },
"leave_budget":
{ Args: { "p_budget_id": string }; Returns: undefined
                           },
"list_categories_for_date":
{ Args: { "p_budget_id": string,"p_date": string }; Returns: {
              "category_id": string,"display_order": number,"name": string,"parent_id": string,"parent_name": string
            }[]
                           },
"list_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "budget_id": string,"budget_name": string,"created_at": string,"expires_at": string,"id": string,"invited_by_email": string,"invited_by_name": string
            }[]
                           },
"list_transactions":
{ Args: { "p_before_created_at"?: string,"p_before_date"?: string,"p_before_id"?: string,"p_budget_id": string,"p_category_id"?: string,"p_from_date"?: string,"p_kind"?: Database["public"]['Enums']["transaction_kind"],"p_limit"?: number,"p_to_date"?: string }; Returns: {
              "amount": number,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"created_at": string,
"date": string,
"description": string | null,
"id": string,
"kind": Database["public"]['Enums']["transaction_kind"],
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"revision": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } },
"move_period_start":
{ Args: { "p_period_id": string,"p_start_date": string }; Returns: undefined
                           },
"pay_date":
{ Args: { "p_month": number,"p_pay_day": number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"],"p_year": number }; Returns: string
                           },
"preview_expected_pay_date":
{ Args: { "p_budget_id": string,"p_income_id"?: string,"p_pay_day"?: number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: {
              "end_date": string,"end_is_manual": boolean,"expected_pay_date": string,"period_id": string
            }[]
                           },
"preview_reopen":
{ Args: { "p_budget_id": string }; Returns: {
              "change": string,"record_id": string,"record_kind": string,"record_name": string,"replaces_previous": boolean
            }[]
                           },
"record_early_pay_date":
{ Args: { "p_budget_id": string,"p_pay_date": string }; Returns: {
              "budget_id": string,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"remove_income":
{ Args: { "p_expected_revision"?: number,"p_from_period_id"?: string,"p_income_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_budget_id": string,"p_user_id": string }; Returns: undefined
                           },
"rename_budget":
{ Args: { "p_budget_id": string,"p_expected_revision": number,"p_name": string }; Returns: number
                           },
"rename_income":
{ Args: { "p_expected_revision": number,"p_income_id": string,"p_name": string }; Returns: number
                           },
"reopen_previous_period":
{ Args: { "p_budget_id": string,"p_pay_date"?: string }; Returns: {
              "budget_id": string,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"reorder_categories":
{ Args: { "p_budget_id": string,"p_category_ids": (string)[],"p_parent_id": string }; Returns: undefined
                           },
"set_budget_end_date":
{ Args: { "p_budget_id": string,"p_end_date"?: string,"p_expected_revision"?: number }; Returns: {
              "created_at": string,
"end_date": string | null,
"end_date_entered": string | null,
"id": string,
"is_owner": boolean | null,
"name": string,
"owner_id": string,
"primary_income_id": string,
"revision": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "my_budgets"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_expected_pay_date":
{ Args: { "p_budget_id": string,"p_pay_date"?: string }; Returns: {
              "budget_id": string,
"end_date": string,
"end_is_manual": boolean,
"expected_total": number | null,
"extra_income_total": number | null,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"left_to_assign": number | null,
"result": number | null,
"salary_total": number | null,
"seq": number,
"spent_total": number | null,
"start_date": string,
"today": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_primary_income":
{ Args: { "p_income_id": string }; Returns: undefined
                           },
"update_category":
{ Args: { "p_amount"?: number,"p_cadence"?: Database["public"]['Enums']["expectation_cadence"],"p_category_id": string,"p_expected_revision": number,"p_from_period_id"?: string,"p_name"?: string }; Returns: {
              "amount": number | null,
"budget_id": string,
"cadence": Database["public"]['Enums']["expectation_cadence"] | null,
"created_at": string,
"end_seq": number | null,
"first_seq": number,
"has_transactions": boolean | null,
"id": string,
"is_active": boolean | null,
"is_group": boolean,
"monthly_amount": number | null,
"name": string,
"parent_id": string | null,
"removal_deletes": boolean | null,
"revision": number,
"sort_order": number,
"terms_from_seq": number | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "category_overview"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_income_terms":
{ Args: { "p_amount": number,"p_expected_revision"?: number,"p_from_period_id"?: string,"p_income_id": string,"p_pay_day": number,"p_weekend_rule": Database["public"]['Enums']["weekend_rule"] }; Returns: undefined
                           },
"update_transaction":
{ Args: { "p_amount": number,"p_category_id"?: string,"p_date": string,"p_description"?: string,"p_expected_revision": number,"p_kind": Database["public"]['Enums']["transaction_kind"],"p_transaction_id": string }; Returns: {
              "amount": number,
"budget_id": string,
"category_id": string | null,
"category_name": string | null,
"created_at": string,
"date": string,
"description": string | null,
"id": string,
"kind": Database["public"]['Enums']["transaction_kind"],
"parent_category_id": string | null,
"parent_category_name": string | null,
"period_id": string | null,
"recorded_by": string | null,
"recorded_by_name": string | null,
"revision": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transaction_list"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            "expectation_cadence": "monthly"|"yearly","transaction_kind": "expense"|"refund"|"extra_income","weekend_rule": "nearest"|"previous"|"next"|"none"
          }
          CompositeTypes: {
            [_ in never]: never
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
            "expectation_cadence": ["monthly", "yearly"],"transaction_kind": ["expense", "refund", "extra_income"],"weekend_rule": ["nearest", "previous", "next", "none"]
          }
        }
} as const
