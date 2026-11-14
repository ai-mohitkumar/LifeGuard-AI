import { useEffect, useState } from "react";
import { CheckCircle2, ThumbsDown, ThumbsUp } from "lucide-react";
import { platformApi } from "../api/client";

export default function FeedbackWidget({
  predictionId,
  labelOptions = ["safe", "suspicious", "scam"],
  placeholderNote = "e.g., legit bank alert or actual quote",
  initialFeedback = null,
  onSubmitted = null,
}) {
  const [status, setStatus] = useState(initialFeedback);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctLabel, setCorrectLabel] = useState(labelOptions[0] || "");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCorrectLabel(labelOptions[0] || "");
  }, [labelOptions.join("|")]);

  async function sendFeedback(isCorrect, chosenLabel = null, note = null) {
    setSaving(true);
    setError("");
    try {
      const updated = await platformApi.submitFeedback(predictionId, {
        is_correct: isCorrect,
        correct_label: chosenLabel,
        comment: note,
      });
      setStatus({
        is_correct: updated.feedback_is_correct,
        correct_label: updated.feedback_label,
      });
      setShowCorrection(false);
      if (onSubmitted) onSubmitted(updated);
    } catch (err) {
      setError(err.message || "Failed to save feedback.");
    } finally {
      setSaving(false);
    }
  }

  if (status) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-medium text-verdict-safe-ink dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4 text-verdict-safe" />
        <span>
          Feedback recorded:{" "}
          {status.is_correct
            ? "Marked as accurate"
            : `Marked incorrect${
                status.correct_label ? ` (actual: ${status.correct_label})` : ""
              }`}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-brand-offwhite p-4 dark:border-slate-700 dark:bg-brand-navy/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
            Did this match real life?
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            One quick tap helps future evaluations spot tricky edge cases.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => sendFeedback(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-verdict-safe-ink hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:bg-brand-surface dark:text-green-300 dark:hover:bg-green-950/40"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Yes, accurate
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setShowCorrection((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-verdict-danger-ink hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-brand-surface dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            No, incorrect
          </button>
        </div>
      </div>

      {showCorrection && (
        <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-700 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Actual Label
            </label>
            <select
              value={correctLabel}
              onChange={(e) => setCorrectLabel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              {labelOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Optional Note
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={placeholderNote}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => sendFeedback(false, correctLabel, comment)}
              className="w-full rounded-xl bg-brand-indigo px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Submit Correction"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-verdict-danger-ink dark:text-red-400">{error}</p>}
    </div>
  );
}
