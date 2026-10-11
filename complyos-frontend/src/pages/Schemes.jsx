import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, Shield, CheckCircle2, Sparkles, RefreshCw, ExternalLink, X } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Footer } from "../components/layout/Footer";
import SchemeCard from "../components/ui/SchemeCard";
import { Button, Modal } from "../components/ui/Common";
import { apiFetch } from "../services/api";
import { getProfile } from "../utils/profileStore";

const FILTERS = ["All", "Central", "State", "Women", "Loans", "Grants"];
const APPLIED_KEY = "cos_schemes_applied";

// ─── Map frontend profile fields to the SCOUT backend profile shape ──────────
function toScoutProfile(profile) {
  // Parse turnover string (e.g. "₹50 Lakh", "5000000", "2 Cr") into lakhs (number).
  let annualTurnover = null;
  const raw = String(profile.turnover || "").replace(/[₹,\s]/g, "");
  const numMatch = raw.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    let val = parseFloat(numMatch[1]);
    if (/cr/i.test(raw)) val *= 100; // 1 Cr = 100 lakh
    else if (/lakh|lac/i.test(raw)) val *= 1; // already lakhs
    else val = val / 100000; // assume raw rupees
    annualTurnover = val;
  }

  // Map frontend sector/businessType to SCOUT expected business_type values.
  const sector = String(profile.sector || profile.businessType || "").toLowerCase();
  let businessType = sector;
  if (/retail|shop|trading|wholesale|kirana/i.test(sector)) businessType = "trader";
  else if (/manufactur|factory|production/i.test(sector)) businessType = "manufacturer";
  else if (/service|consult|it|tech|salon|repair/i.test(sector)) businessType = "service";

  return {
    businessName: profile.businessName || "",
    businessType,
    state: profile.state || "",
    annualTurnover,
    isWomenLed: !!profile.isWomen,
    udyamNumber: profile.udyam || "",
    gstin: profile.gstin || "",
    pan: profile.pan || "",
  };
}

// ─── Map backend SCOUT response to the scheme-card shape the UI expects ──────
function mapScoutMatch(m) {
  return {
    id: m.schemeId,
    scheme_name: m.name,
    scheme_type: m.schemeType || "Central",
    max_benefit: m.maxBenefit || "",
    eligibility_match_score: Math.round((m.matchScore || 0) * 100),
    why_eligible: m.explanationHindi || m.description || "",
    portal_url: m.officialUrl || m.sourceUrl || "",
    ministry: m.ministry || "Government of India",
    target: "all",
    matchLabel: m.matchLabel,
    missingInfo: m.missingInfo || [],
    isPossible: m.isPossible,
  };
}

export default function SchemesPage() {
  const profile = getProfile();
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [modalScheme, setModalScheme] = useState(null);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [applyScheme, setApplyScheme] = useState(null);
  const [appliedCount, setAppliedCount] = useState(() => {
    try {
      return parseInt(localStorage.getItem(APPLIED_KEY) || "0", 10) || 0;
    } catch {
      return 0;
    }
  });

  async function fetchSchemes() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/schemes/evaluate-custom", {
        method: "POST",
        body: JSON.stringify({ profile: toScoutProfile(profile), limit: 10 }),
      });
      const matches = (data.topMatches || []).map(mapScoutMatch);
      setSchemes(matches);
      setAiLoaded(true);
    } catch {
      setSchemes([]);
      setAiLoaded(false);
    } finally {
      setLoading(false);
    }
  }

  function markApplied() {
    const next = appliedCount + 1;
    setAppliedCount(next);
    try {
      localStorage.setItem(APPLIED_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    fetchSchemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = activeFilter === "All"
    ? schemes
    : schemes.filter((s) => s.scheme_type === activeFilter);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">

        {/* ── AI BANNER ── */}
        {profile.businessName && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-gradient-to-r from-violet-900 to-violet-700 rounded-2xl px-5 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={15} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-violet-200 text-xs font-bold tracking-widest uppercase">SCOUT AI · Official Govt Portals</p>
              <p className="text-white text-sm mt-0.5">
                {aiLoaded
                  ? `${schemes.length} schemes matched to ${profile.businessName} · ${profile.state || "India"} — all linking to official govt portals`
                  : loading
                    ? "Matching schemes to your profile…"
                    : `${schemes.length} government schemes for ${profile.businessName || "your business"}`}
              </p>
            </div>
            <button
              onClick={fetchSchemes}
              disabled={loading}
              className="text-violet-300 hover:text-white disabled:opacity-40"
              title="Re-match schemes"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </motion.div>
        )}

        {/* ── FILTER BAR ── */}
        <div className="bg-white border border-cs-100 rounded-2xl px-5 py-4 flex items-center gap-3 mb-8 flex-wrap">
          {FILTERS.map((f) => (
            <motion.button
              key={f}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${activeFilter === f
                  ? "bg-cs-900 text-cs-50"
                  : "bg-cs-100 text-cs-600 hover:bg-cs-200"
                }`}
            >
              {f}
            </motion.button>
          ))}
          <span className="ml-auto text-cs-400 text-xs">
            {filtered.length} scheme{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

          {/* Status board */}
          <div className="self-start">
            <div className="bg-white border border-cs-100 rounded-2xl p-5">
              <h2 className="font-bold text-cs-900 text-xl mb-4">Status Board</h2>
              {[
                ["ENROLLED", `${(profile.registrations || []).length}`, CheckCircle2],
                ["APPLIED", `${String(appliedCount).padStart(2, "0")}`, Shield],
                ["ELIGIBLE", `${String(schemes.length).padStart(2, "0")}`, Shield],
              ].map(([label, value, Icon]) => (
                <div key={label} className="border border-cs-100 rounded-xl p-4 mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-cs-500 tracking-widest">{label}</p>
                    <p className="text-3xl font-bold text-cs-900 mt-1">{value}</p>
                  </div>
                  <Icon size={20} className="text-cs-400" />
                </div>
              ))}

              {profile.isWomen && (
                <div className="bg-pink-50 border border-pink-100 rounded-xl p-4 mt-2 mb-3">
                  <p className="text-pink-700 text-xs font-bold tracking-widest">WOMEN BENEFITS</p>
                  <p className="text-pink-900 text-sm font-semibold mt-1">
                    {schemes.filter(s => s.scheme_type === "Women").length} women-specific schemes
                  </p>
                  <p className="text-pink-600 text-xs mt-0.5">Mahila Udyam Nidhi &amp; Stand Up India</p>
                </div>
              )}

              <div className="bg-cs-900 rounded-xl p-4 mt-2">
                <p className="text-cs-400 text-xs font-bold tracking-widest">Top Matched Scheme</p>
                <p className="text-cs-50 font-bold text-sm mt-1 leading-tight">
                  {schemes[0]?.scheme_name || "Loading…"}
                </p>
                {schemes[0]?.portal_url && (
                  <a
                    href={schemes[0].portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full flex items-center justify-center gap-1.5 bg-white/10 text-cs-50 hover:bg-white/20 rounded-lg py-2 text-xs font-semibold transition-colors"
                  >
                    Apply on Govt Portal <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Scheme grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white border border-cs-100 rounded-2xl p-5 animate-pulse">
                  <div className="h-4 bg-cs-100 rounded mb-3 w-3/4" />
                  <div className="h-3 bg-cs-100 rounded mb-2 w-1/2" />
                  <div className="h-3 bg-cs-100 rounded mb-4 w-full" />
                  <div className="h-8 bg-cs-100 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-cs-100 rounded-2xl p-10 text-center">
              <p className="text-cs-500 text-sm">
                {aiLoaded
                  ? "No schemes matched your current profile. Update your profile or try again."
                  : "Could not reach the scheme matcher. Make sure the backend is running."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              <AnimatePresence>
                {filtered.map((scheme, idx) => (
                  <motion.div
                    key={scheme.id || scheme.scheme_name}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white border border-cs-100 rounded-2xl p-5 hover:border-cs-300 hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-cs-900 text-sm leading-tight flex-1">
                        {scheme.scheme_name}
                      </h3>
                      <span className="flex-shrink-0 bg-cs-100 text-cs-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {scheme.scheme_type}
                      </span>
                    </div>

                    {/* Ministry */}
                    <p className="text-cs-400 text-xs mb-2">{scheme.ministry}</p>

                    {/* Match score */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-1.5 bg-cs-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cs-700 rounded-full"
                          style={{ width: `${scheme.eligibility_match_score}%` }}
                        />
                      </div>
                      <span className="text-cs-700 text-xs font-bold">{scheme.eligibility_match_score}% match</span>
                    </div>

                    {/* Benefit */}
                    <div className="bg-cs-50 rounded-lg px-3 py-2 mb-3">
                      <p className="text-cs-500 text-xs">Max Benefit</p>
                      <p className="text-cs-900 font-bold text-sm">{scheme.max_benefit}</p>
                    </div>

                    {/* Why eligible */}
                    <p className="text-cs-500 text-xs leading-relaxed mb-4 flex-1">
                      {scheme.why_eligible}
                    </p>

                    {/* Women badge */}
                    {(scheme.scheme_name?.toLowerCase().includes("women") ||
                      scheme.scheme_name?.toLowerCase().includes("mahila") ||
                      scheme.scheme_type === "Women") && (
                        <span className="inline-flex items-center gap-1 text-pink-600 text-xs font-semibold bg-pink-50 border border-pink-100 rounded-full px-2 py-0.5 mb-3 w-fit">
                          Women Specific
                        </span>
                      )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto">
                      <a
                        href={scheme.portal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={markApplied}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-cs-900 text-cs-50 rounded-lg py-2 text-xs font-semibold hover:bg-cs-700 transition-colors"
                      >
                        Apply Now <ExternalLink size={11} />
                      </a>
                      <button
                        onClick={() => { setApplyScheme(scheme); markApplied(); }}
                        className="flex-shrink-0 border border-cs-200 text-cs-700 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-cs-50 transition-colors"
                      >
                        Pre-fill
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* ── Pre-fill Application Modal ── */}
      <Modal
        isOpen={!!applyScheme}
        onClose={() => setApplyScheme(null)}
        title="Pre-filled Application"
      >
        <p className="text-cs-500 text-sm mb-1 font-semibold">{applyScheme?.scheme_name}</p>
        <p className="text-cs-400 text-xs mb-4">{applyScheme?.ministry}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            ["Business Name", profile.businessName || ""],
            ["GSTIN", profile.gstin || ""],
            ["State", profile.state || ""],
            ["Sector", profile.sector || ""],
            ["Turnover", profile.turnover || ""],
            ["Requested Benefit", applyScheme?.max_benefit ?? ""],
          ].map(([lbl, val]) => (
            <label key={lbl} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-cs-600">{lbl}</span>
              <input
                defaultValue={val}
                className="border border-cs-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cs-500"
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-cs-50 rounded-lg p-3 mb-4 text-cs-700 text-sm font-medium">
          <CheckCircle2 size={16} className="text-cs-500" />
          CA verification recommended before final submission.
        </div>

        <div className="flex gap-3">
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => setApplyScheme(null)}
          >
            Send to CA for Verification
          </Button>
          {applyScheme?.portal_url && (
            <a
              href={applyScheme.portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border border-cs-200 text-cs-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-cs-50 transition-colors"
            >
              Official Portal <ExternalLink size={13} />
            </a>
          )}
        </div>
      </Modal>

      <Footer dark />
    </DashboardLayout>
  );
}
