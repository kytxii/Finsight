import Skel from "../../shared/Skel";
import { HOME_SURFACE, HOME_DIVIDER, HOME_MUTED } from "../../shared/categoryVisuals";

function IconChevron({ dir = "left", size = 15 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// The balance detail page's full-page loading mockup - stats header,
// progress bar, and the 3-column charge-management layout below. Previously
// lived inline in CreditCardBalancePage.jsx and had drifted out of sync with
// the real layout at least once before (#142) - being its own component
// makes that easier to catch going forward.
export default function CreditCardBalancePageSkeleton({ mobile, onBack }) {
  const border = HOME_DIVIDER;
  const backBtnStyle = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: HOME_MUTED, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 0" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 16 : 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <button type="button" onClick={onBack} style={backBtnStyle}><IconChevron /> Back</button>
        <Skel w={70} h={12} />
      </div>

      {mobile ? (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: HOME_SURFACE, border: `1px solid ${border}` }}>
          <div style={{ padding: "13px 15px" }}>
            <Skel w={38} h={10} />
            <Skel w={64} h={19} style={{ marginTop: 6 }} />
          </div>
          <div className="grid grid-cols-2" style={{ borderTop: `1px solid ${border}` }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ padding: "13px 15px", borderLeft: i === 0 ? "none" : `1px solid ${border}` }}>
                <Skel w={38} h={10} />
                <Skel w={64} h={19} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-3 rounded-2xl overflow-hidden"
          style={{ backgroundColor: HOME_SURFACE, border: `1px solid ${border}` }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ padding: "15px 18px", borderLeft: i === 0 ? "none" : `1px solid ${border}` }}
            >
              <Skel w={38} h={10} />
              <Skel w={64} h={23} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
      )}

      <Skel h={8} style={{ borderRadius: 999 }} />

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3, 1fr)", gap: 18, height: mobile ? undefined : 460 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              padding: mobile ? 20 : 22, borderRadius: 14, border: `1px solid ${border}`,
              display: "flex", flexDirection: "column", gap: 10, minHeight: 0,
            }}
          >
            <Skel w={130} h={15} />
            <Skel h={44} style={{ borderRadius: 10, marginTop: 4 }} />
            <Skel h={44} style={{ borderRadius: 10 }} />
            <Skel h={44} style={{ borderRadius: 10 }} />
            {!mobile && <Skel h={44} style={{ borderRadius: 10 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
