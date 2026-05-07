import { useState } from "react";
import { Settings } from "lucide-react";
import HomeScreen from "./components/HomeScreen";
import SettingsPage from "./components/SettingsPage";
import { useBackendPort } from "./hooks/useBackendPort";

export default function App() {
  useBackendPort();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
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

      <main className="flex-1 min-h-0 overflow-hidden">
        {showSettings ? (
          <SettingsPage onClose={() => setShowSettings(false)} />
        ) : (
          <HomeScreen />
        )}
      </main>
    </div>
  );
}
