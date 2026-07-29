// Purely-visual flavor shown while an auth request is in flight (like the button
// spinner). One random phrase per attempt, no retry / cold-start logic. Shared by
// Login and Register.
export const LOADING_SYMBOLS = ["·", "✢", "✣", "✤", "✥", "✦", "✧", "✩", "✦", "✥", "✤", "✣", "✢", "·"];

export const LOADING_PHRASES = [
  "Coaxing the server out of bed…",
  "Sending the server a strongly worded email…",
  "Bribing the cloud with extra RAM…",
  "Waking up the server…",
  "Brewing the coffee…",
  "Warming up the engines…",
  "Spinning up containers…",
  "Tying the server's shoes…",
  "Loading the database…",
  "Hitting snooze one more time…",
  "Almost ready…",
  "Negotiating with the cloud…",
  "Poking the backend with a stick…",
];
