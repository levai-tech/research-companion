import HealthCheck from "./components/HealthCheck";
import { Button } from "@/components/ui/button";
import { useBackendPort } from "./hooks/useBackendPort";

export default function App() {
  useBackendPort();

  return (
    <main className="p-8 space-y-4">
      <HealthCheck />
      <Button variant="outline">Open Project</Button>
    </main>
  );
}
