import { CATEGORY_CONFIG, INCOME_TYPES, fmt } from "../utils/finance";
import { periodLabel, relativeDate } from "../utils/mobileFormat";
import Skel from "./Skel";
import {
  HOME_TEXT,
  HOME_MUTED,
  HOME_CHEVRON,
  HOME_SURFACE,
  HOME_DIVIDER,
  HOME_INCOME,
  HOME_EXPENSE,
  HOME_ACCENT,
  TILE_COLOR,
  CATEGORY_ICON,
} from "./categoryVisuals";
import { IconExpenseTile } from "./categoryIcons";

// ── Icons ────────────────────────────────────────────────────────────────────
// Tile icons always sit on a saturated tile-color circle, so they stay
// literal white strokes rather than theming via currentColor.

function IconChevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={HOME_CHEVRON}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function IconGray({ children }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c7c7cc"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const NAV_ROWS = [
  "INCOME",
  "EXPENSE",
  "BILL",
  "SUBSCRIPTION",
  "DEBT",
  "REIMBURSEMENT",
  "SAVINGS",
  "TIPS",
];

const BILLS_DUE_PLACEHOLDER = 3;

// ── Shared row (nav card / tools) ───────────────────────────────────────────

function Row({
  icon,
  iconBg,
  label,
  trailing,
  badge,
  badgeColor,
  onClick,
  first,
}) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "9px 14px",
        minHeight: 56,
        cursor: interactive ? "pointer" : "default",
      }}
    >
      {!first && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 68,
            right: 0,
            height: 1,
            backgroundColor: HOME_DIVIDER,
          }}
        />
      )}
      <div
        style={{
          flex: "0 0 auto",
          width: 40,
          height: 40,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        {icon}
      </div>
      <p
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          fontSize: 15.5,
          fontWeight: 500,
          color: HOME_TEXT,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </p>
      {badge && (
        <span
          style={{
            flex: "0 0 auto",
            fontSize: 11,
            fontWeight: 700,
            color: badgeColor,
            background: `color-mix(in srgb, ${badgeColor} 16%, transparent)`,
            padding: "3px 8px",
            borderRadius: 999,
          }}
        >
          {badge}
        </span>
      )}
      {trailing != null && (
        <span
          style={{
            flex: "0 0 auto",
            fontSize: 14.5,
            fontWeight: 600,
            color: HOME_TEXT,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {trailing}
        </span>
      )}
      {interactive && (
        <span style={{ flex: "0 0 auto", display: "flex" }}>
          <IconChevron />
        </span>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

function ChangeBadge({ current, previous, goodWhenUp }) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  const color = good ? HOME_INCOME : HOME_EXPENSE;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {up ? "▲" : "▼"}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

// The month overview card: a 2x2 grid of stats.
//   Current Balance   |   Upcoming Bills
//   Estimated Cash    |   Estimated Savings
// Balance is a placeholder until bank integration (#15). The rest come from the
// spendable-surplus and estimated-savings endpoints.
function StatField({ label, value, color, caption, onClick, loading }) {
  const interactive = typeof onClick === "function" && !loading;
  return (
    <div
      onClick={interactive ? onClick : undefined}
      style={{
        cursor: interactive ? "pointer" : "default",
        margin: -6, padding: 6, borderRadius: 10,
        transition: "background-color 0.12s",
      }}
      onPointerDown={interactive ? (e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; } : undefined}
      onPointerUp={interactive ? (e) => { e.currentTarget.style.backgroundColor = "transparent"; } : undefined}
      onPointerLeave={interactive ? (e) => { e.currentTarget.style.backgroundColor = "transparent"; } : undefined}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>{label}</p>
      {loading ? (
        <Skel h={17} w="65%" style={{ marginTop: 4 }} />
      ) : (
        <p
          style={{
            margin: "2px 0 0", fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px",
            fontVariantNumeric: "tabular-nums", color,
          }}
        >
          {value}
        </p>
      )}
      {caption && !loading && (
        <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 500, color: HOME_MUTED }}>{caption}</p>
      )}
    </div>
  );
}

function OverviewCard({
  safeToSpend,
  status,
  savings,
  savingsStatus,
  cardStyle,
  onOpenBreakdown,
}) {
  // Placeholder until bank integration (#15) provides a live figure.
  const currentBalance = {
    key: "balance",
    label: "Current Balance",
    value: "$3,284.19",
    color: HOME_TEXT,
  };

  let bills, discretionary;
  if (status === "ok" && safeToSpend) {
    const surplus = parseFloat(safeToSpend.spendable_surplus);
    const billCount = safeToSpend.bills_breakdown?.length ?? 0;
    discretionary = {
      key: "cash",
      label: "Estimated Cash",
      value: fmt(safeToSpend.spendable_surplus),
      color: surplus >= 0 ? HOME_INCOME : HOME_EXPENSE,
    };
    bills = {
      key: "bills",
      label: "Upcoming Bills",
      value: parseFloat(safeToSpend.bills_before_next_payday) > 0 ? `-${fmt(safeToSpend.bills_before_next_payday)}` : fmt(safeToSpend.bills_before_next_payday),
      color: TILE_COLOR.BILL,
      caption: billCount > 0 ? `${billCount} bill${billCount !== 1 ? "s" : ""} due` : "No bills due",
    };
  } else if (status === "loading") {
    discretionary = { key: "cash", label: "Estimated Cash", color: HOME_MUTED, loading: true };
    bills = { key: "bills", label: "Upcoming Bills", color: HOME_MUTED, loading: true };
  } else {
    discretionary = { key: "cash", label: "Estimated Cash", value: "Not set up", color: HOME_MUTED };
    bills = { key: "bills", label: "Upcoming Bills", value: "—", color: HOME_MUTED };
  }

  let save;
  if (savingsStatus === "ok" && savings) {
    const target = parseFloat(savings.estimated_savings);
    const value =
      target > 0
        ? `${fmt(savings.saved_so_far)}/${fmt(savings.estimated_savings)}`
        : fmt(savings.saved_so_far);
    save = { key: "savings", label: "Estimated Savings", value, color: TILE_COLOR.SAVINGS };
  } else if (savingsStatus === "loading") {
    save = { key: "savings", label: "Estimated Savings", color: HOME_MUTED, loading: true };
  } else {
    save = { key: "savings", label: "Estimated Savings", value: "—", color: HOME_MUTED };
  }

  const fields = [currentBalance, bills, discretionary, save];

  return (
    <div
      style={{
        ...cardStyle,
        padding: "14px 16px",
        marginTop: 16,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "14px 12px",
      }}
    >
      {fields.map((f) => (
        <StatField key={f.key} {...f} onClick={() => onOpenBreakdown(f.key)} />
      ))}
    </div>
  );
}

export default function MobileHome({
  loading,
  dashSummary,
  dashLastMonthSummary,
  safeToSpend,
  safeToSpendStatus,
  savings,
  savingsStatus,
  dashSorted,
  dashCategoryTotals,
  onOpenRecurring,
  onOpenPaychecks,
  onOpenBreakdown,
  onViewCategory,
  onSeeAllTransactions,
  onEditTransaction,
}) {
  const cardStyle = {
    backgroundColor: HOME_SURFACE,
    borderRadius: 16,
    overflow: "hidden",
  };
  const sectionHeadStyle = {
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: HOME_TEXT,
    margin: 0,
  };

  return (
    <>
      {/* Month summary hero */}
      <div style={{ margin: "18px 2px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-0.4px",
              color: HOME_TEXT,
            }}
          >
            {periodLabel()}
          </span>
          {!loading && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: dashSummary.net >= 0 ? HOME_INCOME : HOME_EXPENSE,
              }}
            >
              <span
                style={{ color: HOME_MUTED, fontWeight: 500, marginRight: 5 }}
              >
                Net
              </span>
              {(dashSummary.net >= 0 ? "+" : "-") +
                fmt(Math.abs(dashSummary.net))}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {loading ? (
            <>
              <div style={{ flex: 1, ...cardStyle, padding: "12px 14px 13px" }}>
                <Skel h={13} w="55%" style={{ marginBottom: 8 }} />
                <Skel h={21} w="75%" />
              </div>
              <div style={{ flex: 1, ...cardStyle, padding: "12px 14px 13px" }}>
                <Skel h={13} w="55%" style={{ marginBottom: 8 }} />
                <Skel h={21} w="75%" />
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: 1, ...cardStyle, padding: "12px 14px 13px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: HOME_INCOME,
                    }}
                  >
                    Income
                  </p>
                  <ChangeBadge
                    current={dashSummary.totalIn}
                    previous={dashLastMonthSummary?.totalIn}
                    goodWhenUp={true}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 21,
                    fontWeight: 700,
                    letterSpacing: "-0.4px",
                    color: HOME_INCOME,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(dashSummary.totalIn)}
                </p>
              </div>
              <div style={{ flex: 1, ...cardStyle, padding: "12px 14px 13px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: HOME_EXPENSE,
                    }}
                  >
                    Expenses
                  </p>
                  <ChangeBadge
                    current={dashSummary.totalOut}
                    previous={dashLastMonthSummary?.totalOut}
                    goodWhenUp={false}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 21,
                    fontWeight: 700,
                    letterSpacing: "-0.4px",
                    color: HOME_EXPENSE,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(dashSummary.totalOut)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Month overview */}
      <OverviewCard
        safeToSpend={safeToSpend}
        status={safeToSpendStatus}
        savings={savings}
        savingsStatus={savingsStatus}
        cardStyle={cardStyle}
        onOpenBreakdown={onOpenBreakdown}
      />
      {/* Primary nav card */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        {NAV_ROWS.map((cat, i) => {
          const Icon = CATEGORY_ICON[cat];
          return (
            <Row
              key={cat}
              first={i === 0}
              icon={<Icon />}
              iconBg={TILE_COLOR[cat]}
              label={CATEGORY_CONFIG[cat]?.label ?? cat}
              trailing={loading ? <Skel w={50} h={14} /> : fmt(dashCategoryTotals[cat] ?? 0)}
              badge={cat === "BILL" ? `${BILLS_DUE_PLACEHOLDER} due` : null}
              badgeColor={TILE_COLOR.BILL}
              onClick={() => onViewCategory(cat)}
            />
          );
        })}
      </div>
      {/* Accounts — static placeholder, no bank-linking yet */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "18px 4px 12px",
          }}
        >
          <h2 style={sectionHeadStyle}>Accounts</h2>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: HOME_MUTED,
                }}
              />
            ))}
          </div>
        </div>
        <div style={cardStyle}>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "9px 14px",
              minHeight: 60,
            }}
          >
            <div
              style={{
                flex: "0 0 auto",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#1461d1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15.5,
              }}
            >
              CH
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{ fontSize: 13.5, color: HOME_MUTED, fontWeight: 500 }}
              >
                Chase
              </span>
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.2px",
                  color: HOME_TEXT,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Everyday Checking ••4021
              </span>
            </div>
            <span
              style={{
                flex: "0 0 auto",
                fontSize: 16.5,
                fontWeight: 600,
                color: HOME_TEXT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              $3,284.19
            </span>
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "9px 14px",
              minHeight: 60,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 68,
                right: 0,
                height: 1,
                backgroundColor: HOME_DIVIDER,
              }}
            />
            <div
              style={{
                flex: "0 0 auto",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#2e6ad1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15.5,
              }}
            >
              AX
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{ fontSize: 13.5, color: HOME_MUTED, fontWeight: 500 }}
              >
                American Express
              </span>
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.2px",
                  color: HOME_TEXT,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Blue Cash ••1008
              </span>
            </div>
            <span
              style={{
                flex: "0 0 auto",
                fontSize: 16.5,
                fontWeight: 600,
                color: HOME_EXPENSE,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              −$642.55
            </span>
          </div>
        </div>
      </div>
      {/* Tools */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "18px 4px 12px",
          }}
        >
          <h2 style={sectionHeadStyle}>Tools</h2>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: HOME_MUTED,
                }}
              />
            ))}
          </div>
        </div>
        <div style={cardStyle}>
          <Row
            first
            icon={
              <IconGray>
                <rect x="3" y="6.5" width="18" height="11" rx="2.2" />
                <circle cx="12" cy="12" r="2.3" />
              </IconGray>
            }
            iconBg="#2a2a2e"
            label="Paychecks"
            onClick={onOpenPaychecks}
          />
          <Row
            icon={
              <IconGray>
                <path d="M17 3.5l3 3-3 3" />
                <path d="M20 6.5H8.5a4.5 4.5 0 0 0-4.5 4.5" />
                <path d="M7 20.5l-3-3 3-3" />
                <path d="M4 17.5h11.5a4.5 4.5 0 0 0 4.5-4.5" />
              </IconGray>
            }
            iconBg="#2a2a2e"
            label="Recurring payments"
            onClick={onOpenRecurring}
          />
          <Row
            icon={
              <IconGray>
                <path d="M6.5 3h11v18l-2.75-1.6L12 21l-2.75-1.6L6.5 21z" />
              </IconGray>
            }
            iconBg="#2a2a2e"
            label="Upcoming bills"
          />
        </div>
      </div>
      {/* Recent transactions */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "18px 4px 12px",
          }}
        >
          <h2 style={sectionHeadStyle}>Recent</h2>
          <span
            onClick={onSeeAllTransactions}
            style={{
              color: HOME_ACCENT,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            See All
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "11px 4px",
                }}
              >
                <Skel h={40} w={40} style={{ borderRadius: "50%" }} />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <Skel h={14} w="40%" />
                  <Skel h={16} w="65%" />
                </div>
                <Skel h={16} w={60} />
              </div>
            ))
          ) : dashSorted.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: HOME_MUTED,
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              No transactions yet
            </p>
          ) : (
            dashSorted.slice(0, 4).map((t, i) => {
              const isIncome = INCOME_TYPES.has(t.category);
              const Icon = CATEGORY_ICON[t.category] ?? IconExpenseTile;
              return (
                <div
                  key={t.id}
                  onClick={() => onEditTransaction(t)}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 4px",
                    cursor: "pointer",
                    borderRadius: 12,
                  }}
                >
                  {i > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 58,
                        right: 4,
                        height: 1,
                        backgroundColor: HOME_DIVIDER,
                      }}
                    />
                  )}
                  <div
                    style={{
                      flex: "0 0 auto",
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: TILE_COLOR[t.category] ?? "#2a2a2e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                    }}
                  >
                    <Icon />
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: HOME_MUTED,
                          fontWeight: 500,
                        }}
                      >
                        {CATEGORY_CONFIG[t.category]?.label ?? t.category}
                      </span>
                      <span
                        style={{
                          flex: "0 0 auto",
                          fontSize: 16,
                          fontWeight: 600,
                          letterSpacing: "-0.2px",
                          fontVariantNumeric: "tabular-nums",
                          color: isIncome ? HOME_INCOME : HOME_TEXT,
                        }}
                      >
                        {isIncome ? "+" : "−"}
                        {fmt(t.amount)}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 17,
                        fontWeight: 600,
                        letterSpacing: "-0.2px",
                        color: HOME_TEXT,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.name}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: HOME_MUTED,
                        fontWeight: 500,
                      }}
                    >
                      {relativeDate(t.transaction_date)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
