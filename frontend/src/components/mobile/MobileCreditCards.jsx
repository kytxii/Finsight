import { useEffect, useRef, useState } from "react";
import { getCreditCardPayments, deleteCreditCardPayment, createCreditCardPayment } from "../../api/creditCard";
import CreditCardBalancePage from "../shared/CreditCardBalancePage";
import CreditCardFace from "../shared/CreditCardFace";
import CreditCardSkeleton from "../skeletons/shared/CreditCardSkeleton";
import { fmt } from "../../utils/finance";
import { getToday } from "../../utils/time";
import { assignCardColors } from "../../utils/cardColors";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE } from "../shared/categoryVisuals";

// A balance is just an amount to itemize charges against, not an expense
// event itself - creating one doesn't touch the transactions table (#54
// follow-up). This name is only ever seen if a balance is later re-anchored
// to a real transaction through the older from-transaction flow.
const DEFAULT_PAYMENT_NAME = "Credit Card Payment";

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SHEET_EXIT_MS = 200;

// "+" opens this: just an amount, a date, and (optionally) a due-by date -
// creates the balance directly, no transaction-picking involved. Slides up
// from the bottom on open and back down on close/submit, matching the
// detail page's own bottom-sheet transitions.
function NewBalanceSheet({ onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function requestClose() {
    setClosing(true);
    setTimeout(onClose, SHEET_EXIT_MS);
  }

  function handleCreate() {
    const amt = parseFloat(amount);
    if (!(amt > 0)) return;
    onSubmit({ amount: amt, date: getToday(), dueDate: dueDate || null });
    requestClose();
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={requestClose} />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
          backgroundColor: HOME_SURFACE, borderRadius: "20px 20px 0 0",
          padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
          display: "flex", flexDirection: "column", gap: 12,
          transform: closing || !entered ? "translateY(100%)" : "translateY(0)",
          transition: `transform ${SHEET_EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: HOME_DIVIDER, alignSelf: "center", margin: "2px 0 4px" }} />
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HOME_TEXT }}>New Credit Card Balance</p>
        <CreditCardFace autoFocus amount={amount} onAmountChange={setAmount} dueDate={dueDate} onDueDateChange={setDueDate} />
        <button
          type="button" onClick={handleCreate}
          style={{
            padding: "10px 0", borderRadius: 12, border: "none", backgroundColor: HOME_INCOME, color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >Create</button>
      </div>
    </>
  );
}

export default function MobileCreditCards({ onSaved, openAddSignal, onEditStateChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // undefined = list view, string = viewing an existing balance's whole
  // page (#54). Creating a new balance is the floating sheet below instead.
  const [activePaymentId, setActivePaymentId] = useState(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  // Tapping a still-creating balance doesn't just no-op - it queues that
  // balance to open the instant its real id comes back from the background
  // creation, instead of making the tap feel dead. A plain ref (not state) -
  // no UI depends on this directly, it's only read inside the async
  // creation callback below.
  const pendingOpenIdRef = useRef(null);

  // Edit mode: Edit toggles on a checkbox on every row instead of opening
  // its detail page, so one or more balances can be picked and removed
  // together. The toggle itself lives in the header (MobileDashboard.jsx),
  // matching desktop - reported up via onEditStateChange below instead of
  // rendered here.
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  function load() {
    setLoading(true);
    setLoadFailed(false);
    getCreditCardPayments()
      .then((res) => setRows(res.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const prevAddSignal = useRef(openAddSignal);
  useEffect(() => {
    if (openAddSignal !== prevAddSignal.current) {
      prevAddSignal.current = openAddSignal;
      setPickerOpen(true);
    }
  }, [openAddSignal]);

  function toggleEdit() {
    setEditMode((e) => !e);
    setSelectedIds(new Set());
    setActionError("");
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // The header's hold-to-delete button (MobileDashboard.jsx) is itself the
  // confirmation, so this just executes - no arm-then-confirm step here.
  useEffect(() => {
    if (activePaymentId !== undefined) return;
    onEditStateChange?.({
      editMode,
      hasRows: rows.length > 0,
      toggleEdit,
      hasSelection: selectedIds.size > 0,
      selectionCount: selectedIds.size,
      deleteSelected: handleBulkDelete,
    });
  }, [editMode, rows.length, activePaymentId, selectedIds]);

  // Balance appears in the list the instant Create is tapped; the actual
  // creation happens after, in the background. On failure the placeholder is
  // pulled back out and the error surfaces in the list banner.
  function handleCreateSubmit({ amount, date, dueDate }) {
    const id = tempId();
    const placeholder = {
      id, name: DEFAULT_PAYMENT_NAME, total_amount: amount.toFixed(2), payment_date: date, due_date: dueDate,
      paid: "0.00", left: amount.toFixed(2), charges: [], pending: true,
    };
    setRows((prev) => [placeholder, ...prev]);
    setActionError("");

    (async () => {
      try {
        const res = await createCreditCardPayment(amount, date, dueDate || undefined);
        setRows((prev) => prev.map((r) => (r.id === id ? res.data : r)));
        if (pendingOpenIdRef.current === id) {
          pendingOpenIdRef.current = null;
          setActivePaymentId(res.data.id);
        }
      } catch (err) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setActionError(err.response?.data?.detail ?? "Couldn't create this balance");
        if (pendingOpenIdRef.current === id) pendingOpenIdRef.current = null;
      } finally {
        onSaved?.();
      }
    })();
  }

  // Selected balances disappear from the list the instant the header's
  // hold-to-delete completes; the actual DELETE calls happen after, in the
  // background. Any that fail are put back and the error surfaces in the
  // list banner.
  function handleBulkDelete() {
    const idsToDelete = [...selectedIds];
    const removedRows = rows.filter((r) => selectedIds.has(r.id));
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setEditMode(false);
    setActionError("");

    (async () => {
      const results = await Promise.allSettled(idsToDelete.map((id) => deleteCreditCardPayment(id)));
      const failedIds = idsToDelete.filter((id, i) => results[i].status === "rejected");
      if (failedIds.length > 0) {
        const toRestore = removedRows.filter((r) => failedIds.includes(r.id));
        setRows((prev) => [...prev, ...toRestore]);
        setActionError(`Couldn't delete ${failedIds.length} balance${failedIds.length !== 1 ? "s" : ""} — try again`);
      }
      onSaved?.();
    })();
  }

  function openRow(row) {
    if (row.pending) {
      if (!editMode) pendingOpenIdRef.current = row.id;
      return;
    }
    if (editMode) toggleSelect(row.id);
    else setActivePaymentId(row.id);
  }

  if (activePaymentId !== undefined) {
    return (
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 16px 32px" }}>
        <CreditCardBalancePage
          paymentId={activePaymentId}
          mobile
          onBack={() => { setActivePaymentId(undefined); load(); }}
          onChanged={() => { load(); onSaved?.(); }}
          onEditStateChange={onEditStateChange}
        />
      </div>
    );
  }

  const cardColors = assignCardColors(rows.map((r) => r.id));

  return (
    <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`@keyframes cc-progress-stripes { from { background-position: 0 0; } to { background-position: 20px 0; } }`}</style>
      {actionError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{actionError}</p>}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => <CreditCardSkeleton key={i} mobile opacity={1 - i * 0.15} />)}
        </div>
      ) : loadFailed ? (
        <div style={{ textAlign: "center", padding: "20px 12px", border: `1px solid ${HOME_DIVIDER}`, borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: HOME_MUTED, marginBottom: 10 }}>Couldn't load credit card balances</p>
          <button
            onClick={load}
            style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{ width: "100%", textAlign: "center", padding: "20px 12px", borderRadius: 12, border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "transparent", cursor: "pointer" }}
        >
          <p style={{ fontSize: 13.5, fontWeight: 700, color: HOME_TEXT, margin: 0 }}>No Credit Card Balances</p>
          <p style={{ fontSize: 13, color: HOME_MUTED, margin: "4px 0 0" }}>Tap to add your first one</p>
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: editMode ? 12 : 0,
            border: `1px solid ${editMode ? HOME_INCOME : "transparent"}`,
            borderRadius: 18,
            transition: "padding 200ms ease, border-color 200ms ease",
          }}
        >
          {rows.map((row) => {
            const left = parseFloat(row.left);
            const paidOff = left <= 0;
            const pct = Math.min(100, (parseFloat(row.paid) / Math.max(parseFloat(row.total_amount), 0.01)) * 100);
            const checked = selectedIds.has(row.id);

            let dueColor = HOME_MUTED;
            if (row.due_date && !paidOff) {
              const days = Math.round((new Date(row.due_date + "T00:00:00") - new Date(getToday() + "T00:00:00")) / 86400000);
              dueColor = days <= 3 ? HOME_EXPENSE : HOME_MUTED;
            }

            return (
              <div
                key={row.id}
                onClick={() => openRow(row)}
                style={{
                  padding: checked ? "11px 13px" : "12px 14px", borderRadius: 14,
                  border: `${checked ? 2 : 1}px solid ${checked ? HOME_INCOME : HOME_DIVIDER}`,
                  backgroundColor: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10,
                }}
              >
                <div style={{ position: "relative" }}>
                  <CreditCardFace readOnly maxWidth={null} amount={row.total_amount} dueDate={row.due_date} colorIndex={cardColors[row.id]} />
                </div>

                <div className="grid grid-cols-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${HOME_DIVIDER}` }}>
                  {[
                    ["Paid", fmt(row.paid), HOME_TEXT],
                    ["Left", paidOff ? "Paid off" : fmt(left), HOME_TEXT],
                    ["Due", row.due_date ? shortDate(row.due_date) : "—", dueColor],
                  ].map(([label, value, color], i) => (
                    <div key={label} style={{ padding: "7px 9px", borderLeft: i === 0 ? "none" : `1px solid ${HOME_DIVIDER}` }}>
                      <p style={{ margin: 0, fontSize: 8.5, fontWeight: 600, color: HOME_MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ height: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%", width: `${pct}%`, borderRadius: 999, backgroundColor: HOME_INCOME,
                      backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 5px, transparent 5px, transparent 10px)",
                      backgroundSize: "20px 20px",
                      animation: "cc-progress-stripes 1s linear infinite",
                      transition: "width 300ms ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <NewBalanceSheet onClose={() => setPickerOpen(false)} onSubmit={handleCreateSubmit} />
      )}
    </div>
  );
}
