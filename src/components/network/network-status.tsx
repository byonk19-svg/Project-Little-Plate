"use client";

import { useEffect, useState } from "react";

export function NetworkStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const blockOfflineSubmit = (event: SubmitEvent) => {
      if (!navigator.onLine) {
        event.preventDefault();
        setOffline(true);
      }
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("submit", blockOfflineSubmit, true);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("submit", blockOfflineSubmit, true);
    };
  }, []);

  return offline ? (
    <p className="network-status" role="alert">
      You are offline. No change was sent. Reconnect, refresh the current state,
      and try again.
    </p>
  ) : null;
}
