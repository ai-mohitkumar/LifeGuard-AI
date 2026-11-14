import { Link } from "react-router-dom";
import { ArrowLeft, Wrench } from "lucide-react";

export default function ModulePage({ title, phase, description, plannedPipeline }) {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Overview
      </Link>

      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Wrench className="h-5 w-5" />
        </span>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {phase}
          </span>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">{description}</p>

      {plannedPipeline && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Planned Architecture
          </h2>
          <ul className="mt-2.5 space-y-1.5 text-sm text-slate-700">
            {plannedPipeline.map((step) => (
              <li key={step} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
