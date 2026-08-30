import { useState, useRef, useLayoutEffect } from "react";
import { CATEGORY_CONFIG, lockedNameFor } from "../../utils/finance";
import { createTransaction } from "../../api/transactions";
import { createTipDeposit } from "../../api/tipDeposits";
import { getToday } from "../../utils/time";
import Toggle from "../shared/Toggle";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, HOME_ACCENT, ACCENT, CATEGORY_ACCENT } from "../shared/categoryVisuals";
import CurrencyInput from "../shared/CurrencyInput";
import BatchAddPanel from "./BatchAddPanel";
import ImportPanel from "./ImportPanel";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => ({ value: key, label }));

const ORDER = ["single", "batch", "import"];

const CARDS = {
  single: {
    title: "Single",
    desc: "Add one transaction",
    color: HOME_INCOME,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5v14" />
      </svg>
    ),
  },
  batch: {
    title: "Batch",
    desc: "Add several transactions at once",
    color: ACCENT,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  import: {
    title: "Import",
    desc: "Upload a CSV or PDF statement",
    color: HOME_ACCENT,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
};

function ArrowButton({ direction, onClick, muted, text }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "left" ? "Previous option" : "Next option"}
      className="rounded-full cursor-pointer transition-colors flex items-center justify-center"
      style={{ width: 40, height: 40, flexShrink: 0, color: muted, background: "none", border: "none" }}
      onMouseEnter={e => e.currentTarget.style.color = text}
      onMouseLeave={e => e.currentTarget.style.color = muted}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}

export default function AddTransactionPage({ onSaved, onImported }) {
  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;

  const [focus, setFocus] = useState(null); // null | "single" | "batch" | "import"
  const [hoveredCard, setHoveredCard] = useState(null);

  const cardRefs = useRef({});
  const panelRef = useRef(null);
  const flipFromRect = useRef(null);

  function focusCard(key) {
    flipFromRect.current = cardRefs.current[key]?.getBoundingClientRect() ?? null;
    setFocus(key);
  }

  function cycle(dir) {
    const i = ORDER.indexOf(focus);
    setFocus(ORDER[(i + dir + ORDER.length) % ORDER.length]);
  }

  useLayoutEffect(() => {
    const from = flipFromRect.current;
    const el = panelRef.current;
    if (!from || !el) return;
    flipFromRect.current = null;

    const to = el.getBoundingClientRect();
    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;

    el.style.transition = "none";
    el.style.transformOrigin = "center center";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    el.style.opacity = "0.5";
    el.getBoundingClientRect(); // force reflow so the start state actually paints
    requestAnimationFrame(() => {
      el.style.transition = "transform 320ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease";
      el.style.transform = "translate(0, 0) scale(1, 1)";
      el.style.opacity = "1";
    });
  }, [focus]);

  return (
    <div>
      <style>{`
        @keyframes add-page-fade { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes add-panel-slide { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <div
        style={{
          display: focus === null ? "flex" : "none",
          alignItems: "center", justifyContent: "center",
          minHeight: "70vh",
        }}
      >
        <div
          className="grid grid-cols-3 gap-6"
          style={{
            animation: focus === null ? "add-page-fade 220ms ease" : undefined,
            maxWidth: 840, width: "100%",
          }}
        >
          {ORDER.map((key) => {
            const card = CARDS[key];
            const hov = hoveredCard === key;
            return (
              <button
                key={key}
                ref={(el) => { cardRefs.current[key] = el; }}
                onClick={() => focusCard(key)}
                onMouseEnter={() => setHoveredCard(key)}
                onMouseLeave={() => setHoveredCard(null)}
                className="rounded-2xl text-left cursor-pointer transition-colors flex flex-col justify-center"
                style={{
                  padding: 28,
                  aspectRatio: "3 / 4",
                  backgroundColor: hov ? `color-mix(in srgb, ${text} 6%, ${bg})` : bg,
                  border: "none",
                }}
              >
                <div
                  style={{
                    width: 56, height: 56, borderRadius: 16, marginBottom: 20,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: `color-mix(in srgb, ${card.color} 16%, transparent)`,
                    color: card.color,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: text, marginBottom: 6 }}>{card.title}</div>
                <div style={{ fontSize: 14, color: muted }}>{card.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        onClick={() => setFocus(null)}
        style={{ display: focus === null ? "none" : "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center" }}
      >
        <div
          className="flex items-center"
          style={{ gap: 16, width: "100%", maxWidth: 1040 }}
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowButton direction="left" onClick={() => cycle(-1)} muted={muted} text={text} />
          <div
            ref={panelRef}
            className="rounded-2xl flex-1"
            style={{ backgroundColor: bg, border: `1px solid ${border}`, overflow: "hidden" }}
          >
            {ORDER.map((key) => (
              <div key={key} style={{ display: focus === key ? "block" : "none", animation: focus === key ? "add-panel-slide 280ms ease" : undefined }}>
                <div className="px-7 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div style={{ color: CARDS[key].color, display: "flex" }}>{CARDS[key].icon}</div>
                  <h2 className="text-lg font-semibold" style={{ color: text }}>{CARDS[key].title}</h2>
                </div>
                <div className="px-7 py-6">
                  {key === "single" && <SingleForm onSaved={onSaved} />}
                  {key === "batch" && <BatchSection onSaved={onSaved} />}
                  {key === "import" && <ImportSection onImported={onImported} />}
                </div>
              </div>
            ))}
          </div>
          <ArrowButton direction="right" onClick={() => cycle(1)} muted={muted} text={text} />
        </div>
      </div>
    </div>
  );
}

function SingleForm({ onSaved }) {
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;

  const [form, setForm] = useState({ name: "", amount: "", category: "EXPENSE", transaction_date: getToday(), note: "", deposited: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "category") {
      // Deposited is Tips-only - drop it along with the toggle once it's
      // switched away from that category.
      setForm((f) => ({
        ...f, category: value, name: lockedNameFor(value) ?? f.name,
        deposited: value === "TIPS" ? f.deposited : false,
      }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { deposited, ...rest } = form;
      // A deposited tip isn't a transaction at all - it's a TipDeposit, its
      // own amount + date with no link back to any tip (#155). Its amount
      // doesn't need to match any particular tip or the month's total.
      if (form.category === "TIPS" && deposited) {
        await createTipDeposit({ amount: parseFloat(form.amount), deposit_date: form.transaction_date });
      } else {
        await createTransaction({ ...rest, amount: parseFloat(form.amount) });
      }
      setForm((f) => ({ name: "", amount: "", category: f.category, transaction_date: getToday(), note: "", deposited: false }));
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const catColor = CATEGORY_ACCENT[form.category];
  const underline = (extra) => ({
    backgroundColor: "transparent", color: text, border: "none",
    borderBottom: `1px solid ${border}`, borderRadius: 0, ...extra,
  });
  const focusAccent = (e) => { e.currentTarget.style.borderBottomColor = catColor; };
  const blurAccent = (e) => { e.currentTarget.style.borderBottomColor = border; };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1.5">Name</label>
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          onFocus={focusAccent}
          onBlur={blurAccent}
          required={!lockedNameFor(form.category)}
          disabled={!!lockedNameFor(form.category)}
          placeholder="e.g. Netflix, Salary..."
          className="w-full px-1 py-2.5 text-base focus:outline-none transition-colors"
          style={lockedNameFor(form.category)
            ? { ...underline(), backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, color-mix(in srgb, ${text} 10%, transparent) 5px, color-mix(in srgb, ${text} 10%, transparent) 10px)`, cursor: "not-allowed", opacity: 0.5 }
            : underline()}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Amount</label>
          <CurrencyInput
            value={form.amount}
            onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            onFocus={focusAccent}
            onBlur={blurAccent}
            required
            placeholder="$0.00"
            className="w-full px-1 py-2.5 text-base focus:outline-none transition-colors"
            style={underline()}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Category</label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full rounded-full px-3 py-2.5 text-sm font-semibold focus:outline-none cursor-pointer text-center"
            style={{ backgroundColor: catColor, color: "#fff", border: "none" }}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ backgroundColor: HOME_SURFACE, color: text }}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-sm font-medium mb-1.5">Date</label>
          <input
            type="date"
            name="transaction_date"
            value={form.transaction_date}
            onChange={handleChange}
            onFocus={focusAccent}
            onBlur={blurAccent}
            required
            className="w-full px-1 py-2.5 text-base focus:outline-none transition-colors"
            style={{ ...underline(), WebkitAppearance: "none", appearance: "none", minWidth: 0, colorScheme: "dark" }}
          />
        </div>
      </div>

      {form.category === "TIPS" && (
        <div className="flex items-center gap-2.5" style={{ marginTop: -8 }}>
          <Toggle
            checked={form.deposited}
            onChange={(v) => setForm((f) => ({ ...f, deposited: v }))}
            activeColor={catColor}
          />
          <span style={{ fontSize: 14, color: HOME_MUTED }}>Deposited (not cash on hand)</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Note <span className="font-normal opacity-60">(optional)</span></label>
        <input
          type="text"
          name="note"
          value={form.note}
          onChange={handleChange}
          onFocus={focusAccent}
          onBlur={blurAccent}
          placeholder="e.g. Refund, from John..."
          maxLength={100}
          className="w-full px-1 py-2.5 text-base focus:outline-none transition-colors"
          style={underline()}
        />
      </div>

      {error && (
        <div className="text-sm px-4 py-2.5 rounded-xl text-red-500" style={{ backgroundColor: `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)` }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl text-base font-semibold disabled:opacity-50 transition-all cursor-pointer active:scale-[0.99]"
        style={{ padding: "13px 20px", backgroundColor: catColor, color: "#fff", border: "none" }}
      >
        {loading ? "Adding..." : "Add Transaction"}
      </button>
    </form>
  );
}

function BatchSection({ onSaved }) {
  const [saveState, setSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", validCount: 0, onSave: null });

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: HOME_MUTED }}>
          {saveState.saveStatus === "saved" ? <span style={{ color: HOME_INCOME }}>Saved</span> : "Add rows below, then save"}
        </span>
        <button
          onClick={saveState.onSave}
          disabled={!saveState.isDirty || saveState.isSaving}
          className="text-sm font-semibold rounded-lg cursor-pointer transition-opacity"
          style={{
            padding: "7px 16px",
            border: "none",
            color: "#000",
            backgroundColor: HOME_INCOME,
            opacity: !saveState.isDirty || saveState.isSaving ? 0.4 : 1,
            cursor: saveState.isDirty && !saveState.isSaving ? "pointer" : "default",
          }}
        >
          {saveState.isSaving ? "Adding…" : saveState.validCount ? `Add ${saveState.validCount} transaction${saveState.validCount !== 1 ? "s" : ""}` : "Add transactions"}
        </button>
      </div>
      <BatchAddPanel active onSaveStateChange={setSaveState} onSaved={onSaved} />
    </div>
  );
}

function ImportSection({ onImported }) {
  const [saveState, setSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", validCount: 0, onSave: null });

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: HOME_MUTED }}>
          {saveState.saveStatus === "saved" ? <span style={{ color: HOME_INCOME }}>Saved</span> : "Upload a statement, review, then import"}
        </span>
        <button
          onClick={saveState.onSave}
          disabled={!saveState.isDirty || saveState.isSaving}
          className="text-sm font-semibold rounded-lg cursor-pointer transition-opacity"
          style={{
            padding: "7px 16px",
            border: "none",
            color: "#000",
            backgroundColor: HOME_INCOME,
            opacity: !saveState.isDirty || saveState.isSaving ? 0.4 : 1,
            cursor: saveState.isDirty && !saveState.isSaving ? "pointer" : "default",
          }}
        >
          {saveState.isSaving ? "Importing…" : saveState.validCount ? `Import ${saveState.validCount} transaction${saveState.validCount !== 1 ? "s" : ""}` : "Import transactions"}
        </button>
      </div>
      <ImportPanel active onSaveStateChange={setSaveState} onSaved={onImported} />
    </div>
  );
}
