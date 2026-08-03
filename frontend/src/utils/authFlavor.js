// Purely-visual flavor shown while an auth request is in flight (like the button
// spinner). One random phrase per attempt, no retry / cold-start logic. Shared by
// Login, Register, and the import AI-cleanup button (symbols only, no phrase there).
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

// Same treatment for reading an uploaded statement — this is local parsing,
// not a server cold-start, so it gets its own file-flavored set of phrases.
export const IMPORT_LOADING_PHRASES = [
  "Unpacking the file…",
  "Skimming the statement…",
  "Counting your coffee runs…",
  "Deciphering bank-speak…",
  "Untangling the spreadsheet…",
  "Squinting at tiny bank fonts…",
  "Sorting the receipts…",
  "Cross-referencing your latte habit…",
  "Parsing line by line…",
  "Reading the fine print…",
];
