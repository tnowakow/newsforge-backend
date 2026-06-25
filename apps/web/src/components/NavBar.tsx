import { Link, useLocation } from "react-router-dom";

export function NavBar() {
  const loc = useLocation();
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <PorterMark />
          <div className="leading-tight">
            <div className="font-semibold text-porter group-hover:text-porter-600">
              NewsForge
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">
              Porter One Design
            </div>
          </div>
        </Link>
        <nav className="text-sm text-slate-500">
          {loc.pathname !== "/" && (
            <Link to="/" className="hover:text-porter">
              ← Pick a different client
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function PorterMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="2" y="2" width="24" height="24" rx="6" fill="#1B4F8A" />
      <path
        d="M9 19V9h5.4c2.4 0 3.8 1.3 3.8 3.6 0 2.3-1.4 3.6-3.8 3.6H11.5v2.8H9zm2.5-4.9h2.7c1 0 1.6-.5 1.6-1.5s-.6-1.5-1.6-1.5h-2.7v3z"
        fill="#fff"
      />
    </svg>
  );
}
