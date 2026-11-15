
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
                    "created_at": string,"end_month": string | null,"id": string,"name": string,"owner_id": string,"primary_income_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_month"?: string | null,"id"?: string,"name": string,"owner_id": string,"primary_income_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_month"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string,"primary_income_id"?: string,"updated_at"?: string
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
                    "budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"name": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id": string,"created_at"?: string,"end_seq"?: number | null,"first_seq": number,"id"?: string,"name": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "budget_id"?: string,"created_at"?: string,"end_seq"?: number | null,"first_seq"?: number,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string | null
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
                    "anchor_date": string,"budget_id": string,"created_at": string,"end_date": string,"end_is_manual": boolean,"id": string,"month": string,"seq": number,"start_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date": string,"budget_id": string,"created_at"?: string,"end_date": string,"end_is_manual"?: boolean,"id"?: string,"month": string,"seq": number,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "anchor_date"?: string,"budget_id"?: string,"created_at"?: string,"end_date"?: string,"end_is_manual"?: boolean,"id"?: string,"month"?: string,"seq"?: number,"start_date"?: string,"updated_at"?: string
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
                },"income_overview": {
                  Row: {
                    "amount": number,"budget_id": string,"created_at": string,"end_seq": number | null,"first_seq": number,"id": string,"is_active": boolean | null,"is_primary": boolean | null,"name": string,"next_pay_date": string | null,"pay_day": number,"terms_from_seq": number,"updated_at": string,"user_display_name": string | null,"user_id": string | null,"weekend_rule": Database["public"]['Enums']["weekend_rule"]
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
                    "created_at": string,"end_date": string | null,"end_month": string | null,"id": string,"is_owner": boolean | null,"name": string,"owner_id": string,"primary_income_id": string,"updated_at": string
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
                    "anchor_date": string,"budget_id": string,"end_date": string,"end_is_manual": boolean,"id": string,"income_total": number | null,"is_current": boolean | null,"month": string,"seq": number,"start_date": string,"today": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "anchor_date"?: string | null,"budget_id"?: string | null,"end_date"?: string | null,"end_is_manual"?: boolean | null,"id"?: string | null,"income_total"?: never,"is_current"?: never,"month"?: string | null,"seq"?: number | null,"start_date"?: string | null,"today"?: never
                         }
                        Update: {
                           "anchor_date"?: string | null,"budget_id"?: string | null,"end_date"?: string | null,"end_is_manual"?: boolean | null,"id"?: string | null,"income_total"?: never,"is_current"?: never,"month"?: string | null,"seq"?: number | null,"start_date"?: string | null,"today"?: never
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
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_invitation_id": string }; Returns: string
                           },
"add_income":
{ Args: { "p_amount": number,"p_budget_id": string,"p_from_period_id"?: string,"p_name": string,"p_pay_day": number,"p_user_id"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: string
                           },
"cancel_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"create_budget":
{ Args: { "p_amount": number,"p_end_date"?: string,"p_income_name": string,"p_name": string,"p_pay_day": number,"p_start_month"?: string,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"] }; Returns: string
                           },
"decline_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"delete_budget":
{ Args: { "p_budget_id": string }; Returns: undefined
                           },
"ensure_periods":
{ Args: { "p_budget_id": string }; Returns: number
                           },
"get_current_period":
{ Args: { "p_budget_id": string }; Returns: {
              "anchor_date": string,
"budget_id": string,
"end_date": string,
"end_is_manual": boolean,
"id": string,
"income_total": number | null,
"is_current": boolean | null,
"month": string,
"seq": number,
"start_date": string,
"today": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "period_summaries"
        isOneToOne: false
        isSetofReturn: true
      } },
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
"list_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "budget_id": string,"budget_name": string,"created_at": string,"expires_at": string,"id": string,"invited_by_email": string,"invited_by_name": string
            }[]
                           },
"move_period_boundary":
{ Args: { "p_new_end"?: string,"p_period_id": string }; Returns: undefined
                           },
"pay_date":
{ Args: { "p_month": number,"p_pay_day": number,"p_weekend_rule"?: Database["public"]['Enums']["weekend_rule"],"p_year": number }; Returns: string
                           },
"remove_income":
{ Args: { "p_from_period_id"?: string,"p_income_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_budget_id": string,"p_user_id": string }; Returns: undefined
                           },
"set_budget_end_date":
{ Args: { "p_budget_id": string,"p_end_date"?: string }; Returns: {
              "created_at": string,
"end_date": string | null,
"end_month": string | null,
"id": string,
"is_owner": boolean | null,
"name": string,
"owner_id": string,
"primary_income_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "my_budgets"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_primary_income":
{ Args: { "p_income_id": string }; Returns: undefined
                           },
"update_income_terms":
{ Args: { "p_amount": number,"p_from_period_id"?: string,"p_income_id": string,"p_pay_day": number,"p_weekend_rule": Database["public"]['Enums']["weekend_rule"] }; Returns: undefined
                           }
          }
          Enums: {
            "weekend_rule": "nearest"|"previous"|"next"|"none"
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
            "weekend_rule": ["nearest", "previous", "next", "none"]
          }
        }
} as const
