import { groupIssuesByStatus, Issue } from '@/mock-data/issues';
import { LabelInterface } from '@/mock-data/labels';
import { Priority } from '@/mock-data/priorities';
import { Project } from '@/mock-data/projects';
import { Status } from '@/mock-data/status';
import { User } from '@/mock-data/users';
import * as remote from '@/lib/data/mutations';
import { toast } from 'sonner';
import { create } from 'zustand';

interface FilterOptions {
   status?: string[];
   assignee?: string[];
   priority?: string[];
   labels?: string[];
   project?: string[];
   cycle?: string[];
   statusType?: string[];
}

interface IssuesState {
   // Data
   issues: Issue[];
   issuesByStatus: Record<string, Issue[]>;

   /** Substitui o conteúdo do store pelos dados vindos do servidor. */
   hydrate: (issues: Issue[]) => void;

   //
   getAllIssues: () => Issue[];

   // Actions
   addIssue: (issue: Issue) => void;
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => void;
   deleteIssue: (id: string) => void;

   // Filters
   filterByStatus: (statusId: string) => Issue[];
   filterByPriority: (priorityId: string) => Issue[];
   filterByAssignee: (userId: string | null) => Issue[];
   filterByLabel: (labelId: string) => Issue[];
   filterByProject: (projectId: string) => Issue[];
   filterByCycle: (cycleId: string) => Issue[];
   searchIssues: (query: string) => Issue[];
   filterIssues: (filters: FilterOptions) => Issue[];

   // Status management
   updateIssueStatus: (issueId: string, newStatus: Status) => void;

   // Priority management
   updateIssuePriority: (issueId: string, newPriority: Priority) => void;

   // Assignee management
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => void;

   // Labels management
   addIssueLabel: (issueId: string, label: LabelInterface) => void;
   removeIssueLabel: (issueId: string, labelId: string) => void;

   // Project management
   updateIssueProject: (issueId: string, newProject: Project | undefined) => void;

   // Utility functions
   getIssueById: (id: string) => Issue | undefined;
}

/** Reaplica o estado derivado sempre que a lista muda. */
const withGrouping = (issues: Issue[]) => ({
   issues,
   issuesByStatus: groupIssuesByStatus(issues),
});

export const useIssuesStore = create<IssuesState>((set, get) => ({
   // Vazio até o WorkspaceProvider hidratar com os dados do banco.
   issues: [],
   issuesByStatus: {},

   hydrate: (issues: Issue[]) => {
      set(withGrouping([...issues].sort((a, b) => b.rank.localeCompare(a.rank))));
   },

   //
   getAllIssues: () => get().issues,

   /*
    * As três ações abaixo são otimistas: a tela muda na hora e a escrita segue
    * para o Supabase. Se a escrita falhar, o estado anterior volta e um toast
    * avisa — nunca fica uma alteração só na tela, sem correspondente no banco.
    */
   addIssue: (issue: Issue) => {
      const previous = get().issues;
      set(withGrouping([...previous, issue]));

      remote
         .createIssue({
            title: issue.title,
            teamId: issue.teamId,
            statusId: issue.status.id,
            rank: issue.rank,
            description: issue.description,
            priorityId: issue.priority.id,
            assigneeId: issue.assignee?.id ?? null,
            projectId: issue.project?.id ?? null,
            cycleId: issue.cycleId || null,
            dueDate: issue.dueDate ?? null,
            labels: issue.labels,
         })
         .then(({ id, identifier }) => {
            // Troca o id provisório pelo definitivo e adota o identificador do banco.
            set((state) =>
               withGrouping(
                  state.issues.map((i) => (i.id === issue.id ? { ...i, id, identifier } : i))
               )
            );
         })
         .catch((err: Error) => {
            set(withGrouping(previous));
            toast.error(err.message);
         });
   },

   updateIssue: (id: string, updatedIssue: Partial<Issue>) => {
      const previous = get().issues;
      set(withGrouping(previous.map((i) => (i.id === id ? { ...i, ...updatedIssue } : i))));

      remote.updateIssue(id, updatedIssue).catch((err: Error) => {
         set(withGrouping(previous));
         toast.error(err.message);
      });
   },

   deleteIssue: (id: string) => {
      const previous = get().issues;
      set(withGrouping(previous.filter((issue) => issue.id !== id)));

      remote.deleteIssue(id).catch((err: Error) => {
         set(withGrouping(previous));
         toast.error(err.message);
      });
   },

   // Filters
   filterByStatus: (statusId: string) => {
      return get().issues.filter((issue) => issue.status.id === statusId);
   },

   filterByPriority: (priorityId: string) => {
      return get().issues.filter((issue) => issue.priority.id === priorityId);
   },

   filterByAssignee: (userId: string | null) => {
      if (userId === null) {
         return get().issues.filter((issue) => issue.assignee === null);
      }
      return get().issues.filter((issue) => issue.assignee?.id === userId);
   },

   filterByLabel: (labelId: string) => {
      return get().issues.filter((issue) => issue.labels.some((label) => label.id === labelId));
   },

   filterByProject: (projectId: string) => {
      return get().issues.filter((issue) => issue.project?.id === projectId);
   },

   filterByCycle: (cycleId: string) => {
      return get().issues.filter((issue) => issue.cycleId === cycleId);
   },

   searchIssues: (query: string) => {
      const lowerCaseQuery = query.toLowerCase();
      return get().issues.filter(
         (issue) =>
            issue.title.toLowerCase().includes(lowerCaseQuery) ||
            issue.identifier.toLowerCase().includes(lowerCaseQuery)
      );
   },

   filterIssues: (filters: FilterOptions) => {
      let filteredIssues = get().issues;

      // Filter by status
      if (filters.status && filters.status.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            filters.status!.includes(issue.status.id)
         );
      }

      // Filter by assignee
      if (filters.assignee && filters.assignee.length > 0) {
         filteredIssues = filteredIssues.filter((issue) => {
            if (filters.assignee!.includes('unassigned')) {
               // If 'unassigned' is selected and the issue has no assignee
               if (issue.assignee === null) {
                  return true;
               }
            }
            // Check if the issue's assignee is in the selected assignees
            return issue.assignee && filters.assignee!.includes(issue.assignee.id);
         });
      }

      // Filter by priority
      if (filters.priority && filters.priority.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            filters.priority!.includes(issue.priority.id)
         );
      }

      // Filter by labels
      if (filters.labels && filters.labels.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            issue.labels.some((label) => filters.labels!.includes(label.id))
         );
      }

      // Filter by project
      if (filters.project && filters.project.length > 0) {
         filteredIssues = filteredIssues.filter(
            (issue) => issue.project && filters.project!.includes(issue.project.id)
         );
      }

      // Filter by cycle ('no-cycle' matches issues outside any cycle)
      if (filters.cycle && filters.cycle.length > 0) {
         filteredIssues = filteredIssues.filter((issue) => {
            if (filters.cycle!.includes('no-cycle') && issue.cycleId === '') {
               return true;
            }
            return filters.cycle!.includes(issue.cycleId);
         });
      }

      // Filter by status type (status category)
      if (filters.statusType && filters.statusType.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            filters.statusType!.includes(issue.status.category)
         );
      }

      return filteredIssues;
   },

   // Status management
   updateIssueStatus: (issueId: string, newStatus: Status) => {
      get().updateIssue(issueId, { status: newStatus });
   },

   // Priority management
   updateIssuePriority: (issueId: string, newPriority: Priority) => {
      get().updateIssue(issueId, { priority: newPriority });
   },

   // Assignee management
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => {
      get().updateIssue(issueId, { assignee: newAssignee });
   },

   // Labels management
   addIssueLabel: (issueId: string, label: LabelInterface) => {
      const issue = get().getIssueById(issueId);
      if (issue) {
         const updatedLabels = [...issue.labels, label];
         get().updateIssue(issueId, { labels: updatedLabels });
      }
   },

   removeIssueLabel: (issueId: string, labelId: string) => {
      const issue = get().getIssueById(issueId);
      if (issue) {
         const updatedLabels = issue.labels.filter((label) => label.id !== labelId);
         get().updateIssue(issueId, { labels: updatedLabels });
      }
   },

   // Project management
   updateIssueProject: (issueId: string, newProject: Project | undefined) => {
      get().updateIssue(issueId, { project: newProject });
   },

   // Utility functions
   getIssueById: (id: string) => {
      return get().issues.find((issue) => issue.id === id);
   },
}));
