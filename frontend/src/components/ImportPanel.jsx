import { useState, useEffect, useRef } from "react";
import { CATEGORY_CONFIG, INCOME_TYPES } from "../utils/finance";
import { previewImport, commitImport, aiCleanupNames } from "../api/imports";
import { LOADING_SYMBOLS, IMPORT_LOADING_PHRASES } from "../utils/authFlavor";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, HOME_ACCENT, CATEGORY_ACCENT, DUPLICATE_ALERT } from "./categoryVisuals";

const isDemo = () => localStorage.getItem("demo") === "true";

function formatShortDate(isoDate) {
  if (!isoDate) return "";
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Bank-extracted names often come through as ALL CAPS ("CHECKCARD 0616 GROCERY
// MART..."); read much better title-cased than shouted. Only reshape names
// that are genuinely still shouting, though — the backend already hands back
// deliberately-cased names (merchant aliases like "Walmart"), and blindly
// re-casing those mangles anything after the first character of each word.
function toTitleCase(str) {
  if (!str || str !== str.toUpperCase()) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

let _lid = 0;
const nextId = () => ++_lid;
const toRow = (r) => ({
  _lid: nextId(),
  name: toTitleCase(r.name),
  note: r.note ?? "",
  amount: r.amount ?? "",
  category: r.category ?? "EXPENSE",
  transaction_date: r.transaction_date ?? "",
  is_duplicate: r.is_duplicate,
  duplicate_transaction_id: r.duplicate_transaction_id,
  duplicate_transaction: r.duplicate_transaction,
  is_tip_deposit_candidate: r.is_tip_deposit_candidate,
  is_tip_deposit: r.is_tip_deposit_candidate,
  is_credit_card_payment_candidate: r.is_credit_card_payment_candidate,
  is_split: false,
  splitItems: [],
  errors: r.errors,
  skip: r.is_duplicate,
  is_excluded: false,
});

// Amount is deliberately left blank — the review UI shows the unallocated
// remainder as a placeholder hint instead of pre-filling a real value, so an
// empty row never silently commits with the wrong amount.
const newSplitItem = (seed) => ({
  _sid: nextId(),
  name: seed?.name ?? "",
  amount: "",
  category: seed?.category ?? "EXPENSE",
  transaction_date: seed?.transaction_date ?? "",
});

function isRowValid(r) {
  return !r.is_tip_deposit && !r.is_split && !r.is_excluded && r.name.trim() !== "" && parseFloat(r.amount) > 0 && !!r.transaction_date && !r.skip;
}

function isTipDepositRowValid(r) {
  return r.is_tip_deposit && !r.is_excluded && parseFloat(r.amount) > 0 && !!r.transaction_date && !r.skip;
}

function isSplitItemValid(item) {
  return item.name.trim() !== "" && parseFloat(item.amount) > 0 && !!item.transaction_date;
}

function needsAction(r) {
  // Tips deposit is no longer a manual toggle (auto-detection is trusted
  // outright), so it no longer counts as something the user has to act on.
  return r.is_duplicate || r.is_credit_card_payment_candidate || r.errors?.length > 0;
}

export default function ImportPanel({ active, onSaveStateChange, onSaved, onCancel }) {
  // Shared between desktop (Dashboard.jsx) and mobile (MobileDashboard.jsx) -
  // both are pinned to the same dark HOME_* palette now, so there's no
  // per-caller branching left to do here.
  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;
  const faint  = "rgba(255,255,255,0.04)";
  const colorScheme = "dark";

  const fileInputRef = useRef(null);
  const nameEditRef = useRef({});
  const nameInputRefs = useRef({});
  const [file, setFile] = useState(null);
  const [sourceFormat, setSourceFormat] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [aiCleanupLoading, setAiCleanupLoading] = useState(false);
  const [aiCleanupError, setAiCleanupError] = useState("");
  const [aiCleanupStatus, setAiCleanupStatus] = useState("idle");
  const [aiCleanupSymbolIdx, setAiCleanupSymbolIdx] = useState(0);
  const [renamingLid, setRenamingLid] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showDuplicatesMenu, setShowDuplicatesMenu] = useState(false);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);

  const reset = () => {
    setFile(null); setSourceFormat(null);
    setRows([]); setLoadError(""); setAiCleanupError("");
    setRenamingLid(null); setRenameValue("");
    setShowDuplicatesMenu(false);
  };

  const startRename = (r) => { setRenamingLid(r._lid); setRenameValue(r.name); };
  const cancelRename = () => { setRenamingLid(null); setRenameValue(""); };
  const confirmRename = (r) => {
    const newName = renameValue.trim();
    if (newName) {
      const oldName = r.name;
      setRows(prev => prev.map(x => (x.name === oldName ? { ...x, name: newName } : x)));
    }
    cancelRename();
  };

  const toggleSplit = (r) => {
    setRows(prev => prev.map(x => {
      if (x._lid !== r._lid) return x;
      const nowSplit = !x.is_split;
      const splitItems = nowSplit && x.splitItems.length === 0
        ? [newSplitItem({ transaction_date: x.transaction_date, category: x.category })]
        : x.splitItems;
      return { ...x, is_split: nowSplit, splitItems };
    }));
  };

  const addSplitItem = (r) => {
    setRows(prev => prev.map(x => x._lid === r._lid
      ? { ...x, splitItems: [...x.splitItems, newSplitItem({ transaction_date: x.transaction_date, category: x.category })] }
      : x));
  };

  const updateSplitItem = (r, sid, patch) => {
    setRows(prev => prev.map(x => x._lid !== r._lid ? x : {
      ...x, splitItems: x.splitItems.map(item => item._sid === sid ? { ...item, ...patch } : item),
    }));
  };

  const removeSplitItem = (r, sid) => {
    setRows(prev => prev.map(x => x._lid !== r._lid ? x : { ...x, splitItems: x.splitItems.filter(item => item._sid !== sid) }));
  };

  const runPreview = async (selectedFile) => {
    setLoading(true);
    setLoadError("");
    setLoadingPhraseIdx(Math.floor(Math.random() * IMPORT_LOADING_PHRASES.length));
    try {
      const res = await previewImport(selectedFile);
      const data = res.data;
      setSourceFormat(data.source_format);
      setRows(data.rows.map(toRow));
    } catch {
      setLoadError("Couldn't read that file. Make sure it's a valid CSV or PDF statement.");
    } finally {
      setLoading(false);
    }
  };

  const isPdfFile = (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (isDemo() && isPdfFile(f)) {
      setLoadError("PDF import needs a real account — try a CSV file in demo mode instead.");
      return;
    }
    runPreview(f);
  };

  const handleAiCleanup = async () => {
    if (aiCleanupLoading) return;
    if (isDemo()) {
      setAiCleanupError("AI cleanup needs a real account — not available in demo mode.");
      return;
    }
    const distinctNames = [...new Set(rows.map(r => r.name).filter(Boolean))];
    if (distinctNames.length === 0) return;
    setAiCleanupLoading(true);
    setAiCleanupError("");
    try {
      const res = await aiCleanupNames(distinctNames);
      const suggestions = res.data.suggestions || {};
      setRows(prev => prev.map(r => suggestions[r.name] ? { ...r, name: suggestions[r.name] } : r));
      setAiCleanupStatus("success");
      setTimeout(() => setAiCleanupStatus("idle"), 2200);
    } catch (err) {
      setAiCleanupError(err?.response?.data?.detail || "AI cleanup isn't available right now.");
    } finally {
      setAiCleanupLoading(false);
    }
  };

  const txValidCount = rows.filter(isRowValid).length;
  const depositValidCount = rows.filter(isTipDepositRowValid).length;
  const splitValidCount = rows.filter(r => r.is_split && !r.is_excluded).reduce((sum, r) => sum + r.splitItems.filter(isSplitItemValid).length, 0);
  const validCount = txValidCount + depositValidCount + splitValidCount;
  const isDirty = validCount > 0;
  // Excluded rows are opted out of the import regardless, so they no longer
  // need to surface in the "needs a decision" counts either.
  const duplicateCount = rows.filter(r => r.is_duplicate && !r.is_excluded).length;
  const errorCount = rows.filter(r => r.errors?.length && !r.skip && !r.is_excluded).length;

  const handleSave = async () => {
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    try {
      const commitRows = rows.filter(isRowValid).map(r => ({
        name: r.name.trim(), note: r.note?.trim() || null, amount: parseFloat(r.amount), category: r.category, transaction_date: r.transaction_date, skip: false,
      }));
      const splitCommitRows = rows.filter(r => r.is_split).flatMap(r => r.splitItems.filter(isSplitItemValid).map(item => ({
        name: item.name.trim(), amount: parseFloat(item.amount), category: item.category, transaction_date: item.transaction_date, skip: false,
      })));
      const tipDepositRows = rows.filter(isTipDepositRowValid).map(r => ({
        amount: parseFloat(r.amount), deposit_date: r.transaction_date,
      }));
      const payload = { rows: [...commitRows, ...splitCommitRows], tip_deposit_rows: tipDepositRows };
      const res = await commitImport(payload);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
      reset();
      onSaved?.(res.data.transactions);
    } catch { /* leave rows in place so the user can retry */ }
    finally { setIsSaving(false); }
  };

  useEffect(() => {
    if (!active) return;
    onSaveStateChange?.({ isDirty, isSaving, saveStatus, validCount, onSave: handleSave });
  }, [active, isDirty, isSaving, saveStatus, rows]);

  // Cycle the little symbol while AI cleanup is in flight — same treatment as
  // the auth-page loading spinner (see authFlavor.js), symbol only, no phrase.
  useEffect(() => {
    if (!aiCleanupLoading) return;
    const interval = setInterval(() => setAiCleanupSymbolIdx((i) => (i + 1) % LOADING_SYMBOLS.length), 100);
    return () => clearInterval(interval);
  }, [aiCleanupLoading]);

  if (!file) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, padding: 32, borderTop: `1px solid ${border}` }}>
        <input ref={fileInputRef} type="file" accept=".csv,.pdf" onChange={handleFileChange} style={{ display: "none" }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: "10px 20px", borderRadius: 10, border: `1px dashed ${border}`, background: "transparent", color: text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Choose a CSV or PDF file…
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <p style={{ fontSize: 12, color: muted, margin: 0 }}>Export a statement from your bank as CSV or PDF.</p>
          <p style={{ fontSize: 12, color: muted, margin: 0 }}>CSV — columns are auto-detected.</p>
          <p style={{ fontSize: 12, color: muted, margin: 0 }}>PDF — parsed directly (Bank of America format).</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} style={{ fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Cancel</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", color: text, borderTop: `1px solid ${border}` }}>
      {loading && (
        <div style={{ position: "relative", padding: "36px 20px 44px" }}>
          <style>{`
            @keyframes import-doc-rise {
              0%   { transform: translateY(34px) scale(0.85); opacity: 0; }
              18%  { opacity: 1; }
              62%  { opacity: 1; }
              100% { transform: translateY(-46px) scale(0.55); opacity: 0; }
            }
            @keyframes import-tray-pulse {
              0%, 100% { opacity: 0.8; transform: scale(1); }
              50%      { opacity: 1;   transform: scale(1.08); }
            }
          `}</style>
          {/* Center stage: small "documents" rise up and fade into the
              upload tray on a loop - purely decorative (the real progress
              signal is the phrase in the corner), just something nicer to
              look at than a bare spinner while previewImport is in flight. */}
          <div style={{ position: "relative", height: 108, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ position: "absolute", top: 0, color: HOME_ACCENT, animation: "import-tray-pulse 1.6s ease-in-out infinite" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  position: "absolute", bottom: 0, left: `calc(50% + ${(i - 1) * 22}px - 9px)`,
                  width: 18, height: 24, borderRadius: 3,
                  backgroundColor: `color-mix(in srgb, ${HOME_ACCENT} 25%, transparent)`,
                  border: `1.5px solid ${HOME_ACCENT}`,
                  animation: `import-doc-rise 1.8s ease-in-out ${i * 0.5}s infinite`,
                }}
              />
            ))}
          </div>
          <span style={{ position: "absolute", right: 16, bottom: 10, fontSize: 11, color: muted }}>
            {IMPORT_LOADING_PHRASES[loadingPhraseIdx]}
          </span>
        </div>
      )}

      {!loading && loadError && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 10, padding: 24 }}>
          <p style={{ color: HOME_EXPENSE, fontSize: 13, textAlign: "center", maxWidth: 320 }}>{loadError}</p>
          <button onClick={reset} style={{ fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Choose a different file
          </button>
        </div>
      )}

      {!loading && !loadError && sourceFormat && (
        <>
          {/* File bar */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 10, fontSize: 12, backgroundColor: faint }}>
            <span style={{ color: muted }}>
              {sourceFormat === "pdf"
                ? <>Parsed from <strong style={{ color: text }}>{file.name}</strong> (Bank of America statement format)</>
                : <>Reviewing <strong style={{ color: text }}>{file.name}</strong></>}
            </span>
            <button onClick={reset} style={{ marginLeft: "auto", fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Choose a different file
            </button>
          </div>

          {/* Summary */}
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 12, fontSize: 12, flexWrap: "wrap", position: "relative" }}>
            <span style={{ color: muted }}>{rows.length} rows</span>
            {duplicateCount > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowDuplicatesMenu(v => !v)}
                  aria-label={`${duplicateCount} possible duplicate${duplicateCount !== 1 ? "s" : ""}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                    color: DUPLICATE_ALERT, backgroundColor: `color-mix(in srgb, ${DUPLICATE_ALERT} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${DUPLICATE_ALERT} 40%, transparent)`,
                    borderRadius: 999, padding: "3px 9px", cursor: "pointer",
                  }}
                >
                  ⚠ {duplicateCount}
                </button>
                {showDuplicatesMenu && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 10, width: 300, maxHeight: 340,
                    backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                        {duplicateCount} possible duplicate{duplicateCount !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button" onClick={() => setShowDuplicatesMenu(false)} aria-label="Close"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
                          background: "none", border: "none", color: muted, cursor: "pointer", fontSize: 14, borderRadius: 6,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = text; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 10%, transparent)`; }}
                        onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.backgroundColor = "transparent"; }}
                      >✕</button>
                    </div>
                    <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
                      {rows.filter(r => r.is_duplicate && !r.is_excluded).map((r, i, arr) => (
                        <div key={r._lid} style={{
                          display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, padding: "9px 12px",
                          borderBottom: i < arr.length - 1 ? `1px solid ${border}` : "none",
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: text, fontWeight: 600 }}>{r.name}</span>
                              <span style={{ color: muted, whiteSpace: "nowrap" }}>${r.amount}</span>
                            </div>
                            {r.duplicate_transaction && (
                              <div style={{ fontSize: 10.5, color: muted, marginTop: 2 }}>
                                Matches existing: {r.duplicate_transaction.name} · ${r.duplicate_transaction.amount} · {formatShortDate(r.duplicate_transaction.transaction_date)}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: `1px solid ${border}`, flexShrink: 0, marginTop: 1 }}>
                            <button
                              type="button"
                              onClick={() => setRows(prev => prev.map(x => x._lid === r._lid ? { ...x, skip: true } : x))}
                              style={{
                                fontSize: 10, fontWeight: 600, padding: "3px 8px", cursor: "pointer", border: "none", fontFamily: "inherit",
                                backgroundColor: r.skip ? `color-mix(in srgb, ${DUPLICATE_ALERT} 30%, transparent)` : "transparent",
                                color: r.skip ? text : muted,
                              }}
                            >
                              Skip
                            </button>
                            <button
                              type="button"
                              onClick={() => setRows(prev => prev.map(x => x._lid === r._lid ? { ...x, skip: false } : x))}
                              style={{
                                fontSize: 10, fontWeight: 600, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit",
                                border: "none", borderLeft: `1px solid ${border}`,
                                backgroundColor: !r.skip ? `color-mix(in srgb, ${HOME_INCOME} 25%, transparent)` : "transparent",
                                color: !r.skip ? HOME_INCOME : muted,
                              }}
                            >
                              Keep
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {errorCount > 0 && <span style={{ color: HOME_EXPENSE }}>{errorCount} row{errorCount !== 1 ? "s" : ""} need attention</span>}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              {aiCleanupError && <span style={{ color: HOME_EXPENSE }}>{aiCleanupError}</span>}
              <button
                type="button"
                onClick={handleAiCleanup}
                disabled={aiCleanupLoading}
                title="Sends only the merchant name strings below to an AI model to suggest cleaner names — nothing else, and you can still edit or undo any result before saving."
                style={{
                  fontSize: 12, borderRadius: 999, padding: "3px 10px", cursor: aiCleanupLoading ? "default" : "pointer", minWidth: 44, textAlign: "center",
                  color: aiCleanupStatus === "success" ? HOME_INCOME : muted,
                  border: `1px solid ${aiCleanupStatus === "success" ? `color-mix(in srgb, ${HOME_INCOME} 45%, transparent)` : border}`,
                  background: "none",
                }}
              >
                {aiCleanupLoading
                  ? <span style={{ fontFamily: "monospace" }}>{LOADING_SYMBOLS[aiCleanupSymbolIdx]}</span>
                  : aiCleanupStatus === "success" ? "✓ Cleaned up" : "Clean up with AI"}
              </button>
            </div>
          </div>

          {/* Review cards — rows needing a decision (duplicate, credit card
              payment, tips deposit, errors) surface above a divider first */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => {
            const renderRow = (r) => {
              const catColor = CATEGORY_ACCENT[r.category];
              const hasError = r.errors?.length > 0;
              const update = (patch) => setRows(prev => prev.map(x => x._lid === r._lid ? { ...x, ...patch } : x));
              return (
                <div key={r._lid} style={{
                  position: "relative",
                  borderRadius: 12,
                  border: `1px solid ${border}`,
                  backgroundColor: hasError ? `color-mix(in srgb, ${HOME_EXPENSE} 8%, transparent)` : faint,
                  padding: "9px 12px",
                }}>
                  <div style={{ position: "relative", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      role="img"
                      aria-label={INCOME_TYPES.has(r.category) ? "Income" : "Expense"}
                      title={INCOME_TYPES.has(r.category) ? "Income" : "Expense"}
                      style={{
                        flexShrink: 0, width: 16, height: 16, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
                        fontSize: 11, fontWeight: 700, lineHeight: 1,
                        color: INCOME_TYPES.has(r.category) ? HOME_INCOME : HOME_EXPENSE,
                        backgroundColor: INCOME_TYPES.has(r.category)
                          ? `color-mix(in srgb, ${HOME_INCOME} 18%, transparent)`
                          : `color-mix(in srgb, ${HOME_EXPENSE} 18%, transparent)`,
                      }}
                    >
                      <span style={{ transform: INCOME_TYPES.has(r.category) ? "none" : "translateY(-1px)" }}>
                        {INCOME_TYPES.has(r.category) ? "+" : "−"}
                      </span>
                    </span>
                    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                    <textarea
                      ref={el => { if (el) nameInputRefs.current[r._lid] = el; }}
                      value={r.name}
                      onFocus={() => { nameEditRef.current[r._lid] = r.name; }}
                      onChange={e => update({ name: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          // Apply the edit instead of inserting a newline —
                          // this is a name field, not a paragraph.
                          e.preventDefault();
                          e.target.blur();
                        }
                      }}
                      onBlur={() => {
                        const original = nameEditRef.current[r._lid];
                        delete nameEditRef.current[r._lid];
                        if (original === undefined) return;
                        if (r.name.trim() === "" && original.trim() !== "") {
                          // Cleared by hand and left blank — restore rather
                          // than leaving the row nameless.
                          update({ name: original });
                          return;
                        }
                        if (original !== r.name && original.trim() !== "") {
                          setRows(prev => prev.map(x => (x._lid !== r._lid && x.name === original) ? { ...x, name: r.name } : x));
                        }
                      }}
                      rows={r.name.length > 28 ? 2 : 1}
                      style={{
                        width: "100%", background: "transparent", color: text, border: "none", outline: "none",
                        fontSize: 14, fontWeight: 600, fontFamily: "inherit", resize: "none", overflowWrap: "break-word",
                        padding: 0, paddingRight: 24,
                      }}
                    />
                    {r.name && (
                      <button
                        type="button"
                        onClick={() => startRename(r)}
                        aria-label="Rename all matching rows"
                        title="Rename this and every other row with the same name"
                        style={{
                          position: "absolute", top: 0, right: 0, background: "none", border: "none", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
                          color: muted, fontSize: 13, borderRadius: 6,
                          transition: "color 0.15s ease, background-color 0.15s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = text; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 10%, transparent)`; }}
                        onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        ✎
                      </button>
                    )}
                    </div>
                  </div>
                  {renamingLid === r._lid && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12 }}>
                      <span style={{ color: muted, whiteSpace: "nowrap" }}>
                        Rename all "{r.name}" ({rows.filter(x => x.name === r.name).length} found) to
                      </span>
                      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); confirmRename(r); }
                          if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                        }}
                        placeholder="New name…"
                        style={{ width: "100%", boxSizing: "border-box", fontSize: 12, borderRadius: 6, border: `1px solid ${border}`, backgroundColor: bg, color: text, padding: "3px 22px 3px 6px", outline: "none" }}
                      />
                      {renameValue && (
                        <button
                          type="button"
                          onClick={() => setRenameValue("")}
                          aria-label="Clear"
                          title="Clear to type a new name from scratch"
                          style={{
                            position: "absolute", top: 0, right: 0, background: "none", border: "none", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
                            color: muted, fontSize: 14, borderRadius: 6,
                            transition: "color 0.15s ease, background-color 0.15s ease",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = HOME_EXPENSE; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)`; }}
                          onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          ×
                        </button>
                      )}
                      </div>
                      <button
                        type="button" onClick={() => confirmRename(r)} aria-label="Confirm rename"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
                          fontSize: 14, color: HOME_INCOME, background: "none", border: "none", cursor: "pointer",
                          fontWeight: 700, borderRadius: 6, transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)`; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        ✓
                      </button>
                      <button
                        type="button" onClick={cancelRename} aria-label="Cancel rename"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
                          fontSize: 14, color: muted, background: "none", border: "none", cursor: "pointer",
                          borderRadius: 6, transition: "color 0.15s ease, background-color 0.15s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = text; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 10%, transparent)`; }}
                        onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: 90, flexShrink: 0, borderBottom: `1px solid ${border}`, paddingBottom: 3 }}>
                      <span style={{ fontSize: 12, color: muted }}>$</span>
                      <input type="number" value={r.amount} min="0.01" step="0.01" onChange={e => update({ amount: e.target.value })}
                        style={{ width: "100%", boxSizing: "border-box", background: "transparent", color: text, border: "none", outline: "none", fontSize: 13, fontWeight: 600, fontFamily: "inherit", padding: 0 }} />
                    </div>
                    {r.is_tip_deposit ? (
                      <span style={{ width: 132, boxSizing: "border-box", textAlign: "center", flexShrink: 0, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", backgroundColor: CATEGORY_ACCENT.TIPS }}>
                        Tips Deposit
                      </span>
                    ) : (
                      <select value={r.category} onChange={e => update({ category: e.target.value })}
                        style={{ width: 132, boxSizing: "border-box", flexShrink: 0, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", backgroundColor: catColor, border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit", colorScheme }}>
                        {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => <option key={key} value={key} style={{ backgroundColor: bg, color: text }}>{cfg.label}</option>)}
                      </select>
                    )}
                    <input type="date" value={r.transaction_date} onChange={e => update({ transaction_date: e.target.value })}
                      style={{ width: 132, boxSizing: "border-box", flexShrink: 0, background: "transparent", color: muted, border: "none", borderBottom: `1px solid ${border}`, outline: "none", fontSize: 13, fontFamily: "inherit", padding: "0 0 3px", colorScheme }} />
                    {/* Exclude rides along on the fields row for the common
                        (non-credit-card) case, instead of getting its own
                        footer row - one less row of height on most cards. */}
                    {!r.is_credit_card_payment_candidate && (
                      <label
                        title="Leave this checked to keep this row out of the import — it stays here so you can uncheck it later."
                        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: muted, cursor: "pointer", marginLeft: "auto" }}
                      >
                        <input type="checkbox" checked={r.is_excluded} onChange={e => update({ is_excluded: e.target.checked })} />
                        Exclude
                      </label>
                    )}
                  </div>

                  {/* Split menu — animates open/closed; fixed height with its own
                      scroll so the card doesn't grow unbounded as charges are added. */}
                  {r.is_credit_card_payment_candidate && (
                    <div style={{
                      maxHeight: r.is_split ? 220 : 0,
                      opacity: r.is_split ? 1 : 0,
                      overflow: "hidden",
                      transition: "max-height 0.25s ease, opacity 0.2s ease",
                      marginTop: r.is_split ? 8 : 0,
                    }}>
                      <div style={{
                        display: "flex", flexDirection: "column", height: 220,
                        border: `1px solid ${border}`, borderRadius: 8, padding: 8, backgroundColor: bg,
                      }}>
                        {(() => {
                          const allocated = r.splitItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                          const original = parseFloat(r.amount) || 0;
                          const mismatch = Math.abs(allocated - original) > 0.005;
                          return (
                            <div style={{
                              flexShrink: 0, fontSize: 11, fontWeight: 600, color: mismatch ? HOME_EXPENSE : muted,
                              paddingBottom: 6, borderBottom: `1px solid ${border}`, marginBottom: 6,
                            }}>
                              Allocation: ${allocated.toFixed(2)} / ${original.toFixed(2)}
                            </div>
                          );
                        })()}
                        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                          {r.splitItems.map(item => {
                            const othersTotal = r.splitItems
                              .filter(i => i._sid !== item._sid)
                              .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
                            const remainder = Math.max(0, (parseFloat(r.amount) || 0) - othersTotal);
                            return (
                              <div key={item._sid} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <input
                                  type="text" value={item.name} placeholder="e.g. Gas"
                                  onChange={e => updateSplitItem(r, item._sid, { name: e.target.value })}
                                  style={{ flex: "1 1 120px", minWidth: 0, background: "transparent", color: text, border: `1px solid ${border}`, borderRadius: 6, outline: "none", fontSize: 13, fontFamily: "inherit", padding: "3px 6px" }}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 11, color: muted }}>$</span>
                                  <input
                                    type="number" value={item.amount} min="0.01" step="0.01" placeholder={remainder.toFixed(2)}
                                    onChange={e => updateSplitItem(r, item._sid, { amount: e.target.value })}
                                    style={{ width: 70, background: "transparent", color: text, border: `1px solid ${border}`, borderRadius: 6, outline: "none", fontSize: 13, fontFamily: "inherit", padding: "3px 6px" }}
                                  />
                                </div>
                                <select
                                  value={item.category} onChange={e => updateSplitItem(r, item._sid, { category: e.target.value })}
                                  style={{ padding: "3px 6px", borderRadius: 6, fontSize: 11, border: `1px solid ${border}`, backgroundColor: bg, color: text, outline: "none", cursor: "pointer", fontFamily: "inherit", colorScheme }}
                                >
                                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                                </select>
                                <input
                                  type="date" value={item.transaction_date}
                                  onChange={e => updateSplitItem(r, item._sid, { transaction_date: e.target.value })}
                                  style={{ background: "transparent", color: text, border: `1px solid ${border}`, borderRadius: 6, outline: "none", fontSize: 12, fontFamily: "inherit", padding: "3px 6px", colorScheme }}
                                />
                                <button
                                  type="button" onClick={() => removeSplitItem(r, item._sid)} aria-label="Remove charge"
                                  style={{
                                    display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
                                    background: "none", border: "none", color: muted, cursor: "pointer", fontSize: 15, borderRadius: 6,
                                    transition: "color 0.15s ease, background-color 0.15s ease",
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.color = HOME_EXPENSE; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)`; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.backgroundColor = "transparent"; }}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button" onClick={() => addSplitItem(r)} aria-label="Add charge" title="Add charge"
                          style={{
                            flexShrink: 0, alignSelf: "flex-start", marginTop: 6, width: 24, height: 24,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, lineHeight: 1, color: muted, background: "none",
                            border: `1px dashed ${border}`, borderRadius: 999, cursor: "pointer",
                            transition: "color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = text; e.currentTarget.style.borderColor = text; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 10%, transparent)`; }}
                          onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = border; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {!r.is_duplicate && hasError && (
                    <p style={{ fontSize: 11, color: HOME_EXPENSE, marginTop: 8, marginBottom: 0 }}>{r.errors.join(", ")}</p>
                  )}

                  {r.is_duplicate && r.duplicate_transaction && (
                    <div style={{
                      marginTop: 8, fontSize: 11, color: DUPLICATE_ALERT,
                      backgroundColor: `color-mix(in srgb, ${DUPLICATE_ALERT} 15%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${DUPLICATE_ALERT} 40%, transparent)`,
                      borderRadius: 6, padding: "6px 8px",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                    }}>
                      <span>
                        Matches existing: {r.duplicate_transaction.name} · ${r.duplicate_transaction.amount} · {formatShortDate(r.duplicate_transaction.transaction_date)}
                      </span>
                      <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: `1px solid color-mix(in srgb, ${DUPLICATE_ALERT} 40%, transparent)`, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => update({ skip: true })}
                          style={{
                            fontSize: 10, fontWeight: 600, padding: "3px 9px", cursor: "pointer", border: "none", fontFamily: "inherit",
                            backgroundColor: r.skip ? `color-mix(in srgb, ${DUPLICATE_ALERT} 35%, transparent)` : "transparent",
                            color: r.skip ? text : DUPLICATE_ALERT,
                          }}
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          onClick={() => update({ skip: false })}
                          style={{
                            fontSize: 10, fontWeight: 600, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit",
                            border: "none", borderLeft: `1px solid color-mix(in srgb, ${DUPLICATE_ALERT} 40%, transparent)`,
                            backgroundColor: !r.skip ? `color-mix(in srgb, ${HOME_INCOME} 25%, transparent)` : "transparent",
                            color: !r.skip ? HOME_INCOME : DUPLICATE_ALERT,
                          }}
                        >
                          Keep
                        </button>
                      </div>
                    </div>
                  )}

                  {r.is_credit_card_payment_candidate && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                      <button
                        type="button"
                        onClick={() => toggleSplit(r)}
                        title="Looks like a payment to a credit card — often bundles several purchases into one line."
                        style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "4px 12px", cursor: "pointer",
                          color: CATEGORY_ACCENT.DEBT, fontFamily: "inherit",
                          backgroundColor: r.is_split ? `color-mix(in srgb, ${CATEGORY_ACCENT.DEBT} 25%, transparent)` : "transparent",
                          border: `1px solid color-mix(in srgb, ${CATEGORY_ACCENT.DEBT} 45%, transparent)`,
                        }}
                      >
                        {r.is_split ? "Splitting…" : "Split"}
                      </button>
                      <label
                        title="Leave this checked to keep this row out of the import — it stays here so you can uncheck it later."
                        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: muted, cursor: "pointer" }}
                      >
                        <input type="checkbox" checked={r.is_excluded} onChange={e => update({ is_excluded: e.target.checked })} />
                        Exclude
                      </label>
                    </div>
                  )}
                </div>
              );
            };

            const actionRows = rows.filter(needsAction);
            const regularRows = rows.filter(r => !needsAction(r));

            const divider = (label) => (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0", fontSize: 11, color: muted }}>
                <div style={{ flex: 1, height: 1, backgroundColor: border }} />
                <span>{label}</span>
                <div style={{ flex: 1, height: 1, backgroundColor: border }} />
              </div>
            );

            return (
              <>
                {actionRows.length > 0 && divider("Needs action")}
                {actionRows.map(renderRow)}
                {actionRows.length > 0 && regularRows.length > 0 && divider("No action needed")}
                {regularRows.map(renderRow)}
              </>
            );
          })()}
          </div>
        </>
      )}
    </div>
  );
}
