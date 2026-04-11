import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";

function App() {
  const [dark, setDark] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const connRef = ref(db, ".info/connected");
    const unsub = onValue(connRef, (snap) => {
      setConnected(snap.val() === true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light"
    );
  }, [dark]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold text-accent">Yacht Dice</h1>

      <button
        onClick={() => setDark((d) => !d)}
        className="rounded-sm bg-surface px-4 py-2 text-foreground shadow-sm transition hover:bg-surface-hover"
      >
        {dark ? "\u2600 Light Mode" : "\u263E Dark Mode"}
      </button>

      <p className="text-sm text-muted">
        Firebase:{" "}
        {connected === null
          ? "connecting\u2026"
          : connected
            ? "\u2705 connected"
            : "\u274C disconnected"}
      </p>
    </div>
  );
}

export default App;
