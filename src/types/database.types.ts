export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string;
          address_line2: string | null;
          city: string;
          created_at: string;
          id: string;
          is_default: boolean;
          organization_id: string | null;
          phone_number: string;
          postal_code: string;
          prefecture: string;
          recipient_first_name: string;
          recipient_last_name: string;
          type: Database["public"]["Enums"]["address_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address_line1: string;
          address_line2?: string | null;
          city: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          organization_id?: string | null;
          phone_number: string;
          postal_code: string;
          prefecture: string;
          recipient_first_name: string;
          recipient_last_name: string;
          type: Database["public"]["Enums"]["address_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          organization_id?: string | null;
          phone_number?: string;
          postal_code?: string;
          prefecture?: string;
          recipient_first_name?: string;
          recipient_last_name?: string;
          type?: Database["public"]["Enums"]["address_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "addresses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "addresses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      cart_items: {
        Row: {
          created_at: string;
          id: string;
          quantity: number;
          sanity_product_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          quantity?: number;
          sanity_product_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          quantity?: number;
          sanity_product_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          sanity_product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          sanity_product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          sanity_product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      member_ranks: {
        Row: {
          code: string;
          created_at: string;
          display_name_ja: string;
          is_active: boolean;
          monthly_limit_amount: number | null;
          sort_order: number;
          stripe_initial_fee_price_id: string | null;
          stripe_monthly_price_id: string | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          display_name_ja: string;
          is_active?: boolean;
          monthly_limit_amount?: number | null;
          sort_order: number;
          stripe_initial_fee_price_id?: string | null;
          stripe_monthly_price_id?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          display_name_ja?: string;
          is_active?: boolean;
          monthly_limit_amount?: number | null;
          sort_order?: number;
          stripe_initial_fee_price_id?: string | null;
          stripe_monthly_price_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          is_negotiable: boolean;
          negotiated_unit_price: number | null;
          order_id: string;
          product_name_snapshot: string;
          quantity: number;
          sanity_product_id: string;
          unit_price_snapshot: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_negotiable?: boolean;
          negotiated_unit_price?: number | null;
          order_id: string;
          product_name_snapshot: string;
          quantity: number;
          sanity_product_id: string;
          unit_price_snapshot?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_negotiable?: boolean;
          negotiated_unit_price?: number | null;
          order_id?: string;
          product_name_snapshot?: string;
          quantity?: number;
          sanity_product_id?: string;
          unit_price_snapshot?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          approval_status: string | null;
          approved_at: string | null;
          approved_by_user_id: string | null;
          billing_address_snapshot: Json;
          created_at: string;
          id: string;
          monthly_limit_at_order: number;
          organization_id: string | null;
          payment_flow: Database["public"]["Enums"]["order_payment_flow"];
          rank_at_order: Database["public"]["Enums"]["member_rank"];
          requested_by_user_id: string | null;
          shipping_address_snapshot: Json;
          split_group_id: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id: string | null;
          stripe_invoice_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          approval_status?: string | null;
          approved_at?: string | null;
          approved_by_user_id?: string | null;
          billing_address_snapshot: Json;
          created_at?: string;
          id?: string;
          monthly_limit_at_order: number;
          organization_id?: string | null;
          payment_flow: Database["public"]["Enums"]["order_payment_flow"];
          rank_at_order: Database["public"]["Enums"]["member_rank"];
          requested_by_user_id?: string | null;
          shipping_address_snapshot: Json;
          split_group_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_invoice_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approval_status?: string | null;
          approved_at?: string | null;
          approved_by_user_id?: string | null;
          billing_address_snapshot?: Json;
          created_at?: string;
          id?: string;
          monthly_limit_at_order?: number;
          organization_id?: string | null;
          payment_flow?: Database["public"]["Enums"]["order_payment_flow"];
          rank_at_order?: Database["public"]["Enums"]["member_rank"];
          requested_by_user_id?: string | null;
          shipping_address_snapshot?: Json;
          split_group_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_invoice_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_approved_by_user_id_fkey";
            columns: ["approved_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_requested_by_user_id_fkey";
            columns: ["requested_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          clerk_role: string;
          created_at: string;
          id: string;
          organization_id: string;
          user_id: string;
        };
        Insert: {
          clerk_role: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          clerk_role?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          address_line1: string;
          address_line2: string | null;
          billing_anchor_day: number | null;
          city: string;
          clerk_org_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          initial_fee_paid_rank_code: string | null;
          invoice_registration_number: string;
          name: string;
          onboarding_completed: boolean;
          phone_number: string;
          postal_code: string;
          prefecture: string;
          rank_code: string;
          representative_name: string;
          stripe_customer_id: string | null;
        };
        Insert: {
          address_line1: string;
          address_line2?: string | null;
          billing_anchor_day?: number | null;
          city: string;
          clerk_org_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          initial_fee_paid_rank_code?: string | null;
          invoice_registration_number: string;
          name: string;
          onboarding_completed?: boolean;
          phone_number: string;
          postal_code: string;
          prefecture: string;
          rank_code?: string;
          representative_name: string;
          stripe_customer_id?: string | null;
        };
        Update: {
          address_line1?: string;
          address_line2?: string | null;
          billing_anchor_day?: number | null;
          city?: string;
          clerk_org_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          initial_fee_paid_rank_code?: string | null;
          invoice_registration_number?: string;
          name?: string;
          onboarding_completed?: boolean;
          phone_number?: string;
          postal_code?: string;
          prefecture?: string;
          rank_code?: string;
          representative_name?: string;
          stripe_customer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_initial_fee_paid_rank_code_fkey";
            columns: ["initial_fee_paid_rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "organizations_rank_code_fkey";
            columns: ["rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
        ];
      };
      rank_changes: {
        Row: {
          changed_by: string;
          created_at: string;
          effective_at: string;
          from_rank_code: string | null;
          id: string;
          initial_fee_charged: boolean;
          organization_id: string | null;
          reason: string | null;
          stripe_subscription_id: string | null;
          to_rank_code: string;
          user_id: string | null;
        };
        Insert: {
          changed_by: string;
          created_at?: string;
          effective_at?: string;
          from_rank_code?: string | null;
          id?: string;
          initial_fee_charged?: boolean;
          organization_id?: string | null;
          reason?: string | null;
          stripe_subscription_id?: string | null;
          to_rank_code: string;
          user_id?: string | null;
        };
        Update: {
          changed_by?: string;
          created_at?: string;
          effective_at?: string;
          from_rank_code?: string | null;
          id?: string;
          initial_fee_charged?: boolean;
          organization_id?: string | null;
          reason?: string | null;
          stripe_subscription_id?: string | null;
          to_rank_code?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rank_changes_from_rank_code_fkey";
            columns: ["from_rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "rank_changes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rank_changes_to_rank_code_fkey";
            columns: ["to_rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "rank_changes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_webhook_events: {
        Row: {
          error: string | null;
          event_id: string;
          payload: Json;
          processed_at: string | null;
          received_at: string;
          status: string;
          type: string;
        };
        Insert: {
          error?: string | null;
          event_id: string;
          payload: Json;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          type: string;
        };
        Update: {
          error?: string | null;
          event_id?: string;
          payload?: Json;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string;
          current_period_start: string;
          id: string;
          organization_id: string | null;
          pending_rank_code: string | null;
          rank_code: string;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          stripe_subscription_schedule_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end: string;
          current_period_start: string;
          id?: string;
          organization_id?: string | null;
          pending_rank_code?: string | null;
          rank_code: string;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          stripe_subscription_schedule_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          organization_id?: string | null;
          pending_rank_code?: string | null;
          rank_code?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          stripe_subscription_schedule_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_pending_rank_code_fkey";
            columns: ["pending_rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "subscriptions_rank_code_fkey";
            columns: ["rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          billing_anchor_day: number | null;
          clerk_user_id: string;
          created_at: string;
          deleted_at: string | null;
          email: string;
          first_name: string;
          id: string;
          initial_fee_paid_rank_code: string | null;
          last_name: string;
          onboarding_completed: boolean;
          phone_number: string;
          profile_completed_at: string | null;
          rank_code: string;
          stripe_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          billing_anchor_day?: number | null;
          clerk_user_id: string;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          first_name?: string;
          id?: string;
          initial_fee_paid_rank_code?: string | null;
          last_name?: string;
          onboarding_completed?: boolean;
          phone_number?: string;
          profile_completed_at?: string | null;
          rank_code?: string;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          billing_anchor_day?: number | null;
          clerk_user_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          first_name?: string;
          id?: string;
          initial_fee_paid_rank_code?: string | null;
          last_name?: string;
          onboarding_completed?: boolean;
          phone_number?: string;
          profile_completed_at?: string | null;
          rank_code?: string;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_initial_fee_paid_rank_code_fkey";
            columns: ["initial_fee_paid_rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "users_rank_code_fkey";
            columns: ["rank_code"];
            isOneToOne: false;
            referencedRelation: "member_ranks";
            referencedColumns: ["code"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_current_org_id: { Args: never; Returns: string };
      get_current_org_ids: { Args: never; Returns: string[] };
      get_current_user_id: { Args: never; Returns: string };
    };
    Enums: {
      address_type: "billing" | "shipping";
      member_rank:
        | "free"
        | "entry"
        | "standard"
        | "pro"
        | "enterprise"
        | "starter"
        | "basic"
        | "advanced"
        | "premium";
      order_payment_flow: "checkout" | "invoice";
      order_status:
        | "pending_approval"
        | "pending_payment"
        | "confirming"
        | "limit_exceeded"
        | "invoice_sent"
        | "paid"
        | "sourcing"
        | "ordered"
        | "preparing"
        | "shipping"
        | "delivered"
        | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      address_type: ["billing", "shipping"],
      member_rank: [
        "free",
        "entry",
        "standard",
        "pro",
        "enterprise",
        "starter",
        "basic",
        "advanced",
        "premium",
      ],
      order_payment_flow: ["checkout", "invoice"],
      order_status: [
        "pending_approval",
        "pending_payment",
        "confirming",
        "limit_exceeded",
        "invoice_sent",
        "paid",
        "sourcing",
        "ordered",
        "preparing",
        "shipping",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const;
