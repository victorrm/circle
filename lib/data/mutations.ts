'use client';

import { createClient } from '@/lib/supabase/client';
import type { UpdateDto } from '@/lib/supabase/types';
import type { Issue } from '@/mock-data/issues';
import type { LabelInterface } from '@/mock-data/labels';

/**
 * Escritas feitas do navegador, com a sessão do usuário — a RLS decide o que
 * passa. Nenhuma destas funções mexe no store: quem chama aplica a mudança
 * otimista, chama aqui e reverte se der erro.
 */

/** Traduz um patch de domínio para colunas. `labels` sai fora: é tabela de junção. */
function toColumns(patch: Partial<Issue>): UpdateDto<'issues'> {
   const cols: UpdateDto<'issues'> = {};

   if (patch.title !== undefined) cols.title = patch.title;
   if (patch.description !== undefined) cols.description = patch.description;
   if (patch.rank !== undefined) cols.rank = patch.rank;
   if (patch.status !== undefined) cols.status_id = patch.status.id;
   if (patch.priority !== undefined) cols.priority_id = patch.priority.id;
   if (patch.assignee !== undefined) cols.assignee_id = patch.assignee?.id ?? null;
   if (patch.project !== undefined) cols.project_id = patch.project?.id ?? null;
   if (patch.cycleId !== undefined) cols.cycle_id = patch.cycleId || null;
   if (patch.dueDate !== undefined) cols.due_date = patch.dueDate ?? null;

   return cols;
}

export interface CreateIssueInput {
   title: string;
   teamId: string;
   statusId: string;
   rank: string;
   description?: string;
   priorityId?: string;
   assigneeId?: string | null;
   projectId?: string | null;
   cycleId?: string | null;
   dueDate?: string | null;
   creatorId?: string | null;
   labels?: LabelInterface[];
}

/**
 * Cria a issue. O `identifier` (GER-1, GER-2…) é gerado pelo trigger no banco,
 * não aqui — dois clientes criando ao mesmo tempo não colidem.
 */
export async function createIssue(
   input: CreateIssueInput
): Promise<{ id: string; identifier: string }> {
   const supabase = createClient();

   const { data, error } = await supabase
      .from('issues')
      .insert({
         title: input.title,
         team_id: input.teamId,
         status_id: input.statusId,
         rank: input.rank,
         description: input.description ?? '',
         priority_id: input.priorityId ?? 'no-priority',
         assignee_id: input.assigneeId ?? null,
         project_id: input.projectId ?? null,
         cycle_id: input.cycleId ?? null,
         due_date: input.dueDate ?? null,
         creator_id: input.creatorId ?? null,
      })
      .select('id, identifier')
      .single();

   if (error) throw new Error(`Não foi possível criar a issue: ${error.message}`);

   if (input.labels?.length) {
      await setIssueLabels(data.id, input.labels);
   }

   return data;
}

export async function updateIssue(id: string, patch: Partial<Issue>): Promise<void> {
   const supabase = createClient();

   const cols = toColumns(patch);
   if (Object.keys(cols).length > 0) {
      const { error } = await supabase.from('issues').update(cols).eq('id', id);
      if (error) throw new Error(`Não foi possível salvar a issue: ${error.message}`);
   }

   if (patch.labels !== undefined) {
      await setIssueLabels(id, patch.labels);
   }
}

export async function deleteIssue(id: string): Promise<void> {
   const supabase = createClient();
   const { error } = await supabase.from('issues').delete().eq('id', id);
   if (error) throw new Error(`Não foi possível excluir a issue: ${error.message}`);
}

/** Substitui o conjunto de labels da issue, aplicando só a diferença. */
export async function setIssueLabels(issueId: string, labels: LabelInterface[]): Promise<void> {
   const supabase = createClient();

   const { data: current, error: readError } = await supabase
      .from('issue_labels')
      .select('label_id')
      .eq('issue_id', issueId);

   if (readError) throw new Error(`Não foi possível ler as labels: ${readError.message}`);

   const before = new Set((current ?? []).map((r) => r.label_id));
   const after = new Set(labels.map((l) => l.id));

   const toAdd = [...after].filter((id) => !before.has(id));
   const toRemove = [...before].filter((id) => !after.has(id));

   if (toAdd.length > 0) {
      const { error } = await supabase
         .from('issue_labels')
         .insert(toAdd.map((label_id) => ({ issue_id: issueId, label_id })));
      if (error) throw new Error(`Não foi possível adicionar labels: ${error.message}`);
   }

   if (toRemove.length > 0) {
      const { error } = await supabase
         .from('issue_labels')
         .delete()
         .eq('issue_id', issueId)
         .in('label_id', toRemove);
      if (error) throw new Error(`Não foi possível remover labels: ${error.message}`);
   }
}
