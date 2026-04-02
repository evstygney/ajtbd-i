export type InterviewMode = "frequent" | "sequential";
export type JobLevel = "big" | "core" | "small" | "sub";
export type StepStatus = "todo" | "active" | "done" | "skipped";
export type StepPhase =
  | "onboarding"
  | "qualification"
  | "navigation-to-jobs"
  | "job-deep-dive"
  | "previous-next-jobs"
  | "lower-level-jobs"
  | "solution-interview"
  | "summary";
export type JobLinkType = "parent-child" | "previous-next" | "uses-solution";

export interface QualificationProfile {
  segment: string;
  experienceLevel: string;
  priorSolutions: string;
  constraints: string;
  notes: string;
}

export interface StepState {
  id: string;
  phase: StepPhase;
  title: string;
  status: StepStatus;
  notes: string;
  jobId?: string;
  unclear?: boolean;
}

export interface JobFields {
  expectedOutcome?: string;
  criteria?: string;
  activatingKnowledge?: string;
  solution?: string;
  context?: string;
  trigger?: string;
  higherLevelOutcome?: string;
  positiveEmotion?: string;
  negativeEmotion?: string;
  frequency?: string;
  importanceScore?: number;
  satisfactionScore?: number;
  value?: string;
  ahaMoment?: string;
  price?: string;
  priceValueFitScore?: number;
  problems?: string[];
  barriers?: string[];
  alternatives?: string[];
}

export interface JobNode {
  id: string;
  title: string;
  level: JobLevel;
  branchType: InterviewMode;
  parentId?: string;
  position?: {
    x: number;
    y: number;
  };
  fields: JobFields;
}

export interface JobLink {
  id: string;
  source: string;
  target: string;
  type: JobLinkType;
}

export interface InterviewSession {
  id: string;
  schemaVersion: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  hypothesisJob?: string;
  hypothesisSolution?: string;
  mode: InterviewMode;
  qualification: QualificationProfile;
  steps: StepState[];
  jobs: JobNode[];
  links: JobLink[];
  notes: string[];
  activeStepId: string;
  selectedJobId?: string;
}
