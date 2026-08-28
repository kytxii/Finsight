import client from "./client";

export const updateUser = (data) => client.patch("/users/me", data);
export const deleteUser = () => client.delete("/users/me");

// Connections (#25) - link/unlink Google/GitHub on an already logged-in
// account. Not demo-branched here, same convention as updateUser/deleteUser
// above - AccountPanel checks isDemo() itself and shows a disabled state.
export const getConnections = () => client.get("/users/me/connections");
export const startLinkProvider = (provider) => client.post(`/users/me/connections/${provider}/start`);
export const unlinkProvider = (provider) => client.delete(`/users/me/connections/${provider}`);
