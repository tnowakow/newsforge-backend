import { useEffect, useState, type FormEvent } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import ClientPicker from "./pages/ClientPicker";
import Workspace from "./pages/Workspace";
import Preview from "./pages/Preview";
import Approved from "./pages/Approved";
import BusinessCase from "./pages/BusinessCase";
import { api } from "./lib/api";

export default function App() {
  return (
    <SiteGate>
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<ClientPicker />} />
            <Route path="/workspace/:clientId" element={<Workspace />} />
            <Route path="/workspace/:clientId/preview" element={<Preview />} />
            <Route path="/newsletters" element={<Approved />} />
            <Route path="/business-case" element={<BusinessCase />} />
            {/* v2 Screen 9 legacy alias */}
            <Route path="/approved" element={<Approved />} />
            {/* Convenience aliases used in the prompt */}
            <Route path="/client/:clientId" element={<Workspace />} />
            <Route path="/run/:runId/preview" element={<Preview />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <AppFooter />
      </div>
    </SiteGate>
  );
}

/**
 * Site-wide password gate. Same password + same httpOnly cookie as the AI
 * unlock flow (backend: checkAiPassword / hasAiUnlockCookie) — one password
 * unlocks both the site and the AI generation features. Checks status once
 * on load via GET /api/runs/unlock-status (cookie is httpOnly, so the SPA
 * can't read it directly).
 */
function SiteGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .unlockStatus()
      .then((res) => setStatus(res.unlocked ? "unlocked" : "locked"))
      .catch(() => setStatus("locked"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.unlock(password);
      if (res.unlocked) {
        setStatus("unlocked");
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Incorrect password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return <div className="min-h-screen bg-bg" />;
  }

  if (status === "locked") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-rule bg-surface p-8 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-6">
            <span className="h-7 w-7 rounded-md bg-ink text-bg grid place-items-center font-display font-bold text-sm">
              N
            </span>
            <span className="font-display font-semibold tracking-tight text-base">
              NewsForge
            </span>
          </div>
          <label className="block text-sm font-medium mb-2" htmlFor="site-gate-password">
            This demo is password-protected
          </label>
          <input
            id="site-gate-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-rule bg-bg mb-3"
            placeholder="Password"
          />
          {error && (
            <p className="text-sm text-red-600 mb-3" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full h-10 rounded-md bg-accent text-white font-medium disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}

function AppHeader() {
  const loc = useLocation();
  const hideOnFullscreen = loc.pathname.includes("/preview");
  return (
    <header
      className={`h-16 px-10 flex items-center justify-between border-b border-rule bg-surface/90 backdrop-blur sticky top-0 z-30 ${
        hideOnFullscreen ? "" : ""
      }`}
    >
      <Link to="/" className="flex items-center gap-3 group">
        <span className="h-7 w-7 rounded-md bg-ink text-bg grid place-items-center font-display font-bold text-sm">
          N
        </span>
        <span className="font-display font-semibold tracking-tight text-base">
          NewsForge
        </span>
        <span className="hidden md:inline text-2xs uppercase tracking-widest text-ink-muted ml-3 pl-3 border-l border-rule">
          Porter <span className="text-accent">One</span> Design
        </span>
      </Link>
      <div className="flex items-center gap-2 text-ink-muted">
        {/* v2 Screen 9 nav — hidden on /preview per v1 fullscreen pattern */}
        {!hideOnFullscreen && (
          <>
            <Link
              to="/newsletters"
              className={`h-8 px-3 rounded-md text-sm hover:text-ink hover:bg-rule/40 grid place-items-center ${
                loc.pathname === "/newsletters" || loc.pathname === "/approved"
                  ? "text-ink"
                  : ""
              }`}
            >
              Newsletters
            </Link>
            <Link
              to="/business-case"
              className={`h-8 px-3 rounded-md text-sm hover:text-ink hover:bg-rule/40 grid place-items-center ${
                loc.pathname === "/business-case" ? "text-ink" : ""
              }`}
            >
              Business Case
            </Link>
          </>
        )}
        <button
          className="h-8 w-8 rounded-md hover:bg-rule/40 grid place-items-center"
          aria-label="Help"
          title="Help"
        >
          ?
        </button>
        <button
          className="h-8 w-8 rounded-md hover:bg-rule/40 grid place-items-center"
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="px-10 py-4 text-2xs text-ink-muted border-t border-rule flex items-center justify-between">
      <span>NewsForge demo · Built for Porter One Design</span>
      <span className="opacity-70">Gemini + OpenAI backup · React · Vite</span>
    </footer>
  );
}

function NotFound() {
  return (
    <div className="px-10 py-24 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Page not found</h1>
      <p className="text-ink-muted mb-6">
        That route doesn't exist. Head back to pick a client.
      </p>
      <Link
        to="/"
        className="inline-block px-4 h-10 leading-10 rounded-md bg-accent text-white font-medium"
      >
        Back to clients
      </Link>
    </div>
  );
}
