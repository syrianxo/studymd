"use client";

/**
 * UploadModal.tsx
 * Full lecture upload flow for StudyMD v2.
 *
 * State machine:
 *   idle → converting → uploading-slides → generating → done | error
 *
 * The PPTX path short-circuits immediately with a friendly instruction message.
 */

import { useState, useCallback, useRef } from "react";
import {
  convertPdfToSlides,
  uploadSlides,
  isPdf,
  isPptx,
} from "@/lib/slide-converter";
import { createClient } from "@/lib/supabase";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStage =
  | "idle"
  | "converting"
  | "uploading-slides"
  | "generating"
  | "done"
  | "error";

interface UploadState {
  stage: UploadStage;
  /** Progress within the current stage, 0–100 */
  stageProgress: number;
  /** Human-readable progress label */
  progressLabel: string;
  errorMessage: string | null;
  /** The internal ID of the newly created lecture, available in "done" stage */
  createdInternalId: string | null;
}

const INITIAL_STATE: UploadState = {
  stage: "idle",
  stageProgress: 0,
  progressLabel: "",
  errorMessage: null,
  createdInternalId: null,
};

const VALID_COURSES = [
  "Physical Diagnosis I",
  "Anatomy & Physiology",
  "Laboratory Diagnosis",
] as const;

type Course = (typeof VALID_COURSES)[number];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when a lecture is successfully created so the dashboard can refresh. */
  onLectureCreated: (internalId: string) => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  onLectureCreated,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState<Course>("Physical Diagnosis I");
  const [title, setTitle] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>(INITIAL_STATE);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Is the form currently processing?
  const isProcessing = !["idle", "done", "error"].includes(uploadState.stage);

  // ---------------------------------------------------------------------------
  // File selection
  // ---------------------------------------------------------------------------

  const handleFile = useCallback((selected: File) => {
    // Reset state when a new file is chosen.
    setUploadState(INITIAL_STATE);
    setFile(selected);
    // Pre-fill title from filename (strip extension).
    if (!title) {
      setTitle(selected.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    }
  }, [title]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  // ---------------------------------------------------------------------------
  // Upload flow
  // ---------------------------------------------------------------------------
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || isProcessing) return;

    // --- PPTX: not supported, show instruction and bail early ---
    if (isPptx(file)) {
      setUploadState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage:
          "PPTX files can't be converted directly in the browser. " +
          "Please export your presentation as a PDF first:\n\n" +
          "PowerPoint → File → Export → Create PDF/XPS\n" +
          "Keynote → File → Export To → PDF\n" +
          "Google Slides → File → Download → PDF Document",
      });
      return;
    }

    // --- PDF: run the full pipeline ---
    if (!isPdf(file)) {
      setUploadState({
        ...INITIAL_STATE,
        stage: "error",
        errorMessage: "Only PDF files are supported. Please upload a .pdf file.",
      });
      return;
    }

    // Generate a temporary internal ID. The server will confirm/override this.
    const tempId = `lec_${Math.random().toString(16).slice(2, 10)}`;

    try {
      // ── Stage 1: Convert PDF pages to JPEG blobs ─────────────────────────
      setUploadState({
        stage: "converting",
        stageProgress: 0,
        progressLabel: "Converting slides…",
        errorMessage: null,
        createdInternalId: null,
      });

      const blobs = await convertPdfToSlides(file, {
        dpi: 200,
        quality: 0.85,
        onConversionProgress: (current, total) => {
          setUploadState((prev) => ({
            ...prev,
            stageProgress: Math.round((current / total) * 100),
            progressLabel: `Converting slide ${current} of ${total}…`,
          }));
        },
      });

      // ── Stage 2: Upload JPEG blobs to Supabase Storage ───────────────────
      setUploadState({
        stage: "uploading-slides",
        stageProgress: 0,
        progressLabel: `Uploading ${blobs.length} slides…`,
        errorMessage: null,
        createdInternalId: null,
      });

      await uploadSlides(tempId, blobs, supabase, {
        onUploadProgress: (uploaded, total) => {
          setUploadState((prev) => ({
            ...prev,
            stageProgress: Math.round((uploaded / total) * 100),
            progressLabel: `Uploading slide ${uploaded} of ${total}…`,
          }));
        },
      });

      // ── Stage 3: Upload PDF to storage, create job, call generate route ───
      setUploadState({
        stage: "generating",
        stageProgress: 0,
        progressLabel: "Uploading PDF for processing…",
        errorMessage: null,
        createdInternalId: null,
      });

      // Upload the original PDF to Supabase Storage so the server can fetch it.
      // The generate route expects a fileUrl, not the raw file — sending the
      // raw file as FormData caused the 413 Request Entity Too Large error.
      const pdfStoragePath = `uploads/${tempId}/source.pdf`;
      const { error: pdfUploadError } = await supabase.storage
        .from("slides")
        .upload(pdfStoragePath, file, { contentType: "application/pdf", upsert: true });

      if (pdfUploadError) {
        throw new Error(`Failed to upload PDF: ${pdfUploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from("slides")
        .getPublicUrl(pdfStoragePath);

      const fileUrl = urlData.publicUrl;

      // Get the current user ID — required by the generate route.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated. Please log in and try again.");

      // Create a processing_jobs row so the server can track status.
      const { data: jobRow, error: jobError } = await supabase
        .from("processing_jobs")
        .insert({
          internal_id: tempId,
          user_id: user.id,
          status: "pending",
          storage_path: pdfStoragePath,
          original_file: file.name,
          course,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          slide_count: blobs.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("job_id")
        .single();

      if (jobError) throw new Error(`Failed to create processing job: ${jobError.message}`);

      setUploadState((prev) => ({
        ...prev,
        progressLabel: "Generating flashcards and questions with Claude…",
      }));

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.NEXT_PUBLIC_INTERNAL_API_SECRET ?? "",
        },
        body: JSON.stringify({
          fileUrl,
          course,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          internalId: tempId,
          jobId: jobRow.job_id,
          userId: user.id,
          fileSizeBytes: file.size,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Server error ${response.status}: ${response.statusText}`
        );
      }

      const result = await response.json();
      const confirmedId: string = result.internalId ?? tempId;

      // ── Done ─────────────────────────────────────────────────────────────
      setUploadState({
        stage: "done",
        stageProgress: 100,
        progressLabel: "Lecture created!",
        errorMessage: null,
        createdInternalId: confirmedId,
      });

      onLectureCreated(confirmedId);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setUploadState({
        stage: "error",
        stageProgress: 0,
        progressLabel: "",
        errorMessage: message,
        createdInternalId: null,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Close / reset
  // ---------------------------------------------------------------------------

  function handleClose() {
    if (isProcessing) return; // Don't allow close during processing.
    setFile(null);
    setTitle("");
    setCourse("Physical Diagnosis I");
    setUploadState(INITIAL_STATE);
    onClose();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  const isPptxFile = file ? isPptx(file) : false;
  const isPdfFile = file ? isPdf(file) : false;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div>
            <h2
              className="text-xl font-semibold"
              style={{ fontFamily: "Fraunces, serif", color: "var(--text)" }}
            >
              Upload Lecture
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              PDF files are converted to slides automatically
            </p>
          </div>
          {!isProcessing && (
            <button
              onClick={handleClose}
              className="rounded-lg p-2 transition-colors"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* File drop zone */}
          <div
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              isDragging ? "border-accent bg-accent/5" : ""
            }`}
            style={{
              borderColor: isDragging
                ? "var(--accent)"
                : file
                ? isPdfFile
                  ? "var(--success, #10b981)"
                  : "var(--gold, #f0c040)"
                : "rgba(255,255,255,0.12)",
              background: isDragging ? "rgba(91,141,238,0.05)" : "transparent",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx"
              className="hidden"
              onChange={handleInputChange}
              disabled={isProcessing}
            />

            {file ? (
              <div className="space-y-1">
                <div className="text-2xl">{isPdfFile ? "📄" : "📊"}</div>
                <p
                  className="font-medium truncate max-w-xs mx-auto"
                  style={{ color: "var(--text)", fontFamily: "DM Mono, monospace", fontSize: "0.85rem" }}
                >
                  {file.name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB •{" "}
                  {isPdfFile ? "PDF ✓" : "PPTX — see note below"}
                </p>
                {!isProcessing && (
                  <p className="text-xs mt-2" style={{ color: "var(--accent)" }}>
                    Click to change file
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl opacity-40">⬆</div>
                <p className="font-medium" style={{ color: "var(--text)" }}>
                  Drop a PDF or PPTX here
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  or click to browse · max 50 MB
                </p>
              </div>
            )}
          </div>

          {/* PPTX guidance banner */}
          {isPptxFile && uploadState.stage !== "error" && (
            <PptxGuidanceBanner />
          )}

          {/* Course select */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Course
            </label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value as Course)}
              disabled={isProcessing}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: "var(--surface2)",
                color: "var(--text)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {VALID_COURSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Lecture title{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                (optional — defaults to filename)
              </span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Head & Neck Exam"
              disabled={isProcessing}
              maxLength={120}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: "var(--surface2)",
                color: "var(--text)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>

          {/* Progress bar + label */}
          {isProcessing && (
            <ProgressSection
              stage={uploadState.stage}
              progress={uploadState.stageProgress}
              label={uploadState.progressLabel}
            />
          )}

          {/* Success message */}
          {uploadState.stage === "done" && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#10b981",
              }}
            >
              ✓ Lecture created! Closing…
            </div>
          )}

          {/* Error message */}
          {uploadState.stage === "error" && uploadState.errorMessage && (
            <ErrorMessage message={uploadState.errorMessage} />
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors"
              style={{
                background: "var(--surface2)",
                color: "var(--text-muted)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {uploadState.stage === "done" ? "Close" : "Cancel"}
            </button>

            {uploadState.stage !== "done" && (
              <button
                type="submit"
                disabled={!file || isProcessing || isPptxFile}
                className="flex-[2] rounded-xl py-2.5 text-sm font-semibold transition-all"
                style={{
                  background:
                    !file || isProcessing || isPptxFile
                      ? "rgba(91,141,238,0.3)"
                      : "var(--accent, #5b8dee)",
                  color: !file || isProcessing || isPptxFile ? "rgba(255,255,255,0.4)" : "#fff",
                  cursor: !file || isProcessing || isPptxFile ? "not-allowed" : "pointer",
                }}
              >
                {isProcessing ? "Processing…" : "Upload & Generate"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PptxGuidanceBanner() {
  return (
    <div
      className="rounded-xl px-4 py-3 space-y-1"
      style={{
        background: "rgba(240,192,64,0.08)",
        border: "1px solid rgba(240,192,64,0.25)",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "#f0c040" }}>
        📊 PPTX detected — export as PDF first
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(240,192,64,0.8)" }}>
        Browser-based PPTX-to-image conversion is unreliable. Please export
        your slides as a PDF, then upload the PDF here.
      </p>
      <div className="text-xs pt-1 space-y-0.5" style={{ color: "rgba(240,192,64,0.6)", fontFamily: "DM Mono, monospace" }}>
        <div>PowerPoint → File → Export → Create PDF/XPS</div>
        <div>Keynote → File → Export To → PDF</div>
        <div>Google Slides → File → Download → PDF Document</div>
      </div>
    </div>
  );
}

interface ProgressSectionProps {
  stage: UploadStage;
  progress: number;
  label: string;
}

function ProgressSection({ stage, progress, label }: ProgressSectionProps) {
  const stageLabels: Record<string, string> = {
    converting: "1 / 3  Converting",
    "uploading-slides": "2 / 3  Uploading slides",
    generating: "3 / 3  Generating content",
  };

  return (
    <div className="space-y-2">
      {/* Stage chips */}
      <div className="flex gap-2">
        {(["converting", "uploading-slides", "generating"] as const).map((s) => {
          const stageOrder = ["converting", "uploading-slides", "generating"];
          const currentIdx = stageOrder.indexOf(stage);
          const thisIdx = stageOrder.indexOf(s);
          const isActive = s === stage;
          const isDone = thisIdx < currentIdx;

          return (
            <div
              key={s}
              className="flex-1 rounded-full h-1 transition-all duration-500"
              style={{
                background: isDone
                  ? "#10b981"
                  : isActive
                  ? "var(--accent, #5b8dee)"
                  : "rgba(255,255,255,0.1)",
              }}
            />
          );
        })}
      </div>

      {/* Stage label */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {stageLabels[stage] ?? stage}
        </p>
        <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>
          {progress}%
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: "6px", background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            background:
              stage === "generating"
                ? "linear-gradient(90deg, var(--accent, #5b8dee), #8b5cf6)"
                : "var(--accent, #5b8dee)",
          }}
        />
      </div>

      {/* Detail label */}
      <p
        className="text-xs truncate"
        style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}
      >
        {label}
      </p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.25)",
        color: "#f87171",
      }}
    >
      <p className="font-semibold mb-1">Something went wrong</p>
      <pre
        className="whitespace-pre-wrap text-xs leading-relaxed"
        style={{ color: "rgba(248,113,113,0.8)", fontFamily: "DM Mono, monospace" }}
      >
        {message}
      </pre>
    </div>
  );
}
