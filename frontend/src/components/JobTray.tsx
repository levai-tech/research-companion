import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { useJobTrayStore } from "../jobTrayStore";

interface Resource {
  id: string;
  indexing_status: string;
  citation_metadata: { title?: string };
}

interface StatusResponse {
  indexing_status: string;
  chunks_done: number;
  chunks_total: number;
  error_message: string | null;
  current_step: string | null;
}

function stepLabel(step: string, chunksDone: number, chunksTotal: number): string {
  if (step === "extracting") return "Extracting…";
  if (step === "chunking") return "Chunking…";
  if (step.startsWith("rate_limited")) {
    const seconds = parseInt(step.split(":")[1], 10);
    return !isNaN(seconds) && seconds > 0
      ? `API limit reached — retrying in ${seconds}s…`
      : "API limit reached — waiting to retry…";
  }
  if (chunksTotal > 0) return `Embedding ${chunksDone} / ${chunksTotal}`;
  return "Embedding…";
}

interface Props {
  projectId: string;
}

export default function JobTray({ projectId }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const jobs = useJobTrayStore((s) => s.jobs);
  const registerJob = useJobTrayStore((s) => s.registerJob);
  const updateJob = useJobTrayStore((s) => s.updateJob);
  const dismissJob = useJobTrayStore((s) => s.dismissJob);

  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  });

  // Seed from resource list on mount
  useEffect(() => {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/resources`)
      .then((r) => r.json())
      .then((resources: Resource[]) => {
        resources
          .filter(
            (r) =>
              r.indexing_status === "queued" ||
              r.indexing_status === "indexing",
          )
          .forEach((r) => {
            registerJob(
              projectId,
              r.id,
              r.citation_metadata?.title ?? "(untitled)",
            );
          });
      });
  }, [port, projectId]);

  // Poll status for active jobs every 2 seconds
  useEffect(() => {
    if (!port) return;
    const id = setInterval(() => {
      const activeJobs = Object.values(jobsRef.current).filter(
        (j) => j.status === "queued" || j.status === "indexing",
      );
      activeJobs.forEach((job) => {
        fetch(
          `http://127.0.0.1:${port}/projects/${job.projectId}/resources/${job.resourceId}/status`,
        )
          .then((r) => r.json())
          .then((status: StatusResponse) => {
            if (status.indexing_status === "ready") {
              updateJob(job.resourceId, {
                status: "ready",
                chunksDone: status.chunks_done,
                chunksTotal: status.chunks_total,
                completedAt: Date.now(),
                currentStep: null,
              });
              setTimeout(() => dismissJob(job.resourceId), 5000);
            } else if (status.indexing_status === "failed") {
              updateJob(job.resourceId, {
                status: "failed",
                errorMessage: status.error_message,
                currentStep: null,
              });
            } else {
              updateJob(job.resourceId, {
                status: status.indexing_status as "queued" | "indexing",
                chunksDone: status.chunks_done,
                chunksTotal: status.chunks_total,
                currentStep: status.current_step,
              });
            }
          });
      });
    }, 2000);
    return () => clearInterval(id);
  }, [port]);

  // Auto-dismiss completed jobs that were pre-seeded as ready
  useEffect(() => {
    Object.values(jobs)
      .filter((j) => j.status === "ready" && j.completedAt !== null)
      .forEach((j) => {
        const age = Date.now() - j.completedAt!;
        const remaining = Math.max(0, 5000 - age);
        setTimeout(() => dismissJob(j.resourceId), remaining);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Re-run when the set of "ready" job IDs changes
    Object.values(jobs)
      .filter((j) => j.status === "ready")
      .map((j) => j.resourceId)
      .join(","),
  ]);

  const visibleJobs = Object.values(jobs);
  if (visibleJobs.length === 0) return null;

  return (
    <div
      className="border-t bg-muted/30 px-4 py-3 flex flex-col gap-2"
      role="region"
      aria-label="Indexing jobs"
    >
      {visibleJobs.map((job) => (
        <div key={job.resourceId} className="flex items-center gap-3">
          {(job.status === "queued" || job.status === "indexing") && (
            <span
              className="animate-spin inline-block text-sm"
              aria-label="indexing"
            >
              ⟳
            </span>
          )}
          {job.status === "ready" && (
            <span className="text-green-600 text-sm" aria-label="complete">
              ✓
            </span>
          )}
          {job.status === "failed" && (
            <span className="text-red-600 text-sm" aria-label="failed">
              ✗
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{job.title}</p>
            {(job.status === "queued" || job.status === "indexing") &&
              job.currentStep && (
                <p
                  data-testid="step-label"
                  className="text-xs text-muted-foreground"
                >
                  {stepLabel(job.currentStep, job.chunksDone, job.chunksTotal)}
                </p>
              )}
            {(job.status === "queued" || job.status === "indexing") && (
              <progress
                aria-valuenow={job.chunksDone}
                aria-valuemin={0}
                aria-valuemax={job.chunksTotal || 100}
                value={job.chunksDone}
                max={job.chunksTotal || 100}
                className="w-full h-1"
              />
            )}
            {job.status === "failed" && job.errorMessage && (
              <p className="text-xs text-red-600">{job.errorMessage}</p>
            )}
          </div>
          {job.status === "failed" && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => dismissJob(job.resourceId)}
            >
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
