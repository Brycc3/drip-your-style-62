export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      closet_items: {
        Row: {
          archived: boolean;
          brand: string | null;
          category: string;
          color: string | null;
          created_at: string;
          fit: string | null;
          formality: Database["public"]["Enums"]["formality"];
          id: string;
          image_url: string | null;
          kind: Database["public"]["Enums"]["item_kind"];
          last_worn_at: string | null;
          material: string | null;
          name: string;
          notes: string | null;
          price: number | null;
          season: Database["public"]["Enums"]["season"];
          secondary_colors: string[];
          size: string | null;
          subcategory: string | null;
          tags: string[];
          times_worn: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          brand?: string | null;
          category: string;
          color?: string | null;
          created_at?: string;
          fit?: string | null;
          formality?: Database["public"]["Enums"]["formality"];
          id?: string;
          image_url?: string | null;
          kind: Database["public"]["Enums"]["item_kind"];
          last_worn_at?: string | null;
          material?: string | null;
          name: string;
          notes?: string | null;
          price?: number | null;
          season?: Database["public"]["Enums"]["season"];
          secondary_colors?: string[];
          size?: string | null;
          subcategory?: string | null;
          tags?: string[];
          times_worn?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          brand?: string | null;
          category?: string;
          color?: string | null;
          created_at?: string;
          fit?: string | null;
          formality?: Database["public"]["Enums"]["formality"];
          id?: string;
          image_url?: string | null;
          kind?: Database["public"]["Enums"]["item_kind"];
          last_worn_at?: string | null;
          material?: string | null;
          name?: string;
          notes?: string | null;
          price?: number | null;
          season?: Database["public"]["Enums"]["season"];
          secondary_colors?: string[];
          size?: string | null;
          subcategory?: string | null;
          tags?: string[];
          times_worn?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          followee_id: string;
          follower_id: string;
        };
        Insert: {
          created_at?: string;
          followee_id: string;
          follower_id: string;
        };
        Update: {
          created_at?: string;
          followee_id?: string;
          follower_id?: string;
        };
        Relationships: [];
      };
      fragrances: {
        Row: {
          base_notes: string[];
          brand: string | null;
          created_at: string;
          family: string | null;
          heart_notes: string[];
          id: string;
          image_url: string | null;
          longevity: string | null;
          name: string;
          notes: string | null;
          occasions: string[];
          projection: string | null;
          season: Database["public"]["Enums"]["season"];
          top_notes: string[];
          user_id: string;
        };
        Insert: {
          base_notes?: string[];
          brand?: string | null;
          created_at?: string;
          family?: string | null;
          heart_notes?: string[];
          id?: string;
          image_url?: string | null;
          longevity?: string | null;
          name: string;
          notes?: string | null;
          occasions?: string[];
          projection?: string | null;
          season?: Database["public"]["Enums"]["season"];
          top_notes?: string[];
          user_id: string;
        };
        Update: {
          base_notes?: string[];
          brand?: string | null;
          created_at?: string;
          family?: string | null;
          heart_notes?: string[];
          id?: string;
          image_url?: string | null;
          longevity?: string | null;
          name?: string;
          notes?: string | null;
          occasions?: string[];
          projection?: string | null;
          season?: Database["public"]["Enums"]["season"];
          top_notes?: string[];
          user_id?: string;
        };
        Relationships: [];
      };
      outfit_comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          outfit_id: string;
          parent_id: string | null;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          outfit_id: string;
          parent_id?: string | null;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          outfit_id?: string;
          parent_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outfit_comments_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "outfit_leaderboard";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_comments_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "saved_outfits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "outfit_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      outfit_feedback: {
        Row: {
          created_at: string;
          id: string;
          liked: boolean;
          outfit_id: string | null;
          signature: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          liked: boolean;
          outfit_id?: string | null;
          signature: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          liked?: boolean;
          outfit_id?: string | null;
          signature?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outfit_feedback_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "outfit_leaderboard";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_feedback_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "saved_outfits";
            referencedColumns: ["id"];
          },
        ];
      };
      outfit_items: {
        Row: {
          closet_item_id: string;
          outfit_id: string;
          role: string | null;
        };
        Insert: {
          closet_item_id: string;
          outfit_id: string;
          role?: string | null;
        };
        Update: {
          closet_item_id?: string;
          outfit_id?: string;
          role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "outfit_items_closet_item_id_fkey";
            columns: ["closet_item_id"];
            isOneToOne: false;
            referencedRelation: "closet_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_items_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "outfit_leaderboard";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_items_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "saved_outfits";
            referencedColumns: ["id"];
          },
        ];
      };
      outfit_likes: {
        Row: {
          created_at: string;
          outfit_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          outfit_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          outfit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outfit_likes_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "outfit_leaderboard";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_likes_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "saved_outfits";
            referencedColumns: ["id"];
          },
        ];
      };
      outfit_saves: {
        Row: {
          created_at: string;
          outfit_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          outfit_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          outfit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outfit_saves_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "outfit_leaderboard";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outfit_saves_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "saved_outfits";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          handle: string | null;
          id: string;
          is_public: boolean;
          onboarded: boolean;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          handle?: string | null;
          id: string;
          is_public?: boolean;
          onboarded?: boolean;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          is_public?: boolean;
          onboarded?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_outfits: {
        Row: {
          cover_image_url: string | null;
          created_at: string;
          dress_code: Database["public"]["Enums"]["formality"] | null;
          explanation: string | null;
          fragrance_id: string | null;
          id: string;
          name: string | null;
          occasion: string | null;
          score: number | null;
          share_slug: string | null;
          temperature_f: number | null;
          user_id: string;
          vibe: string | null;
          visibility: Database["public"]["Enums"]["outfit_visibility"];
          weather: string | null;
          worn_at: string | null;
        };
        Insert: {
          cover_image_url?: string | null;
          created_at?: string;
          dress_code?: Database["public"]["Enums"]["formality"] | null;
          explanation?: string | null;
          fragrance_id?: string | null;
          id?: string;
          name?: string | null;
          occasion?: string | null;
          score?: number | null;
          share_slug?: string | null;
          temperature_f?: number | null;
          user_id: string;
          vibe?: string | null;
          visibility?: Database["public"]["Enums"]["outfit_visibility"];
          weather?: string | null;
          worn_at?: string | null;
        };
        Update: {
          cover_image_url?: string | null;
          created_at?: string;
          dress_code?: Database["public"]["Enums"]["formality"] | null;
          explanation?: string | null;
          fragrance_id?: string | null;
          id?: string;
          name?: string | null;
          occasion?: string | null;
          score?: number | null;
          share_slug?: string | null;
          temperature_f?: number | null;
          user_id?: string;
          vibe?: string | null;
          visibility?: Database["public"]["Enums"]["outfit_visibility"];
          weather?: string | null;
          worn_at?: string | null;
        };
        Relationships: [];
      };
      shop_catalog: {
        Row: {
          brand: string | null;
          category: string;
          color: string | null;
          condition: Database["public"]["Enums"]["item_condition"];
          created_at: string;
          description: string | null;
          fit: string | null;
          formality: Database["public"]["Enums"]["formality"];
          id: string;
          image_url: string | null;
          kind: Database["public"]["Enums"]["item_kind"];
          material: string | null;
          name: string;
          price: number | null;
          season: Database["public"]["Enums"]["season"];
          source: string | null;
          tags: string[];
        };
        Insert: {
          brand?: string | null;
          category: string;
          color?: string | null;
          condition?: Database["public"]["Enums"]["item_condition"];
          created_at?: string;
          description?: string | null;
          fit?: string | null;
          formality?: Database["public"]["Enums"]["formality"];
          id?: string;
          image_url?: string | null;
          kind: Database["public"]["Enums"]["item_kind"];
          material?: string | null;
          name: string;
          price?: number | null;
          season?: Database["public"]["Enums"]["season"];
          source?: string | null;
          tags?: string[];
        };
        Update: {
          brand?: string | null;
          category?: string;
          color?: string | null;
          condition?: Database["public"]["Enums"]["item_condition"];
          created_at?: string;
          description?: string | null;
          fit?: string | null;
          formality?: Database["public"]["Enums"]["formality"];
          id?: string;
          image_url?: string | null;
          kind?: Database["public"]["Enums"]["item_kind"];
          material?: string | null;
          name?: string;
          price?: number | null;
          season?: Database["public"]["Enums"]["season"];
          source?: string | null;
          tags?: string[];
        };
        Relationships: [];
      };
      shop_feedback: {
        Row: {
          catalog_id: string;
          created_at: string;
          dismissed: boolean;
          id: string;
          liked: boolean;
          saved: boolean;
          user_id: string;
        };
        Insert: {
          catalog_id: string;
          created_at?: string;
          dismissed?: boolean;
          id?: string;
          liked: boolean;
          saved?: boolean;
          user_id: string;
        };
        Update: {
          catalog_id?: string;
          created_at?: string;
          dismissed?: boolean;
          id?: string;
          liked?: boolean;
          saved?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_feedback_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "shop_catalog";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          budget_range: string | null;
          created_at: string;
          disliked_colors: string[];
          favorite_colors: string[];
          sizes: Json;
          style_vibes: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          budget_range?: string | null;
          created_at?: string;
          disliked_colors?: string[];
          favorite_colors?: string[];
          sizes?: Json;
          style_vibes?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          budget_range?: string | null;
          created_at?: string;
          disliked_colors?: string[];
          favorite_colors?: string[];
          sizes?: Json;
          style_vibes?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      wear_history: {
        Row: {
          created_at: string;
          id: string;
          outfit_id: string | null;
          user_id: string;
          worn_on: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          outfit_id?: string | null;
          user_id: string;
          worn_on?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          outfit_id?: string | null;
          user_id?: string;
          worn_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wear_history_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "outfit_leaderboard";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wear_history_outfit_id_fkey";
            columns: ["outfit_id"];
            isOneToOne: false;
            referencedRelation: "saved_outfits";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      outfit_leaderboard: {
        Row: {
          comment_count: number | null;
          cover_image_url: string | null;
          created_at: string | null;
          id: string | null;
          like_count: number | null;
          name: string | null;
          occasion: string | null;
          share_slug: string | null;
          trending_score: number | null;
          user_id: string | null;
          vibe: string | null;
        };
        Insert: {
          comment_count?: never;
          cover_image_url?: string | null;
          created_at?: string | null;
          id?: string | null;
          like_count?: never;
          name?: string | null;
          occasion?: string | null;
          share_slug?: string | null;
          trending_score?: never;
          user_id?: string | null;
          vibe?: string | null;
        };
        Update: {
          comment_count?: never;
          cover_image_url?: string | null;
          created_at?: string | null;
          id?: string | null;
          like_count?: never;
          name?: string | null;
          occasion?: string | null;
          share_slug?: string | null;
          trending_score?: never;
          user_id?: string | null;
          vibe?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_following: {
        Args: { _followee: string; _follower: string };
        Returns: boolean;
      };
      outfit_signature: { Args: { _outfit_id: string }; Returns: string };
      record_outfit_wear: { Args: { _outfit_id: string }; Returns: undefined };
    };
    Enums: {
      formality: "loungewear" | "casual" | "smart_casual" | "business" | "formal";
      item_condition: "new" | "vintage" | "thrift" | "resale";
      item_kind: "clothing" | "shoes" | "accessory" | "fragrance";
      outfit_visibility: "private" | "friends" | "public";
      season: "spring" | "summer" | "fall" | "winter" | "all";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
  public: {
    Enums: {
      formality: ["loungewear", "casual", "smart_casual", "business", "formal"],
      item_condition: ["new", "vintage", "thrift", "resale"],
      item_kind: ["clothing", "shoes", "accessory", "fragrance"],
      outfit_visibility: ["private", "friends", "public"],
      season: ["spring", "summer", "fall", "winter", "all"],
    },
  },
} as const;
