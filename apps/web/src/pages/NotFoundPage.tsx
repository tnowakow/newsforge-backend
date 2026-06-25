import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="px-8 py-20 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">Lost the trail.</h1>
      <p className="mt-2 text-slate-600">
        That page doesn't exist — try starting from the client picker.
      </p>
      <Link to="/" className="btn-primary mt-6 inline-flex">
        ← Back to clients
      </Link>
    </div>
  );
}
