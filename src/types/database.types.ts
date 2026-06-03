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
          billing_address_snapshot: Json;
          created_at: string;
          id: string;
          monthly_limit_at_order: number;
          payment_flow: Database["public"]["Enums"]["order_payment_flow"];
          rank_at_order: Database["public"]["Enums"]["member_rank"];
          shipping_address_snapshot: Json;
          status: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id: string | null;
          stripe_invoice_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          billing_address_snapshot: Json;
          created_at?: string;
          id?: string;
          monthly_limit_at_order: number;
          payment_flow: Database["public"]["Enums"]["order_payment_flow"];
          rank_at_order: Database["public"]["Enums"]["member_rank"];
          shipping_address_snapshot: Json;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_invoice_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          billing_address_snapshot?: Json;
          created_at?: string;
          id?: string;
          monthly_limit_at_order?: number;
          payment_flow?: Database["public"]["Enums"]["order_payment_flow"];
          rank_at_order?: Database["public"]["Enums"]["member_rank"];
          shipping_address_snapshot?: Json;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_invoice_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          clerk_user_id: string;
          created_at: string;
          deleted_at: string | null;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
          onboarding_completed: boolean;
          rank: Database["public"]["Enums"]["member_rank"];
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscribed_at: string | null;
          terms_agreed_at: string | null;
          terms_version: string | null;
          updated_at: string;
        };
        Insert: {
          clerk_user_id: string;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          onboarding_completed?: boolean;
          rank?: Database["public"]["Enums"]["member_rank"];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscribed_at?: string | null;
          terms_agreed_at?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Update: {
          clerk_user_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          onboarding_completed?: boolean;
          rank?: Database["public"]["Enums"]["member_rank"];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscribed_at?: string | null;
          terms_agreed_at?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_current_user_id: { Args: never; Returns: string };
    };
    Enums: {
      address_type: "billing" | "shipping";
      member_rank: "free" | "entry" | "standard" | "pro" | "enterprise";
      order_payment_flow: "checkout" | "invoice";
      order_status:
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
      member_rank: ["free", "entry", "standard", "pro", "enterprise"],
      order_payment_flow: ["checkout", "invoice"],
      order_status: [
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
