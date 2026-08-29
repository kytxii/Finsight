import { useEffect, useRef, useState } from "react";
import {
  getCreditCardPayments,
  deleteCreditCardPayment,
  createCreditCardPayment,
} from "../../api/creditCard";
import CreditCardBalancePage from "../shared/CreditCardBalancePage";
import CreditCardFace from "../shared/CreditCardFace";
import CreditCardSkeleton from "../shared/CreditCardSkeleton";
import { fmt } from "../../utils/finance";
import { getToday } from "../../utils/time";
import { assignCardColors } from "../../utils/cardColors";
import {
  HOME_SURFACE,
  HOME_DIVIDER,
  HOME_TEXT,
  HOME_MUTED,
  HOME_INCOME,
  HOME_EXPENSE,
} from "../shared/categoryVisuals";

const DEFAULT_PAYMENT_NAME = "Credit Card Payment";

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const PANEL_EXIT_MS = 200;

// "+" opens this: just an amount, a date, and (optionally) a due-by date -
// creates the balance directly, no transaction-picking involved. Slides in
// from the right on open and back out on close/submit, matching the detail
// page's own panel-style transitions.
function NewBalancePanel({ onClose, onSubmit }) {
  const bg = HOME_SURFACE,
    border = HOME_DIVIDER,
    text = HOME_TEXT,
    muted = HOME_MUTED;

  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [closing, setClosing] = useState(false);

  function requestClose() {
    setClosing(true);
    setTimeout(onClose, PANEL_EXIT_MS);
  }

  function handleCreate(e) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!(amt > 0)) return;
    onSubmit({ amount: amt, date: getToday(), dueDate: dueDate || null });
    requestClose();
  }

  return (
    <>
      <style>{`@keyframes cc-add-panel-in {
        from { opacity: 0; transform: translateX(calc(100% + 24px)); }
        to   { opacity: 1; transform: translateX(0); }
      }`}</style>
      <div
        className="fixed z-40 flex flex-col rounded-2xl border shadow-2xl"
        style={{
          top: 88,
          right: 24,
          width: 380,
          maxWidth: "calc(100vw - 48px)",
          backgroundColor: bg,
          borderColor: border,
          color: text,
          transform: closing
            ? "translateX(calc(100% + 24px))"
            : "translateX(0)",
          opacity: closing ? 0 : 1,
          animation: closing
            ? undefined
            : `cc-add-panel-in ${PANEL_EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          transition: `transform ${PANEL_EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${PANEL_EXIT_MS}ms ease`,
        }}
      >
        <div
          className="px-4 sm:px-5 py-3.5 flex items-center justify-between shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <h2 className="text-base font-semibold">New Credit Card Balance</h2>
          <button
            onClick={requestClose}
            aria-label="Close"
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ color: muted }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form
          onSubmit={handleCreate}
          className="px-4 sm:px-5 py-4"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <CreditCardFace
            autoFocus
            amount={amount}
            onAmountChange={setAmount}
            dueDate={dueDate}
            onDueDateChange={setDueDate}
          />
          <button
            type="submit"
            style={{
              padding: "9px 0",
              borderRadius: 10,
              border: `1px solid ${HOME_INCOME}`,
              backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 14%, transparent)`,
              color: HOME_INCOME,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create
          </button>
        </form>
      </div>
    </>
  );
}

export default function CreditCardsPanel({
  addSignal,
  onChanged,
  onEditStateChange,
}) {
  const bg = HOME_SURFACE,
    border = HOME_DIVIDER,
    text = HOME_TEXT,
    muted = HOME_MUTED;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [emptyHovered, setEmptyHovered] = useState(false);
  const [actionError, setActionError] = useState("");
  // Tracks a click on a still-pending (optimistic) row so it opens the
  // instant the real payment exists - no UI depends on this directly
  // anymore (creation is fast enough there's nothing to show while waiting),
  // it's only read inside the async create callback below.
  const pendingOpenIdRef = useRef(null);

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

  const prevAddSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== prevAddSignal.current) {
      prevAddSignal.current = addSignal;
      setPickerOpen(true);
    }
  }, [addSignal]);

  function toggleEdit() {
    setEditMode((e) => !e);
    setSelectedIds(new Set());
    setActionError("");
  }

  // The Edit toggle lives in the Dashboard header next to "+", not in this
  // panel - report state up so that button can render/act on it. While a
  // balance's detail page is open, that page reports its own edit state for
  // its charge list instead (#146) - skip here so the two don't race.
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

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreateSubmit({ amount, date, dueDate }) {
    const id = tempId();
    const placeholder = {
      id,
      name: DEFAULT_PAYMENT_NAME,
      total_amount: amount.toFixed(2),
      payment_date: date,
      due_date: dueDate,
      paid: "0.00",
      left: amount.toFixed(2),
      charges: [],
      pending: true,
    };
    setRows((prev) => [placeholder, ...prev]);
    setActionError("");

    (async () => {
      try {
        const res = await createCreditCardPayment(
          amount,
          date,
          dueDate || undefined,
        );
        setRows((prev) => prev.map((r) => (r.id === id ? res.data : r)));
        if (pendingOpenIdRef.current === id) {
          pendingOpenIdRef.current = null;
          setActivePaymentId(res.data.id);
        }
      } catch (err) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setActionError(
          err.response?.data?.detail ?? "Couldn't create this balance",
        );
        if (pendingOpenIdRef.current === id) pendingOpenIdRef.current = null;
      } finally {
        onChanged?.();
      }
    })();
  }

  // No arm-then-confirm step here anymore - the header's hold-to-delete
  // button (Dashboard.jsx) is itself the confirmation, so this just executes.
  function handleBulkDelete() {
    const idsToDelete = [...selectedIds];
    const removedRows = rows.filter((r) => selectedIds.has(r.id));
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setEditMode(false);
    setActionError("");

    (async () => {
      const results = await Promise.allSettled(
        idsToDelete.map((id) => deleteCreditCardPayment(id)),
      );
      const failedIds = idsToDelete.filter(
        (id, i) => results[i].status === "rejected",
      );
      if (failedIds.length > 0) {
        const toRestore = removedRows.filter((r) => failedIds.includes(r.id));
        setRows((prev) => [...prev, ...toRestore]);
        setActionError(
          `Couldn't delete ${failedIds.length} balance${failedIds.length !== 1 ? "s" : ""} — try again`,
        );
      }
      onChanged?.();
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
      <div style={{ padding: "24px 28px 24px", color: text }}>
        <CreditCardBalancePage
          paymentId={activePaymentId}
          onBack={() => {
            setActivePaymentId(undefined);
            load();
          }}
          onChanged={() => {
            load();
            onChanged?.();
          }}
          onEditStateChange={onEditStateChange}
        />
      </div>
    );
  }

  const cardColors = assignCardColors(rows.map((r) => r.id));

  return (
    <div
      style={{
        padding: "24px 28px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        color: text,
      }}
    >
      <style>{`@keyframes cc-progress-stripes { from { background-position: 0 0; } to { background-position: 20px 0; } }`}</style>
      {actionError && (
        <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>
          {actionError}
        </p>
      )}

      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {[...Array(3)].map((_, i) => (
            <CreditCardSkeleton key={i} opacity={1 - i * 0.15} />
          ))}
        </div>
      ) : loadFailed ? (
        <div
          style={{
            textAlign: "center",
            padding: "28px 16px",
            border: `1px solid ${border}`,
            borderRadius: 16,
          }}
        >
          <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>
            Couldn't load credit card balances
          </p>
          <button
            onClick={load}
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: "7px 16px",
              borderRadius: 10,
              border: "none",
              color: "#fff",
              backgroundColor: HOME_INCOME,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        // Card-shaped, not a full-width bar - same shell a real card (or its
        // loading CreditCardSkeleton) uses, so this reads as "here's where
        // your first one goes" instead of a generic empty-state banner.
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            onMouseEnter={() => setEmptyHovered(true)}
            onMouseLeave={() => setEmptyHovered(false)}
            className="transition-colors text-left"
            style={{
              padding: 18,
              borderRadius: 14,
              border: `1px dashed ${border}`,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minHeight: 228,
              backgroundColor: emptyHovered
                ? `color-mix(in srgb, ${text} 5%, ${bg})`
                : "transparent",
            }}
          >
            <div
              className="transition-colors"
              style={{
                width: "100%",
                aspectRatio: "1.586",
                borderRadius: 18,
                border: `1.5px dashed ${emptyHovered ? HOME_INCOME : border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-colors"
                style={{ color: emptyHovered ? HOME_INCOME : muted }}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: text, margin: 0 }}>
                No Credit Card Balances
              </p>
              <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>
                Click to add your first one
              </p>
            </div>
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            padding: editMode ? 16 : 0,
            border: `1px solid ${editMode ? HOME_INCOME : "transparent"}`,
            borderRadius: 18,
            transition: "padding 200ms ease, border-color 200ms ease",
          }}
        >
          {rows.map((row) => {
            const left = parseFloat(row.left);
            const paidOff = left <= 0;
            const pct = Math.min(
              100,
              (parseFloat(row.paid) /
                Math.max(parseFloat(row.total_amount), 0.01)) *
                100,
            );
            const checked = selectedIds.has(row.id);
            const hovered = hoveredId === row.id;
            const shownCharges = [...row.charges]
              .sort(
                (a, b) =>
                  parseFloat(b.total_amount) - parseFloat(a.total_amount),
              )
              .slice(0, 4);

            let dueTint = null;
            if (row.due_date && !paidOff) {
              const days = Math.round(
                (new Date(row.due_date + "T00:00:00") -
                  new Date(getToday() + "T00:00:00")) /
                  86400000,
              );
              dueTint =
                days < 0
                  ? {
                      color: HOME_EXPENSE,
                      label: `Overdue · ${shortDate(row.due_date)}`,
                    }
                  : days <= 3
                    ? {
                        color: HOME_EXPENSE,
                        label: `Due ${shortDate(row.due_date)}`,
                      }
                    : { color: muted, label: `Due ${shortDate(row.due_date)}` };
            }

            return (
              <div
                key={row.id}
                onClick={() => openRow(row)}
                onMouseEnter={() => setHoveredId(row.id)}
                onMouseLeave={() =>
                  setHoveredId((id) => (id === row.id ? null : id))
                }
                className="transition-colors"
                style={{
                  padding: checked ? "17px" : "18px",
                  borderRadius: 14,
                  border: `${checked ? 2 : 1}px solid ${checked ? HOME_INCOME : border}`,
                  backgroundColor: bg,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  minHeight: 228,
                  position: "relative",
                }}
              >
                <div style={{ position: "relative" }}>
                  <CreditCardFace
                    readOnly
                    maxWidth={null}
                    amount={row.total_amount}
                    dueDate={row.due_date}
                    hovered={hovered}
                    colorIndex={cardColors[row.id]}
                  />
                </div>

                <div
                  className="grid grid-cols-3 rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${border}` }}
                >
                  {[
                    ["Paid", fmt(row.paid), text],
                    ["Left", paidOff ? "Paid off" : fmt(left), text],
                    [
                      "Due",
                      row.due_date ? shortDate(row.due_date) : "—",
                      dueTint ? dueTint.color : muted,
                    ],
                  ].map(([label, value, color], i) => (
                    <div
                      key={label}
                      style={{
                        padding: "8px 10px",
                        borderLeft: i === 0 ? "none" : `1px solid ${border}`,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 9,
                          fontWeight: 600,
                          color: muted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {label}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 13,
                          fontWeight: 700,
                          color,
                          fontVariantNumeric: "tabular-nums",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    minHeight: 0,
                    paddingTop: 2,
                    borderTop: `1px solid ${border}`,
                  }}
                >
                  {shownCharges.length === 0 ? (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 11.5,
                        color: muted,
                      }}
                    >
                      No Payments Yet
                    </p>
                  ) : (
                    shownCharges.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          fontSize: 11.5,
                          marginTop: 6,
                        }}
                      >
                        <span
                          style={{
                            color: text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.name}
                        </span>
                        <span
                          style={{
                            color: muted,
                            flexShrink: 0,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(c.total_amount)}
                        </span>
                      </div>
                    ))
                  )}
                  {row.charges.length > shownCharges.length && (
                    <p
                      style={{ margin: "6px 0 0", fontSize: 11, color: muted }}
                    >
                      +{row.charges.length - shownCharges.length} more
                    </p>
                  )}
                </div>

                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: `color-mix(in srgb, ${text} 10%, transparent)`,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 999,
                      backgroundColor: HOME_INCOME,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 5px, transparent 5px, transparent 10px)",
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
        <NewBalancePanel
          onClose={() => setPickerOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}
    </div>
  );
}
