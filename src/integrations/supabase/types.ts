export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          action: string
          answer: string | null
          created_at: string
          distance_meters: number | null
          id: string
          is_correct: boolean | null
          location_id: string
          points_earned: number
          student_id: string
        }
        Insert: {
          action: string
          answer?: string | null
          created_at?: string
          distance_meters?: number | null
          id?: string
          is_correct?: boolean | null
          location_id: string
          points_earned?: number
          student_id: string
        }
        Update: {
          action?: string
          answer?: string | null
          created_at?: string
          distance_meters?: number | null
          id?: string
          is_correct?: boolean | null
          location_id?: string
          points_earned?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_settings: {
        Row: {
          end_time: string | null
          event_date: string | null
          id: string
          name: string
          singleton: boolean
          start_time: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          end_time?: string | null
          event_date?: string | null
          id?: string
          name?: string
          singleton?: boolean
          start_time?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          end_time?: string | null
          event_date?: string | null
          id?: string
          name?: string
          singleton?: boolean
          start_time?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          activity_type: string
          altitude_meters: number | null
          anchor_height_meters: number | null
          ar_offset_x: number | null
          ar_offset_y: number | null
          ar_offset_z: number | null
          ar_scale: number | null
          award_points: boolean
          choices: Json | null
          content: string | null
          correct_answer: string | null
          created_at: string
          description: string | null
          dwell_seconds: number
          end_time: string | null
          external_id: string | null
          id: string
          kind: string
          lat: number
          lng: number
          media_image_url: string | null
          media_video_url: string | null
          points: number
          question: string | null
          radius_meters: number
          schedule_date: string | null
          sort_order: number
          start_time: string | null
          street_view_enabled: boolean
          title: string
          updated_at: string
        }
        Insert: {
          activity_type?: string
          altitude_meters?: number | null
          anchor_height_meters?: number | null
          ar_offset_x?: number | null
          ar_offset_y?: number | null
          ar_offset_z?: number | null
          ar_scale?: number | null
          award_points?: boolean
          choices?: Json | null
          content?: string | null
          correct_answer?: string | null
          created_at?: string
          description?: string | null
          dwell_seconds?: number
          end_time?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          lat: number
          lng: number
          media_image_url?: string | null
          media_video_url?: string | null
          points?: number
          question?: string | null
          radius_meters?: number
          schedule_date?: string | null
          sort_order?: number
          start_time?: string | null
          street_view_enabled?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          altitude_meters?: number | null
          anchor_height_meters?: number | null
          ar_offset_x?: number | null
          ar_offset_y?: number | null
          ar_offset_z?: number | null
          ar_scale?: number | null
          award_points?: boolean
          choices?: Json | null
          content?: string | null
          correct_answer?: string | null
          created_at?: string
          description?: string | null
          dwell_seconds?: number
          end_time?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          lat?: number
          lng?: number
          media_image_url?: string | null
          media_video_url?: string | null
          points?: number
          question?: string | null
          radius_meters?: number
          schedule_date?: string | null
          sort_order?: number
          start_time?: string | null
          street_view_enabled?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_progress: {
        Row: {
          answered_correct: boolean | null
          completed_at: string | null
          created_at: string
          dwell_seconds: number
          id: string
          last_tick_at: string | null
          location_id: string
          points_awarded: number
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          answered_correct?: boolean | null
          completed_at?: string | null
          created_at?: string
          dwell_seconds?: number
          id?: string
          last_tick_at?: string | null
          location_id: string
          points_awarded?: number
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          answered_correct?: boolean | null
          completed_at?: string | null
          created_at?: string
          dwell_seconds?: number
          id?: string
          last_tick_at?: string | null
          location_id?: string
          points_awarded?: number
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class: string
          created_at: string
          id: string
          level: number
          name: string
          points: number
          updated_at: string
        }
        Insert: {
          class: string
          created_at?: string
          id?: string
          level?: number
          name: string
          points?: number
          updated_at?: string
        }
        Update: {
          class?: string
          created_at?: string
          id?: string
          level?: number
          name?: string
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_activity: {
        Args: { p_answer?: string; p_location: string; p_student: string }
        Returns: Json
      }
      location_window: {
        Args: { p_location: string }
        Returns: {
          ends_at: string
          starts_at: string
        }[]
      }
      server_now: { Args: never; Returns: string }
      tick_dwell: {
        Args: { p_location: string; p_student: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
