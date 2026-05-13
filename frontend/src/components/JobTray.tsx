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
  batches_total: number;
  batches_fallback: number;
}

function stepLabel(step: string, chunksDone: number, chunksTotal: number): string {
  if (step === "extracting") return "Extracting…";
  if (step.startsWith("chunking")) {
    const match = step.match(/^chunking:(\d+)\/(\d+)$/);
    return match ? `Chunking ${match[1]} / ${match[2]}…` : "Chunking…";
  }
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
    fetch(`http://127.0.0.1:${port}/resources`)
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
          `http://127.0.0.1:${port}/resources/${job.resourceId}/status`,
        )
          .then((r) => r.json())
          .then((status: StatusResponse) => {
            if (status.indexing_status === "ready") {
              const hasFallback =
                status.batches_total > 0 &&
                status.batches_fallback / status.batches_total > 0.25;
              updateJob(job.resourceId, {
                status: "ready",
                chunksDone: status.chunks_done,
                chunksTotal: status.chunks_total,
                completedAt: Date.now(),
                currentStep: null,
                batchesTotal: status.batches_total,
                batchesFallback: status.batches_fallback,
              });
              if (!hasFallback) {
                setTimeout(() => dismissJob(job.resourceId), 5000);
              }
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
                batchesTotal: status.batches_total,
                batchesFallback: status.batches_fallback,
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
      style={{ borderTop: "1px solid var(--border)", background: "var(--surface-sunken)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}
      role="region"
      aria-label="Indexing jobs"
    >
      {visibleJobs.map((job) => (
        <div key={job.resourceId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(job.status === "queued" || job.status === "indexing") && (
            <span className="animate-spin" style={{ fontSize: 14, color: "var(--brand-cyan-500)", lineHeight: 1 }} aria-label="indexing">⟳</span>
          )}
          {job.status === "ready" && (
            <span style={{ fontSize: 13, color: "var(--signal-success)" }} aria-label="complete">✓</span>
          )}
          {job.status === "failed" && (
            <span style={{ fontSize: 13, color: "var(--signal-danger)" }} aria-label="failed">✗</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</p>
            {(job.status === "queued" || job.status === "indexing") && job.currentStep && (
              <p data-testid="step-label" style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--foreground-muted)", margin: "1px 0 0" }}>
                {stepLabel(job.currentStep, job.chunksDone, job.chunksTotal)}
              </p>
            )}
            {(job.status === "queued" || job.status === "indexing") && (
              <progress
                aria-valuenow={job.chunksDone} aria-valuemin={0}
                aria-valuemax={job.chunksTotal || 100}
                value={job.chunksDone} max={job.chunksTotal || 100}
                style={{ width: "100%", height: 2, marginTop: 3 }}
              />
            )}
            {job.status === "failed" && job.errorMessage && (
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--signal-danger)", margin: "1px 0 0" }}>{job.errorMessage}</p>
            )}
            {job.batchesTotal > 0 && job.batchesFallback / job.batchesTotal > 0.25 && (
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--signal-warning)", margin: "1px 0 0" }}>
                {job.batchesFallback} of {job.batchesTotal} batches used recursive fallback
              </p>
            )}
          </div>
          {job.status === "failed" && (
            <button
              style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--foreground-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}
              onClick={() => dismissJob(job.resourceId)}
            >
              Dismiss
            </button>
          )}
          {job.batchesTotal > 0 && job.batchesFallback / job.batchesTotal > 0.25 && (
            <button
              style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--signal-warning)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}
              onClick={() =>
                fetch(`http://127.0.0.1:${port}/resources/${job.resourceId}/reingest`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "recursive" }),
                }).then(() => { updateJob(job.resourceId, { status: "queued", batchesTotal: 0, batchesFallback: 0 }); })
              }
            >
              Re-ingest with recursive chunker
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
