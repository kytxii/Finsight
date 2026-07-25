// ── Keys ──────────────────────────────────────────────────────────────────────
const TX_KEY = "demo_transactions";
const RP_KEY = "demo_recurring";
const PS_KEY = "demo_paycheck_schedules";
const PC_KEY = "demo_paychecks";
const BA_KEY = "demo_balance_anchor";
const RES_KEY = "demo_spending_reserve";

// ── Helpers ───────────────────────────────────────────────────────────────────
const getAll  = (key)       => JSON.parse(localStorage.getItem(key) || "[]");
const saveAll = (key, data) => localStorage.setItem(key, JSON.stringify(data));
const respond = (data)      => Promise.resolve({ data });
let   _id     = 1000;
const nextId  = ()          => `demo-${++_id}`;

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_TRANSACTIONS = [
  // May 2025
  { id: "demo-t-1",   name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-05-01" },
  { id: "demo-t-2",   name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-05-01" },
  { id: "demo-t-3",   name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-05-01" },
  { id: "demo-t-4",   name: "Groceries",             amount: "98.40",   category: "EXPENSE",      transaction_date: "2025-05-03" },
  { id: "demo-t-5",   name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-05-05" },
  { id: "demo-t-6",   name: "Gas",                   amount: "52.10",   category: "EXPENSE",      transaction_date: "2025-05-07" },
  { id: "demo-t-7",   name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-05-10" },
  { id: "demo-t-8",   name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-05-11" },
  { id: "demo-t-9",   name: "Dinner Out",            amount: "48.20",   category: "EXPENSE",      transaction_date: "2025-05-13" },
  { id: "demo-t-10",  name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-05-15" },
  { id: "demo-t-11",  name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-05-15" },
  { id: "demo-t-12",  name: "Groceries",             amount: "82.60",   category: "EXPENSE",      transaction_date: "2025-05-17" },
  { id: "demo-t-13",  name: "Amazon",                amount: "43.99",   category: "EXPENSE",      transaction_date: "2025-05-19" },
  { id: "demo-t-14",  name: "Electric",              amount: "91.50",   category: "BILL",         transaction_date: "2025-05-20" },
  { id: "demo-t-15",  name: "Pharmacy",              amount: "22.30",   category: "EXPENSE",      transaction_date: "2025-05-22" },
  { id: "demo-t-16",  name: "Lunch",                 amount: "16.80",   category: "EXPENSE",      transaction_date: "2025-05-24" },
  { id: "demo-t-17",  name: "Freelance",             amount: "400.00",  category: "INCOME",       transaction_date: "2025-05-25" },
  { id: "demo-t-18",  name: "Cash",                  amount: "20.00",   category: "TIPS",         transaction_date: "2025-05-26" },
  { id: "demo-t-19",  name: "Clothing",              amount: "75.00",   category: "EXPENSE",      transaction_date: "2025-05-27" },
  { id: "demo-t-20",  name: "Savings Transfer",      amount: "500.00",  category: "SAVINGS",      transaction_date: "2025-05-28" },
  // June 2025
  { id: "demo-t-21",  name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-06-01" },
  { id: "demo-t-22",  name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-06-01" },
  { id: "demo-t-23",  name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-06-01" },
  { id: "demo-t-24",  name: "Groceries",             amount: "94.20",   category: "EXPENSE",      transaction_date: "2025-06-03" },
  { id: "demo-t-25",  name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-06-05" },
  { id: "demo-t-26",  name: "Gas",                   amount: "58.40",   category: "EXPENSE",      transaction_date: "2025-06-07" },
  { id: "demo-t-27",  name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-06-10" },
  { id: "demo-t-28",  name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-06-11" },
  { id: "demo-t-29",  name: "BBQ Supplies",          amount: "67.30",   category: "EXPENSE",      transaction_date: "2025-06-14" },
  { id: "demo-t-30",  name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-06-15" },
  { id: "demo-t-31",  name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-06-15" },
  { id: "demo-t-32",  name: "Groceries",             amount: "88.90",   category: "EXPENSE",      transaction_date: "2025-06-18" },
  { id: "demo-t-33",  name: "Electric",              amount: "78.20",   category: "BILL",         transaction_date: "2025-06-20" },
  { id: "demo-t-34",  name: "Uber",                  amount: "22.50",   category: "EXPENSE",      transaction_date: "2025-06-21" },
  { id: "demo-t-35",  name: "Concert Tickets",       amount: "85.00",   category: "EXPENSE",      transaction_date: "2025-06-22" },
  { id: "demo-t-36",  name: "Freelance",             amount: "600.00",  category: "INCOME",       transaction_date: "2025-06-23" },
  { id: "demo-t-37",  name: "Amazon",                amount: "31.49",   category: "EXPENSE",      transaction_date: "2025-06-24" },
  { id: "demo-t-38",  name: "Dinner Out",            amount: "56.80",   category: "EXPENSE",      transaction_date: "2025-06-26" },
  { id: "demo-t-39",  name: "Beach Supplies",        amount: "38.50",   category: "EXPENSE",      transaction_date: "2025-06-27" },
  { id: "demo-t-40",  name: "Savings Transfer",      amount: "550.00",  category: "SAVINGS",      transaction_date: "2025-06-28" },
  // July 2025
  { id: "demo-t-41",  name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-07-01" },
  { id: "demo-t-42",  name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-07-01" },
  { id: "demo-t-43",  name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-07-01" },
  { id: "demo-t-44",  name: "Groceries",             amount: "102.30",  category: "EXPENSE",      transaction_date: "2025-07-03" },
  { id: "demo-t-45",  name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-07-05" },
  { id: "demo-t-46",  name: "Gas",                   amount: "61.20",   category: "EXPENSE",      transaction_date: "2025-07-08" },
  { id: "demo-t-47",  name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-07-10" },
  { id: "demo-t-48",  name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-07-12" },
  { id: "demo-t-49",  name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-07-15" },
  { id: "demo-t-50",  name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-07-15" },
  { id: "demo-t-51",  name: "Groceries",             amount: "79.40",   category: "EXPENSE",      transaction_date: "2025-07-16" },
  { id: "demo-t-52",  name: "Electric",              amount: "105.60",  category: "BILL",         transaction_date: "2025-07-20" },
  { id: "demo-t-53",  name: "Vacation Hotel",        amount: "320.00",  category: "EXPENSE",      transaction_date: "2025-07-22" },
  { id: "demo-t-54",  name: "Vacation Food",         amount: "145.80",  category: "EXPENSE",      transaction_date: "2025-07-23" },
  { id: "demo-t-55",  name: "Amazon",                amount: "54.99",   category: "EXPENSE",      transaction_date: "2025-07-21" },
  { id: "demo-t-56",  name: "Pharmacy",              amount: "18.90",   category: "EXPENSE",      transaction_date: "2025-07-25" },
  { id: "demo-t-57",  name: "Gas",                   amount: "48.30",   category: "EXPENSE",      transaction_date: "2025-07-26" },
  { id: "demo-t-58",  name: "Cash",                  amount: "25.00",   category: "TIPS",         transaction_date: "2025-07-27" },
  { id: "demo-t-59",  name: "Dinner Out",            amount: "72.30",   category: "EXPENSE",      transaction_date: "2025-07-28" },
  { id: "demo-t-60",  name: "Savings Transfer",      amount: "300.00",  category: "SAVINGS",      transaction_date: "2025-07-28" },
  // August 2025
  { id: "demo-t-61",  name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-08-01" },
  { id: "demo-t-62",  name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-08-01" },
  { id: "demo-t-63",  name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-08-01" },
  { id: "demo-t-64",  name: "Groceries",             amount: "91.70",   category: "EXPENSE",      transaction_date: "2025-08-04" },
  { id: "demo-t-65",  name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-08-05" },
  { id: "demo-t-66",  name: "Gas",                   amount: "55.80",   category: "EXPENSE",      transaction_date: "2025-08-07" },
  { id: "demo-t-67",  name: "School Supplies",       amount: "88.50",   category: "EXPENSE",      transaction_date: "2025-08-09" },
  { id: "demo-t-68",  name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-08-10" },
  { id: "demo-t-69",  name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-08-12" },
  { id: "demo-t-70",  name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-08-15" },
  { id: "demo-t-71",  name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-08-15" },
  { id: "demo-t-72",  name: "Groceries",             amount: "84.20",   category: "EXPENSE",      transaction_date: "2025-08-17" },
  { id: "demo-t-73",  name: "Electric",              amount: "98.40",   category: "BILL",         transaction_date: "2025-08-20" },
  { id: "demo-t-74",  name: "Clothing",              amount: "112.00",  category: "EXPENSE",      transaction_date: "2025-08-23" },
  { id: "demo-t-75",  name: "Amazon",                amount: "29.99",   category: "EXPENSE",      transaction_date: "2025-08-21" },
  { id: "demo-t-76",  name: "Freelance",             amount: "350.00",  category: "INCOME",       transaction_date: "2025-08-26" },
  { id: "demo-t-77",  name: "Lunch",                 amount: "14.50",   category: "EXPENSE",      transaction_date: "2025-08-25" },
  { id: "demo-t-78",  name: "Dinner Out",            amount: "61.40",   category: "EXPENSE",      transaction_date: "2025-08-27" },
  { id: "demo-t-79",  name: "Pharmacy",              amount: "31.50",   category: "EXPENSE",      transaction_date: "2025-08-28" },
  { id: "demo-t-80",  name: "Savings Transfer",      amount: "450.00",  category: "SAVINGS",      transaction_date: "2025-08-28" },
  // September 2025
  { id: "demo-t-81",  name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-09-01" },
  { id: "demo-t-82",  name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-09-01" },
  { id: "demo-t-83",  name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-09-01" },
  { id: "demo-t-84",  name: "Groceries",             amount: "96.80",   category: "EXPENSE",      transaction_date: "2025-09-03" },
  { id: "demo-t-85",  name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-09-05" },
  { id: "demo-t-86",  name: "Gas",                   amount: "53.60",   category: "EXPENSE",      transaction_date: "2025-09-06" },
  { id: "demo-t-87",  name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-09-10" },
  { id: "demo-t-88",  name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-09-11" },
  { id: "demo-t-89",  name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-09-15" },
  { id: "demo-t-90",  name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-09-15" },
  { id: "demo-t-91",  name: "Groceries",             amount: "77.30",   category: "EXPENSE",      transaction_date: "2025-09-16" },
  { id: "demo-t-92",  name: "Electric",              amount: "88.70",   category: "BILL",         transaction_date: "2025-09-20" },
  { id: "demo-t-93",  name: "Amazon",                amount: "66.49",   category: "EXPENSE",      transaction_date: "2025-09-21" },
  { id: "demo-t-94",  name: "Dinner Out",            amount: "43.80",   category: "EXPENSE",      transaction_date: "2025-09-22" },
  { id: "demo-t-95",  name: "Accessories",           amount: "34.99",   category: "EXPENSE",      transaction_date: "2025-09-23" },
  { id: "demo-t-96",  name: "Freelance",             amount: "500.00",  category: "INCOME",       transaction_date: "2025-09-24" },
  { id: "demo-t-97",  name: "Uber",                  amount: "18.50",   category: "EXPENSE",      transaction_date: "2025-09-25" },
  { id: "demo-t-98",  name: "Medical",               amount: "75.00",   category: "EXPENSE",      transaction_date: "2025-09-26" },
  { id: "demo-t-99",  name: "Groceries",             amount: "68.90",   category: "EXPENSE",      transaction_date: "2025-09-27" },
  { id: "demo-t-100", name: "Savings Transfer",      amount: "500.00",  category: "SAVINGS",      transaction_date: "2025-09-28" },
  // October 2025
  { id: "demo-t-101", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-10-01" },
  { id: "demo-t-102", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-10-01" },
  { id: "demo-t-103", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-10-01" },
  { id: "demo-t-104", name: "Groceries",             amount: "89.50",   category: "EXPENSE",      transaction_date: "2025-10-04" },
  { id: "demo-t-105", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-10-05" },
  { id: "demo-t-106", name: "Gas",                   amount: "57.20",   category: "EXPENSE",      transaction_date: "2025-10-07" },
  { id: "demo-t-107", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-10-10" },
  { id: "demo-t-108", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-10-11" },
  { id: "demo-t-109", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-10-15" },
  { id: "demo-t-110", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-10-15" },
  { id: "demo-t-111", name: "Groceries",             amount: "93.10",   category: "EXPENSE",      transaction_date: "2025-10-16" },
  { id: "demo-t-112", name: "Electric",              amount: "82.30",   category: "BILL",         transaction_date: "2025-10-20" },
  { id: "demo-t-113", name: "Halloween Costumes",    amount: "64.00",   category: "EXPENSE",      transaction_date: "2025-10-21" },
  { id: "demo-t-114", name: "Amazon",                amount: "47.99",   category: "EXPENSE",      transaction_date: "2025-10-22" },
  { id: "demo-t-115", name: "Dinner Out",            amount: "58.60",   category: "EXPENSE",      transaction_date: "2025-10-24" },
  { id: "demo-t-116", name: "Pharmacy",              amount: "27.40",   category: "EXPENSE",      transaction_date: "2025-10-25" },
  { id: "demo-t-117", name: "Pumpkin Patch",         amount: "32.00",   category: "EXPENSE",      transaction_date: "2025-10-26" },
  { id: "demo-t-118", name: "Cash",                  amount: "20.00",   category: "TIPS",         transaction_date: "2025-10-27" },
  { id: "demo-t-119", name: "Clothing",              amount: "95.00",   category: "EXPENSE",      transaction_date: "2025-10-28" },
  { id: "demo-t-120", name: "Savings Transfer",      amount: "500.00",  category: "SAVINGS",      transaction_date: "2025-10-28" },
  // November 2025
  { id: "demo-t-121", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-11-01" },
  { id: "demo-t-122", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-11-01" },
  { id: "demo-t-123", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-11-01" },
  { id: "demo-t-124", name: "Groceries",             amount: "104.20",  category: "EXPENSE",      transaction_date: "2025-11-04" },
  { id: "demo-t-125", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-11-05" },
  { id: "demo-t-126", name: "Gas",                   amount: "51.90",   category: "EXPENSE",      transaction_date: "2025-11-07" },
  { id: "demo-t-127", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-11-10" },
  { id: "demo-t-128", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-11-11" },
  { id: "demo-t-129", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-11-15" },
  { id: "demo-t-130", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-11-15" },
  { id: "demo-t-131", name: "Groceries",             amount: "88.60",   category: "EXPENSE",      transaction_date: "2025-11-16" },
  { id: "demo-t-132", name: "Electric",              amount: "94.20",   category: "BILL",         transaction_date: "2025-11-20" },
  { id: "demo-t-133", name: "Dinner Out",            amount: "47.20",   category: "EXPENSE",      transaction_date: "2025-11-22" },
  { id: "demo-t-134", name: "Thanksgiving Groceries", amount: "143.50", category: "EXPENSE",      transaction_date: "2025-11-24" },
  { id: "demo-t-135", name: "Freelance",             amount: "450.00",  category: "INCOME",       transaction_date: "2025-11-25" },
  { id: "demo-t-136", name: "Gas",                   amount: "49.80",   category: "EXPENSE",      transaction_date: "2025-11-26" },
  { id: "demo-t-137", name: "Amazon",                amount: "89.99",   category: "EXPENSE",      transaction_date: "2025-11-21" },
  { id: "demo-t-138", name: "Black Friday",          amount: "212.00",  category: "EXPENSE",      transaction_date: "2025-11-28" },
  { id: "demo-t-139", name: "Pharmacy",              amount: "15.60",   category: "EXPENSE",      transaction_date: "2025-11-29" },
  { id: "demo-t-140", name: "Savings Transfer",      amount: "400.00",  category: "SAVINGS",      transaction_date: "2025-11-28" },
  // December 2025
  { id: "demo-t-141", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2025-12-01" },
  { id: "demo-t-142", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2025-12-01" },
  { id: "demo-t-143", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2025-12-01" },
  { id: "demo-t-144", name: "Groceries",             amount: "98.70",   category: "EXPENSE",      transaction_date: "2025-12-03" },
  { id: "demo-t-145", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2025-12-05" },
  { id: "demo-t-146", name: "Gas",                   amount: "54.60",   category: "EXPENSE",      transaction_date: "2025-12-07" },
  { id: "demo-t-147", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2025-12-10" },
  { id: "demo-t-148", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2025-12-11" },
  { id: "demo-t-149", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2025-12-15" },
  { id: "demo-t-150", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2025-12-15" },
  { id: "demo-t-151", name: "Groceries",             amount: "88.40",   category: "EXPENSE",      transaction_date: "2025-12-16" },
  { id: "demo-t-152", name: "Electric",              amount: "108.30",  category: "BILL",         transaction_date: "2025-12-20" },
  { id: "demo-t-153", name: "Christmas Gifts",       amount: "385.00",  category: "EXPENSE",      transaction_date: "2025-12-20" },
  { id: "demo-t-154", name: "Amazon",                amount: "67.49",   category: "EXPENSE",      transaction_date: "2025-12-21" },
  { id: "demo-t-155", name: "Freelance",             amount: "700.00",  category: "INCOME",       transaction_date: "2025-12-22" },
  { id: "demo-t-156", name: "Christmas Dinner",      amount: "94.80",   category: "EXPENSE",      transaction_date: "2025-12-25" },
  { id: "demo-t-157", name: "Dinner Out",            amount: "52.30",   category: "EXPENSE",      transaction_date: "2025-12-26" },
  { id: "demo-t-158", name: "Cash",                  amount: "30.00",   category: "TIPS",         transaction_date: "2025-12-27" },
  { id: "demo-t-159", name: "New Year Eve",          amount: "78.00",   category: "EXPENSE",      transaction_date: "2025-12-31" },
  { id: "demo-t-160", name: "Savings Transfer",      amount: "350.00",  category: "SAVINGS",      transaction_date: "2025-12-28" },
  // January 2026
  { id: "demo-t-161", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2026-01-01" },
  { id: "demo-t-162", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2026-01-01" },
  { id: "demo-t-163", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2026-01-01" },
  { id: "demo-t-164", name: "Groceries",             amount: "105.40",  category: "EXPENSE",      transaction_date: "2026-01-03" },
  { id: "demo-t-165", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2026-01-05" },
  { id: "demo-t-166", name: "Gas",                   amount: "55.20",   category: "EXPENSE",      transaction_date: "2026-01-08" },
  { id: "demo-t-167", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2026-01-10" },
  { id: "demo-t-168", name: "New Year Dinner",       amount: "72.50",   category: "EXPENSE",      transaction_date: "2026-01-12" },
  { id: "demo-t-169", name: "Cash",                  amount: "20.00",   category: "TIPS",         transaction_date: "2026-01-14" },
  { id: "demo-t-170", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2026-01-15" },
  { id: "demo-t-171", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2026-01-15" },
  { id: "demo-t-172", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2026-01-16" },
  { id: "demo-t-173", name: "Groceries",             amount: "88.90",   category: "EXPENSE",      transaction_date: "2026-01-18" },
  { id: "demo-t-174", name: "Electric",              amount: "98.20",   category: "BILL",         transaction_date: "2026-01-20" },
  { id: "demo-t-175", name: "Amazon",                amount: "156.99",  category: "EXPENSE",      transaction_date: "2026-01-22" },
  { id: "demo-t-176", name: "Pharmacy",              amount: "22.00",   category: "EXPENSE",      transaction_date: "2026-01-25" },
  { id: "demo-t-177", name: "Freelance",             amount: "500.00",  category: "INCOME",       transaction_date: "2026-01-26" },
  { id: "demo-t-178", name: "Clothing",              amount: "120.00",  category: "EXPENSE",      transaction_date: "2026-01-24" },
  { id: "demo-t-179", name: "Dinner Out",            amount: "54.30",   category: "EXPENSE",      transaction_date: "2026-01-30" },
  { id: "demo-t-180", name: "Savings Transfer",      amount: "600.00",  category: "SAVINGS",      transaction_date: "2026-01-28" },
  // February 2026
  { id: "demo-t-181", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2026-02-01" },
  { id: "demo-t-182", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2026-02-01" },
  { id: "demo-t-183", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2026-02-01" },
  { id: "demo-t-184", name: "Groceries",             amount: "95.60",   category: "EXPENSE",      transaction_date: "2026-02-04" },
  { id: "demo-t-185", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2026-02-05" },
  { id: "demo-t-186", name: "Valentine's Dinner",    amount: "85.00",   category: "EXPENSE",      transaction_date: "2026-02-07" },
  { id: "demo-t-187", name: "Gas",                   amount: "48.75",   category: "EXPENSE",      transaction_date: "2026-02-09" },
  { id: "demo-t-188", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2026-02-10" },
  { id: "demo-t-189", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2026-02-12" },
  { id: "demo-t-190", name: "Gift",                  amount: "65.00",   category: "EXPENSE",      transaction_date: "2026-02-14" },
  { id: "demo-t-191", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2026-02-15" },
  { id: "demo-t-192", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2026-02-15" },
  { id: "demo-t-193", name: "Groceries",             amount: "71.30",   category: "EXPENSE",      transaction_date: "2026-02-17" },
  { id: "demo-t-194", name: "Electric",              amount: "92.40",   category: "BILL",         transaction_date: "2026-02-20" },
  { id: "demo-t-195", name: "Amazon",                amount: "28.49",   category: "EXPENSE",      transaction_date: "2026-02-22" },
  { id: "demo-t-196", name: "Lunch",                 amount: "19.80",   category: "EXPENSE",      transaction_date: "2026-02-24" },
  { id: "demo-t-197", name: "Savings Transfer",      amount: "400.00",  category: "SAVINGS",      transaction_date: "2026-02-25" },
  { id: "demo-t-198", name: "Dinner Out",            amount: "39.50",   category: "EXPENSE",      transaction_date: "2026-02-26" },
  { id: "demo-t-199", name: "Pharmacy",              amount: "12.30",   category: "EXPENSE",      transaction_date: "2026-02-27" },
  { id: "demo-t-200", name: "Medical",               amount: "45.00",   category: "EXPENSE",      transaction_date: "2026-02-28" },
  // March 2026
  { id: "demo-t-201", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2026-03-01" },
  { id: "demo-t-202", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2026-03-01" },
  { id: "demo-t-203", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2026-03-01" },
  { id: "demo-t-204", name: "Groceries",             amount: "92.15",   category: "EXPENSE",      transaction_date: "2026-03-03" },
  { id: "demo-t-205", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2026-03-05" },
  { id: "demo-t-206", name: "Dinner Out",            amount: "45.80",   category: "EXPENSE",      transaction_date: "2026-03-07" },
  { id: "demo-t-207", name: "Gas",                   amount: "52.30",   category: "EXPENSE",      transaction_date: "2026-03-08" },
  { id: "demo-t-208", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2026-03-10" },
  { id: "demo-t-209", name: "Amazon",                amount: "34.99",   category: "EXPENSE",      transaction_date: "2026-03-12" },
  { id: "demo-t-210", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2026-03-14" },
  { id: "demo-t-211", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2026-03-15" },
  { id: "demo-t-212", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2026-03-15" },
  { id: "demo-t-213", name: "Groceries",             amount: "78.40",   category: "EXPENSE",      transaction_date: "2026-03-16" },
  { id: "demo-t-214", name: "Freelance",             amount: "350.00",  category: "INCOME",       transaction_date: "2026-03-18" },
  { id: "demo-t-215", name: "Electric",              amount: "85.00",   category: "BILL",         transaction_date: "2026-03-20" },
  { id: "demo-t-216", name: "Clothing",              amount: "89.99",   category: "EXPENSE",      transaction_date: "2026-03-22" },
  { id: "demo-t-217", name: "Pharmacy",              amount: "18.50",   category: "EXPENSE",      transaction_date: "2026-03-25" },
  { id: "demo-t-218", name: "Uber",                  amount: "16.50",   category: "EXPENSE",      transaction_date: "2026-03-27" },
  { id: "demo-t-219", name: "Dinner Out",            amount: "62.40",   category: "EXPENSE",      transaction_date: "2026-03-30" },
  { id: "demo-t-220", name: "Savings Transfer",      amount: "500.00",  category: "SAVINGS",      transaction_date: "2026-03-28" },
  // April 2026
  { id: "demo-t-221", name: "Salary",               amount: "4500.00", category: "INCOME",       transaction_date: "2026-04-01" },
  { id: "demo-t-222", name: "Rent",                  amount: "1200.00", category: "BILL",         transaction_date: "2026-04-01" },
  { id: "demo-t-223", name: "Spotify",               amount: "9.99",    category: "SUBSCRIPTION", transaction_date: "2026-04-01" },
  { id: "demo-t-224", name: "Groceries",             amount: "87.32",   category: "EXPENSE",      transaction_date: "2026-04-04" },
  { id: "demo-t-225", name: "Gym Membership",        amount: "40.00",   category: "SUBSCRIPTION", transaction_date: "2026-04-05" },
  { id: "demo-t-226", name: "Uber",                  amount: "14.50",   category: "EXPENSE",      transaction_date: "2026-04-08" },
  { id: "demo-t-227", name: "Internet",              amount: "60.00",   category: "BILL",         transaction_date: "2026-04-10" },
  { id: "demo-t-228", name: "Cash",                  amount: "20.00",   category: "TIPS",         transaction_date: "2026-04-10" },
  { id: "demo-t-229", name: "Coffee",                amount: "4.75",    category: "EXPENSE",      transaction_date: "2026-04-11" },
  { id: "demo-t-230", name: "Lunch",                 amount: "18.40",   category: "EXPENSE",      transaction_date: "2026-04-12" },
  { id: "demo-t-231", name: "Pharmacy",              amount: "23.10",   category: "EXPENSE",      transaction_date: "2026-04-14" },
  { id: "demo-t-232", name: "Netflix",               amount: "15.99",   category: "SUBSCRIPTION", transaction_date: "2026-04-15" },
  { id: "demo-t-233", name: "Student Loan",          amount: "250.00",  category: "DEBT",         transaction_date: "2026-04-15" },
  { id: "demo-t-234", name: "Groceries",             amount: "64.50",   category: "EXPENSE",      transaction_date: "2026-04-16" },
  { id: "demo-t-235", name: "Electric",              amount: "90.20",   category: "BILL",         transaction_date: "2026-04-20" },
  { id: "demo-t-236", name: "Amazon",                amount: "39.99",   category: "EXPENSE",      transaction_date: "2026-04-21" },
  { id: "demo-t-237", name: "Dinner Out",            amount: "55.60",   category: "EXPENSE",      transaction_date: "2026-04-22" },
  { id: "demo-t-238", name: "Freelance",             amount: "425.00",  category: "INCOME",       transaction_date: "2026-04-24" },
  { id: "demo-t-239", name: "Clothing",              amount: "68.00",   category: "EXPENSE",      transaction_date: "2026-04-25" },
  { id: "demo-t-240", name: "Savings Transfer",      amount: "450.00",  category: "SAVINGS",      transaction_date: "2026-04-28" },
  // May 2025 — extra
  { id: "demo-t-241", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2025-05-10" },
  { id: "demo-t-242", name: "DoorDash",              amount: "34.50",   category: "EXPENSE",      transaction_date: "2025-05-21" },
  { id: "demo-t-243", name: "Work Lunch Reimb.",     amount: "45.00",   category: "REIMBURSEMENT", transaction_date: "2025-05-23" },
  // June 2025 — extra
  { id: "demo-t-244", name: "Haircut",               amount: "28.00",   category: "EXPENSE",      transaction_date: "2025-06-09" },
  { id: "demo-t-245", name: "Movie Tickets",         amount: "32.00",   category: "EXPENSE",      transaction_date: "2025-06-20" },
  { id: "demo-t-246", name: "Travel Reimbursement",  amount: "120.00",  category: "REIMBURSEMENT", transaction_date: "2025-06-25" },
  // July 2025 — extra
  { id: "demo-t-247", name: "Parking",               amount: "18.00",   category: "EXPENSE",      transaction_date: "2025-07-05" },
  { id: "demo-t-248", name: "Car Wash",              amount: "22.00",   category: "EXPENSE",      transaction_date: "2025-07-19" },
  { id: "demo-t-249", name: "Medical Reimbursement", amount: "75.00",   category: "REIMBURSEMENT", transaction_date: "2025-07-30" },
  // August 2025 — extra
  { id: "demo-t-250", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2025-08-08" },
  { id: "demo-t-251", name: "Online Course",         amount: "49.00",   category: "EXPENSE",      transaction_date: "2025-08-18" },
  { id: "demo-t-252", name: "Expense Reimbursement", amount: "85.00",   category: "REIMBURSEMENT", transaction_date: "2025-08-22" },
  // September 2025 — extra
  { id: "demo-t-253", name: "DoorDash",              amount: "28.75",   category: "EXPENSE",      transaction_date: "2025-09-08" },
  { id: "demo-t-254", name: "Car Wash",              amount: "22.00",   category: "EXPENSE",      transaction_date: "2025-09-18" },
  { id: "demo-t-255", name: "Parking Reimbursement", amount: "40.00",   category: "REIMBURSEMENT", transaction_date: "2025-09-29" },
  // October 2025 — extra
  { id: "demo-t-256", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2025-10-09" },
  { id: "demo-t-257", name: "Disney+",               amount: "13.99",   category: "SUBSCRIPTION", transaction_date: "2025-10-14" },
  { id: "demo-t-258", name: "Conference Reimb.",     amount: "150.00",  category: "REIMBURSEMENT", transaction_date: "2025-10-20" },
  // November 2025 — extra
  { id: "demo-t-259", name: "Parking",               amount: "24.00",   category: "EXPENSE",      transaction_date: "2025-11-09" },
  { id: "demo-t-260", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2025-11-19" },
  { id: "demo-t-261", name: "Travel Reimbursement",  amount: "200.00",  category: "REIMBURSEMENT", transaction_date: "2025-11-27" },
  // December 2025 — extra
  { id: "demo-t-262", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2025-12-09" },
  { id: "demo-t-263", name: "DoorDash",              amount: "41.20",   category: "EXPENSE",      transaction_date: "2025-12-18" },
  { id: "demo-t-264", name: "Movie Tickets",         amount: "45.00",   category: "EXPENSE",      transaction_date: "2025-12-24" },
  { id: "demo-t-265", name: "Holiday Bonus",         amount: "500.00",  category: "INCOME",       transaction_date: "2025-12-23" },
  // January 2026 — extra
  { id: "demo-t-266", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2026-01-09" },
  { id: "demo-t-267", name: "DoorDash",              amount: "29.40",   category: "EXPENSE",      transaction_date: "2026-01-20" },
  { id: "demo-t-268", name: "Medical Reimbursement", amount: "95.00",   category: "REIMBURSEMENT", transaction_date: "2026-01-29" },
  // February 2026 — extra
  { id: "demo-t-269", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2026-02-08" },
  { id: "demo-t-270", name: "Online Course",         amount: "39.00",   category: "EXPENSE",      transaction_date: "2026-02-18" },
  { id: "demo-t-271", name: "Expense Reimbursement", amount: "110.00",  category: "REIMBURSEMENT", transaction_date: "2026-02-21" },
  // March 2026 — extra
  { id: "demo-t-272", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2026-03-09" },
  { id: "demo-t-273", name: "DoorDash",              amount: "33.60",   category: "EXPENSE",      transaction_date: "2026-03-18" },
  { id: "demo-t-274", name: "Parking Reimbursement", amount: "55.00",   category: "REIMBURSEMENT", transaction_date: "2026-03-24" },
  // April 2026 — extra
  { id: "demo-t-275", name: "Barber",                amount: "25.00",   category: "EXPENSE",      transaction_date: "2026-04-07" },
  { id: "demo-t-276", name: "Travel Reimbursement",  amount: "175.00",  category: "REIMBURSEMENT", transaction_date: "2026-04-16" },
  { id: "demo-t-277", name: "DoorDash",              amount: "27.80",   category: "EXPENSE",      transaction_date: "2026-04-17" },
];

const SEED_RECURRING = [
  { id: "demo-r-1", name: "Rent",           amount: "1200.00", day_of_month: 1,    category: "BILL"         },
  { id: "demo-r-2", name: "Spotify",        amount: "9.99",    day_of_month: 1,    category: "SUBSCRIPTION" },
  { id: "demo-r-3", name: "Gym Membership", amount: "40.00",   day_of_month: 5,    category: "SUBSCRIPTION" },
  { id: "demo-r-4", name: "Internet",       amount: "60.00",   day_of_month: 10,   category: "BILL"         },
  { id: "demo-r-5", name: "Netflix",        amount: "15.99",   day_of_month: 15,   category: "SUBSCRIPTION" },
  { id: "demo-r-6", name: "Electric",       amount: "88.00",   day_of_month: 20,   category: "BILL"         },
  { id: "demo-r-7", name: "Groceries",      amount: "400.00",  day_of_month: null, category: "EXPENSE", is_estimate: true },
];

const SEED_PAYCHECK_SCHEDULES = [
  { id: "demo-ps-1", name: "Northwind Traders", frequency: "BIWEEKLY", start_date: "2026-01-02", active: true },
];

// ── Init ──────────────────────────────────────────────────────────────────────
export function initDemo() {
  if (!localStorage.getItem(TX_KEY)) {
    localStorage.setItem(TX_KEY, JSON.stringify(SEED_TRANSACTIONS));
  }
  if (!localStorage.getItem(RP_KEY)) {
    localStorage.setItem(RP_KEY, JSON.stringify(SEED_RECURRING));
  }
  if (!localStorage.getItem(PS_KEY)) {
    localStorage.setItem(PS_KEY, JSON.stringify(SEED_PAYCHECK_SCHEDULES));
  }
}

export function clearDemo() {
  localStorage.removeItem(TX_KEY);
  localStorage.removeItem(RP_KEY);
  localStorage.removeItem(PS_KEY);
  localStorage.removeItem(PC_KEY);
  localStorage.removeItem(BA_KEY);
  localStorage.removeItem(RES_KEY);
  localStorage.removeItem("demo");
}

// ── Auto-apply recurring payments ─────────────────────────────────────────────
const DEMO_TODAY = "2026-04-28";

function applyRecurringPayments() {
  const now     = new Date(DEMO_TODAY + "T00:00:00");
  const today   = now.getDate();
  const year    = now.getFullYear();
  const month   = String(now.getMonth() + 1).padStart(2, "0");
  const prefix  = `${year}-${month}`;

  const recurring    = getAll(RP_KEY);
  const transactions = getAll(TX_KEY);

  let changed = false;

  recurring.forEach((rp) => {
    if (rp.is_estimate) return; // estimates inform surplus math only - never generate ledger transactions
    if (rp.active === false) return;
    if (rp.day_of_month == null || rp.day_of_month > today) return;

    const alreadyExists = transactions.some(
      (t) =>
        t.transaction_date.startsWith(prefix) &&
        (t._recurring_id === rp.id || (t.name === rp.name && t.amount === rp.amount))
    );
    if (alreadyExists) return;

    const maxDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const day    = String(Math.min(rp.day_of_month, maxDay)).padStart(2, "0");

    transactions.push({
      id:               nextId(),
      name:             rp.name,
      amount:           rp.amount,
      category:         rp.category,
      transaction_date: `${prefix}-${day}`,
      _recurring_id:    rp.id,
    });
    changed = true;
  });

  if (changed) saveAll(TX_KEY, transactions);
}

// ── Transactions ──────────────────────────────────────────────────────────────
export const getTransactions = () => {
  applyRecurringPayments();
  return respond(getAll(TX_KEY));
};

export const createTransaction = (data) => {
  const items = getAll(TX_KEY);
  const item = { id: nextId(), ...data, amount: String(parseFloat(data.amount).toFixed(2)) };
  saveAll(TX_KEY, [...items, item]);
  return respond(item);
};

export const updateTransaction = (id, data) => {
  const items = getAll(TX_KEY);
  let updated;
  const next = items.map(t => {
    if (t.id !== id) return t;
    updated = { ...t, ...data, amount: data.amount != null ? String(parseFloat(data.amount).toFixed(2)) : t.amount };
    return updated;
  });
  saveAll(TX_KEY, next);
  return respond(updated);
};

export const deleteTransaction = (id) => {
  const transactions = getAll(TX_KEY);
  const target = transactions.find(t => t.id === id);
  saveAll(TX_KEY, transactions.filter(t => t.id !== id));

  if (target?.paycheck_id) {
    saveAll(PC_KEY, getAll(PC_KEY).map(p => p.id === target.paycheck_id ? { ...p, amount: null } : p));
  }

  return Promise.resolve({ data: null, status: 204 });
};

// ── Recurring payments ────────────────────────────────────────────────────────
export const getRecurringPayments = () =>
  respond(getAll(RP_KEY).filter((r) => r.active !== false));

export const createRecurringPayment = (data) => {
  const items = getAll(RP_KEY);
  const item = {
    id: nextId(),
    ...data,
    amount: String(parseFloat(data.amount).toFixed(2)),
    is_estimate: data.is_estimate ?? false,
    active: true,
  };
  saveAll(RP_KEY, [...items, item]);
  return respond(item);
};

export const updateRecurringPayment = (id, data) => {
  const items = getAll(RP_KEY);
  let updated;
  const next = items.map(r => {
    if (r.id !== id) return r;
    updated = { ...r, ...data, amount: data.amount != null ? String(parseFloat(data.amount).toFixed(2)) : r.amount };
    return updated;
  });
  saveAll(RP_KEY, next);
  return respond(updated);
};

export const deleteRecurringPayment = (id) => {
  // Soft-deactivate rather than remove - stops generating new transactions,
  // but existing transaction history (t.recurring_payment_id) stays untouched.
  saveAll(RP_KEY, getAll(RP_KEY).map(r => r.id === id ? { ...r, active: false } : r));
  return Promise.resolve({ data: null, status: 204 });
};

// ── Paychecks ─────────────────────────────────────────────────────────────────
// Mirrors app/services/paycheck_service.py so demo mode behaves the same as the
// real backend: pay dates are generated per frequency, backfilled lazily on
// read (past dates + one upcoming), and never invented with an amount.

const PAYCHECK_EXPENSE_CATEGORIES = new Set(["EXPENSE", "BILL", "SUBSCRIPTION", "SAVINGS", "DEBT"]);
const PAYCHECK_INCOME_CATEGORIES = new Set(["INCOME", "REIMBURSEMENT", "TIPS"]);

// Estimated-savings spend/obligation categories exclude SAVINGS (saving, not
// spending - surfaced separately as "saved so far").
const NON_SAVINGS_EXPENSE_CATEGORIES = new Set(["EXPENSE", "BILL", "SUBSCRIPTION", "DEBT"]);
const SAVINGS_HISTORY_MONTHS = 3;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Adds `months` to `base`, clamping the day-of-month to the target month's length
// (e.g. Jan 31 + 1 month -> Feb 28), same as the Python service's _add_months.
function addMonthsClamped(base, months) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  const targetIndex = month + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(day, lastDay));
}

// Yields a schedule's pay dates in ascending order, indefinitely. SEMI_MONTHLY
// is two dates 15 days apart per month, anchored to start_date's day-of-month.
function* iterPayDates(schedule) {
  const start = new Date(schedule.start_date + "T00:00:00");

  if (schedule.frequency === "WEEKLY" || schedule.frequency === "BIWEEKLY") {
    const stepDays = schedule.frequency === "WEEKLY" ? 7 : 14;
    let current = start;
    while (true) {
      yield current;
      current = new Date(current);
      current.setDate(current.getDate() + stepDays);
    }
  } else if (schedule.frequency === "MONTHLY") {
    let months = 0;
    while (true) {
      yield addMonthsClamped(start, months);
      months += 1;
    }
  } else if (schedule.frequency === "SEMI_MONTHLY") {
    let months = 0;
    while (true) {
      const anchor = addMonthsClamped(start, months);
      yield anchor;
      const second = new Date(anchor);
      second.setDate(second.getDate() + 15);
      yield second;
      months += 1;
    }
  }
}

function generatePayDatesThrough(schedule, through) {
  const dates = [];
  for (const d of iterPayDates(schedule)) {
    dates.push(d);
    if (d > through) break;
  }
  return dates;
}

function nextOccurrence(dayOfMonth, fromDate) {
  const lastDay = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();
  const candidate = new Date(fromDate.getFullYear(), fromDate.getMonth(), Math.min(dayOfMonth, lastDay));
  if (candidate >= fromDate) return candidate;

  const nextMonth = addMonthsClamped(new Date(fromDate.getFullYear(), fromDate.getMonth(), 1), 1);
  const nextLastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(dayOfMonth, nextLastDay));
}

function backfillPaychecks(through) {
  const schedules = getAll(PS_KEY);
  const paychecks = getAll(PC_KEY);
  const horizon = through ?? new Date(DEMO_TODAY + "T00:00:00");
  let changed = false;

  schedules.filter((schedule) => schedule.active !== false).forEach((schedule) => {
    const expected = generatePayDatesThrough(schedule, horizon);
    const existingDates = new Set(
      paychecks.filter((p) => p.schedule_id === schedule.id).map((p) => p.pay_date)
    );

    expected.forEach((d) => {
      const dateStr = toDateStr(d);
      if (!existingDates.has(dateStr)) {
        paychecks.push({
          id: nextId(),
          schedule_id: schedule.id,
          pay_date: dateStr,
          amount: null,
        });
        changed = true;
      }
    });
  });

  if (changed) saveAll(PC_KEY, paychecks);
  return paychecks;
}

export const getPaycheckSchedules = () => respond(getAll(PS_KEY).filter((s) => s.active !== false));

export const createPaycheckSchedule = (data) => {
  const items = getAll(PS_KEY);
  const item = { id: nextId(), name: data.name, frequency: data.frequency, start_date: data.start_date, active: true };
  saveAll(PS_KEY, [...items, item]);
  return respond(item);
};

export const updatePaycheckSchedule = (id, data) => {
  const items = getAll(PS_KEY);
  let updated;
  const next = items.map((s) => {
    if (s.id !== id) return s;
    updated = { ...s, ...data };
    return updated;
  });
  saveAll(PS_KEY, next);

  // Unfilled paychecks no longer match the old frequency/start_date - drop
  // them so the next read backfills fresh ones. Entered amounts stay.
  saveAll(PC_KEY, getAll(PC_KEY).filter((p) => p.schedule_id !== id || p.amount != null));

  return respond(updated);
};

export const deletePaycheckSchedule = (id) => {
  // Soft-deactivate rather than remove - stops generating new paychecks, but
  // past paychecks and their linked income transactions stay untouched.
  saveAll(PS_KEY, getAll(PS_KEY).map((s) => s.id === id ? { ...s, active: false } : s));
  return Promise.resolve({ data: null, status: 204 });
};

export const getPaychecks = () => {
  const all = backfillPaychecks();
  const scheduleNames = Object.fromEntries(getAll(PS_KEY).map((s) => [s.id, s.name]));

  // Guessed amount for still-unfilled paychecks, based on recent entries for
  // that schedule - purely informational, never used in the spendable-surplus
  // math (which only counts money actually received).
  const withEstimates = all.map((p) => {
    const schedule_name = scheduleNames[p.schedule_id] ?? null;
    if (p.amount != null) return { ...p, schedule_name, estimated_amount: null };
    const estimate = averageRecentAmounts(p.schedule_id, all);
    return { ...p, schedule_name, estimated_amount: estimate != null ? estimate.toFixed(2) : null };
  });

  const sorted = withEstimates.sort((a, b) => b.pay_date.localeCompare(a.pay_date));
  const pending = sorted.filter((p) => p.pay_date <= DEMO_TODAY && p.amount == null);
  return respond({ paychecks: sorted, pending_paychecks: pending });
};

export const updatePaycheckAmount = (id, data) => {
  const items = getAll(PC_KEY);
  let updated;
  const next = items.map((p) => {
    if (p.id !== id) return p;
    updated = { ...p, amount: String(parseFloat(data.amount).toFixed(2)) };
    return updated;
  });
  saveAll(PC_KEY, next);

  if (updated) {
    const transactions = getAll(TX_KEY);
    const existingIdx = transactions.findIndex((t) => t.paycheck_id === id);
    if (existingIdx !== -1) {
      transactions[existingIdx] = { ...transactions[existingIdx], amount: updated.amount, transaction_date: updated.pay_date };
    } else {
      transactions.push({
        id: nextId(),
        name: "Paycheck",
        amount: updated.amount,
        category: "INCOME",
        transaction_date: updated.pay_date,
        paycheck_id: id,
      });
    }
    saveAll(TX_KEY, transactions);
  }

  return respond(updated);
};

export const getBalanceAnchor = () => {
  const raw = localStorage.getItem(BA_KEY);
  return respond(raw ? JSON.parse(raw) : null);
};

export const setBalanceAnchor = (data) => {
  const existing = localStorage.getItem(BA_KEY);
  const anchor = {
    id: existing ? JSON.parse(existing).id : nextId(),
    current_balance: String(parseFloat(data.current_balance).toFixed(2)),
    as_of_date: data.as_of_date,
  };
  localStorage.setItem(BA_KEY, JSON.stringify(anchor));
  return respond(anchor);
};

function computeRunningBalance() {
  const raw = localStorage.getItem(BA_KEY);
  if (!raw) return null;
  const anchor = JSON.parse(raw);

  // Bounded to "today" - an already-entered future-dated paycheck transaction
  // must not inflate the *current* running balance. Future income is instead
  // surfaced explicitly via the projected-income sum in getSpendableSurplus.
  const net = getAll(TX_KEY)
    .filter((t) => t.transaction_date >= anchor.as_of_date && t.transaction_date <= DEMO_TODAY)
    .reduce((sum, t) => sum + (PAYCHECK_INCOME_CATEGORIES.has(t.category) ? parseFloat(t.amount) : -parseFloat(t.amount)), 0);

  return parseFloat(anchor.current_balance) + net;
}

export const getRunningBalance = () => {
  const raw = localStorage.getItem(BA_KEY);
  if (!raw) {
    return Promise.reject({ response: { status: 404, data: { detail: "No starting balance set" } } });
  }
  const anchor = JSON.parse(raw);
  return respond({ balance: computeRunningBalance().toFixed(2), as_of_date: anchor.as_of_date });
};

function nextMonthStart(today) {
  const month = today.getMonth();
  const year = today.getFullYear();
  return month === 11 ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
}

function averageRecentAmounts(scheduleId, allPaychecks, limit = 3) {
  const amounts = allPaychecks
    .filter((p) => p.schedule_id === scheduleId && p.amount != null)
    .sort((a, b) => b.pay_date.localeCompare(a.pay_date))
    .slice(0, limit)
    .map((p) => parseFloat(p.amount));
  if (amounts.length === 0) return null;
  return amounts.reduce((a, b) => a + b, 0) / amounts.length;
}

function committedBefore(recurring, today, horizon) {
  return recurring.reduce((sum, rp) => {
    // Estimate with no fixed due date - count it in full (conservative).
    if (rp.day_of_month == null) return sum + parseFloat(rp.amount);
    const occurrence = nextOccurrence(rp.day_of_month, today);
    return occurrence <= horizon ? sum + parseFloat(rp.amount) : sum;
  }, 0);
}

// Sum every future paycheck landing before monthEnd, across all active
// schedules - actual amount if entered, else that schedule's average
// estimate. Paychecks with pay_date <= today are excluded - they're either
// already reflected in the running balance or still pending entry.
function projectedIncomeBefore(schedules, today, monthEnd) {
  if (schedules.length === 0) return 0;

  // Backfilling through monthEnd (rather than just today) guarantees a row
  // exists for every payday in the window we're about to sum, including ones
  // further out than the immediate next check.
  const allPaychecks = backfillPaychecks(monthEnd);
  const todayStr = toDateStr(today);
  const monthEndStr = toDateStr(monthEnd);
  const scheduleIds = new Set(schedules.map((s) => s.id));

  const future = allPaychecks.filter(
    (p) => scheduleIds.has(p.schedule_id) && p.pay_date > todayStr && p.pay_date < monthEndStr
  );

  return future.reduce((sum, p) => {
    if (p.amount != null) return sum + parseFloat(p.amount);
    const estimate = averageRecentAmounts(p.schedule_id, allPaychecks);
    return sum + (estimate ?? 0);
  }, 0);
}

export const getSpendingReserve = () => {
  const raw = localStorage.getItem(RES_KEY);
  return respond({ spending_reserve: raw ? JSON.parse(raw).spending_reserve : "0.00" });
};

export const setSpendingReserve = (data) => {
  const value = parseFloat(data.spending_reserve).toFixed(2);
  localStorage.setItem(RES_KEY, JSON.stringify({ spending_reserve: value }));
  return respond({ spending_reserve: value });
};

function getSpendingReserveValue() {
  const raw = localStorage.getItem(RES_KEY);
  return raw ? parseFloat(JSON.parse(raw).spending_reserve) : 0;
}

export const getSpendableSurplus = () => {
  const runningBalance = computeRunningBalance();
  if (runningBalance == null) {
    return Promise.reject({ response: { status: 404, data: { detail: "No starting balance set" } } });
  }

  const schedules = getAll(PS_KEY).filter((s) => s.active !== false);
  if (schedules.length === 0) {
    return Promise.reject({ response: { status: 404, data: { detail: "No active paycheck schedule found" } } });
  }

  const today = new Date(DEMO_TODAY + "T00:00:00");
  let nextPayday = null;
  let nextSchedule = null;
  schedules.forEach((schedule) => {
    for (const d of iterPayDates(schedule)) {
      if (d >= today) {
        if (nextPayday === null || d.getTime() < nextPayday.getTime()) {
          nextPayday = d;
          nextSchedule = schedule;
        }
        break;
      }
    }
  });
  const monthEnd = nextMonthStart(today);
  const nextPaydayEstimate = nextSchedule ? averageRecentAmounts(nextSchedule.id, getAll(PC_KEY)) : null;

  const recurring = getAll(RP_KEY).filter((rp) => rp.active !== false && PAYCHECK_EXPENSE_CATEGORIES.has(rp.category));

  // Primary number: what's actually free to spend/save before bills reset at
  // the start of next month. Secondary: how much of that is already spoken
  // for before the next paycheck lands, shown separately for context.
  const billsBeforeMonthEnd = committedBefore(recurring, today, monthEnd);
  const billsBeforeNextPayday = committedBefore(recurring, today, nextPayday);

  const projectedIncome = projectedIncomeBefore(schedules, today, monthEnd);
  const spendableSurplus = runningBalance + projectedIncome - billsBeforeMonthEnd;
  const freeToAllocate = spendableSurplus - getSpendingReserveValue();

  return respond({
    next_payday: toDateStr(nextPayday),
    month_end: toDateStr(monthEnd),
    spendable_surplus: spendableSurplus.toFixed(2),
    free_to_allocate: freeToAllocate.toFixed(2),
    bills_before_next_payday: billsBeforeNextPayday.toFixed(2),
    next_payday_estimate: nextPaydayEstimate != null ? nextPaydayEstimate.toFixed(2) : null,
  });
};

// Sum every paycheck landing in [monthStart, monthEnd), across active schedules -
// whole calendar month (received + upcoming), actual amount if entered else the
// schedule's average estimate. Mirrors _full_month_income in the Python service.
function fullMonthIncome(schedules, monthStartStr, monthEndStr) {
  if (schedules.length === 0) return 0;

  const allPaychecks = backfillPaychecks(new Date(monthEndStr + "T00:00:00"));
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const inMonth = allPaychecks.filter(
    (p) => scheduleIds.has(p.schedule_id) && p.pay_date >= monthStartStr && p.pay_date < monthEndStr
  );

  return inMonth.reduce((sum, p) => {
    if (p.amount != null) return sum + parseFloat(p.amount);
    const estimate = averageRecentAmounts(p.schedule_id, allPaychecks);
    return sum + (estimate ?? 0);
  }, 0);
}

export const getEstimatedSavings = () => {
  const schedules = getAll(PS_KEY).filter((s) => s.active !== false);
  if (schedules.length === 0) {
    return Promise.reject({ response: { status: 404, data: { detail: "No active paycheck schedule found" } } });
  }

  const today = new Date(DEMO_TODAY + "T00:00:00");
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = nextMonthStart(today);
  const monthStartStr = toDateStr(monthStart);
  const monthEndStr = toDateStr(monthEnd);

  // Without a known income figure the estimate is meaningless - a schedule whose
  // checks have no amounts entered projects $0 and is treated as not-ready.
  const projectedIncome = fullMonthIncome(schedules, monthStartStr, monthEndStr);
  if (projectedIncome <= 0) {
    return Promise.reject({ response: { status: 404, data: { detail: "No paycheck amounts yet" } } });
  }

  const historyStartStr = toDateStr(addMonthsClamped(monthStart, -SAVINGS_HISTORY_MONTHS));

  // The real backend excludes recurring-linked transactions from the discretionary
  // average via recurring_payment_id. Seed history predates that link, so mirror
  // the intent by also excluding transactions whose name matches an active
  // non-estimate recurring - those fixed bills are added back as committed_recurring.
  const recurringNames = new Set(
    getAll(RP_KEY)
      .filter((rp) => rp.active !== false && !rp.is_estimate && NON_SAVINGS_EXPENSE_CATEGORIES.has(rp.category))
      .map((rp) => rp.name)
  );

  const spendRows = getAll(TX_KEY).filter(
    (t) =>
      NON_SAVINGS_EXPENSE_CATEGORIES.has(t.category) &&
      !t._recurring_id && !t.recurring_payment_id && !recurringNames.has(t.name) &&
      t.transaction_date >= historyStartStr && t.transaction_date < monthStartStr
  );

  const totalsByMonth = {};
  spendRows.forEach((t) => {
    const key = t.transaction_date.slice(0, 7);
    totalsByMonth[key] = (totalsByMonth[key] ?? 0) + parseFloat(t.amount);
  });

  const expectedMonths = [];
  for (let n = 1; n <= SAVINGS_HISTORY_MONTHS; n++) {
    expectedMonths.push(toDateStr(addMonthsClamped(monthStart, -n)).slice(0, 7));
  }
  if (!expectedMonths.every((m) => m in totalsByMonth)) {
    return Promise.reject({ response: { status: 404, data: { detail: "Not enough spending history" } } });
  }

  const totalSpend = Object.values(totalsByMonth).reduce((a, b) => a + b, 0);
  const projectedSpending = totalSpend / SAVINGS_HISTORY_MONTHS;

  const committedRecurring = getAll(RP_KEY)
    .filter((rp) => rp.active !== false && !rp.is_estimate && NON_SAVINGS_EXPENSE_CATEGORIES.has(rp.category))
    .reduce((sum, rp) => sum + parseFloat(rp.amount), 0);

  const savedSoFar = getAll(TX_KEY)
    .filter((t) => t.category === "SAVINGS" && t.transaction_date >= monthStartStr && t.transaction_date < monthEndStr)
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const raw = projectedIncome - projectedSpending - committedRecurring;
  const estimatedSavings = raw > 0 ? raw : 0;

  return respond({
    month_start: monthStartStr,
    month_end: monthEndStr,
    estimated_savings: estimatedSavings.toFixed(2),
    saved_so_far: savedSoFar.toFixed(2),
    projected_income: projectedIncome.toFixed(2),
    projected_spending: projectedSpending.toFixed(2),
    committed_recurring: committedRecurring.toFixed(2),
  });
};
