import { Routes, Route, Link, useLocation } from "react-router-dom";
import ClientPicker from "./pages/ClientPicker";
import Workspace from "./pages/Workspace";
import Preview from "./pages/Preview";
import Approved from "./pages/Approved";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<ClientPicker />} />
          <Route path="/workspace/:clientId" element={<Workspace />} />
          <Route path="/workspace/:clientId/preview" element={<Preview />} />
          {/* v2 Screen 9 */}
          <Route path="/approved" element={<Approved />} />
          {/* Convenience aliases used in the prompt */}
          <Route path="/client/:clientId" element={<Workspace />} />
          <Route path="/run/:runId/preview" element={<Preview />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <AppFooter />
    </div>
  );
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
        {/* PorterMark SVG (restored from v1) */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className="group-hover:opacity-90 transition-opacity"
        >
          <rect x="2" y="2" width="24" height="24" rx="6" fill="#1B4F8A" />
          <path
            d="M9 19V9h5.4c2.4 0 3.8 1.3 3.8 3.6 0 2.3-1.4 3.6-3.8 3.6H11.5v2.8H9zm2.5-4.9h2.7c1 0 1.6-.5 1.6-1.5s-.6-1.5-1.6-1.5h-2.7v3z"
            fill="#fff"
          />
        </svg>
        <span className="font-display font-semibold tracking-tight text-base text-porter group-hover:text-porter-600 transition-colors">
          NewsForge
        </span>
        <span className="hidden md:inline text-2xs uppercase tracking-widest text-ink-muted ml-3 pl-3 border-l border-rule">
          Porter <span className="text-porter">One</span> Design
        </span>
      </Link>
      <div className="flex items-center gap-2 text-ink-muted">
        {/* v2 Screen 9 nav — hidden on /preview per v1 fullscreen pattern */}
        {!hideOnFullscreen && (
          <Link
            to="/approved"
            className={`h-8 px-3 rounded-md text-sm hover:text-porter hover:bg-porter-50 transition-colors grid place-items-center ${
              loc.pathname === "/approved" ? "text-porter font-medium" : ""
            }`}
          >
            Approved
          </Link>
        )}
        <button
          className="h-8 w-8 rounded-md hover:bg-porter-50 hover:text-porter transition-colors grid place-items-center"
          aria-label="Help"
          title="Help"
        >
          ?
        </button>
        <button
          className="h-8 w-8 rounded-md hover:bg-porter-50 hover:text-porter transition-colors grid place-items-center"
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
      <span className="opacity-70">Gemini 2.5 Flash · React · Vite</span>
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
