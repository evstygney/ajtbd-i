import {
  InterviewMode,
  InterviewSession,
  JobFields,
  JobLevel,
  JobLinkType,
  JobNode,
  QualificationProfile,
} from "../types";
import { createSteps } from "./interviewFlow";

const SCHEMA_VERSION = 1;

function createQualification(): QualificationProfile {
  return {
    segment: "",
    experienceLevel: "",
    priorSolutions: "",
    constraints: "",
    notes: "",
  };
}

function createInitialJob(mode: InterviewMode, title: string): JobNode {
  return {
    id: crypto.randomUUID(),
    title,
    level: "core",
    branchType: mode,
    position: { x: 180, y: 120 },
    fields: {
      expectedOutcome: title,
      problems: [],
      barriers: [],
      alternatives: [],
    },
  };
}

export function createSession(params?: {
  title?: string;
  mode?: InterviewMode;
  hypothesisJob?: string;
  hypothesisSolution?: string;
}): InterviewSession {
  const mode = params?.mode ?? "frequent";
  const now = new Date().toISOString();
  const baseTitle =
    params?.title ||
    params?.hypothesisJob ||
    params?.hypothesisSolution ||
    "Новое AJTBD интервью";
  const initialJobTitle = params?.hypothesisJob || "Новая работа";
  const initialJob = createInitialJob(mode, initialJobTitle);

  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    title: baseTitle,
    createdAt: now,
    updatedAt: now,
    hypothesisJob: params?.hypothesisJob,
    hypothesisSolution: params?.hypothesisSolution,
    mode,
    qualification: createQualification(),
    steps: createSteps(mode),
    jobs: [initialJob],
    links: [],
    notes: [],
    activeStepId: "onboarding",
    selectedJobId: initialJob.id,
  };
}

export function ensureSessionCompatibility(session: InterviewSession): InterviewSession {
  if (session.schemaVersion === SCHEMA_VERSION) {
    return session;
  }

  return {
    ...session,
    schemaVersion: SCHEMA_VERSION,
    qualification: session.qualification ?? createQualification(),
    steps: session.steps?.length ? session.steps : createSteps(session.mode),
    jobs: session.jobs ?? [],
    links: session.links ?? [],
    notes: session.notes ?? [],
    activeStepId: session.activeStepId ?? "onboarding",
  };
}

export function updateJobFields(job: JobNode, patch: Partial<JobFields>): JobNode {
  return {
    ...job,
    fields: {
      ...job.fields,
      ...patch,
    },
  };
}

export function createJob(params: {
  title?: string;
  level: JobLevel;
  mode: InterviewMode;
  parentId?: string;
}): JobNode {
  const title = params.title?.trim() || `${params.level} job`;
  return {
    id: crypto.randomUUID(),
    title,
    level: params.level,
    branchType: params.mode,
    parentId: params.parentId,
    position: { x: 120, y: 120 },
    fields: {
      expectedOutcome: title,
      problems: [],
      barriers: [],
      alternatives: [],
    },
  };
}

export function createLink(source: string, target: string, type: JobLinkType) {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    type,
  };
}
