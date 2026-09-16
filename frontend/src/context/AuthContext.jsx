import { createContext, useContext, useState, useEffect } from "react";
import { initDemo, clearDemo } from "../api/demoStore";
import { clearAllCached } from "../utils/pageCache";
import { clearAllCached as clearOfflineCache } from "../api/offline/db";
import client from "../api/client";

const AuthContext = createContext(null);

const DEMO_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="50" fill="#6b7280"/>' +
      '<circle cx="50" cy="36" r="19" fill="#f3f4f6"/>' +
      '<path d="M12 100 Q12 62 50 62 Q88 62 88 100 Z" fill="#f3f4f6"/>' +
      "</svg>",
  );

const DEMO_USER = {
  first_name: "John",
  last_name: "Smith",
  email_address: "@finsight.app",
  avatar: DEMO_AVATAR,
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    if (localStorage.getItem("demo") === "true") return DEMO_USER;
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [initializing, setInitializing] = useState(
    !localStorage.getItem("token") && localStorage.getItem("demo") !== "true",
  );

  const _setSession = (newToken, userData) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const login = (newToken, userData) => {
    clearDemo();
    clearAllCached();
    // IndexedDB survives the tab closing, so a stale entry here would seed the
    // next account's session with the previous user's financial data on a
    // shared device (#204) - the durable version of the pageCache bug.
    clearOfflineCache();
    _setSession(newToken, userData);
  };

  const logout = async () => {
    try {
      await client.post("/auth/logout");
    } catch {
      // clear client state
    }
    clearDemo();
    clearAllCached();
    clearOfflineCache();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  const enterDemoMode = () => {
    clearDemo();
    clearAllCached();
    clearOfflineCache();
    localStorage.setItem("demo", "true");
    initDemo();
    setToken("demo");
    setUser(DEMO_USER);
  };

  const isDemo = () => localStorage.getItem("demo") === "true";

  // On startup: if no token, try to restore session via refresh cookie
  useEffect(() => {
    if (isDemo()) return;

    if (!localStorage.getItem("token")) {
      client
        .post("/auth/refresh")
        .then((res) => {
          const newToken = res.data.access_token;
          localStorage.setItem("token", newToken);
          setToken(newToken);
          return client.get("/users/me", {
            headers: { Authorization: `Bearer ${newToken}` },
          });
        })
        .then((res) => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
        })
        .catch(() => {
          // No valid refresh cookie is the normal case for a logged-out
          // visitor, not a failure to surface (#175) - falling through to
          // the login page (via finally below) is already the right outcome.
        })
        .finally(() => setInitializing(false));
    } else {
      // Sync user profile from server on startup
      client
        .get("/users/me")
        .then((res) => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
        })
        .catch((err) => {
          // Unlike the branch above, a token existing but this failing is a
          // genuine error (network blip, 500, ...), not an expected outcome.
          // There's no panel to show it in this early in bootstrap, so this
          // logs rather than staying fully silent (#175) - the app keeps
          // running on the localStorage-cached profile set at mount above.
          console.error("Failed to sync user profile on startup:", err);
        });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        setUser,
        login,
        logout,
        enterDemoMode,
        isDemo,
        initializing,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
