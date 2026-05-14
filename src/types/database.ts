export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          created_at: string | null
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_settings: {
        Row: {
          user_id: string
          native_language: string
          active_language: string
          active_level: string
          languages_config: Json
          theme: string
          tts_voice: string
          github_token_encrypted: string | null
          github_repo: string | null
          onboarding_completed: boolean
          updated_at: string | null
        }
        Insert: {
          user_id: string
          native_language?: string
          active_language?: string
          active_level?: string
          languages_config?: Json
          theme?: string
          tts_voice?: string
          github_token_encrypted?: string | null
          github_repo?: string | null
          onboarding_completed?: boolean
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          native_language?: string
          active_language?: string
          active_level?: string
          languages_config?: Json
          theme?: string
          tts_voice?: string
          github_token_encrypted?: string | null
          github_repo?: string | null
          onboarding_completed?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_streaks: {
        Row: {
          user_id: string
          current_streak: number
          longest_streak: number
          last_session_date: string | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          current_streak?: number
          longest_streak?: number
          last_session_date?: string | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          current_streak?: number
          longest_streak?: number
          last_session_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          type: 'free' | 'roleplay' | 'deep_dive'
          language: string
          level: string
          scenario: string | null
          started_at: string
          ended_at: string | null
          summary: string | null
          tags: string[]
          youtube_context: Json | null
          feedback_status: 'pending' | 'processing' | 'done' | 'failed'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'free' | 'roleplay' | 'deep_dive'
          language: string
          level: string
          scenario?: string | null
          started_at?: string
          ended_at?: string | null
          summary?: string | null
          tags?: string[]
          youtube_context?: Json | null
          feedback_status?: 'pending' | 'processing' | 'done' | 'failed'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'free' | 'roleplay' | 'deep_dive'
          language?: string
          level?: string
          scenario?: string | null
          started_at?: string
          ended_at?: string | null
          summary?: string | null
          tags?: string[]
          youtube_context?: Json | null
          feedback_status?: 'pending' | 'processing' | 'done' | 'failed'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      session_turns: {
        Row: {
          id: string
          session_id: string
          idx: number
          speaker: 'user' | 'ai'
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          idx: number
          speaker: 'user' | 'ai'
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          idx?: number
          speaker?: 'user' | 'ai'
          text?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_turns_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      tracked_items: {
        Row: {
          id: string
          user_id: string
          text: string
          lemma: string
          severity: 'error' | 'warning' | 'improvement'
          category: 'grammar' | 'vocab' | 'context' | 'phrasal' | 'register'
          explanation: string
          weight: number
          first_seen_session: string | null
          last_seen_session: string | null
          srs_state: Json
          archived: boolean
          user_rejections: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          text: string
          lemma: string
          severity: 'error' | 'warning' | 'improvement'
          category: 'grammar' | 'vocab' | 'context' | 'phrasal' | 'register'
          explanation: string
          weight?: number
          first_seen_session?: string | null
          last_seen_session?: string | null
          srs_state?: Json
          archived?: boolean
          user_rejections?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          text?: string
          lemma?: string
          severity?: 'error' | 'warning' | 'improvement'
          category?: 'grammar' | 'vocab' | 'context' | 'phrasal' | 'register'
          explanation?: string
          weight?: number
          first_seen_session?: string | null
          last_seen_session?: string | null
          srs_state?: Json
          archived?: boolean
          user_rejections?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_items_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_items_first_seen_session_fkey"
            columns: ["first_seen_session"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_items_last_seen_session_fkey"
            columns: ["last_seen_session"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      feedback_annotations: {
        Row: {
          id: string
          turn_id: string
          span_start: number
          span_end: number
          severity: 'error' | 'warning' | 'improvement'
          category: string
          explanation: string
          suggestion: string
          tracked_item_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          turn_id: string
          span_start: number
          span_end: number
          severity: 'error' | 'warning' | 'improvement'
          category: string
          explanation: string
          suggestion: string
          tracked_item_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          turn_id?: string
          span_start?: number
          span_end?: number
          severity?: 'error' | 'warning' | 'improvement'
          category?: string
          explanation?: string
          suggestion?: string
          tracked_item_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_annotations_turn_id_fkey"
            columns: ["turn_id"]
            referencedRelation: "session_turns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_annotations_tracked_item_id_fkey"
            columns: ["tracked_item_id"]
            referencedRelation: "tracked_items"
            referencedColumns: ["id"]
          }
        ]
      }
      deep_dive_sessions: {
        Row: {
          id: string
          parent_session_id: string
          tracked_item_id: string
          dive_session_id: string
          created_at: string
        }
        Insert: {
          id?: string
          parent_session_id: string
          tracked_item_id: string
          dive_session_id: string
          created_at?: string
        }
        Update: {
          id?: string
          parent_session_id?: string
          tracked_item_id?: string
          dive_session_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deep_dive_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_dive_sessions_tracked_item_id_fkey"
            columns: ["tracked_item_id"]
            referencedRelation: "tracked_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_dive_sessions_dive_session_id_fkey"
            columns: ["dive_session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      user_facts: {
        Row: {
          id: string
          user_id: string
          text: string
          embedding: string | null
          source_session: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          text: string
          embedding?: string | null
          source_session?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          text?: string
          embedding?: string | null
          source_session?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_facts_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_facts_source_session_fkey"
            columns: ["source_session"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      roleplay_topic_batches: {
        Row: {
          id: string
          user_id: string
          language: string
          level: string
          topics: string[]
          used_count: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          language: string
          level: string
          topics: string[]
          used_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          language?: string
          level?: string
          topics?: string[]
          used_count?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_topic_batches_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      session_analytics: {
        Row: {
          user_id: string
          week_start: string | null
          session_count: number | null
          total_minutes: number | null
          avg_minutes: number | null
        }
      }
    }
    Functions: {
      get_my_session_analytics: {
        Args: Record<PropertyKey, never>
        Returns: {
          week_start: string
          session_count: number
          total_minutes: number
          avg_minutes: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
