import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { HOME_BG, HOME_SURFACE, HOME_TEXT, HOME_MUTED, HOME_DIVIDER } from "../components/categoryVisuals";
import { LOADING_SYMBOLS as SYMBOLS, LOADING_PHRASES as PHRASES } from "../utils/authFlavor";
import { Wordmark } from "../components/Logo";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

// Dark-only, pinned to the app's jade/teal theme (matches the mobile dashboard
// screens). No light/dark branching on these pages by design.
const ACCENT = "#14b8a6";        // teal — primary action + focus
const ACCENT_TEXT = "#04140f";   // near-black text on a jade fill
const ACCENT_DEEP = "#0f766e";   // deep teal for the ambient glow
const FIELD = "#08131a";         // input background, a step below the card

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Seed any OAuth error passed back via ?error= at first render, then strip it
  // from the URL as a side effect.
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("error"));
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  const [symbolIdx, setSymbolIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const { login, enterDemoMode } = useAuth();

  // Cycle the little symbol while a request is loading (interval callback only,
  // so no synchronous setState in the effect body).
  useEffect(() => {
    if (!loading) return;
    const symInt = setInterval(() => setSymbolIdx((i) => (i + 1) % SYMBOLS.length), 100);
    return () => clearInterval(symInt);
  }, [loading]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error")) {
      window.history.replaceState({}, "", "/login");
    }
  }, []);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || rateLimited) return;
    setLoading(true);
    setError(null);
    setPhraseIdx(Math.floor(Math.random() * PHRASES.length));

    const attempt = async () => {
      try {
        const res = await client.post("/auth/login", { email_address: email, password, remember_me: rememberMe });
        const token = res.data.access_token;
        const meRes = await client.get("/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        login(token, meRes.data);
        navigate("/");
      } catch (err) {
        if (err.response?.status === 429) {
          setLoading(false);
          setRateLimited(true);
          setAttempts(0);
          setCountdown(30);
          setError("Too many attempts.");
          const interval = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                setRateLimited(false);
                setError(null);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else if (!err.response || err.response.status >= 500) {
          setLoading(false);
          setError("Something went wrong. Please try again.");
        } else {
          setLoading(false);
          setAttempts((prev) => prev + 1);
          setError("Invalid email or password.");
        }
      }
    };

    attempt();
  };

  const labelStyle = { fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: HOME_MUTED };
  const fieldStyle = {
    padding: "11px 12px", borderRadius: "10px", border: `1px solid ${HOME_DIVIDER}`,
    backgroundColor: FIELD, color: HOME_TEXT, fontSize: "15px", outline: "none",
    width: "100%", boxSizing: "border-box", transition: "border-color 0.15s",
  };
  const focusOn = (e) => { e.target.style.borderColor = ACCENT; };
  const focusOff = (e) => { e.target.style.borderColor = HOME_DIVIDER; };
  const oauthBtnStyle = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    padding: "10px 12px", borderRadius: "10px", border: `1px solid ${HOME_DIVIDER}`,
    backgroundColor: "transparent", color: HOME_TEXT, fontSize: "14px", fontWeight: 500,
    cursor: "pointer", transition: "background-color 0.15s, border-color 0.15s",
  };
  const oauthHover = (e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; };
  const oauthLeave = (e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = HOME_DIVIDER; };

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
        {/* Jade glow, top-left */}
        <div
          style={{
            position: "absolute", top: "-160px", left: "-160px", width: "620px", height: "620px",
            borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}24 0%, transparent 70%)`,
            filter: "blur(48px)", animation: "finsight-float-1 18s ease-in-out infinite",
          }}
        />
        {/* Deep-teal glow, bottom-right */}
        <div
          style={{
            position: "absolute", bottom: "-180px", right: "-140px", width: "520px", height: "520px",
            borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT_DEEP}55 0%, transparent 70%)`,
            filter: "blur(56px)", animation: "finsight-float-2 22s ease-in-out infinite",
          }}
        />
        {/* Faint surface glow, center-right */}
        <div
          style={{
            position: "absolute", top: "34%", right: "-40px", width: "360px", height: "360px",
            borderRadius: "50%", background: `radial-gradient(circle, ${HOME_SURFACE}cc 0%, transparent 70%)`,
            filter: "blur(40px)", animation: "finsight-float-3 15s ease-in-out infinite",
          }}
        />
      </div>

      {/* Scroll-safe centered wrapper — keeps tall forms from clipping on short
          viewports and lets the card scale on large screens (#20). */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflowY: "auto", padding: "24px 16px",
        }}
      >
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
            <Wordmark size={32} textSize={28} />
            <p style={{ margin: "10px 0 0", fontSize: "15px", color: HOME_MUTED }}>Sign in to your account</p>
          </div>

          <form onSubmit={rateLimited ? (e) => e.preventDefault() : handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              <label style={labelStyle}>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} onFocus={focusOn} onBlur={focusOff} style={fieldStyle} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} onFocus={focusOn} onBlur={focusOff}
                  style={{ ...fieldStyle, padding: "11px 40px 11px 12px" }}
                />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: HOME_MUTED, display: "flex" }}
                >
                  {showPassword
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              />
              <span aria-hidden="true" style={{
                width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                border: `1.5px solid ${rememberMe ? ACCENT : HOME_DIVIDER}`,
                backgroundColor: rememberMe ? ACCENT : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background-color 0.15s, border-color 0.15s",
              }}>
                {rememberMe && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT_TEXT} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                )}
              </span>
              <span style={{ fontSize: "13px", color: HOME_MUTED }}>Remember me for 7 days</span>
            </label>

            {error && (
              <p style={{ margin: 0, fontSize: "12.5px", color: "var(--category-expense)", display: "flex", justifyContent: "space-between" }}>
                <span>{error}{rateLimited && countdown > 0 ? ` Retry in ${countdown}s.` : ""}</span>
                {!rateLimited && attempts > 0 && <span style={{ opacity: 0.6 }}>{attempts}/5</span>}
              </p>
            )}

            <button type="submit" disabled={rateLimited || loading}
              style={{
                position: "relative", padding: "12px 16px", borderRadius: "10px", border: "none",
                backgroundColor: ACCENT, color: ACCENT_TEXT, fontSize: "15px", fontWeight: 700,
                cursor: rateLimited || loading ? "not-allowed" : "pointer", transition: "filter 0.15s, opacity 0.15s",
                opacity: rateLimited ? 0.4 : 1, textDecoration: rateLimited ? "line-through" : "none",
              }}
              onMouseEnter={e => { if (!rateLimited && !loading) e.currentTarget.style.filter = "brightness(1.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
            >
              <span style={{ opacity: loading ? 0 : 1 }}>Sign in</span>
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
              Don't have an account?{" "}
              <a href="/register" style={{ opacity: rateLimited ? 0.35 : 1, color: ACCENT, textDecoration: "none", fontWeight: 700, pointerEvents: rateLimited ? "none" : "auto", transition: "filter 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.28)"}
                onMouseLeave={e => e.currentTarget.style.filter = "none"}
              >Register</a>
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "2px 0" }}>
              <div style={{ flex: 1, height: "1px", backgroundColor: HOME_DIVIDER }} />
              <span style={{ fontSize: "11px", color: HOME_MUTED }}>or</span>
              <div style={{ flex: 1, height: "1px", backgroundColor: HOME_DIVIDER }} />
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => { window.location.href = `${API_BASE}/auth/google/login`; }} style={oauthBtnStyle} onMouseEnter={oauthHover} onMouseLeave={oauthLeave}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.12-1.43.34-2.09V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.06l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
                Google
              </button>
              <button type="button" onClick={() => { window.location.href = `${API_BASE}/auth/github/login`; }} style={oauthBtnStyle} onMouseEnter={oauthHover} onMouseLeave={oauthLeave}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.53-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.12 3.06.74.8 1.18 1.83 1.18 3.09 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A10.51 10.51 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5z"/>
                </svg>
                GitHub
              </button>
            </div>

            <button type="button" onClick={() => { enterDemoMode(); navigate("/"); }}
              style={{ padding: "10px 16px", borderRadius: "10px", border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "transparent", color: HOME_MUTED, fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "color 0.15s, border-color 0.15s, background-color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = HOME_TEXT; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = HOME_MUTED; e.currentTarget.style.borderColor = HOME_DIVIDER; e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              Try Demo
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
