import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { HOME_BG, HOME_SURFACE, HOME_TEXT, HOME_MUTED, HOME_DIVIDER } from "../components/categoryVisuals";
import { LOADING_SYMBOLS as SYMBOLS, LOADING_PHRASES as PHRASES } from "../utils/authFlavor";

// Dark-only, pinned to the app's jade/teal theme (matches Login + the mobile
// dashboard). No light/dark branching on these pages by design.
const ACCENT = "#14b8a6";        // teal — primary action, focus, "met"/strong
const ACCENT_TEXT = "#04140f";   // near-black text on a jade fill
const ACCENT_DEEP = "#0f766e";   // deep teal for the ambient glow
const FIELD = "#08131a";         // input background, a step below the card

const FIELD_LABELS = {
  first_name: "First name",
  last_name: "Last name",
  email_address: "Email",
  password: "Password",
};

const MSG_MAP = {
  string_too_short: (ctx) => `must be at least ${ctx?.min_length} characters`,
  string_too_long: (ctx) => `must be at most ${ctx?.max_length} characters`,
  value_error: () => "is invalid",
};

function getPasswordStrength(pw) {
  const checks = [pw.length >= 8, pw.length >= 12, /\d/.test(pw), /[^a-zA-Z0-9]/.test(pw)];
  const score = checks.filter(Boolean).length;
  const levels = [
    null,
    { label: "Weak", color: "#ef5350" },
    { label: "Fair", color: "#fb8c00" },
    { label: "Good", color: "#fdd835" },
    { label: "Strong", color: ACCENT },
  ];
  return { score, ...(levels[score] ?? { label: "", color: "transparent" }) };
}

const EyeIcon = ({ off }) => off ? (
  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
) : (
  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);

export default function Register() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [symbolIdx, setSymbolIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) return;
    const symInt = setInterval(() => setSymbolIdx((i) => (i + 1) % SYMBOLS.length), 100);
    return () => clearInterval(symInt);
  }, [loading]);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (/\s/.test(password)) { setError("Password cannot contain whitespaces."); return; }
    if (!/\d/.test(password)) { setError("Password must contain at least one number."); return; }
    if (!/[^a-zA-Z0-9]/.test(password)) { setError("Password must contain at least one special character."); return; }

    setError(null);
    setLoading(true);
    setPhraseIdx(Math.floor(Math.random() * PHRASES.length));

    try {
      await client.post("/auth/register", {
        first_name: firstName,
        last_name: lastName,
        email_address: email,
        password,
      });
      navigate("/login");
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      setLoading(false);
      if (status === 403) {
        setError("Registration is closed.");
      } else if (status === 422 && Array.isArray(detail)) {
        const first = detail[0];
        const field = FIELD_LABELS[first.loc?.[1]] ?? first.loc?.[1];
        const msg = MSG_MAP[first.type]?.(first.ctx) ?? first.msg;
        setError(`${field} ${msg}.`);
      } else {
        setError("Something went wrong. Try again.");
      }
    }
  };

  const labelStyle = { fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: HOME_MUTED };
  const fieldWrap = { display: "flex", flexDirection: "column", gap: "7px" };
  const fieldStyle = {
    padding: "11px 12px", borderRadius: "10px", border: `1px solid ${HOME_DIVIDER}`,
    backgroundColor: FIELD, color: HOME_TEXT, fontSize: "15px", outline: "none",
    width: "100%", boxSizing: "border-box", transition: "border-color 0.15s",
  };
  const focusOn = (e) => { e.target.style.borderColor = ACCENT; };
  const focusOff = (e) => { e.target.style.borderColor = HOME_DIVIDER; };
  const eyeBtnStyle = { position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: HOME_MUTED, display: "flex" };

  return (
    <>
      <style>{`
        @keyframes btn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes finsight-float-1 {
          0%   { transform: translate(0px,   0px)   scale(1);    }
          33%  { transform: translate(40px,  -30px) scale(1.08); }
          66%  { transform: translate(-20px, 25px)  scale(0.95); }
          100% { transform: translate(0px,   0px)   scale(1);    }
        }
        @keyframes finsight-float-2 {
          0%   { transform: translate(0px,  0px)   scale(1);    }
          40%  { transform: translate(-35px, 20px) scale(1.06); }
          70%  { transform: translate(25px, -40px) scale(0.97); }
          100% { transform: translate(0px,  0px)   scale(1);    }
        }
        @keyframes finsight-float-3 {
          0%   { transform: translate(0px,   0px)  scale(1);    }
          50%  { transform: translate(20px,  35px) scale(1.05); }
          100% { transform: translate(0px,   0px)  scale(1);    }
        }
        @keyframes finsight-grid-fade { 0%, 100% { opacity: 0.04; } 50% { opacity: 0.08; } }
        @keyframes strength-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      `}</style>

      {/* Full-screen ambient background */}
      <div style={{ position: "fixed", inset: 0, backgroundColor: HOME_BG, overflow: "hidden", zIndex: 0 }}>
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `radial-gradient(circle, ${ACCENT} 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
            animation: "finsight-grid-fade 8s ease-in-out infinite",
          }}
        />
        {/* Glow blobs use fixed px sizes + corner-anchored px offsets so the
            ambient background reads the same on a phone and a 4K monitor
            (vw units made them balloon/shrink per screen). */}
        {/* Jade glow, top-right */}
        <div style={{ position: "absolute", top: "-160px", right: "-160px", width: "620px", height: "620px", borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}24 0%, transparent 70%)`, filter: "blur(48px)", animation: "finsight-float-1 18s ease-in-out infinite" }} />
        {/* Deep-teal glow, bottom-left */}
        <div style={{ position: "absolute", bottom: "-180px", left: "-140px", width: "520px", height: "520px", borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT_DEEP}55 0%, transparent 70%)`, filter: "blur(56px)", animation: "finsight-float-2 22s ease-in-out infinite" }} />
        {/* Faint surface glow, center-left */}
        <div style={{ position: "absolute", top: "34%", left: "-40px", width: "360px", height: "360px", borderRadius: "50%", background: `radial-gradient(circle, ${HOME_SURFACE}cc 0%, transparent 70%)`, filter: "blur(40px)", animation: "finsight-float-3 15s ease-in-out infinite" }} />
      </div>

      {/* Scroll-safe centered wrapper (#20) */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", padding: "24px 16px" }}>
        <div
          style={{
            width: "100%", maxWidth: "440px",
            padding: "clamp(28px, 6vw, 40px)",
            borderRadius: "20px",
            backgroundColor: HOME_SURFACE,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ marginBottom: "26px" }}>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", color: HOME_TEXT }}>Finsight</h1>
            <p style={{ margin: "6px 0 0", fontSize: "15px", color: HOME_MUTED }}>Create your account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ ...fieldWrap, flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>First name</label>
                <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} onFocus={focusOn} onBlur={focusOff} style={fieldStyle} />
              </div>
              <div style={{ ...fieldWrap, flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>Last name</label>
                <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} onFocus={focusOn} onBlur={focusOff} style={fieldStyle} />
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} onFocus={focusOn} onBlur={focusOff} style={fieldStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} onFocus={focusOn} onBlur={focusOff} style={{ ...fieldStyle, paddingRight: "40px" }} />
                <button type="button" onClick={() => setShowPassword((p) => !p)} style={eyeBtnStyle}><EyeIcon off={showPassword} /></button>
              </div>

              {password.length > 0 && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ position: "relative", height: "4px", borderRadius: "4px", backgroundColor: HOME_DIVIDER, overflow: "hidden" }}>
                    <div
                      style={{
                        position: "absolute", inset: "0 auto 0 0",
                        width: `${(strength.score / 4) * 100}%`, borderRadius: "4px",
                        background: strength.score === 4 ? `linear-gradient(90deg, ${ACCENT}, #5fd6c8, ${ACCENT})` : strength.color,
                        backgroundSize: "200% auto",
                        animation: strength.score === 4 ? "strength-shimmer 2s linear infinite" : "none",
                        transition: "width 0.35s ease, background-color 0.35s ease",
                      }}
                    />
                  </div>
                  <p style={{ margin: "5px 0 0", fontSize: "11px", color: strength.color, fontWeight: 600, transition: "color 0.35s ease" }}>{strength.label}</p>
                  <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${HOME_DIVIDER}`, backgroundColor: FIELD, display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      { label: "At least 8 characters", met: password.length >= 8 },
                      { label: "At least one number", met: /\d/.test(password) },
                      { label: "At least one special character", met: /[^a-zA-Z0-9]/.test(password) },
                      { label: "No whitespaces", met: !/\s/.test(password) },
                    ].map(({ label, met }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={met ? ACCENT : HOME_DIVIDER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "stroke 0.2s ease" }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span style={{ fontSize: "11.5px", color: met ? ACCENT : HOME_MUTED, transition: "color 0.2s ease" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Confirm Password</label>
              <div style={{ position: "relative" }}>
                <input type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onFocus={focusOn} onBlur={focusOff} style={{ ...fieldStyle, paddingRight: "40px" }} />
                <button type="button" onClick={() => setShowConfirmPassword((p) => !p)} style={eyeBtnStyle}><EyeIcon off={showConfirmPassword} /></button>
              </div>
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: "12.5px", color: "var(--category-expense)" }}>{error}</p>
            )}

            <button type="submit" disabled={loading}
              style={{
                position: "relative", padding: "12px 16px", borderRadius: "10px", border: "none",
                backgroundColor: ACCENT, color: ACCENT_TEXT, fontSize: "15px", fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", transition: "filter 0.15s", opacity: 1, width: "100%",
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.filter = "brightness(1.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
            >
              <span style={{ opacity: loading ? 0 : 1 }}>Create account</span>
              {loading && (
                <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ animation: "btn-spin 0.8s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </button>

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "15px", color: ACCENT, width: "16px", textAlign: "center", flexShrink: 0, fontFamily: "monospace", lineHeight: 1 }}>{SYMBOLS[symbolIdx]}</span>
                <span style={{ fontSize: "12.5px", color: HOME_MUTED }}>{PHRASES[phraseIdx]}</span>
              </div>
            )}

            <p style={{ margin: 0, fontSize: "13.5px", textAlign: "center", color: HOME_MUTED }}>
              Already have an account?{" "}
              <a href="/login" style={{ color: ACCENT, textDecoration: "none", fontWeight: 700, transition: "filter 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.28)"}
                onMouseLeave={e => e.currentTarget.style.filter = "none"}
              >Sign in</a>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
