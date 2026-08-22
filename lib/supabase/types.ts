/**
 * Tipos do banco, espelhando supabase/migrations/0001_init.sql.
 *
 * Para regenerar a partir do banco real:
 *   pnpm dlx supabase gen types typescript --project-id wzndldadbppnmsijxtvc > lib/supabase/types.ts
 */

export type StatusCategory =
   | 'triage'
   | 'backlog'
   | 'unstarted'
   | 'started'
   | 'completed'
   | 'canceled';

export type CycleStatus = 'planned' | 'upcoming' | 'current' | 'completed';
export type MemberRole = 'Member' | 'Admin' | 'Guest' | 'Application';
export type PresenceStatus = 'online' | 'offline' | 'away';

/** Colunas geradas pelo banco: opcionais no insert, imutáveis pelo cliente. */
type Generated = 'id' | 'created_at' | 'updated_at';

type StatusRow = {
   id: string;
   name: string;
   color: string;
   category: StatusCategory;
   position: number;
};

type PriorityRow = {
   id: string;
   name: string;
   position: number;
};

type ProjectHealthRow = {
   id: string;
   name: string;
   color: string;
   description: string;
};

type LabelRow = {
   id: string;
   name: string;
   color: string;
};

type ProfileRow = {
   id: string;
   user_id: string | null;
   email: string;
   name: string;
   avatar_url: string | null;
   role: MemberRole;
   status: PresenceStatus;
   timezone: string;
   joined_date: string;
   created_at: string;
   updated_at: string;
};

type TeamRow = {
   id: string;
   name: string;
   icon: string;
   color: string;
   issue_prefix: string;
   issue_counter: number;
   created_at: string;
};

type TeamMemberRow = {
   team_id: string;
   profile_id: string;
   joined_at: string;
};

type CycleRow = {
   id: string;
   number: number;
   name: string;
   team_id: string;
   status: CycleStatus;
   start_date: string;
   end_date: string;
   capacity: number;
   created_at: string;
};

type ProjectRow = {
   id: string;
   name: string;
   description: string;
   icon: string;
   status_id: string;
   priority_id: string;
   health_id: string;
   team_id: string | null;
   lead_id: string | null;
   percent_complete: number;
   start_date: string;
   target_date: string | null;
   initiative: string | null;
   health_updated_ago_days: number | null;
   created_at: string;
   updated_at: string;
};

type ProjectLabelRow = {
   project_id: string;
   label_id: string;
};

type IssueRow = {
   id: string;
   /** Gerado pelo trigger a partir do prefixo do time — não envie no insert. */
   identifier: string;
   title: string;
   description: string;
   team_id: string;
   status_id: string;
   priority_id: string;
   project_id: string | null;
   cycle_id: string | null;
   assignee_id: string | null;
   creator_id: string | null;
   parent_id: string | null;
   rank: string;
   due_date: string | null;
   created_at: string;
   updated_at: string;
};

type IssueLabelRow = {
   issue_id: string;
   label_id: string;
};

/**
 * Tabela de referência: o cliente só lê (a RLS bloqueia escrita).
 *
 * `Insert`/`Update` precisam ser objetos mesmo assim — o supabase-js exige que
 * toda tabela satisfaça `GenericTable`, e um `never` aqui invalida o schema
 * inteiro, fazendo TODAS as consultas degradarem para `never`.
 */
type ReadOnlyTable<Row> = { Row: Row; Insert: Row; Update: Partial<Row>; Relationships: [] };

type Table<Row, Optional extends keyof Row = never> = {
   Row: Row;
   Insert: Omit<Row, Generated | Optional> &
      Partial<Pick<Row, Extract<Generated | Optional, keyof Row>>>;
   Update: Partial<Omit<Row, Generated>>;
   Relationships: [];
};

export type Database = {
   public: {
      Tables: {
         statuses: ReadOnlyTable<StatusRow>;
         priorities: ReadOnlyTable<PriorityRow>;
         project_healths: ReadOnlyTable<ProjectHealthRow>;
         labels: Table<LabelRow>;
         profiles: Table<
            ProfileRow,
            'user_id' | 'avatar_url' | 'role' | 'status' | 'timezone' | 'joined_date'
         >;
         teams: Table<TeamRow, 'icon' | 'color' | 'issue_counter'>;
         team_members: Table<TeamMemberRow, 'joined_at'>;
         cycles: Table<CycleRow, 'capacity'>;
         projects: Table<
            ProjectRow,
            | 'description'
            | 'icon'
            | 'health_id'
            | 'team_id'
            | 'lead_id'
            | 'percent_complete'
            | 'start_date'
            | 'target_date'
            | 'initiative'
            | 'health_updated_ago_days'
         >;
         project_labels: Table<ProjectLabelRow>;
         issues: Table<
            IssueRow,
            | 'identifier'
            | 'description'
            | 'priority_id'
            | 'project_id'
            | 'cycle_id'
            | 'assignee_id'
            | 'creator_id'
            | 'parent_id'
            | 'due_date'
         >;
         issue_labels: Table<IssueLabelRow>;
      };
      Views: Record<never, never>;
      Functions: Record<never, never>;
      Enums: Record<never, never>;
      CompositeTypes: Record<never, never>;
   };
};

/* Atalhos usados pela camada de dados. */
export type Tables<T extends keyof Database['public']['Tables']> =
   Database['public']['Tables'][T]['Row'];
export type InsertDto<T extends keyof Database['public']['Tables']> =
   Database['public']['Tables'][T]['Insert'];
export type UpdateDto<T extends keyof Database['public']['Tables']> =
   Database['public']['Tables'][T]['Update'];
