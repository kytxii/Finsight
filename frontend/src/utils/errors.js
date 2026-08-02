// FastAPI sends `detail` as a string for HTTPException, but as an array of
// validation-error objects for 422s. Storing that array in state and rendering
// it directly throws "Objects are not valid as a React child" and unmounts the
// tree, so always coerce to a string before it reaches a component. (#47)
export const errorMessage = (err, fallback = "Something went wrong") => {
  const detail = err?.response?.data?.detail;

  if (typeof detail === "string" && detail) return detail;

  if (Array.isArray(detail)) {
    const messages = detail.map((d) => d?.msg).filter(Boolean);
    if (messages.length) return messages.join(", ");
  }

  return fallback;
};
