import { useState, useEffect, useRef } from "react";
import SwipeableRow from "./SwipeableRow";
import CurrencyInput from "../shared/CurrencyInput";
import Skel from "../shared/Skel";
import ListRowSkeleton from "../skeletons/shared/ListRowSkeleton";
import { CATEGORY_CONFIG, fmt } from "../../utils/finance";
import {
  getRecurringPayments,
  createRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
} from "../../api/recurringPayments";
import { useSheetDrag, SHEET_EASE } from "../../hooks/useSheetDrag";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_EXPENSE, HOME_INCOME, HOME_ACCENT, TILE_COLOR, CATEGORY_ICON } from "../shared/categoryVisuals";

const EMPTY_DRAFT = { name: "", amount: "", day_of_month: "", category: "SUBSCRIPTION", is_estimate: false };

const EXIT_MS = 260;

function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${n}${suffix}`;
}

function isDraftValid(d) {
  return d.name.trim() !== "" &&
    parseFloat(d.amount) > 0 &&
    (d.is_estimate || (parseInt(d.day_of_month, 10) >= 1 && parseInt(d.day_of_month, 10) <= 31));
}


const fieldStyle = {
  width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 15,
  border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "rgba(255,255,255,0.04)", color: HOME_TEXT,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
};
const labelStyle = { fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 };

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: HOME_MUTED, margin: "0 4px 8px" }}>
      {children}
    </p>
  );
}

function CategoryToggle({ category, onToggle }) {
  const color = TILE_COLOR[category];
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        alignSelf: "flex-start", padding: "5px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
        color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, border: "none", cursor: "pointer",
      }}
    >
      {CATEGORY_CONFIG[category]?.label ?? category}
    </button>
  );
}

function EstimateToggle({ active, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Estimate (no fixed due date)"
      style={{
        flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "8px 12px", borderRadius: 10,
        border: `1px solid ${active ? HOME_INCOME : HOME_DIVIDER}`,
        color: active ? HOME_INCOME : HOME_MUTED,
        backgroundColor: active ? `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)` : "transparent",
        cursor: "pointer",
      }}
    >
      ~ Estimate
    </button>
  );
}

function EditSheet({ draft, setDraft, mode, saving, error, onCancel, onSave, onDelete, deleteConfirm }) {
  const valid = isDraftValid(draft);

  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onCancel, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onCancel]);
  const { dragY, dragging, handlers } = useSheetDrag(requestClose);

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={requestClose}
      />
      <style>{`@keyframes recurring-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
          backgroundColor: HOME_SURFACE, borderRadius: "20px 20px 0 0",
          padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
          display: "flex", flexDirection: "column", gap: 12,
          transform: closing ? "translateY(100%)" : dragging ? `translateY(${dragY}px)` : undefined,
          animation: dragging || closing ? undefined : "recurring-sheet-up 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
          transition: dragging ? "none" : `transform ${EXIT_MS}ms ${SHEET_EASE}`,
        }}
      >
        <div {...handlers} style={{ touchAction: "none" }}>
          <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: HOME_DIVIDER, margin: "2px auto 4px", cursor: "grab" }} />
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HOME_TEXT }}>
            {mode === "add" ? "New Recurring Payment" : "Edit Recurring Payment"}
          </p>
        </div>

        <div>
          <p style={labelStyle}>Name</p>
          <input
            autoFocus={mode === "add"}
            type="text"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Netflix"
            style={fieldStyle}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={labelStyle}>Amount</p>
            <CurrencyInput
              value={draft.amount}
              onChange={v => setDraft(d => ({ ...d, amount: v }))}
              placeholder="0.00"
              style={fieldStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <p style={labelStyle}>Recurs on</p>
            <input
              type="number" min="1" max="31"
              value={draft.day_of_month}
              onChange={e => setDraft(d => ({ ...d, day_of_month: e.target.value }))}
              placeholder={draft.is_estimate ? "optional" : "1–31"}
              disabled={draft.is_estimate}
              style={{ ...fieldStyle, opacity: draft.is_estimate ? 0.4 : 1 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CategoryToggle
            category={draft.category}
            onToggle={() => setDraft(d => ({ ...d, category: d.category === "SUBSCRIPTION" ? "BILL" : "SUBSCRIPTION" }))}
          />
          <EstimateToggle
            active={draft.is_estimate}
            onToggle={() => setDraft(d => ({ ...d, is_estimate: !d.is_estimate }))}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={requestClose}
            style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1px solid ${HOME_DIVIDER}`, background: "transparent", color: HOME_MUTED, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >Cancel</button>
          <button type="button" onClick={onSave} disabled={!valid || saving}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 12, border: `1px solid ${HOME_INCOME}`,
              backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)`, color: HOME_INCOME,
              fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: valid && !saving ? 1 : 0.5,
            }}
          >{saving ? "Saving…" : mode === "add" ? "Add" : "Save"}</button>
        </div>

        {mode === "edit" && (
          <button type="button" onClick={onDelete}
            style={{
              padding: "9px 0", borderRadius: 12, border: "none", background: "transparent",
              color: HOME_EXPENSE, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >{deleteConfirm ? "Tap again to confirm delete" : "Delete"}</button>
        )}
      </div>
    </>
  );
}

export default function MobileRecurring({ onSaved, openAddSignal }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [openId, setOpenId] = useState(null);
  const [listError, setListError] = useState("");

  const [sheet, setSheet] = useState(null); // null | { mode: "add" | "edit", id?, draft }
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const prevSignal = useRef(openAddSignal);

  useEffect(() => {
    getRecurringPayments()
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Parent's "+" button in the overlay header bumps this counter to request the add sheet.
  useEffect(() => {
    if (openAddSignal !== prevSignal.current) {
      prevSignal.current = openAddSignal;
      openAdd();
    }
  }, [openAddSignal]);

  function openAdd() {
    setSheet({ mode: "add", draft: { ...EMPTY_DRAFT } });
    setSheetError("");
    setDeleteConfirm(false);
  }

  function openEdit(row) {
    setSheet({
      mode: "edit",
      id: row.id,
      draft: {
        name: row.name,
        amount: String(row.amount),
        day_of_month: row.day_of_month != null ? String(row.day_of_month) : "",
        category: row.category,
        is_estimate: row.is_estimate,
      },
    });
    setSheetError("");
    setDeleteConfirm(false);
  }

  function closeSheet() {
    setSheet(null);
    setSheetError("");
    setDeleteConfirm(false);
  }

  function setDraft(fn) {
    setSheet(s => s ? { ...s, draft: fn(s.draft) } : s);
  }

  async function handleSheetSave() {
    if (!sheet || !isDraftValid(sheet.draft) || saving) return;
    setSaving(true);
    setSheetError("");
    const d = sheet.draft;
    const payload = {
      name: d.name.trim(),
      amount: parseFloat(d.amount),
      day_of_month: d.is_estimate && d.day_of_month === "" ? null : parseInt(d.day_of_month, 10),
      category: d.category,
      is_estimate: d.is_estimate,
    };
    try {
      if (sheet.mode === "add") {
        const res = await createRecurringPayment(payload);
        setRows(prev => [...prev, res.data]);
      } else {
        const res = await updateRecurringPayment(sheet.id, payload);
        setRows(prev => prev.map(r => r.id === sheet.id ? res.data : r));
      }
      onSaved?.();
      closeSheet();
    } catch (err) {
      setSheetError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function handleSheetDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    const id = sheet.id;
    closeSheet();
    handleDelete(id);
  }

  async function handleDelete(id) {
    setDeletingIds(s => new Set(s).add(id));
    try {
      await deleteRecurringPayment(id);
      setRows(prev => prev.filter(r => r.id !== id));
      onSaved?.();
    } catch {
      setListError("Failed to delete — try again");
      setTimeout(() => setListError(""), 3000);
    } finally {
      setDeletingIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 16px 32px", color: HOME_TEXT }}>
      {openId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onTouchStart={() => setOpenId(null)} onClick={() => setOpenId(null)} />
      )}

      {listError && (
        <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: "0 4px 10px" }}>{listError}</p>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[0, 1].map((group) => (
            <div key={group} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Skel w={70} h={11} style={{ marginLeft: 4 }} />
              <div style={{ backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" }}>
                <ListRowSkeleton count={group === 0 ? 3 : 2} trailing opacityFade />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 16px", borderRadius: 16, border: `1px dashed ${HOME_DIVIDER}` }}>
          <p style={{ fontSize: 13, color: HOME_MUTED, margin: "0 0 10px" }}>No recurring payments yet</p>
          <button
            onClick={openAdd}
            style={{
              fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 10,
              border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME,
              backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)`,
              cursor: "pointer",
            }}
          >
            Add a Recurring Payment
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {["BILL", "SUBSCRIPTION"].map((cat) => {
            const catRows = rows.filter((r) => r.category === cat);
            if (catRows.length === 0) return null;
            const Icon = CATEGORY_ICON[cat] ?? CATEGORY_ICON.SUBSCRIPTION;
            const tileColor = TILE_COLOR[cat] ?? HOME_MUTED;
            return (
              <div key={cat}>
                <SectionLabel>{CATEGORY_CONFIG[cat]?.label ?? cat}</SectionLabel>
                <div style={{ backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" }}>
                  {catRows.map((row, i) => {
                    const isDeleting = deletingIds.has(row.id);
                    return (
                      <div key={row.id} style={{ opacity: isDeleting ? 0.35 : 1, transition: "opacity 0.2s ease", pointerEvents: isDeleting ? "none" : "auto" }}>
                        <SwipeableRow
                          id={row.id}
                          openId={openId}
                          setOpenId={setOpenId}
                          onEdit={() => openEdit(row)}
                          onDelete={() => handleDelete(row.id)}
                          border={i === 0 ? "transparent" : HOME_DIVIDER}
                          surface={HOME_SURFACE}
                          text={HOME_TEXT}
                          editBg={HOME_ACCENT}
                          editColor="#fff"
                          deleteBg={HOME_EXPENSE}
                          deleteColor="#fff"
                        >
                          <div
                            onClick={() => openEdit(row)}
                            style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, padding: "9px 14px", minHeight: 60, backgroundColor: HOME_SURFACE, cursor: "pointer" }}
                          >
                            <div style={{
                              flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: tileColor,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                            }}>
                              <Icon />
                            </div>
                            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {row.name}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
                                {row.day_of_month != null ? `Every ${ordinal(row.day_of_month)}` : "Estimate"}
                              </span>
                            </div>
                            <span style={{
                              flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px",
                              fontVariantNumeric: "tabular-nums", color: row.is_estimate ? HOME_MUTED : HOME_TEXT,
                            }}>
                              {row.is_estimate ? "~" : ""}{fmt(row.amount)}
                            </span>
                          </div>
                        </SwipeableRow>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sheet && (
        <EditSheet
          mode={sheet.mode}
          draft={sheet.draft}
          setDraft={setDraft}
          saving={saving}
          error={sheetError}
          onCancel={closeSheet}
          onSave={handleSheetSave}
          onDelete={handleSheetDelete}
          deleteConfirm={deleteConfirm}
        />
      )}
    </div>
  );
}
