import { useState } from "react";
import SwipeableRow from "./SwipeableRow";
import AmountSortButton from "./AmountSortButton";
import Skel from "./Skel";
import { CATEGORY_CONFIG, INCOME_TYPES, fmt, nextAmountSort } from "../utils/finance";
import { periodLabel, relativeDate } from "../utils/mobileFormat";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, HOME_ACCENT,
  TILE_COLOR, CATEGORY_ICON,
} from "./categoryVisuals";

function IconBack() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={HOME_TEXT} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}


export default function MobileCategory({
  category, transactions, loading, onBack, onEditTransaction, onDeleteTransaction,
}) {
  const [openId, setOpenId] = useState(null);
  const [amountSort, setAmountSort] = useState(null); // null | "asc" | "desc"
  const Icon = CATEGORY_ICON[category];
  const tileColor = TILE_COLOR[category] ?? HOME_MUTED;
  const isIncome = INCOME_TYPES.has(category);

  const catTxns = transactions
    .filter((t) => t.category === category)
    .sort((a, b) => {
      if (amountSort === "asc") return parseFloat(a.amount) - parseFloat(b.amount);
      if (amountSort === "desc") return parseFloat(b.amount) - parseFloat(a.amount);
      return new Date(b.transaction_date) - new Date(a.transaction_date);
    });
  const total = catTxns.reduce((s, t) => s + parseFloat(t.amount), 0);

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 2px 20px" }}>
        <button
          onClick={onBack}
          aria-label="Back to home"
          style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
            background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <IconBack />
        </button>
        <div style={{
          flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, background: tileColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
        }}>
          <Icon />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>
          {CATEGORY_CONFIG[category]?.label ?? category}
        </h1>
      </div>

      {/* Summary */}
      <div style={{ margin: "0 2px 20px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: HOME_MUTED, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {periodLabel()}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, backgroundColor: HOME_SURFACE, borderRadius: 18, padding: "13px 15px 14px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>Total</p>
            {loading ? (
              <Skel h={23} w="65%" />
            ) : (
              <p style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums", color: isIncome ? HOME_INCOME : HOME_TEXT }}>
                {fmt(total)}
              </p>
            )}
          </div>
          <div style={{ flex: 1, backgroundColor: HOME_SURFACE, borderRadius: 18, padding: "13px 15px 14px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>Transactions</p>
            {loading ? (
              <Skel h={23} w="35%" />
            ) : (
              <p style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums", color: HOME_TEXT }}>
                {catTxns.length}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Transactions</h2>
          <AmountSortButton sort={amountSort} onToggle={() => setAmountSort(nextAmountSort)} color={tileColor} />
        </div>
        <div style={{ backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" }}>
          {openId !== null && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 5 }}
              onTouchStart={() => setOpenId(null)}
              onClick={() => setOpenId(null)}
            />
          )}
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none" }}>
                <Skel h={40} w={40} style={{ borderRadius: "50%" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skel h={16} w="55%" />
                  <Skel h={13} w="30%" />
                </div>
                <Skel h={16} w={60} />
              </div>
            ))
          ) : catTxns.length === 0 ? (
            <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "22px 0" }}>
              No transactions this month
            </p>
          ) : (
            catTxns.map((t, i) => (
              <SwipeableRow
                key={t.id}
                id={t.id}
                openId={openId}
                setOpenId={setOpenId}
                onEdit={() => onEditTransaction(t)}
                onDelete={() => onDeleteTransaction(t.id)}
                border={i === 0 ? "transparent" : HOME_DIVIDER}
                surface={HOME_SURFACE}
                text={HOME_TEXT}
                editBg={HOME_ACCENT}
                editColor="#fff"
                deleteBg={HOME_EXPENSE}
                deleteColor="#fff"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", backgroundColor: HOME_SURFACE }}>
                  <div style={{
                    flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: tileColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                  }}>
                    <Icon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
                      {relativeDate(t.transaction_date)}
                    </p>
                  </div>
                  <span style={{ flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums", color: isIncome ? HOME_INCOME : HOME_TEXT }}>
                    {isIncome ? "+" : "−"}{fmt(t.amount)}
                  </span>
                </div>
              </SwipeableRow>
            ))
          )}
        </div>
      </div>
    </>
  );
}
