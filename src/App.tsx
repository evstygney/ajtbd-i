import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createLink, createJob, createSession, updateJobFields } from "./data/session";
import { StepTemplate, getStepTemplate, getStepTemplates, getSuggestedJobTitle } from "./data/interviewFlow";
import {
  exportSessionsPayload,
  importSessionsPayload,
  loadSessions,
  saveSessions,
} from "./lib/storage";
import {
  InterviewMode,
  InterviewSession,
  JobFields,
  JobLevel,
  JobLink,
  JobNode,
  StepState,
  StepStatus,
} from "./types";

type WorkspaceView = "start" | "wizard" | "map" | "summary";

const LEVEL_OPTIONS: JobLevel[] = ["big", "core", "small", "sub"];
const VIEW_OPTIONS: WorkspaceView[] = ["start", "wizard", "map", "summary"];
const FIELD_TO_JOB_PATCH: Partial<Record<string, keyof JobFields>> = {
  "job-outcome": "expectedOutcome",
  "job-criteria": "criteria",
  "job-situation": "context",
  "job-motivation": "higherLevelOutcome",
  "job-solution-detail": "value",
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getModeLabel(mode: InterviewMode) {
  return mode === "frequent" ? "Частотная работа" : "Последовательная работа";
}

function getModeShortLabel(mode: InterviewMode) {
  return mode === "frequent" ? "Частотный сценарий" : "Последовательный сценарий";
}

function getModeDescription(mode: InterviewMode) {
  return mode === "frequent"
    ? "Используйте, если работа повторяется регулярно: заказать продукты, доехать на такси, учить слова."
    : "Используйте, если работа похожа на проект с шагами: купить квартиру, выбрать авто, пройти релокацию.";
}

function getLevelLabel(level: JobLevel) {
  switch (level) {
    case "big":
      return "Работа уровнем выше";
    case "core":
      return "Главная работа";
    case "small":
      return "Подзадача";
    case "sub":
      return "Детальный шаг";
  }
}

function getLevelHint(level: JobLevel) {
  switch (level) {
    case "big":
      return "Зачем вообще нужен текущий результат";
    case "core":
      return "Главная формулировка работы, которую сейчас изучаем";
    case "small":
      return "Часть главной работы";
    case "sub":
      return "Совсем конкретный шаг или действие";
  }
}

function nextLevel(level: JobLevel): JobLevel {
  const index = LEVEL_OPTIONS.indexOf(level);
  return LEVEL_OPTIONS[Math.min(index + 1, LEVEL_OPTIONS.length - 1)];
}

function prevLevel(level: JobLevel): JobLevel {
  const index = LEVEL_OPTIONS.indexOf(level);
  return LEVEL_OPTIONS[Math.max(index - 1, 0)];
}

function parseList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToText(values?: string[]) {
  return (values ?? []).join("\n");
}

function withFallback(value: string | undefined, fallback: string) {
  return value?.trim() ? value.trim() : fallback;
}

function buildScriptLines(stepId: string, session: InterviewSession, selectedJob?: JobNode) {
  const solution = withFallback(
    selectedJob?.fields.solution || session.hypothesisSolution,
    "решение",
  );
  const job = withFallback(selectedJob?.title || session.hypothesisJob, "эту работу");
  const outcome = withFallback(selectedJob?.fields.expectedOutcome, "этот результат");
  const higher = withFallback(selectedJob?.fields.higherLevelOutcome, "результат уровнем выше");

  const map: Record<string, string[]> = {
    onboarding: [
      `Спасибо, что нашли время. Мы поговорим про то, как вы решаете задачу: ${job}.`,
      "Я буду задавать много уточняющих вопросов и параллельно вести заметки, чтобы ничего не потерять.",
      "Если какой-то вопрос покажется странным или неудобным, пожалуйста, сразу скажите.",
    ],
    qualification: [
      "Чтобы лучше понимать ваши ответы, хочу немного уточнить ваш опыт и прошлый контекст.",
      `Расскажите, пожалуйста, какой у вас опыт в теме, связанной с задачей "${job}"?`,
      `Какие способы или решения вы уже пробовали до этого?`,
    ],
    "navigation-to-jobs": [
      `Расскажите, пожалуйста, как вы обычно используете ${solution} для задачи "${job}".`,
      `Какие результаты вы обычно хотите получить от ${solution}?`,
      "Если результатов несколько, что из этого самое важное, проблемное и частотное?",
    ],
    "job-outcome": [
      `Какой результат вы обычно хотите получить, когда используете ${solution}?`,
      "Какие задачи за этим стоят?",
      `Если сформулировать коротко, на какую работу вы нанимаете ${solution}?`,
    ],
    "job-criteria": [
      `По каким критериям вы понимаете, что получили "${outcome}" достаточно хорошо?`,
      `Что для вас важно в хорошем результате "${outcome}"?`,
    ],
    "job-situation": [
      `Расскажите, пожалуйста, подробнее, в какой ситуации вы решаете использовать ${solution}, чтобы получить "${outcome}"?`,
      `В какой момент вы обычно начинаете что-то делать, чтобы получить "${outcome}"? Что становится триггером?`,
      `Что такого вы узнали или после какого опыта захотели получить "${outcome}"?`,
    ],
    "job-motivation": [
      `Зачем вы хотите получить "${outcome}"? Чтобы что?`,
      `Как вы хотите себя чувствовать после того, как получите "${outcome}"?`,
      `Пока вы не получаете "${outcome}", какие негативные эмоции вы испытываете?`,
    ],
    "job-economics": [
      `Как часто у вас возникает задача получить "${outcome}"?`,
      `Насколько для вас важно получить "${outcome}" по шкале от 1 до 10?`,
      `Насколько ${solution} позволяет получить "${outcome}" так, как вам нужно?`,
    ],
    "job-solution-detail": [
      `В чем ценность ${solution} именно в контексте "${outcome}"?`,
      `В какой момент вы поняли ценность ${solution}?`,
      `Были ли проблемы, барьеры или другие альтернативы, когда вы пытались получить "${outcome}"?`,
    ],
    "previous-next-jobs": [
      `Что вы делали до того, как начали использовать ${solution}, чтобы прийти к "${outcome}"?`,
      `Что вы делали после того, как получили "${outcome}", чтобы прийти к "${higher}"?`,
    ],
    "lower-level-jobs": [
      session.mode === "frequent"
        ? `Какие работы ниже уровнем вы обычно делаете, чтобы получить "${outcome}"?`
        : `Расскажите, пожалуйста, по шагам, что вы делаете, чтобы получить "${outcome}".`,
      "Какие из этих шагов самые важные или проблемные?",
    ],
    "solution-interview": [
      `Какие альтернативы вы рассматривали, чтобы получить "${outcome}"?`,
      `Почему в итоге выбрали именно ${solution}?`,
    ],
    summary: [
      "Есть ли еще что-то важное, что я не спросил, но это стоит учесть?",
      `Если коротко, какие 1-2 работы и проблемы здесь самые главные вокруг "${outcome}"?`,
    ],
  };

  return map[stepId] ?? [];
}

function summarizeSession(session: InterviewSession) {
  const coreJobs = session.jobs.filter((job) => job.level === "core").length;
  const problemCount = session.jobs.reduce((total, job) => total + (job.fields.problems?.length ?? 0), 0);
  const stepProgress = session.steps.filter((step) => step.status === "done" || step.status === "skipped").length;
  return { coreJobs, problemCount, stepProgress };
}

function getStepLearnedSummary(stepId: string, session: InterviewSession, selectedJob?: JobNode) {
  if (stepId === "onboarding") {
    return session.steps.find((step) => step.id === "onboarding")?.notes || "Пока не зафиксировали стартовую рамку интервью.";
  }

  if (stepId === "qualification") {
    const q = session.qualification;
    const items = [q.segment, q.experienceLevel, q.priorSolutions, q.constraints].filter(Boolean);
    return items.length > 0 ? items.join(" • ") : "Квалификационный профиль пока не заполнен.";
  }

  if (!selectedJob) {
    return "Сначала выберите текущую работу.";
  }

  const byStep: Record<string, string | undefined> = {
    "navigation-to-jobs": session.steps.find((step) => step.id === "navigation-to-jobs")?.notes,
    "job-outcome": selectedJob.fields.expectedOutcome || selectedJob.title,
    "job-criteria": selectedJob.fields.criteria,
    "job-situation": [selectedJob.fields.context, selectedJob.fields.trigger, selectedJob.fields.activatingKnowledge]
      .filter(Boolean)
      .join(" • "),
    "job-motivation": [selectedJob.fields.higherLevelOutcome, selectedJob.fields.positiveEmotion, selectedJob.fields.negativeEmotion]
      .filter(Boolean)
      .join(" • "),
    "job-economics": [
      selectedJob.fields.frequency,
      selectedJob.fields.importanceScore ? `важность ${selectedJob.fields.importanceScore}/10` : undefined,
      selectedJob.fields.satisfactionScore ? `удовлетворённость ${selectedJob.fields.satisfactionScore}/10` : undefined,
    ]
      .filter(Boolean)
      .join(" • "),
    "job-solution-detail": [
      selectedJob.fields.value,
      selectedJob.fields.ahaMoment,
      ...(selectedJob.fields.problems ?? []),
    ]
      .filter(Boolean)
      .join(" • "),
    "previous-next-jobs": session.steps.find((step) => step.id === "previous-next-jobs")?.notes,
    "lower-level-jobs": session.steps.find((step) => step.id === "lower-level-jobs")?.notes,
    "solution-interview": session.steps.find((step) => step.id === "solution-interview")?.notes,
    summary: session.steps.find((step) => step.id === "summary")?.notes,
  };

  return byStep[stepId] || "На этом шаге пока нет сохранённого вывода.";
}

function getStepNextAction(stepId: string, session: InterviewSession, selectedJob?: JobNode) {
  if (stepId === "onboarding") {
    return "Проверьте, что понятно: какую задачу исследуем и как объясняем цель разговора респонденту.";
  }
  if (stepId === "qualification") {
    return "Убедитесь, что понятны опыт респондента, прошлые решения и ограничения.";
  }
  if (!selectedJob) {
    return "Выберите работу, чтобы продолжить интервью по существу.";
  }

  const next: Record<string, string> = {
    "navigation-to-jobs": "Выберите 1-2 самые важные работы и продолжайте только с ними.",
    "job-outcome": "Проверьте, что формулировка звучит как результат, а не как функция продукта.",
    "job-criteria": "Уточните, как респондент понимает, что результат получен хорошо.",
    "job-situation": "Проверьте, что вы отделили ситуацию, триггер и новое знание друг от друга.",
    "job-motivation": "Дойдите до работы уровнем выше и эмоциональной ставки.",
    "job-economics": "Сопоставьте силу работы и качество текущего решения.",
    "job-solution-detail": "Соберите барьеры, альтернативы и реальные проблемы использования.",
    "previous-next-jobs": "Добавьте соседние работы, чтобы увидеть цепочку целиком.",
    "lower-level-jobs": "Разложите текущую работу на шаги только там, где это реально помогает понять проблему.",
    "solution-interview": "Если история перехода сильная, сохраните её как отдельную гипотезу для следующего исследования.",
    summary: "Проверьте, что главные выводы привязаны к конкретным работам и проблемам.",
  };

  return next[stepId] || "Продолжайте по сценарию интервью.";
}

function updateStepStatuses(steps: StepState[], activeStepId: string): StepState[] {
  let passedActive = false;
  return steps.map((step) => {
    if (step.id === activeStepId) {
      passedActive = true;
      return { ...step, status: step.status === "skipped" ? "skipped" : "active" };
    }
    if (!passedActive) {
      return { ...step, status: step.status === "todo" ? "done" : step.status };
    }
    return {
      ...step,
      status: step.status === "done" || step.status === "skipped" ? step.status : "todo",
    };
  });
}

function buildFlowNodes(session: InterviewSession): Node[] {
  return session.jobs.map((job) => ({
    id: job.id,
    position: job.position ?? { x: 100, y: 100 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { label: <JobFlowCard job={job} /> },
    style: {
      width: 240,
      borderRadius: 18,
      border: "1px solid rgba(17, 24, 39, 0.14)",
      background: "#fffdf8",
      boxShadow: "0 14px 28px rgba(17, 24, 39, 0.08)",
      padding: 0,
    },
  }));
}

function buildFlowEdges(session: InterviewSession) {
  const parentEdges = session.jobs
    .filter((job) => job.parentId)
    .map((job) => ({
      id: `parent-${job.id}`,
      source: job.parentId!,
      target: job.id,
      type: "smoothstep",
      label: "level",
      animated: false,
      style: { stroke: "#c96c2b", strokeWidth: 2 },
      labelStyle: { fill: "#8d4b20", fontWeight: 700 },
    }));

  const linkEdges = session.links.map((link) => ({
    id: link.id,
    source: link.source,
    target: link.target,
    type: "smoothstep",
    label: link.type === "previous-next" ? "sequence" : "solution",
    animated: link.type === "previous-next",
    style: {
      stroke: link.type === "previous-next" ? "#2c73d2" : "#3f8f5c",
      strokeWidth: 2,
      strokeDasharray: link.type === "uses-solution" ? "6 4" : undefined,
    },
    labelStyle: { fill: "#334155", fontWeight: 700 },
  }));

  return [...parentEdges, ...linkEdges];
}

function createSessionPatch(previous: InterviewSession, updater: (session: InterviewSession) => InterviewSession) {
  const next = updater(previous);
  return { ...next, updatedAt: new Date().toISOString() };
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getCoreJob(session: InterviewSession) {
  return session.jobs.find((job) => job.level === "core") || session.jobs[0];
}

function getMissingInterviewZones(session: InterviewSession) {
  const coreJob = getCoreJob(session);
  const missing: string[] = [];
  const stepMap = new Map(session.steps.map((step) => [step.id, step]));

  if (!session.hypothesisJob && !session.hypothesisSolution) {
    missing.push("Не указана стартовая гипотеза работы или решения.");
  }
  if (!session.qualification.segment && !session.qualification.experienceLevel) {
    missing.push("Не заполнен квалификационный профиль респондента.");
  }
  if (!stepMap.get("navigation-to-jobs")?.notes) {
    missing.push("Не зафиксирован выбор главной работы после навигации.");
  }
  if (!coreJob?.fields.expectedOutcome) {
    missing.push("У главной работы не сформулирован ожидаемый результат.");
  }
  if (!coreJob?.fields.context) {
    missing.push("Не описан контекст главной работы.");
  }
  if (!coreJob?.fields.trigger) {
    missing.push("Не описан триггер возникновения главной работы.");
  }
  if (!coreJob?.fields.higherLevelOutcome) {
    missing.push("Не выделена работа уровнем выше.");
  }
  if (!(coreJob?.fields.problems ?? []).length) {
    missing.push("Не собраны конкретные проблемы или сбои.");
  }
  if (!coreJob?.fields.value) {
    missing.push("Не зафиксирована ценность текущего решения.");
  }
  if (!stepMap.get("summary")?.notes) {
    missing.push("Не заполнен итоговый вывод интервью.");
  }

  return missing;
}

function getSessionPatterns(sessions: InterviewSession[]) {
  const counts = new Map<string, number>();

  sessions.forEach((session) => {
    session.jobs.forEach((job) => {
      [...(job.fields.problems ?? []), ...(job.fields.barriers ?? []), ...(job.fields.alternatives ?? [])]
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));
}

function createResearchReport(session: InterviewSession, allSessions: InterviewSession[]) {
  const coreJob = getCoreJob(session);
  const higherJobs = session.jobs.filter((job) => job.parentId === undefined && job.level === "big");
  const childJobs = coreJob ? session.jobs.filter((job) => job.parentId === coreJob.id) : [];
  const patterns = getSessionPatterns(allSessions);
  const missing = getMissingInterviewZones(session);
  const problems = session.jobs.flatMap((job) => (job.fields.problems ?? []).map((item) => `${item} (${job.title})`));
  const barriers = session.jobs.flatMap((job) => (job.fields.barriers ?? []).map((item) => `${item} (${job.title})`));
  const alternatives = session.jobs.flatMap((job) => job.fields.alternatives ?? []);

  return [
    `# Research Summary: ${session.title}`,
    "",
    `Дата обновления: ${new Date(session.updatedAt).toLocaleString("ru-RU")}`,
    `Режим интервью: ${getModeLabel(session.mode)}`,
    "",
    "## Главная работа",
    coreJob?.fields.expectedOutcome || coreJob?.title || "Не определена",
    "",
    "## Работа уровнем выше",
    higherJobs.length ? higherJobs.map((job) => `- ${job.title}`).join("\n") : "Не выделена отдельно",
    "",
    "## Подзадачи",
    childJobs.length ? childJobs.map((job) => `- ${job.title}`).join("\n") : "Не декомпозированы",
    "",
    "## Контекст и триггер",
    [coreJob?.fields.context, coreJob?.fields.trigger].filter(Boolean).join(" • ") || "Не заполнено",
    "",
    "## Критерии результата",
    coreJob?.fields.criteria || "Не заполнено",
    "",
    "## Ценность решения",
    coreJob?.fields.value || "Не заполнено",
    "",
    "## Проблемы",
    problems.length ? problems.map((item) => `- ${item}`).join("\n") : "Не заполнено",
    "",
    "## Барьеры",
    barriers.length ? barriers.map((item) => `- ${item}`).join("\n") : "Не заполнено",
    "",
    "## Альтернативы",
    alternatives.length ? alternatives.map((item) => `- ${item}`).join("\n") : "Не заполнено",
    "",
    "## Пропущенные зоны интервью",
    missing.length ? missing.map((item) => `- ${item}`).join("\n") : "Критичных пробелов не обнаружено",
    "",
    "## Повторяющиеся паттерны по всем сессиям",
    patterns.length ? patterns.map((item) => `- ${item.label} (${item.count})`).join("\n") : "Недостаточно данных",
    "",
  ].join("\n");
}

function applySessionStepNotes(session: InterviewSession, stepId: string, value: string): InterviewSession {
  const selectedJob = session.jobs.find((job) => job.id === session.selectedJobId);
  const mappedField = FIELD_TO_JOB_PATCH[stepId];
  let jobs = session.jobs;
  let links = session.links;
  let qualification = session.qualification;

  if (stepId === "qualification") {
    qualification = { ...qualification, notes: value };
  } else if (mappedField && selectedJob) {
    jobs = session.jobs.map((job) => (job.id === selectedJob.id ? updateJobFields(job, { [mappedField]: value }) : job));
  } else if (stepId === "job-economics" && selectedJob) {
    const [frequency = "", importanceRaw = "", satisfactionRaw = ""] = value.split(",").map((part) => part.trim());
    jobs = session.jobs.map((job) =>
      job.id === selectedJob.id
        ? updateJobFields(job, {
            frequency,
            importanceScore: Number.parseInt(importanceRaw, 10) || undefined,
            satisfactionScore: Number.parseInt(satisfactionRaw, 10) || undefined,
          })
        : job,
    );
  } else if (stepId === "previous-next-jobs" && selectedJob) {
    const items = parseList(value).slice(0, 2);
    const createdJobs: JobNode[] = [];
    const createdLinks: JobLink[] = [];
    items.forEach((title, index) => {
      const newJob = createJob({
        title,
        level: index === 0 ? prevLevel(selectedJob.level) : nextLevel(selectedJob.level),
        mode: session.mode,
      });
      newJob.position = {
        x: (selectedJob.position?.x ?? 220) + (index === 0 ? -320 : 320),
        y: (selectedJob.position?.y ?? 120) + 30,
      };
      createdJobs.push(newJob);
      createdLinks.push(createLink(index === 0 ? newJob.id : selectedJob.id, index === 0 ? selectedJob.id : newJob.id, "previous-next"));
    });
    jobs = [...session.jobs, ...createdJobs];
    links = [...session.links, ...createdLinks];
  } else if (stepId === "lower-level-jobs" && selectedJob) {
    const items = parseList(value);
    const createdJobs = items.map((title, index) => {
      const newJob = createJob({
        title,
        level: nextLevel(selectedJob.level),
        mode: session.mode,
        parentId: selectedJob.id,
      });
      newJob.position = {
        x: (selectedJob.position?.x ?? 220) + index * 280 - 120,
        y: (selectedJob.position?.y ?? 120) + 220,
      };
      return newJob;
    });
    jobs = [...session.jobs, ...createdJobs];
  } else if (stepId === "job-solution-detail" && selectedJob) {
    const parts = value.split("\n");
    jobs = session.jobs.map((job) =>
      job.id === selectedJob.id
        ? updateJobFields(job, {
            value: parts[0] ?? "",
            ahaMoment: parts[1] ?? "",
            price: parts[2] ?? "",
            problems: parseList(parts[3] ?? ""),
            barriers: parseList(parts[4] ?? ""),
            alternatives: parseList(parts[5] ?? ""),
          })
        : job,
    );
  }

  return {
    ...session,
    qualification,
    jobs,
    links,
    steps: session.steps.map((step) => (step.id === stepId ? { ...step, notes: value } : step)),
  };
}

function JobFlowCard({ job }: { job: JobNode }) {
  return (
    <div className="flow-card">
      <div className="flow-card__meta">
        <span className="level-pill">{getLevelLabel(job.level)}</span>
        <span className="branch-pill">{getModeLabel(job.branchType)}</span>
      </div>
      <strong>{job.title}</strong>
      <p>{job.fields.expectedOutcome || "Добавьте формулировку работы"}</p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: (mode: InterviewMode) => void }) {
  return (
    <div className="empty-state">
      <h3>Создайте первую сессию</h3>
      <p>
        Помощник работает полностью в браузере, сохраняет интервью в localStorage и строит граф работ
        без сервера.
      </p>
      <div className="mode-help">
        <p><strong>{getModeLabel("frequent")}:</strong> {getModeDescription("frequent")}</p>
        <p><strong>{getModeLabel("sequential")}:</strong> {getModeDescription("sequential")}</p>
      </div>
      <div className="action-row">
        <button className="button button--primary" onClick={() => onCreate("frequent")}>
          {getModeShortLabel("frequent")}
        </button>
        <button className="button" onClick={() => onCreate("sequential")}>
          {getModeShortLabel("sequential")}
        </button>
      </div>
    </div>
  );
}

function StartView({
  session,
  onChange,
  onGoToWizard,
  advancedMode,
  onToggleAdvancedMode,
}: {
  session: InterviewSession;
  onChange: (updater: (session: InterviewSession) => InterviewSession) => void;
  onGoToWizard: () => void;
  advancedMode: boolean;
  onToggleAdvancedMode: () => void;
}) {
  return (
    <div className="stack">
      <section className="hero-card">
        <p className="eyebrow">Старт интервью</p>
        <h3>Сначала задайте рамку разговора, потом переходите к вопросам</h3>
        <p>
          На этом экране нужно принять только три решения: как назвать интервью, что именно вы
          исследуете и какой тип работы изучаете.
        </p>
      </section>
      <section className="panel">
        <div className="mode-cards">
          <button
            type="button"
            className={classNames("mode-card", session.mode === "frequent" && "mode-card--active")}
            onClick={() =>
              onChange((current) => ({
                ...current,
                mode: "frequent",
              }))
            }
          >
            <strong>{getModeLabel("frequent")}</strong>
            <span>{getModeDescription("frequent")}</span>
          </button>
          <button
            type="button"
            className={classNames("mode-card", session.mode === "sequential" && "mode-card--active")}
            onClick={() =>
              onChange((current) => ({
                ...current,
                mode: "sequential",
              }))
            }
          >
            <strong>{getModeLabel("sequential")}</strong>
            <span>{getModeDescription("sequential")}</span>
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="form-grid">
          <label>
            Название сессии
            <input
              value={session.title}
              onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            Режим интервью
            <select
              value={session.mode}
              onChange={(event) =>
                onChange((current) => {
                  const mode = event.target.value as InterviewMode;
                  const steps = getStepTemplates(mode).map((template, index) => {
                    const existing = current.steps.find((step) => step.id === template.id);
                    const status: StepStatus =
                      current.activeStepId === template.id
                        ? "active"
                        : existing?.status ?? (index === 0 ? "active" : "todo");
                    return {
                      id: template.id,
                      phase: template.phase,
                      title: template.title,
                      status,
                      notes: existing?.notes ?? "",
                      unclear: existing?.unclear,
                    };
                  });
                  return { ...current, mode, steps };
                })
              }
            >
              <option value="frequent">{getModeLabel("frequent")}</option>
              <option value="sequential">{getModeLabel("sequential")}</option>
            </select>
          </label>
          <label>
            Гипотеза работы
            <input
              value={session.hypothesisJob || ""}
              onChange={(event) => onChange((current) => ({ ...current, hypothesisJob: event.target.value }))}
            />
          </label>
          <label>
            Гипотеза решения
            <input
              value={session.hypothesisSolution || ""}
              onChange={(event) =>
                onChange((current) => ({ ...current, hypothesisSolution: event.target.value }))
              }
            />
          </label>
          <label className="span-2">
            Заметки по старту интервью
            <textarea
              rows={5}
              value={session.steps.find((step) => step.id === "onboarding")?.notes || ""}
              onChange={(event) =>
                onChange((current) => applySessionStepNotes(current, "onboarding", event.target.value))
              }
            />
          </label>
        </div>
        <div className="action-row">
          <button className="button button--primary" onClick={onGoToWizard}>
            Начать интервью
          </button>
          <button className="button" onClick={onToggleAdvancedMode}>
            {advancedMode ? "Расширенный режим включён" : "Включить расширенный режим"}
          </button>
        </div>
        <p className="muted">
          Подсказка: если сомневаетесь, начните с того режима, где респондент описывает опыт естественнее.
          {advancedMode ? " Сейчас открыт расширенный режим с ручным управлением структурой работ." : " Сейчас открыт базовый режим: сначала интервью, потом структура."}
        </p>
      </section>
    </div>
  );
}

function WizardView({
  session,
  selectedJob,
  activeStep,
  stepTemplate,
  onChange,
  onGoToMap,
  advancedMode,
}: {
  session: InterviewSession;
  selectedJob?: JobNode;
  activeStep: StepState;
  stepTemplate: StepTemplate;
  onChange: (updater: (session: InterviewSession) => InterviewSession) => void;
  onGoToMap: () => void;
  advancedMode: boolean;
}) {
  const currentIndex = session.steps.findIndex((step) => step.id === activeStep.id);
  const canMoveNext = currentIndex < session.steps.length - 1;
  const canMovePrev = currentIndex > 0;
  const scriptLines = buildScriptLines(activeStep.id, session, selectedJob);
  const primaryScript = scriptLines[0];
  const extraScripts = scriptLines.slice(1);
  const learnedSummary = getStepLearnedSummary(activeStep.id, session, selectedJob);
  const nextAction = getStepNextAction(activeStep.id, session, selectedJob);

  const moveStep = (direction: "next" | "prev") => {
    onChange((current) => {
      const index = current.steps.findIndex((step) => step.id === current.activeStepId);
      const nextIndex =
        direction === "next" ? Math.min(index + 1, current.steps.length - 1) : Math.max(index - 1, 0);
      const nextStep = current.steps[nextIndex];
      const currentSteps: StepState[] = current.steps.map((step) =>
        step.id === current.activeStepId
          ? { ...step, status: (step.status === "skipped" ? "skipped" : "done") as StepStatus }
          : step,
      );
      return {
        ...current,
        activeStepId: nextStep.id,
        steps: updateStepStatuses(currentSteps, nextStep.id),
      };
    });
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">{activeStep.phase}</p>
            <h3>{activeStep.title}</h3>
          </div>
          <span>
            {currentIndex + 1}/{session.steps.length}
          </span>
        </div>
        <div className="focus-card">
          <p className="eyebrow">Главная задача шага</p>
          <h4>{stepTemplate.goal}</h4>
          {primaryScript ? (
            <>
              <p className="focus-card__label">Что сказать прямо сейчас</p>
              <p className="script-line">“{primaryScript}”</p>
            </>
          ) : null}
        </div>
        {stepTemplate.supportsJobSelection ? (
          <label>
            Текущая работа, про которую идет разговор
            <select
              value={session.selectedJobId || ""}
              onChange={(event) =>
                onChange((current) => ({ ...current, selectedJobId: event.target.value || undefined }))
              }
            >
                  {session.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {getLevelLabel(job.level)}: {getSuggestedJobTitle(job)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {stepTemplate.supportsJobSelection ? (
          <p className="muted">Сначала задайте главный вопрос, потом коротко зафиксируйте ответ ниже.</p>
        ) : null}
        <label>
          {stepTemplate.fieldLabel}
          <textarea
            rows={6}
            placeholder={stepTemplate.placeholder}
            value={activeStep.notes}
            onChange={(event) =>
              onChange((current) => applySessionStepNotes(current, activeStep.id, event.target.value))
            }
          />
        </label>
        {stepTemplate.exampleAnswer ? (
          <div className="example-answer">
            <p className="example-answer__label">Пример хорошей фиксации ответа</p>
            <p>{stepTemplate.exampleAnswer}</p>
          </div>
        ) : null}
        <div className="step-summary">
          <div className="step-summary__item">
            <p className="step-summary__label">Что уже поняли</p>
            <p>{learnedSummary}</p>
          </div>
          <div className="step-summary__item">
            <p className="step-summary__label">Что уточнить дальше</p>
            <p>{nextAction}</p>
          </div>
        </div>
        <details className="details-card">
          <summary>Показать дополнительные формулировки и уточнения</summary>
          <div className="details-card__body wizard-layout">
            {extraScripts.length > 0 ? (
              <div className="wizard-section">
                <h4>Дополнительные фразы</h4>
                <ul className="clean-list">
                  {extraScripts.map((line) => (
                    <li key={line}>“{line}”</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="wizard-section">
              <h4>Вопросы и ориентиры</h4>
              <ul className="clean-list">
                {stepTemplate.prompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            </div>
            <div className="wizard-section wizard-section--full">
              <h4>Подсказки интервьюеру</h4>
              <ul className="clean-list">
                {stepTemplate.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        {advancedMode ? (
          <>
            <details className="details-card">
              <summary>Показать структурированные поля</summary>
              <div className="details-card__body">
                <StepStructuredEditor
                  session={session}
                  stepId={activeStep.id}
                  selectedJob={selectedJob}
                  onChange={onChange}
                />
              </div>
            </details>
            <details className="details-card">
              <summary>Показать действия со структурой работ</summary>
              <div className="details-card__body quick-actions">
                <button
                  className="button"
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      steps: current.steps.map((step) =>
                        step.id === activeStep.id ? { ...step, unclear: !step.unclear } : step,
                      ),
                    }))
                  }
                >
                  {activeStep.unclear ? "Снять пометку 'неясно'" : "Пометить как неясно"}
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onChange((current) => {
                      const baseJob = current.jobs.find((job) => job.id === current.selectedJobId);
                      const newJob = createJob({
                        title: "Новая работа",
                        level: baseJob?.level ?? "core",
                        mode: current.mode,
                      });
                      newJob.position = {
                        x: (baseJob?.position?.x ?? 120) + 260,
                        y: baseJob?.position?.y ?? 120,
                      };
                      return { ...current, jobs: [...current.jobs, newJob], selectedJobId: newJob.id };
                    })
                  }
                >
                  Добавить работу
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onChange((current) => {
                      const baseJob = current.jobs.find((job) => job.id === current.selectedJobId);
                      if (!baseJob) return current;
                      const newJob = createJob({
                        title: `Выше: ${baseJob.title}`,
                        level: prevLevel(baseJob.level),
                        mode: current.mode,
                      });
                      newJob.position = {
                        x: baseJob.position?.x ?? 120,
                        y: (baseJob.position?.y ?? 120) - 220,
                      };
                      return {
                        ...current,
                        jobs: current.jobs
                          .map((job) => (job.id === baseJob.id ? { ...job, parentId: newJob.id } : job))
                          .concat(newJob),
                        selectedJobId: newJob.id,
                      };
                    })
                  }
                >
                  Создать работу уровнем выше
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onChange((current) => {
                      const baseJob = current.jobs.find((job) => job.id === current.selectedJobId);
                      if (!baseJob) return current;
                      const child = createJob({
                        title: `Ниже: ${baseJob.title}`,
                        level: nextLevel(baseJob.level),
                        mode: current.mode,
                        parentId: baseJob.id,
                      });
                      child.position = {
                        x: baseJob.position?.x ?? 120,
                        y: (baseJob.position?.y ?? 120) + 220,
                      };
                      return { ...current, jobs: [...current.jobs, child], selectedJobId: child.id };
                    })
                  }
                >
                  Создать работу уровнем ниже
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      steps: current.steps.map((step) =>
                        step.id === activeStep.id ? { ...step, status: "skipped" } : step,
                      ),
                    }))
                  }
                >
                  Пропустить шаг
                </button>
              </div>
            </details>
          </>
        ) : null}
        <div className="action-row">
          <button className="button" disabled={!canMovePrev} onClick={() => moveStep("prev")}>
            Назад
          </button>
          {advancedMode ? <button className="button" onClick={onGoToMap}>Открыть карту</button> : null}
          <button className="button button--primary" disabled={!canMoveNext} onClick={() => moveStep("next")}>
            Следующий шаг
          </button>
        </div>
      </section>
      {advancedMode && selectedJob ? (
        <section className="panel">
          <div className="panel__header">
            <h3>Контекст выбранной работы</h3>
            <span>{getLevelLabel(selectedJob.level)}</span>
          </div>
          <p className="muted">{getSuggestedJobTitle(selectedJob)}</p>
          <div className="info-grid">
            <div>
              <strong>Контекст</strong>
              <p>{selectedJob.fields.context || "Пока пусто"}</p>
            </div>
            <div>
              <strong>Триггер</strong>
              <p>{selectedJob.fields.trigger || "Пока пусто"}</p>
            </div>
            <div>
              <strong>Проблемы</strong>
              <p>{(selectedJob.fields.problems ?? []).join(", ") || "Пока пусто"}</p>
            </div>
            <div>
              <strong>Ценность</strong>
              <p>{selectedJob.fields.value || "Пока пусто"}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function JobInspector({
  session,
  selectedJob,
  onChange,
  onDeleteJob,
}: {
  session: InterviewSession;
  selectedJob: JobNode;
  onChange: (updater: (session: InterviewSession) => InterviewSession) => void;
  onDeleteJob: (jobId: string) => void;
}) {
  const updateSelectedJob = (patch: Partial<JobNode>) => {
    onChange((current) => ({
      ...current,
      jobs: current.jobs.map((job) => (job.id === selectedJob.id ? { ...job, ...patch } : job)),
    }));
  };

  const updateFields = (patch: Partial<JobFields>) => {
    onChange((current) => ({
      ...current,
      jobs: current.jobs.map((job) =>
        job.id === selectedJob.id ? updateJobFields(job, patch) : job,
      ),
    }));
  };

  return (
    <div className="stack compact-stack">
      <label>
        Название узла
        <input value={selectedJob.title} onChange={(event) => updateSelectedJob({ title: event.target.value })} />
      </label>
      <label>
        Уровень работы
        <select
          value={selectedJob.level}
          onChange={(event) => updateSelectedJob({ level: event.target.value as JobLevel })}
        >
          {LEVEL_OPTIONS.map((level) => (
            <option key={level} value={level}>
              {getLevelLabel(level)}
            </option>
          ))}
        </select>
        <span className="field-hint">{getLevelHint(selectedJob.level)}</span>
      </label>
      <label>
        Родительская работа
        <select
          value={selectedJob.parentId || ""}
          onChange={(event) => updateSelectedJob({ parentId: event.target.value || undefined })}
        >
          <option value="">Без родителя</option>
          {session.jobs
            .filter((job) => job.id !== selectedJob.id)
            .map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Ожидаемый результат
        <textarea
          rows={3}
          value={selectedJob.fields.expectedOutcome || ""}
          onChange={(event) => updateFields({ expectedOutcome: event.target.value })}
        />
      </label>
      <label>
        Контекст
        <textarea
          rows={3}
          value={selectedJob.fields.context || ""}
          onChange={(event) => updateFields({ context: event.target.value })}
        />
      </label>
      <label>
        Триггер
        <textarea
          rows={2}
          value={selectedJob.fields.trigger || ""}
          onChange={(event) => updateFields({ trigger: event.target.value })}
        />
      </label>
      <label>
        Ценность
        <textarea
          rows={3}
          value={selectedJob.fields.value || ""}
          onChange={(event) => updateFields({ value: event.target.value })}
        />
      </label>
      <label>
        Проблемы
        <textarea
          rows={4}
          value={listToText(selectedJob.fields.problems)}
          onChange={(event) => updateFields({ problems: parseList(event.target.value) })}
        />
      </label>
      <div className="action-row">
        <button className="button button--danger" onClick={() => onDeleteJob(selectedJob.id)}>
          Удалить job
        </button>
      </div>
    </div>
  );
}

function StepStructuredEditor({
  session,
  stepId,
  selectedJob,
  onChange,
}: {
  session: InterviewSession;
  stepId: string;
  selectedJob?: JobNode;
  onChange: (updater: (session: InterviewSession) => InterviewSession) => void;
}) {
  const updateQualification = (patch: Partial<InterviewSession["qualification"]>) => {
    onChange((current) => ({
      ...current,
      qualification: {
        ...current.qualification,
        ...patch,
      },
    }));
  };

  const updateSelectedJobFields = (patch: Partial<JobFields>, patchRoot?: Partial<JobNode>) => {
    if (!selectedJob) return;
    onChange((current) => ({
      ...current,
      jobs: current.jobs.map((job) =>
        job.id === selectedJob.id ? { ...updateJobFields(job, patch), ...patchRoot } : job,
      ),
    }));
  };

  if (stepId === "qualification") {
    return (
      <div className="form-grid">
        <label>
          Сегмент
          <input
            value={session.qualification.segment}
            onChange={(event) => updateQualification({ segment: event.target.value })}
          />
        </label>
        <label>
          Уровень опыта
          <input
            value={session.qualification.experienceLevel}
            onChange={(event) => updateQualification({ experienceLevel: event.target.value })}
          />
        </label>
        <label>
          Прошлые решения
          <textarea
            rows={3}
            value={session.qualification.priorSolutions}
            onChange={(event) => updateQualification({ priorSolutions: event.target.value })}
          />
        </label>
        <label>
          Ограничения
          <textarea
            rows={3}
            value={session.qualification.constraints}
            onChange={(event) => updateQualification({ constraints: event.target.value })}
          />
        </label>
      </div>
    );
  }

  if (!selectedJob) {
    return null;
  }

  if (stepId === "job-outcome") {
    return (
      <div className="form-grid">
        <label>
          Название работы
          <input value={selectedJob.title} onChange={(event) => updateSelectedJobFields({}, { title: event.target.value })} />
        </label>
      <label>
        Уровень
        <select value={selectedJob.level} onChange={(event) => updateSelectedJobFields({}, { level: event.target.value as JobLevel })}>
          {LEVEL_OPTIONS.map((level) => (
            <option key={level} value={level}>
              {getLevelLabel(level)}
            </option>
          ))}
        </select>
        <span className="field-hint">{getLevelHint(selectedJob.level)}</span>
      </label>
        <label className="span-2">
          Ожидаемый результат
          <textarea
            rows={4}
            value={selectedJob.fields.expectedOutcome || ""}
            onChange={(event) => updateSelectedJobFields({ expectedOutcome: event.target.value })}
          />
        </label>
      </div>
    );
  }

  if (stepId === "job-criteria") {
    return (
      <label>
        Критерии результата
        <textarea
          rows={4}
          value={selectedJob.fields.criteria || ""}
          onChange={(event) => updateSelectedJobFields({ criteria: event.target.value })}
        />
      </label>
    );
  }

  if (stepId === "job-situation") {
    return (
      <div className="form-grid">
        <label>
          Контекст
          <textarea rows={3} value={selectedJob.fields.context || ""} onChange={(event) => updateSelectedJobFields({ context: event.target.value })} />
        </label>
        <label>
          Триггер
          <textarea rows={3} value={selectedJob.fields.trigger || ""} onChange={(event) => updateSelectedJobFields({ trigger: event.target.value })} />
        </label>
        <label className="span-2">
          Активирующее знание
          <textarea
            rows={3}
            value={selectedJob.fields.activatingKnowledge || ""}
            onChange={(event) => updateSelectedJobFields({ activatingKnowledge: event.target.value })}
          />
        </label>
      </div>
    );
  }

  if (stepId === "job-motivation") {
    return (
      <div className="form-grid">
        <label>
          Работа уровнем выше
          <textarea
            rows={3}
            value={selectedJob.fields.higherLevelOutcome || ""}
            onChange={(event) => updateSelectedJobFields({ higherLevelOutcome: event.target.value })}
          />
        </label>
        <label>
          Позитивная эмоция
          <textarea
            rows={3}
            value={selectedJob.fields.positiveEmotion || ""}
            onChange={(event) => updateSelectedJobFields({ positiveEmotion: event.target.value })}
          />
        </label>
        <label className="span-2">
          Негативная эмоция
          <textarea
            rows={3}
            value={selectedJob.fields.negativeEmotion || ""}
            onChange={(event) => updateSelectedJobFields({ negativeEmotion: event.target.value })}
          />
        </label>
      </div>
    );
  }

  if (stepId === "job-economics") {
    return (
      <div className="form-grid">
        <label>
          Частотность
          <input value={selectedJob.fields.frequency || ""} onChange={(event) => updateSelectedJobFields({ frequency: event.target.value })} />
        </label>
        <label>
          Важность 1-10
          <input
            type="number"
            min="1"
            max="10"
            value={selectedJob.fields.importanceScore || ""}
            onChange={(event) => updateSelectedJobFields({ importanceScore: Number(event.target.value) || undefined })}
          />
        </label>
        <label className="span-2">
          Удовлетворенность 1-10
          <input
            type="number"
            min="1"
            max="10"
            value={selectedJob.fields.satisfactionScore || ""}
            onChange={(event) => updateSelectedJobFields({ satisfactionScore: Number(event.target.value) || undefined })}
          />
        </label>
      </div>
    );
  }

  if (stepId === "job-solution-detail") {
    return (
      <div className="form-grid">
        <label>
          Ценность
          <textarea rows={3} value={selectedJob.fields.value || ""} onChange={(event) => updateSelectedJobFields({ value: event.target.value })} />
        </label>
        <label>
          Aha-moment
          <textarea rows={3} value={selectedJob.fields.ahaMoment || ""} onChange={(event) => updateSelectedJobFields({ ahaMoment: event.target.value })} />
        </label>
        <label>
          Цена
          <input value={selectedJob.fields.price || ""} onChange={(event) => updateSelectedJobFields({ price: event.target.value })} />
        </label>
        <label>
          Fit цены и ценности
          <input
            type="number"
            min="1"
            max="10"
            value={selectedJob.fields.priceValueFitScore || ""}
            onChange={(event) => updateSelectedJobFields({ priceValueFitScore: Number(event.target.value) || undefined })}
          />
        </label>
        <label className="span-2">
          Проблемы
          <textarea rows={4} value={listToText(selectedJob.fields.problems)} onChange={(event) => updateSelectedJobFields({ problems: parseList(event.target.value) })} />
        </label>
      </div>
    );
  }

  return null;
}

function MapView({
  session,
  onChange,
  onDeleteJob,
}: {
  session: InterviewSession;
  onChange: (updater: (session: InterviewSession) => InterviewSession) => void;
  onDeleteJob: (jobId: string) => void;
}) {
  const nodes = useMemo(() => buildFlowNodes(session), [session]);
  const edges = useMemo(() => buildFlowEdges(session), [session]);

  return (
    <div className="stack map-view">
      <section className="panel map-panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Карта работ</p>
            <h3>Редактируемый граф AJTBD</h3>
          </div>
          <span>{session.jobs.length} узлов</span>
        </div>
        <div className="map-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodesChange={(changes) =>
              onChange((current) => {
                const nextNodes = applyNodeChanges(changes, buildFlowNodes(current));
                return {
                  ...current,
                  jobs: current.jobs.map((job) => {
                    const changedNode = nextNodes.find((node) => node.id === job.id);
                    return changedNode ? { ...job, position: changedNode.position } : job;
                  }),
                };
              })
            }
            onEdgesChange={(changes) =>
              onChange((current) => {
                const nextEdges = applyEdgeChanges(changes, buildFlowEdges(current));
                return {
                  ...current,
                  links: current.links.filter((link) =>
                    nextEdges.some((edge) => edge.id === link.id || edge.id === `parent-${link.target}`),
                  ),
                };
              })
            }
            onNodeClick={(_, node) => onChange((current) => ({ ...current, selectedJobId: node.id }))}
            onConnect={(connection) =>
              onChange((current) => {
                if (!connection.source || !connection.target) {
                  return current;
                }
                return {
                  ...current,
                  links: [...current.links, createLink(connection.source, connection.target, "previous-next")],
                };
              })
            }
          >
            <Background gap={24} color="#d8d1c5" />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h3>Список работ</h3>
          <span>{session.links.length} пользовательских связей</span>
        </div>
        <div className="job-list">
          {session.jobs.map((job) => (
            <div key={job.id} className="job-list-item">
              <div>
                <strong>{job.title}</strong>
                <p>
                  {getLevelLabel(job.level)} / {getModeLabel(job.branchType)}
                </p>
              </div>
              <div className="action-row">
                <button
                  className="button"
                  onClick={() => onChange((current) => ({ ...current, selectedJobId: job.id }))}
                >
                  Выбрать
                </button>
                <button className="button button--danger" onClick={() => onDeleteJob(job.id)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryView({ session, allSessions }: { session: InterviewSession; allSessions: InterviewSession[] }) {
  const summary = summarizeSession(session);
  const coreJob = getCoreJob(session);
  const higherJobs = session.jobs.filter((job) => job.parentId === undefined && job.level === "big");
  const childJobs = coreJob ? session.jobs.filter((job) => job.parentId === coreJob.id) : [];
  const jobsWithProblems = session.jobs.filter((job) => (job.fields.problems ?? []).length > 0);
  const topProblems = jobsWithProblems.flatMap((job) =>
    (job.fields.problems ?? []).map((problem) => `${problem} (${job.title})`),
  );
  const topBarriers = session.jobs.flatMap((job) =>
    (job.fields.barriers ?? []).map((barrier) => `${barrier} (${job.title})`),
  );
  const topAlternatives = session.jobs.flatMap((job) => job.fields.alternatives ?? []);
  const productImplications = [
    coreJob?.fields.value ? `Усилить ценность "${coreJob.fields.value}" в интерфейсе и коммуникации.` : undefined,
    topProblems[0] ? `Снять проблему "${topProblems[0]}" в сценарии продукта.` : undefined,
    coreJob?.fields.criteria ? `Проверить, закрывает ли продукт критерии результата: ${coreJob.fields.criteria}.` : undefined,
    coreJob?.fields.higherLevelOutcome ? `Связать решение с работой уровнем выше: ${coreJob.fields.higherLevelOutcome}.` : undefined,
  ].filter(Boolean) as string[];
  const missingZones = getMissingInterviewZones(session);
  const repeatedPatterns = getSessionPatterns(allSessions);
  const relatedSessions = allSessions.filter((item) => item.id !== session.id);
  const report = createResearchReport(session, allSessions);

  return (
    <div className="stack">
      <section className="hero-card">
        <p className="eyebrow">Research Summary</p>
        <h3>{session.title}</h3>
        <p>
          Это не техническая сводка, а короткий исследовательский итог: какую работу выполняет
          человек, зачем она ему нужна, что мешает и где лежат продуктовые возможности.
        </p>
        <div className="action-row">
          <button
            className="button button--primary"
            onClick={() =>
              downloadText(
                `${session.title.replace(/[\\\\/:*?\"<>|]/g, "_") || "research-summary"}.md`,
                report,
                "text/markdown;charset=utf-8",
              )
            }
          >
            Экспортировать research report
          </button>
        </div>
      </section>
      <section className="summary-grid">
        <div className="summary-tile">
          <strong>{summary.stepProgress}</strong>
          <span>пройденных шагов</span>
        </div>
        <div className="summary-tile">
          <strong>{session.jobs.length}</strong>
          <span>работ в графе</span>
        </div>
        <div className="summary-tile">
          <strong>{summary.problemCount}</strong>
          <span>зафиксированных проблем</span>
        </div>
        <div className="summary-tile">
          <strong>{session.links.length}</strong>
          <span>дополнительных связей</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel__header">
          <h3>Главный вывод по интервью</h3>
          <span>{coreJob ? getLevelLabel(coreJob.level) : "нет"}</span>
        </div>
        <div className="research-grid">
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Главная работа</strong>
              {coreJob ? <span className="level-pill">{getLevelLabel(coreJob.level)}</span> : null}
            </div>
            <p>{coreJob?.fields.expectedOutcome || coreJob?.title || "Не определена"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Зачем это нужно</strong>
            </div>
            <p>{coreJob?.fields.higherLevelOutcome || "Работа уровнем выше пока не зафиксирована"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Ценность решения</strong>
            </div>
            <p>{coreJob?.fields.value || "Ценность пока не описана"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Контекст и триггер</strong>
            </div>
            <p>{[coreJob?.fields.context, coreJob?.fields.trigger].filter(Boolean).join(" • ") || "Пока не собраны"}</p>
          </article>
        </div>
      </section>
      <section className="panel">
        <div className="panel__header">
          <h3>Структура работы</h3>
          <span>{childJobs.length + higherJobs.length}</span>
        </div>
        <div className="research-grid">
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Работы уровнем выше</strong>
            </div>
            <p>{higherJobs.length ? higherJobs.map((job) => job.title).join(", ") : "Не выделены отдельно"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Подзадачи и шаги</strong>
            </div>
            <p>{childJobs.length ? childJobs.map((job) => job.title).join(", ") : "Пока не декомпозированы"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Критерии хорошего результата</strong>
            </div>
            <p>{coreJob?.fields.criteria || "Пока не описаны"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Эмоциональная ставка</strong>
            </div>
            <p>{[coreJob?.fields.positiveEmotion, coreJob?.fields.negativeEmotion].filter(Boolean).join(" • ") || "Пока не зафиксирована"}</p>
          </article>
        </div>
      </section>
      <section className="panel">
        <div className="panel__header">
          <h3>Барьеры, проблемы, альтернативы</h3>
          <span>{topProblems.length}</span>
        </div>
        <div className="research-grid">
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Главные проблемы</strong>
            </div>
            <p>{topProblems.length ? topProblems.slice(0, 5).join(", ") : "Пока не зафиксированы"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Барьеры к использованию</strong>
            </div>
            <p>{topBarriers.length ? topBarriers.slice(0, 5).join(", ") : "Пока не зафиксированы"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Альтернативы</strong>
            </div>
            <p>{topAlternatives.length ? topAlternatives.slice(0, 5).join(", ") : "Пока не зафиксированы"}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Что стоит проверить продуктово</strong>
            </div>
            <p>{productImplications.length ? productImplications.join(" ") : "Пока недостаточно данных для выводов."}</p>
          </article>
        </div>
      </section>
      <section className="panel">
        <div className="panel__header">
          <h3>Пропущенные зоны интервью</h3>
          <span>{missingZones.length}</span>
        </div>
        <div className="research-grid">
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Что ещё не собрано</strong>
            </div>
            <p>{missingZones.length ? missingZones.join(" ") : "Критичных пробелов не видно."}</p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Что проверить в следующем интервью</strong>
            </div>
            <p>
              {missingZones.length
                ? "В следующем разговоре начните с незаполненных зон: контекст, триггер, работа уровнем выше, проблемы и ценность."
                : "Можно переходить к сравнению нескольких интервью и уточнению повторяющихся паттернов."}
            </p>
          </article>
        </div>
      </section>
      <section className="panel">
        <div className="panel__header">
          <h3>Сравнение с другими интервью</h3>
          <span>{relatedSessions.length}</span>
        </div>
        <div className="research-grid">
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Повторяющиеся паттерны</strong>
            </div>
            <p>
              {repeatedPatterns.length
                ? repeatedPatterns.map((item) => `${item.label} (${item.count})`).join(", ")
                : "Пока недостаточно данных для сравнения."}
            </p>
          </article>
          <article className="summary-item">
            <div className="summary-item__top">
              <strong>Другие сессии для сопоставления</strong>
            </div>
            <p>
              {relatedSessions.length
                ? relatedSessions.slice(0, 5).map((item) => item.title).join(", ")
                : "Это пока единственная сохранённая сессия."}
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

function AppShell() {
  const initialSessions = useMemo(() => loadSessions(), []);
  const [sessions, setSessions] = useState<InterviewSession[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(initialSessions[0]?.id);
  const [view, setView] = useState<WorkspaceView>("start");
  const [ioMessage, setIoMessage] = useState<string>("");
  const [showContextPanel, setShowContextPanel] = useState<boolean>(false);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions],
  );
  const activeStep = activeSession?.steps.find((step) => step.id === activeSession.activeStepId);
  const stepTemplate = activeSession && activeStep ? getStepTemplate(activeStep.id, activeSession.mode) : undefined;
  const selectedJob = activeSession?.jobs.find((job) => job.id === activeSession.selectedJobId);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (!activeSessionId && sessions[0]) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions]);

  const updateSession = (updater: (session: InterviewSession) => InterviewSession) => {
    if (!activeSession) return;
    setSessions((current) =>
      current.map((session) => (session.id === activeSession.id ? createSessionPatch(session, updater) : session)),
    );
  };

  const createNewSession = (mode: InterviewMode) => {
    const session = createSession({ mode });
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setView("start");
  };

  const mergeImportedSessions = (incoming: InterviewSession[]) => {
    setSessions((current) => {
      const byId = new Map(current.map((session) => [session.id, session]));
      incoming.forEach((session) => byId.set(session.id, session));
      const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (!activeSessionId && merged[0]) {
        setActiveSessionId(merged[0].id);
      }
      return merged;
    });
  };

  const handleExportAll = () => {
    downloadJson("ajtbd-sessions.json", exportSessionsPayload(sessions));
    setIoMessage("Экспортированы все сессии.");
  };

  const handleExportCurrent = () => {
    if (!activeSession) return;
    downloadJson(`${activeSession.title.replace(/[\\\\/:*?\"<>|]/g, "_") || "ajtbd-session"}.json`, exportSessionsPayload([activeSession]));
    setIoMessage(`Экспортирована сессия: ${activeSession.title}`);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const imported = importSessionsPayload(content);
      mergeImportedSessions(imported);
      if (imported[0]) {
        setActiveSessionId(imported[0].id);
      }
      setIoMessage(`Импортировано сессий: ${imported.length}`);
    } catch {
      setIoMessage("Не удалось импортировать JSON. Проверьте формат файла.");
    } finally {
      event.target.value = "";
    }
  };

  const deleteJob = (jobId: string) => {
    updateSession((session) => {
      const children = new Set<string>([jobId]);
      let changed = true;
      while (changed) {
        changed = false;
        session.jobs.forEach((job) => {
          if (job.parentId && children.has(job.parentId) && !children.has(job.id)) {
            children.add(job.id);
            changed = true;
          }
        });
      }
      const remainingJobs = session.jobs.filter((job) => !children.has(job.id));
      const remainingLinks = session.links.filter(
        (link) => !children.has(link.source) && !children.has(link.target),
      );
      const selectedJobId =
        session.selectedJobId && !children.has(session.selectedJobId)
          ? session.selectedJobId
          : remainingJobs[0]?.id;
      return { ...session, jobs: remainingJobs, links: remainingLinks, selectedJobId };
    });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">AJTBD Interview Assistant</p>
          <h1>Проводите интервью по алгоритму, а не по памяти.</h1>
          <p>
            Мастер ведет интервьюера по шагам, а карта работ параллельно собирается в редактируемый граф.
          </p>
          <div className="action-row">
            <button className="button button--primary" onClick={() => createNewSession("frequent")}>
              Новая сессия: частотная работа
            </button>
            <button className="button" onClick={() => createNewSession("sequential")}>
              Новая сессия: последовательная работа
            </button>
          </div>
          <div className="action-row">
            <button className="button" onClick={handleExportAll} disabled={sessions.length === 0}>
              Экспорт всех JSON
            </button>
            <button className="button" onClick={handleExportCurrent} disabled={!activeSession}>
              Экспорт текущей
            </button>
            <label className="file-button">
              Импорт JSON
              <input type="file" accept="application/json,.json" onChange={handleImportFile} />
            </label>
          </div>
          {ioMessage ? <p className="muted">{ioMessage}</p> : null}
        </div>

        <section className="panel">
          <div className="panel__header">
            <h2>Сессии</h2>
            <span>{sessions.length}</span>
          </div>
          <div className="session-list">
            {sessions.length === 0 ? <p className="muted">Создайте первую сессию справа сверху.</p> : null}
            {sessions.map((session) => {
              const summary = summarizeSession(session);
              return (
                <button
                  key={session.id}
                  className={classNames("session-card", session.id === activeSessionId && "session-card--active")}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <div className="session-card__top">
                    <strong>{session.title}</strong>
                    <span className="branch-pill">{getModeLabel(session.mode)}</span>
                  </div>
                  <p>{session.hypothesisJob || session.hypothesisSolution || "Без явной гипотезы"}</p>
                  <small>
                    {summary.stepProgress}/{session.steps.length} шагов, {summary.coreJobs} core jobs, {summary.problemCount} проблем
                  </small>
                </button>
              );
            })}
          </div>
        </section>
        {activeSession ? (
          <section className="panel">
            <div className="panel__header">
              <h2>Прогресс</h2>
              <span>{getModeLabel(activeSession.mode)}</span>
            </div>
            <div className="step-list">
              {activeSession.steps.map((step) => (
                <button
                  key={step.id}
                  className={classNames("step-card", `step-card--${step.status}`)}
                  onClick={() =>
                    updateSession((session) => ({
                      ...session,
                      activeStepId: step.id,
                      steps: updateStepStatuses(session.steps, step.id),
                    }))
                  }
                >
                  <strong>{step.title}</strong>
                  <span>{step.status}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <main className="workspace">
        <header className="workspace__header">
          <div>
            <p className="eyebrow">Рабочая зона</p>
            <h2>{activeSession?.title || "Создайте первую AJTBD-сессию"}</h2>
          </div>
          <div className="header-actions">
            <div className="tab-row" role="tablist" aria-label="View switcher">
              {VIEW_OPTIONS.filter((option) => advancedMode || option !== "map").map((option) => (
                <button
                  key={option}
                  className={classNames("tab", view === option && "tab--active")}
                  onClick={() => setView(option)}
                >
                  {option === "start" ? "Подготовка" : option === "wizard" ? "Интервью" : option === "map" ? "Карта" : "Итог"}
                </button>
              ))}
            </div>
            <div className="mode-toggle" role="group" aria-label="Interview mode">
              <button
                className={classNames("tab", !advancedMode && "tab--active")}
                onClick={() => setAdvancedMode(false)}
              >
                Базовый режим
              </button>
              <button
                className={classNames("tab", advancedMode && "tab--active")}
                onClick={() => setAdvancedMode(true)}
              >
                Расширенный режим
              </button>
            </div>
            {activeSession && advancedMode ? (
              <button className="button" onClick={() => setShowContextPanel((value) => !value)}>
                {showContextPanel ? "Скрыть контекст" : "Показать контекст"}
              </button>
            ) : null}
          </div>
        </header>

        <div className={classNames("workspace__content", showContextPanel && "workspace__content--with-context")}>
          <section className="content-panel">
            {!activeSession ? (
              <EmptyState onCreate={createNewSession} />
            ) : view === "start" ? (
              <StartView
                session={activeSession}
                onChange={updateSession}
                onGoToWizard={() => setView("wizard")}
                advancedMode={advancedMode}
                onToggleAdvancedMode={() => setAdvancedMode((value) => !value)}
              />
            ) : view === "wizard" && activeStep && stepTemplate ? (
              <WizardView
                session={activeSession}
                selectedJob={selectedJob}
                activeStep={activeStep}
                stepTemplate={stepTemplate}
                onChange={updateSession}
                onGoToMap={() => setView("map")}
                advancedMode={advancedMode}
              />
            ) : view === "map" ? (
              <MapView session={activeSession} onChange={updateSession} onDeleteJob={deleteJob} />
            ) : (
              <SummaryView session={activeSession} allSessions={sessions} />
            )}
          </section>

          {showContextPanel && advancedMode ? (
          <aside className="context-panel">
            {activeSession ? (
              <>
                <section className="panel">
                  <div className="panel__header">
                    <h2>Текущая работа</h2>
                    <span>{selectedJob ? getLevelLabel(selectedJob.level) : "none"}</span>
                  </div>
                  {selectedJob ? (
                    <JobInspector
                      session={activeSession}
                      selectedJob={selectedJob}
                      onChange={updateSession}
                      onDeleteJob={deleteJob}
                    />
                  ) : (
                    <p className="muted">Выберите job на карте или в мастере.</p>
                  )}
                </section>
                <section className="panel mini-map-panel">
                  <div className="panel__header">
                    <h2>Карта работ</h2>
                    <span>{activeSession.jobs.length}</span>
                  </div>
                  <div className="mini-flow">
                    <ReactFlow nodes={buildFlowNodes(activeSession)} edges={buildFlowEdges(activeSession)} fitView>
                      <MiniMap pannable zoomable />
                      <Background gap={24} color="#d8d1c5" />
                    </ReactFlow>
                  </div>
                </section>
              </>
            ) : (
              <section className="panel">
                <h2>Контекст</h2>
                <p className="muted">После создания сессии здесь появятся карточка работы и мини-карта.</p>
              </section>
            )}
          </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}
