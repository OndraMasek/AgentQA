import { z } from "zod";

export const ChangeKind = z.enum(["added", "modified", "deleted", "renamed"]);

export const ChangedFile = z.object({
  path: z.string().min(1),
  kind: ChangeKind,
  previousPath: z.string().optional(),
});
export type ChangedFile = z.infer<typeof ChangedFile>;

export const LinkedIssue = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  source: z.enum(["github", "linear", "jira", "other"]).default("github"),
});
export type LinkedIssue = z.infer<typeof LinkedIssue>;

export const RepoDoc = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type RepoDoc = z.infer<typeof RepoDoc>;

export const PRContext = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  baseRef: z.string(),
  headRef: z.string(),
  repo: z.string(),
});
export type PRContext = z.infer<typeof PRContext>;

export const IntentBundleSchema = z.object({
  diff: z.object({
    base: z.string(),
    head: z.string(),
    files: z.array(ChangedFile),
    raw: z.string(),
  }),
  pr: PRContext.optional(),
  linkedIssues: z.array(LinkedIssue).default([]),
  commitMessages: z.array(z.string()).default([]),
  repoDocs: z.array(RepoDoc).default([]),
});
export type IntentBundle = z.infer<typeof IntentBundleSchema>;
