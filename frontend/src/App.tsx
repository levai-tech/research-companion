import { useState } from "react";
import { Settings } from "lucide-react";
import HealthCheck from "./components/HealthCheck";
import SettingsPage from "./components/SettingsPage";
import { Button } from "@/components/ui/button";
import { useBackendPort } from "./hooks/useBackendPort";

export default function App() {
  useBackendPort();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold text-sm">Research Companion</span>
        <button
          aria-label="Settings"
          onClick={() => setShowSettings((s) => !s)}
          className="rounded-md p-1.5 hover:bg-muted transition-colors"
        >
          <Settings className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1">
        {showSettings ? (
          <SettingsPage onClose={() => setShowSettings(false)} />
        ) : (
          <div className="p-8 space-y-4">
            <HealthCheck />
            <Button variant="outline">Open Project</Button>
          </div>
        )}
      </main>
    </div>
  );
}
