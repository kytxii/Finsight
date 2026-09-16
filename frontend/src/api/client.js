import axios from "axios";
import {
  reportReachable,
  reportUnreachable,
  isUnreachableError,
} from "../utils/connectivity";
import { clearResponses } from "./offline/db";

// Free-tier Render spins the service down after ~15 min idle, and waking it
// takes roughly 50 seconds. Before this the instance had no timeout at all, so
// a cold start left the UI on skeletons indefinitely with nothing to show for
// it. Long enough to ride out a genuine wake-up, short enough that a truly
// dead backend gives up rather than hanging forever (#204).
const REQUEST_TIMEOUT_MS = 60000;

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

client.interceptors.response.use(
  (response) => {
    reportReachable();
    // Any successful write invalidates the read cache (#204). Centralised
    // here rather than per-endpoint so a new mutation can't forget to do it.
    if ((response.config?.method ?? "get").toLowerCase() !== "get") {
      clearResponses();
    }
    return response;
  },
  async (error) => {
    const original = error.config;

    // Every failure feeds the connectivity tracker, including ones handled
    // below - a 401 still proves the backend answered.
    if (isUnreachableError(error)) {
      reportUnreachable();
    } else {
      reportReachable();
    }

    // Don't intercept auth endpoints or already-retried requests
    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.includes("/auth/")
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return client(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const res = await axios.post(
        `${client.defaults.baseURL}/auth/refresh`,
        {},
        { withCredentials: true, timeout: REQUEST_TIMEOUT_MS }
      );
      const newToken = res.data.access_token;
      localStorage.setItem("token", newToken);
      reportReachable();
      processQueue(null, newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return client(original);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // A refresh that couldn't reach the backend says nothing about whether
      // the session is still valid. Previously any failure here wiped the
      // token and bounced to /login - so a suspended or cold-starting Render
      // logged the user out and dropped them on a login page that also
      // couldn't work, locking them out of their own data (#204). Keep the
      // session; let the caller handle the failure.
      if (isUnreachableError(refreshError)) {
        reportUnreachable();
        return Promise.reject(refreshError);
      }

      // The backend answered and rejected the refresh - the session really is
      // gone, so clearing it and redirecting is correct.
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default client;
