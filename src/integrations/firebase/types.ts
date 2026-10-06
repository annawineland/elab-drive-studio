// Row types for the studio's Firestore collections. Generated from the
// original Postgres schema; keep in step with schema.ts when columns change.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      class_drive_files: {
        Row: {
          id: string;
          mime_type: string;
          modified_time: string | null;
          name: string;
          synced_at: string;
          web_view_link: string | null;
        };
        Insert: {
          id: string;
          mime_type?: string;
          modified_time?: string | null;
          name: string;
          synced_at?: string;
          web_view_link?: string | null;
        };
        Update: {
          id?: string;
          mime_type?: string;
          modified_time?: string | null;
          name?: string;
          synced_at?: string;
          web_view_link?: string | null;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          content: string;
          created_at: string;
          entry_type: string;
          id: string;
          mission_id: string | null;
          stage: string;
          team_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          entry_type?: string;
          id?: string;
          mission_id?: string | null;
          stage?: string;
          team_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          entry_type?: string;
          id?: string;
          mission_id?: string | null;
          stage?: string;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entries_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "stage_missions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entries_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence: {
        Row: {
          created_at: string;
          description: string;
          evidence_type: string;
          id: string;
          stage: string;
          team_id: string | null;
          title: string;
          url: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          evidence_type?: string;
          id?: string;
          stage?: string;
          team_id?: string | null;
          title: string;
          url?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          evidence_type?: string;
          id?: string;
          stage?: string;
          team_id?: string | null;
          title?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          author_id: string;
          content: string;
          created_at: string;
          entry_id: string | null;
          id: string;
          mission_id: string | null;
          target_user_id: string | null;
          team_id: string | null;
        };
        Insert: {
          author_id: string;
          content: string;
          created_at?: string;
          entry_id?: string | null;
          id?: string;
          mission_id?: string | null;
          target_user_id?: string | null;
          team_id?: string | null;
        };
        Update: {
          author_id?: string;
          content?: string;
          created_at?: string;
          entry_id?: string | null;
          id?: string;
          mission_id?: string | null;
          target_user_id?: string | null;
          team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "missions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_targets: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          key: string;
          sort_order: number;
          stage: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          key: string;
          sort_order?: number;
          stage?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          key?: string;
          sort_order?: number;
          stage?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      meeting_minutes: {
        Row: {
          attendees: string;
          created_at: string;
          created_by: string | null;
          decisions: string;
          id: string;
          meeting_date: string;
          notes: string;
          team_id: string;
        };
        Insert: {
          attendees?: string;
          created_at?: string;
          created_by?: string | null;
          decisions?: string;
          id?: string;
          meeting_date?: string;
          notes?: string;
          team_id: string;
        };
        Update: {
          attendees?: string;
          created_at?: string;
          created_by?: string | null;
          decisions?: string;
          id?: string;
          meeting_date?: string;
          notes?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_minutes_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      mission_completions: {
        Row: {
          completed_at: string;
          completed_by: string | null;
          id: string;
          mission_id: string;
          team_id: string;
        };
        Insert: {
          completed_at?: string;
          completed_by?: string | null;
          id?: string;
          mission_id: string;
          team_id: string;
        };
        Update: {
          completed_at?: string;
          completed_by?: string | null;
          id?: string;
          mission_id?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mission_completions_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "missions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mission_completions_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      mission_exemplars: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          mission_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          mission_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          mission_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mission_exemplars_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: true;
            referencedRelation: "stage_missions";
            referencedColumns: ["id"];
          },
        ];
      };
      mission_grades: {
        Row: {
          created_at: string;
          feedback: string;
          id: string;
          mission_id: string;
          possible_points: number;
          scores: Json;
          teacher_id: string;
          team_id: string;
          total_points: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          feedback?: string;
          id?: string;
          mission_id: string;
          possible_points?: number;
          scores?: Json;
          teacher_id: string;
          team_id: string;
          total_points?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          feedback?: string;
          id?: string;
          mission_id?: string;
          possible_points?: number;
          scores?: Json;
          teacher_id?: string;
          team_id?: string;
          total_points?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mission_grades_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "stage_missions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mission_grades_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      mission_rubric_criteria: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          label: string;
          mission_id: string;
          points: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          label: string;
          mission_id: string;
          points?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          label?: string;
          mission_id?: string;
          points?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mission_rubric_criteria_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "stage_missions";
            referencedColumns: ["id"];
          },
        ];
      };
      missions: {
        Row: {
          created_at: string;
          description: string;
          due_date: string | null;
          id: string;
          mission_date: string;
          mod_id: string | null;
          past_due_at: string | null;
          stage: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          due_date?: string | null;
          id?: string;
          mission_date?: string;
          mod_id?: string | null;
          past_due_at?: string | null;
          stage?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          due_date?: string | null;
          id?: string;
          mission_date?: string;
          mod_id?: string | null;
          past_due_at?: string | null;
          stage?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "missions_mod_id_fkey";
            columns: ["mod_id"];
            isOneToOne: false;
            referencedRelation: "mods";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_enrollments: {
        Row: {
          added_by: string | null;
          created_at: string;
          email: string;
          id: string;
          mod_id: string;
          student_id: string | null;
          student_name: string | null;
          updated_at: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          mod_id: string;
          student_id?: string | null;
          student_name?: string | null;
          updated_at?: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          mod_id?: string;
          student_id?: string | null;
          student_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_enrollments_mod_id_fkey";
            columns: ["mod_id"];
            isOneToOne: false;
            referencedRelation: "mods";
            referencedColumns: ["id"];
          },
        ];
      };
      mods: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          body: string;
          created_at: string;
          entry_id: string | null;
          id: string;
          kind: string;
          mission_id: string | null;
          read_at: string | null;
          recipient_id: string;
          stage: string;
          team_id: string | null;
          title: string;
        };
        Insert: {
          actor_id?: string | null;
          body?: string;
          created_at?: string;
          entry_id?: string | null;
          id?: string;
          kind: string;
          mission_id?: string | null;
          read_at?: string | null;
          recipient_id: string;
          stage?: string;
          team_id?: string | null;
          title: string;
        };
        Update: {
          actor_id?: string | null;
          body?: string;
          created_at?: string;
          entry_id?: string | null;
          id?: string;
          kind?: string;
          mission_id?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          stage?: string;
          team_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      pacing_weeks: {
        Row: {
          created_at: string;
          deliverables: string;
          end_date: string;
          focus: string;
          id: string;
          milestones: string;
          stage: string | null;
          start_date: string;
          updated_at: string;
          week_number: number;
        };
        Insert: {
          created_at?: string;
          deliverables?: string;
          end_date: string;
          focus: string;
          id?: string;
          milestones?: string;
          stage?: string | null;
          start_date: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          deliverables?: string;
          end_date?: string;
          focus?: string;
          id?: string;
          milestones?: string;
          stage?: string | null;
          start_date?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      requests: {
        Row: {
          created_at: string;
          details: string;
          id: string;
          item: string;
          kind: string;
          quantity: string;
          status: string;
          team_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          details?: string;
          id?: string;
          item: string;
          kind?: string;
          quantity?: string;
          status?: string;
          team_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          details?: string;
          id?: string;
          item?: string;
          kind?: string;
          quantity?: string;
          status?: string;
          team_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requests_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_docs: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          slug: string;
          sort_order: number;
          stage: string | null;
          summary: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          kind: string;
          slug: string;
          sort_order?: number;
          stage?: string | null;
          summary?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          slug?: string;
          sort_order?: number;
          stage?: string | null;
          summary?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      risks: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          impact: string;
          likelihood: string;
          mitigation: string;
          status: string;
          team_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          impact?: string;
          likelihood?: string;
          mitigation?: string;
          status?: string;
          team_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          impact?: string;
          likelihood?: string;
          mitigation?: string;
          status?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "risks_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      rubric_criteria: {
        Row: {
          created_at: string;
          criterion: string;
          id: string;
          level: string;
          sort_order: number;
          target_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          criterion: string;
          id?: string;
          level: string;
          sort_order?: number;
          target_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          criterion?: string;
          id?: string;
          level?: string;
          sort_order?: number;
          target_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "learning_targets";
            referencedColumns: ["id"];
          },
        ];
      };
      rubric_scores: {
        Row: {
          created_at: string;
          entry_id: string | null;
          id: string;
          level: string;
          note: string;
          student_id: string | null;
          target_id: string;
          teacher_id: string;
          team_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entry_id?: string | null;
          id?: string;
          level: string;
          note?: string;
          student_id?: string | null;
          target_id: string;
          teacher_id: string;
          team_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entry_id?: string | null;
          id?: string;
          level?: string;
          note?: string;
          student_id?: string | null;
          target_id?: string;
          teacher_id?: string;
          team_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_scores_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubric_scores_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "learning_targets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubric_scores_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      sprints: {
        Row: {
          created_at: string;
          end_date: string | null;
          goal: string;
          id: string;
          name: string;
          start_date: string | null;
          status: string;
          team_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          goal?: string;
          id?: string;
          name: string;
          start_date?: string | null;
          status?: string;
          team_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          goal?: string;
          id?: string;
          name?: string;
          start_date?: string | null;
          status?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sprints_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      stage_guides: {
        Row: {
          created_at: string;
          id: string;
          instructions: string;
          sort_order: number;
          stage: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          instructions?: string;
          sort_order?: number;
          stage: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          instructions?: string;
          sort_order?: number;
          stage?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stage_missions: {
        Row: {
          created_at: string;
          id: string;
          prompt: string;
          sort_order: number;
          stage: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          prompt?: string;
          sort_order?: number;
          stage: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          prompt?: string;
          sort_order?: number;
          stage?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          assignee_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          sprint_id: string | null;
          status: string;
          team_id: string;
          title: string;
        };
        Insert: {
          assignee_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          sprint_id?: string | null;
          status?: string;
          team_id: string;
          title: string;
        };
        Update: {
          assignee_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          sprint_id?: string | null;
          status?: string;
          team_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_sprint_id_fkey";
            columns: ["sprint_id"];
            isOneToOne: false;
            referencedRelation: "sprints";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_codes: {
        Row: {
          code: string;
          id: string;
          team_id: string;
        };
        Insert: {
          code: string;
          id?: string;
          team_id: string;
        };
        Update: {
          code?: string;
          id?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_codes_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          id: string;
          join_code: string | null;
          joined_at: string;
          member_role: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          join_code?: string | null;
          joined_at?: string;
          member_role?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          join_code?: string | null;
          joined_at?: string;
          member_role?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_pacing_weeks: {
        Row: {
          created_at: string;
          deliverables: string;
          end_date: string;
          focus: string;
          id: string;
          milestones: string;
          stage: string | null;
          start_date: string;
          team_id: string;
          updated_at: string;
          week_number: number;
        };
        Insert: {
          created_at?: string;
          deliverables?: string;
          end_date: string;
          focus?: string;
          id?: string;
          milestones?: string;
          stage?: string | null;
          start_date: string;
          team_id: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          deliverables?: string;
          end_date?: string;
          focus?: string;
          id?: string;
          milestones?: string;
          stage?: string | null;
          start_date?: string;
          team_id?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "team_pacing_weeks_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          client_name: string;
          created_at: string;
          created_by: string | null;
          current_stage: string;
          id: string;
          join_code: string;
          mod_id: string | null;
          name: string;
          project_focus: string;
        };
        Insert: {
          client_name?: string;
          created_at?: string;
          created_by?: string | null;
          current_stage?: string;
          id?: string;
          join_code?: string;
          mod_id?: string | null;
          name: string;
          project_focus?: string;
        };
        Update: {
          client_name?: string;
          created_at?: string;
          created_by?: string | null;
          current_stage?: string;
          id?: string;
          join_code?: string;
          mod_id?: string | null;
          name?: string;
          project_focus?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teams_mod_id_fkey";
            columns: ["mod_id"];
            isOneToOne: false;
            referencedRelation: "mods";
            referencedColumns: ["id"];
          },
        ];
      };
      user_accounts: {
        Row: {
          created_at: string;
          email: string;
          email_verified: boolean;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          email_verified?: boolean;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          email_verified?: boolean;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      join_team_by_code: { Args: { _code: string }; Returns: string };
    };
    Enums: {
      app_role: "teacher" | "student";
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["teacher", "student"],
    },
  },
} as const;
