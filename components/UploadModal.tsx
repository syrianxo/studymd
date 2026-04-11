'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { estimateCost } from '@/lib/api-limits';

// ─── Types ─────────────────────────────────────────────────────────────────
type UploadStage = 'idle' | 'uploading' | 'converting' | 'generating' | 'complete' | 'error';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void; // triggers lecture grid refresh
  authToken: string;
}

const COURSES = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
] as const;

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const POLL_INTERVAL_MS = 5000;

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  uploading: 'Uploading file...',
  converting: 'Converting slides...',
  generating: 'Generating content...',
  complete: 'Complete!',
  error: 'Error',
};

const STAGE_PROGRESS: Record<UploadStage, number> = {
  idle: 0,
  uploading: 20,
  converting: 50,
  generating: 80,
  complete: 100,
  error: 0,
};

// ─── Component ─────────────────────────────────────────────────────────────
export default function UploadModal({ isOpen, onClose, onComplete, authToken }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [course, setCourse] = useState<string>('');
  const [titleOverride, setTitleOverride] = useState('');
  const [stage, setStage] = useState<UploadStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [tokenWarning, setTokenWarning] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const estimatedCost = selectedFile ? estimateCost(selectedFile.size) : 0;
  const isProcessing = stage !== 'idle' && stage !== 'complete' && stage !== 'error';
  const canSubmit = selectedFile && course && !isProcessing && !fileError;

  // ─── Cleanup polling on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Reset on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setCourse('');
      setTitleOverride('');
      setStage('idle');
      setErrorMessage('');
      setTokenWarning('');
      setFileError('');
      setJobId(null);
      setProgress(0);
    }
  }, [isOpen]);

  // ─── File Validation ─────────────────────────────────────────────────
  const validateFile = (file: File): string => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'pptx', 'ppt'].includes(ext ?? '')) {
      return 'Only PDF and PPTX files are accepted.';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max size is ${MAX_FILE_SIZE_MB} MB.`;
    }
    return '';
  };

  const handleFileSelect = (file: File) => {
    const err = validateFile(file);
    setFileError(err);
    setSelectedFile(err ? null : file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  // ─── Status Polling ──────────────────────────────────────────────────
  const startPolling = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload/status?jobId=${id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? 'Status check failed.');
        }

        // Map server status → local stage
        const serverStage = data.status as UploadStage;
        setStage(serverStage);
        if (data.progress !== undefined) {
          setProgress(data.progress);
        } else {
          setProgress(STAGE_PROGRESS[serverStage] ?? 0);
        }

        if (serverStage === 'complete') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setTimeout(() => {
            onComplete();
            onClose();
          }, 1200);
        }

        if (serverStage === 'error') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setErrorMessage(data.error ?? 'Processing failed. Please try again.');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, POLL_INTERVAL_MS);
  };

  // ─── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedFile || !course) return;

    setStage('uploading');
    setProgress(5);
    setErrorMessage('');
    setTokenWarning('');

    try {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('course', course);
      if (titleOverride.trim()) form.append('title', titleOverride.trim());

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setStage('error');
        setErrorMessage(data.error ?? 'Upload failed.');
        return;
      }

      if (data.tokenWarning) setTokenWarning(data.tokenWarning);

      setJobId(data.jobId);
      setStage('converting');
      setProgress(STAGE_PROGRESS.converting);
      startPolling(data.jobId);
    } catch {
      setStage('error');
      setErrorMessage('Network error. Please check your connection and try again.');
    }
  };

  if (!isOpen) return null;

  // ─── Derived UI state ────────────────────────────────────────────────
  const progressPercent = stage === 'complete' ? 100 : progress || STAGE_PROGRESS[stage];

  const stageSteps: { key: UploadStage; label: string }[] = [
    { key: 'uploading', label: 'Upload' },
    { key: 'converting', label: 'Convert' },
    { key: 'generating', label: 'Generate' },
    { key: 'complete', label: 'Done' },
  ];

  const stageOrder: UploadStage[] = ['uploading', 'converting', 'generating', 'complete'];
  const currentStageIndex = stageOrder.indexOf(stage);

  return (
    <div className="upload-modal-overlay" onClick={(e) => e.target === e.currentTarget && !isProcessing && onClose()}>
      <div className="upload-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h2>Upload Lecture</h2>
          </div>
          {!isProcessing && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Processing View */}
        {isProcessing || stage === 'complete' || stage === 'error' ? (
          <div className="processing-view">
            {stage !== 'error' ? (
              <>
                {/* Step indicators */}
                <div className="stage-steps">
                  {stageSteps.map((step, idx) => {
                    const isDone = currentStageIndex > idx || stage === 'complete';
                    const isActive = stageOrder[currentStageIndex] === step.key;
                    return (
                      <div key={step.key} className={`stage-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
                        <div className="step-dot">
                          {isDone ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : isActive ? (
                            <div className="step-spinner" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>
                        <span className="step-label">{step.label}</span>
                        {idx < stageSteps.length - 1 && <div className={`step-line ${isDone ? 'done' : ''}`} />}
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
                </div>

                <p className="stage-label">{STAGE_LABELS[stage]}</p>

                {tokenWarning && (
                  <div className="token-warning">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {tokenWarning}
                  </div>
                )}

                {stage === 'complete' && (
                  <p className="complete-msg">Lecture processed successfully. Closing...</p>
                )}
              </>
            ) : (
              <div className="error-view">
                <div className="error-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <h3>Upload Failed</h3>
                <p>{errorMessage}</p>
                <button className="btn-secondary" onClick={() => { setStage('idle'); setProgress(0); }}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Upload Form */
          <div className="upload-form">
            {/* Drop zone */}
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''} ${fileError ? 'has-error' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.pptx,.ppt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />

              {selectedFile ? (
                <div className="file-selected">
                  <div className="file-icon">
                    {selectedFile.name.endsWith('.pdf') ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <path d="M8 21h8M12 17v4" />
                      </svg>
                    )}
                  </div>
                  <div className="file-info">
                    <span className="file-name">{selectedFile.name}</span>
                    <span className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <button
                    className="file-remove"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setFileError(''); }}
                    aria-label="Remove file"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="drop-content">
                  <div className="drop-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="drop-primary">Drop your file here, or <span>browse</span></p>
                  <p className="drop-secondary">PDF or PPTX &mdash; max {MAX_FILE_SIZE_MB} MB</p>
                </div>
              )}
            </div>

            {fileError && <p className="field-error">{fileError}</p>}

            {/* Fields */}
            <div className="form-fields">
              <div className="form-group">
                <label htmlFor="course-select">Course <span className="required">*</span></label>
                <div className="select-wrapper">
                  <select
                    id="course-select"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                  >
                    <option value="">Select a course...</option>
                    {COURSES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <svg className="select-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="title-input">
                  Title Override
                  <span className="optional">optional</span>
                </label>
                <input
                  id="title-input"
                  type="text"
                  placeholder={selectedFile ? selectedFile.name.replace(/\.[^.]+$/, '') : 'Lecture title...'}
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>

            {/* Cost estimate */}
            {selectedFile && (
              <div className="cost-estimate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>
                  Estimated processing cost:&nbsp;
                  <strong>~${estimatedCost.toFixed(2)}</strong>
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="submit-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload & Process
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .upload-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(8, 12, 20, 0.72);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
          animation: overlayIn 0.18s ease;
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .upload-modal {
          background: #0f1623;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
          animation: modalIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
          overflow: hidden;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* Header */
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 0;
        }
        .modal-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .modal-icon {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }
        .modal-header h2 {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 17px;
          font-weight: 600;
          color: #f0f4ff;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .modal-close {
          background: rgba(255,255,255,0.06);
          border: none;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .modal-close:hover { background: rgba(255,255,255,0.1); color: #f0f4ff; }

        /* Form */
        .upload-form { padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 16px; }

        /* Drop zone */
        .drop-zone {
          border: 1.5px dashed rgba(255,255,255,0.14);
          border-radius: 12px;
          padding: 28px 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          background: rgba(255,255,255,0.02);
        }
        .drop-zone:hover, .drop-zone.drag-over {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.06);
        }
        .drop-zone.has-file {
          border-style: solid;
          border-color: rgba(255,255,255,0.12);
          padding: 14px 16px;
          cursor: default;
        }
        .drop-zone.has-error { border-color: #ef4444; background: rgba(239,68,68,0.04); }

        .drop-icon { color: #475569; margin-bottom: 10px; }
        .drop-primary { font-size: 14px; color: #94a3b8; margin: 0 0 4px; font-family: 'DM Sans', system-ui, sans-serif; }
        .drop-primary span { color: #3b82f6; font-weight: 500; }
        .drop-secondary { font-size: 12px; color: #475569; margin: 0; font-family: 'DM Sans', system-ui, sans-serif; }

        .file-selected {
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
        }
        .file-icon { color: #3b82f6; flex-shrink: 0; }
        .file-info { flex: 1; min-width: 0; }
        .file-name {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .file-size { display: block; font-size: 12px; color: #64748b; font-family: 'DM Sans', system-ui, sans-serif; }
        .file-remove {
          background: rgba(255,255,255,0.06);
          border: none;
          border-radius: 6px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s;
        }
        .file-remove:hover { background: rgba(239,68,68,0.2); color: #ef4444; }

        .field-error { font-size: 12px; color: #ef4444; margin: -8px 0 0; font-family: 'DM Sans', system-ui, sans-serif; }

        /* Form fields */
        .form-fields { display: flex; flex-direction: column; gap: 12px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-family: 'DM Sans', system-ui, sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .required { color: #ef4444; }
        .optional { font-size: 10px; color: #475569; font-weight: 400; text-transform: none; letter-spacing: 0; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px; }

        .select-wrapper { position: relative; }
        .select-wrapper select {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 10px 36px 10px 12px;
          color: #e2e8f0;
          font-size: 14px;
          font-family: 'DM Sans', system-ui, sans-serif;
          cursor: pointer;
          transition: border-color 0.15s;
          outline: none;
        }
        .select-wrapper select:focus { border-color: #3b82f6; background: rgba(59,130,246,0.05); }
        .select-wrapper select option { background: #1e293b; color: #e2e8f0; }
        .select-arrow { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #64748b; pointer-events: none; }

        .form-group input[type="text"] {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 10px 12px;
          color: #e2e8f0;
          font-size: 14px;
          font-family: 'DM Sans', system-ui, sans-serif;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          box-sizing: border-box;
        }
        .form-group input[type="text"]::placeholder { color: #475569; }
        .form-group input[type="text"]:focus { border-color: #3b82f6; background: rgba(59,130,246,0.05); }

        /* Cost estimate */
        .cost-estimate {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #64748b;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .cost-estimate strong { color: #34d399; }

        /* Errors */
        .submit-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13px;
          color: #fca5a5;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: 'DM Sans', system-ui, sans-serif;
          line-height: 1.4;
        }
        .submit-error svg { flex-shrink: 0; margin-top: 1px; }

        /* Actions */
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .btn-secondary {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 9px 16px;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', system-ui, sans-serif;
          transition: background 0.15s, color 0.15s;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

        .btn-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
          border: none;
          border-radius: 8px;
          padding: 9px 18px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'DM Sans', system-ui, sans-serif;
          display: flex;
          align-items: center;
          gap: 7px;
          transition: opacity 0.15s, transform 0.1s;
          box-shadow: 0 4px 16px rgba(59,130,246,0.3);
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Processing view */
        .processing-view {
          padding: 28px 24px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        /* Stage steps */
        .stage-steps {
          display: flex;
          align-items: center;
          gap: 0;
          width: 100%;
          justify-content: center;
        }
        .stage-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          position: relative;
        }
        .step-dot {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 2px solid rgba(255,255,255,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #64748b;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-weight: 600;
          transition: all 0.3s;
          position: relative;
          z-index: 1;
        }
        .stage-step.done .step-dot {
          background: linear-gradient(135deg, #10b981, #059669);
          border-color: transparent;
          color: white;
        }
        .stage-step.active .step-dot {
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          border-color: transparent;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.2);
        }
        .step-line {
          position: absolute;
          top: 16px;
          left: calc(100% + 2px);
          width: 48px;
          height: 2px;
          background: rgba(255,255,255,0.08);
          transition: background 0.3s;
        }
        .step-line.done { background: #059669; }
        .step-label {
          font-size: 11px;
          color: #475569;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-weight: 500;
          white-space: nowrap;
        }
        .stage-step.done .step-label, .stage-step.active .step-label { color: #94a3b8; }

        /* Adjust step spacing for line */
        .stage-step:not(:last-child) { margin-right: 52px; }

        .step-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Progress bar */
        .progress-track {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.08);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          border-radius: 4px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .stage-label {
          font-size: 14px;
          color: #94a3b8;
          font-family: 'DM Sans', system-ui, sans-serif;
          margin: 0;
          font-weight: 500;
        }

        .complete-msg {
          font-size: 13px;
          color: #34d399;
          font-family: 'DM Sans', system-ui, sans-serif;
          margin: 0;
        }

        /* Token warning */
        .token-warning {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #fcd34d;
          background: rgba(251, 191, 36, 0.08);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: 'DM Sans', system-ui, sans-serif;
          line-height: 1.5;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
        }
        .token-warning svg { flex-shrink: 0; margin-top: 1px; }

        /* Error view */
        .error-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        .error-icon {
          width: 56px;
          height: 56px;
          background: rgba(239,68,68,0.12);
          border: 2px solid rgba(239,68,68,0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ef4444;
        }
        .error-view h3 {
          font-size: 16px;
          font-weight: 600;
          color: #f1f5f9;
          margin: 0;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .error-view p {
          font-size: 13px;
          color: #94a3b8;
          margin: 0;
          line-height: 1.5;
          max-width: 320px;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
      `}</style>
    </div>
  );
}
