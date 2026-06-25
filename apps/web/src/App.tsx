import { Routes, Route, Navigate } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ClientPickerPage } from "./pages/ClientPickerPage";
import { ClientWorkspacePage } from "./pages/ClientWorkspacePage";
import { PreviewPage } from "./pages/PreviewPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<ClientPickerPage />} />
          <Route
            path="/clients/:clientId"
            element={<ClientWorkspacePage />}
          />
          <Route path="/runs/:runId" element={<PreviewPage />} />
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
