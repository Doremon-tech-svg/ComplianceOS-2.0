import { useState } from "react";
import { apiFetch } from "../services/api";

/**
 * SCOUT hook — talks to the backend SCOUT agent.
 * Uses the authenticated /api/schemes/match endpoint when a token is present,
 * otherwise falls back to the public /api/schemes/evaluate-custom endpoint
 * which accepts a profile payload directly.
 */
export function useSCOUT() {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSchemes = async (profile) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/schemes/evaluate-custom", {
        method: "POST",
        body: JSON.stringify({ profile: profile || {}, limit: 10 }),
      });
      setSchemes(data.topMatches || []);
    } catch (e) {
      setError("Could not load schemes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const applyForScheme = async (schemeName) => {
    try {
      await apiFetch(`/api/schemes/apply/${encodeURIComponent(schemeName)}`, { method: "POST" });
      return true;
    } catch {
      return false;
    }
  };

  return { schemes, loading, error, fetchSchemes, applyForScheme };
}
