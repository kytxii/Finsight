import {
  parseCsvText,
  detectColumnMapping,
  annotateImportRows,
} from "../utils/csvImport";
import {
  computeMonthlyPayment,
  computeGaugeStatus,
} from "../utils/installmentMath";

const TX_KEY = "demo_transactions";
const RP_KEY = "demo_recurring";
const PS_KEY = "demo_paycheck_schedules";
const PC_KEY = "demo_paychecks";
const BA_KEY = "demo_balance_anchor";
const RES_KEY = "demo_spending_reserve";
const TD_KEY = "demo_tip_deposits";
const IN_KEY = "demo_installments";
const ID_KEY = "demo_next_id";
const CCP_KEY = "demo_credit_card_payments";
const CCC_KEY = "demo_credit_card_charges";
const CCA_KEY = "demo_credit_card_allocations";

const getAll = (key) => JSON.parse(localStorage.getItem(key) || "[]");
const saveAll = (key, data) => localStorage.setItem(key, JSON.stringify(data));
const respond = (data) => Promise.resolve({ data });

// Saved to disk, not just memory
function nextId() {
  const next = parseInt(localStorage.getItem(ID_KEY) || "1000", 10) + 1;
  localStorage.setItem(ID_KEY, String(next));
  return `demo-${next}`;
}

const SEED_TRANSACTIONS = [
  // May 2025
  {
    id: "demo-t-1",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-05-01",
  },
  {
    id: "demo-t-2",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-05-01",
  },
  {
    id: "demo-t-3",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-05-01",
  },
  {
    id: "demo-t-4",
    name: "Groceries",
    amount: "98.40",
    category: "EXPENSE",
    transaction_date: "2025-05-03",
  },
  {
    id: "demo-t-5",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-05-05",
  },
  {
    id: "demo-t-6",
    name: "Gas",
    amount: "52.10",
    category: "EXPENSE",
    transaction_date: "2025-05-07",
  },
  {
    id: "demo-t-7",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-05-10",
  },
  {
    id: "demo-t-8",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-05-11",
  },
  {
    id: "demo-t-9",
    name: "Dinner Out",
    amount: "48.20",
    category: "EXPENSE",
    transaction_date: "2025-05-13",
  },
  {
    id: "demo-t-10",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-05-15",
  },
  {
    id: "demo-t-11",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-05-15",
  },
  {
    id: "demo-t-12",
    name: "Groceries",
    amount: "82.60",
    category: "EXPENSE",
    transaction_date: "2025-05-17",
  },
  {
    id: "demo-t-13",
    name: "Amazon",
    amount: "43.99",
    category: "EXPENSE",
    transaction_date: "2025-05-19",
  },
  {
    id: "demo-t-14",
    name: "Electric",
    amount: "91.50",
    category: "BILL",
    transaction_date: "2025-05-20",
  },
  {
    id: "demo-t-15",
    name: "Pharmacy",
    amount: "22.30",
    category: "EXPENSE",
    transaction_date: "2025-05-22",
  },
  {
    id: "demo-t-16",
    name: "Lunch",
    amount: "16.80",
    category: "EXPENSE",
    transaction_date: "2025-05-24",
  },
  {
    id: "demo-t-17",
    name: "Freelance",
    amount: "400.00",
    category: "INCOME",
    transaction_date: "2025-05-25",
  },
  {
    id: "demo-t-18",
    name: "Cash",
    amount: "20.00",
    category: "TIPS",
    transaction_date: "2025-05-26",
  },
  {
    id: "demo-t-19",
    name: "Clothing",
    amount: "75.00",
    category: "EXPENSE",
    transaction_date: "2025-05-27",
  },
  {
    id: "demo-t-20",
    name: "Savings Transfer",
    amount: "500.00",
    category: "SAVINGS",
    transaction_date: "2025-05-28",
  },
  // June 2025
  {
    id: "demo-t-21",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-06-01",
  },
  {
    id: "demo-t-22",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-06-01",
  },
  {
    id: "demo-t-23",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-06-01",
  },
  {
    id: "demo-t-24",
    name: "Groceries",
    amount: "94.20",
    category: "EXPENSE",
    transaction_date: "2025-06-03",
  },
  {
    id: "demo-t-25",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-06-05",
  },
  {
    id: "demo-t-26",
    name: "Gas",
    amount: "58.40",
    category: "EXPENSE",
    transaction_date: "2025-06-07",
  },
  {
    id: "demo-t-27",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-06-10",
  },
  {
    id: "demo-t-28",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-06-11",
  },
  {
    id: "demo-t-29",
    name: "BBQ Supplies",
    amount: "67.30",
    category: "EXPENSE",
    transaction_date: "2025-06-14",
  },
  {
    id: "demo-t-30",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-06-15",
  },
  {
    id: "demo-t-31",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-06-15",
  },
  {
    id: "demo-t-32",
    name: "Groceries",
    amount: "88.90",
    category: "EXPENSE",
    transaction_date: "2025-06-18",
  },
  {
    id: "demo-t-33",
    name: "Electric",
    amount: "78.20",
    category: "BILL",
    transaction_date: "2025-06-20",
  },
  {
    id: "demo-t-34",
    name: "Uber",
    amount: "22.50",
    category: "EXPENSE",
    transaction_date: "2025-06-21",
  },
  {
    id: "demo-t-35",
    name: "Concert Tickets",
    amount: "85.00",
    category: "EXPENSE",
    transaction_date: "2025-06-22",
  },
  {
    id: "demo-t-36",
    name: "Freelance",
    amount: "600.00",
    category: "INCOME",
    transaction_date: "2025-06-23",
  },
  {
    id: "demo-t-37",
    name: "Amazon",
    amount: "31.49",
    category: "EXPENSE",
    transaction_date: "2025-06-24",
  },
  {
    id: "demo-t-38",
    name: "Dinner Out",
    amount: "56.80",
    category: "EXPENSE",
    transaction_date: "2025-06-26",
  },
  {
    id: "demo-t-39",
    name: "Beach Supplies",
    amount: "38.50",
    category: "EXPENSE",
    transaction_date: "2025-06-27",
  },
  {
    id: "demo-t-40",
    name: "Savings Transfer",
    amount: "550.00",
    category: "SAVINGS",
    transaction_date: "2025-06-28",
  },
  // July 2025
  {
    id: "demo-t-41",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-07-01",
  },
  {
    id: "demo-t-42",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-07-01",
  },
  {
    id: "demo-t-43",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-07-01",
  },
  {
    id: "demo-t-44",
    name: "Groceries",
    amount: "102.30",
    category: "EXPENSE",
    transaction_date: "2025-07-03",
  },
  {
    id: "demo-t-45",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-07-05",
  },
  {
    id: "demo-t-46",
    name: "Gas",
    amount: "61.20",
    category: "EXPENSE",
    transaction_date: "2025-07-08",
  },
  {
    id: "demo-t-47",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-07-10",
  },
  {
    id: "demo-t-48",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-07-12",
  },
  {
    id: "demo-t-49",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-07-15",
  },
  {
    id: "demo-t-50",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-07-15",
  },
  {
    id: "demo-t-51",
    name: "Groceries",
    amount: "79.40",
    category: "EXPENSE",
    transaction_date: "2025-07-16",
  },
  {
    id: "demo-t-52",
    name: "Electric",
    amount: "105.60",
    category: "BILL",
    transaction_date: "2025-07-20",
  },
  {
    id: "demo-t-53",
    name: "Vacation Hotel",
    amount: "320.00",
    category: "EXPENSE",
    transaction_date: "2025-07-22",
  },
  {
    id: "demo-t-54",
    name: "Vacation Food",
    amount: "145.80",
    category: "EXPENSE",
    transaction_date: "2025-07-23",
  },
  {
    id: "demo-t-55",
    name: "Amazon",
    amount: "54.99",
    category: "EXPENSE",
    transaction_date: "2025-07-21",
  },
  {
    id: "demo-t-56",
    name: "Pharmacy",
    amount: "18.90",
    category: "EXPENSE",
    transaction_date: "2025-07-25",
  },
  {
    id: "demo-t-57",
    name: "Gas",
    amount: "48.30",
    category: "EXPENSE",
    transaction_date: "2025-07-26",
  },
  {
    id: "demo-t-58",
    name: "Cash",
    amount: "25.00",
    category: "TIPS",
    transaction_date: "2025-07-27",
  },
  {
    id: "demo-t-59",
    name: "Dinner Out",
    amount: "72.30",
    category: "EXPENSE",
    transaction_date: "2025-07-28",
  },
  {
    id: "demo-t-60",
    name: "Savings Transfer",
    amount: "300.00",
    category: "SAVINGS",
    transaction_date: "2025-07-28",
  },
  // August 2025
  {
    id: "demo-t-61",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-08-01",
  },
  {
    id: "demo-t-62",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-08-01",
  },
  {
    id: "demo-t-63",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-08-01",
  },
  {
    id: "demo-t-64",
    name: "Groceries",
    amount: "91.70",
    category: "EXPENSE",
    transaction_date: "2025-08-04",
  },
  {
    id: "demo-t-65",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-08-05",
  },
  {
    id: "demo-t-66",
    name: "Gas",
    amount: "55.80",
    category: "EXPENSE",
    transaction_date: "2025-08-07",
  },
  {
    id: "demo-t-67",
    name: "School Supplies",
    amount: "88.50",
    category: "EXPENSE",
    transaction_date: "2025-08-09",
  },
  {
    id: "demo-t-68",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-08-10",
  },
  {
    id: "demo-t-69",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-08-12",
  },
  {
    id: "demo-t-70",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-08-15",
  },
  {
    id: "demo-t-71",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-08-15",
  },
  {
    id: "demo-t-72",
    name: "Groceries",
    amount: "84.20",
    category: "EXPENSE",
    transaction_date: "2025-08-17",
  },
  {
    id: "demo-t-73",
    name: "Electric",
    amount: "98.40",
    category: "BILL",
    transaction_date: "2025-08-20",
  },
  {
    id: "demo-t-74",
    name: "Clothing",
    amount: "112.00",
    category: "EXPENSE",
    transaction_date: "2025-08-23",
  },
  {
    id: "demo-t-75",
    name: "Amazon",
    amount: "29.99",
    category: "EXPENSE",
    transaction_date: "2025-08-21",
  },
  {
    id: "demo-t-76",
    name: "Freelance",
    amount: "350.00",
    category: "INCOME",
    transaction_date: "2025-08-26",
  },
  {
    id: "demo-t-77",
    name: "Lunch",
    amount: "14.50",
    category: "EXPENSE",
    transaction_date: "2025-08-25",
  },
  {
    id: "demo-t-78",
    name: "Dinner Out",
    amount: "61.40",
    category: "EXPENSE",
    transaction_date: "2025-08-27",
  },
  {
    id: "demo-t-79",
    name: "Pharmacy",
    amount: "31.50",
    category: "EXPENSE",
    transaction_date: "2025-08-28",
  },
  {
    id: "demo-t-80",
    name: "Savings Transfer",
    amount: "450.00",
    category: "SAVINGS",
    transaction_date: "2025-08-28",
  },
  // September 2025
  {
    id: "demo-t-81",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-09-01",
  },
  {
    id: "demo-t-82",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-09-01",
  },
  {
    id: "demo-t-83",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-09-01",
  },
  {
    id: "demo-t-84",
    name: "Groceries",
    amount: "96.80",
    category: "EXPENSE",
    transaction_date: "2025-09-03",
  },
  {
    id: "demo-t-85",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-09-05",
  },
  {
    id: "demo-t-86",
    name: "Gas",
    amount: "53.60",
    category: "EXPENSE",
    transaction_date: "2025-09-06",
  },
  {
    id: "demo-t-87",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-09-10",
  },
  {
    id: "demo-t-88",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-09-11",
  },
  {
    id: "demo-t-89",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-09-15",
  },
  {
    id: "demo-t-90",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-09-15",
  },
  {
    id: "demo-t-91",
    name: "Groceries",
    amount: "77.30",
    category: "EXPENSE",
    transaction_date: "2025-09-16",
  },
  {
    id: "demo-t-92",
    name: "Electric",
    amount: "88.70",
    category: "BILL",
    transaction_date: "2025-09-20",
  },
  {
    id: "demo-t-93",
    name: "Amazon",
    amount: "66.49",
    category: "EXPENSE",
    transaction_date: "2025-09-21",
  },
  {
    id: "demo-t-94",
    name: "Dinner Out",
    amount: "43.80",
    category: "EXPENSE",
    transaction_date: "2025-09-22",
  },
  {
    id: "demo-t-95",
    name: "Accessories",
    amount: "34.99",
    category: "EXPENSE",
    transaction_date: "2025-09-23",
  },
  {
    id: "demo-t-96",
    name: "Freelance",
    amount: "500.00",
    category: "INCOME",
    transaction_date: "2025-09-24",
  },
  {
    id: "demo-t-97",
    name: "Uber",
    amount: "18.50",
    category: "EXPENSE",
    transaction_date: "2025-09-25",
  },
  {
    id: "demo-t-98",
    name: "Medical",
    amount: "75.00",
    category: "EXPENSE",
    transaction_date: "2025-09-26",
  },
  {
    id: "demo-t-99",
    name: "Groceries",
    amount: "68.90",
    category: "EXPENSE",
    transaction_date: "2025-09-27",
  },
  {
    id: "demo-t-100",
    name: "Savings Transfer",
    amount: "500.00",
    category: "SAVINGS",
    transaction_date: "2025-09-28",
  },
  // October 2025
  {
    id: "demo-t-101",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-10-01",
  },
  {
    id: "demo-t-102",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-10-01",
  },
  {
    id: "demo-t-103",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-10-01",
  },
  {
    id: "demo-t-104",
    name: "Groceries",
    amount: "89.50",
    category: "EXPENSE",
    transaction_date: "2025-10-04",
  },
  {
    id: "demo-t-105",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-10-05",
  },
  {
    id: "demo-t-106",
    name: "Gas",
    amount: "57.20",
    category: "EXPENSE",
    transaction_date: "2025-10-07",
  },
  {
    id: "demo-t-107",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-10-10",
  },
  {
    id: "demo-t-108",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-10-11",
  },
  {
    id: "demo-t-109",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-10-15",
  },
  {
    id: "demo-t-110",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-10-15",
  },
  {
    id: "demo-t-111",
    name: "Groceries",
    amount: "93.10",
    category: "EXPENSE",
    transaction_date: "2025-10-16",
  },
  {
    id: "demo-t-112",
    name: "Electric",
    amount: "82.30",
    category: "BILL",
    transaction_date: "2025-10-20",
  },
  {
    id: "demo-t-113",
    name: "Halloween Costumes",
    amount: "64.00",
    category: "EXPENSE",
    transaction_date: "2025-10-21",
  },
  {
    id: "demo-t-114",
    name: "Amazon",
    amount: "47.99",
    category: "EXPENSE",
    transaction_date: "2025-10-22",
  },
  {
    id: "demo-t-115",
    name: "Dinner Out",
    amount: "58.60",
    category: "EXPENSE",
    transaction_date: "2025-10-24",
  },
  {
    id: "demo-t-116",
    name: "Pharmacy",
    amount: "27.40",
    category: "EXPENSE",
    transaction_date: "2025-10-25",
  },
  {
    id: "demo-t-117",
    name: "Pumpkin Patch",
    amount: "32.00",
    category: "EXPENSE",
    transaction_date: "2025-10-26",
  },
  {
    id: "demo-t-118",
    name: "Cash",
    amount: "20.00",
    category: "TIPS",
    transaction_date: "2025-10-27",
  },
  {
    id: "demo-t-119",
    name: "Clothing",
    amount: "95.00",
    category: "EXPENSE",
    transaction_date: "2025-10-28",
  },
  {
    id: "demo-t-120",
    name: "Savings Transfer",
    amount: "500.00",
    category: "SAVINGS",
    transaction_date: "2025-10-28",
  },
  // November 2025
  {
    id: "demo-t-121",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-11-01",
  },
  {
    id: "demo-t-122",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-11-01",
  },
  {
    id: "demo-t-123",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-11-01",
  },
  {
    id: "demo-t-124",
    name: "Groceries",
    amount: "104.20",
    category: "EXPENSE",
    transaction_date: "2025-11-04",
  },
  {
    id: "demo-t-125",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-11-05",
  },
  {
    id: "demo-t-126",
    name: "Gas",
    amount: "51.90",
    category: "EXPENSE",
    transaction_date: "2025-11-07",
  },
  {
    id: "demo-t-127",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-11-10",
  },
  {
    id: "demo-t-128",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-11-11",
  },
  {
    id: "demo-t-129",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-11-15",
  },
  {
    id: "demo-t-130",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-11-15",
  },
  {
    id: "demo-t-131",
    name: "Groceries",
    amount: "88.60",
    category: "EXPENSE",
    transaction_date: "2025-11-16",
  },
  {
    id: "demo-t-132",
    name: "Electric",
    amount: "94.20",
    category: "BILL",
    transaction_date: "2025-11-20",
  },
  {
    id: "demo-t-133",
    name: "Dinner Out",
    amount: "47.20",
    category: "EXPENSE",
    transaction_date: "2025-11-22",
  },
  {
    id: "demo-t-134",
    name: "Thanksgiving Groceries",
    amount: "143.50",
    category: "EXPENSE",
    transaction_date: "2025-11-24",
  },
  {
    id: "demo-t-135",
    name: "Freelance",
    amount: "450.00",
    category: "INCOME",
    transaction_date: "2025-11-25",
  },
  {
    id: "demo-t-136",
    name: "Gas",
    amount: "49.80",
    category: "EXPENSE",
    transaction_date: "2025-11-26",
  },
  {
    id: "demo-t-137",
    name: "Amazon",
    amount: "89.99",
    category: "EXPENSE",
    transaction_date: "2025-11-21",
  },
  {
    id: "demo-t-138",
    name: "Black Friday",
    amount: "212.00",
    category: "EXPENSE",
    transaction_date: "2025-11-28",
  },
  {
    id: "demo-t-139",
    name: "Pharmacy",
    amount: "15.60",
    category: "EXPENSE",
    transaction_date: "2025-11-29",
  },
  {
    id: "demo-t-140",
    name: "Savings Transfer",
    amount: "400.00",
    category: "SAVINGS",
    transaction_date: "2025-11-28",
  },
  // December 2025
  {
    id: "demo-t-141",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2025-12-01",
  },
  {
    id: "demo-t-142",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2025-12-01",
  },
  {
    id: "demo-t-143",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-12-01",
  },
  {
    id: "demo-t-144",
    name: "Groceries",
    amount: "98.70",
    category: "EXPENSE",
    transaction_date: "2025-12-03",
  },
  {
    id: "demo-t-145",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2025-12-05",
  },
  {
    id: "demo-t-146",
    name: "Gas",
    amount: "54.60",
    category: "EXPENSE",
    transaction_date: "2025-12-07",
  },
  {
    id: "demo-t-147",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2025-12-10",
  },
  {
    id: "demo-t-148",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2025-12-11",
  },
  {
    id: "demo-t-149",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-12-15",
  },
  {
    id: "demo-t-150",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2025-12-15",
  },
  {
    id: "demo-t-151",
    name: "Groceries",
    amount: "88.40",
    category: "EXPENSE",
    transaction_date: "2025-12-16",
  },
  {
    id: "demo-t-152",
    name: "Electric",
    amount: "108.30",
    category: "BILL",
    transaction_date: "2025-12-20",
  },
  {
    id: "demo-t-153",
    name: "Christmas Gifts",
    amount: "385.00",
    category: "EXPENSE",
    transaction_date: "2025-12-20",
  },
  {
    id: "demo-t-154",
    name: "Amazon",
    amount: "67.49",
    category: "EXPENSE",
    transaction_date: "2025-12-21",
  },
  {
    id: "demo-t-155",
    name: "Freelance",
    amount: "700.00",
    category: "INCOME",
    transaction_date: "2025-12-22",
  },
  {
    id: "demo-t-156",
    name: "Christmas Dinner",
    amount: "94.80",
    category: "EXPENSE",
    transaction_date: "2025-12-25",
  },
  {
    id: "demo-t-157",
    name: "Dinner Out",
    amount: "52.30",
    category: "EXPENSE",
    transaction_date: "2025-12-26",
  },
  {
    id: "demo-t-158",
    name: "Cash",
    amount: "30.00",
    category: "TIPS",
    transaction_date: "2025-12-27",
  },
  {
    id: "demo-t-159",
    name: "New Year Eve",
    amount: "78.00",
    category: "EXPENSE",
    transaction_date: "2025-12-31",
  },
  {
    id: "demo-t-160",
    name: "Savings Transfer",
    amount: "350.00",
    category: "SAVINGS",
    transaction_date: "2025-12-28",
  },
  // January 2026
  {
    id: "demo-t-161",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2026-01-01",
  },
  {
    id: "demo-t-162",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2026-01-01",
  },
  {
    id: "demo-t-163",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-01-01",
  },
  {
    id: "demo-t-164",
    name: "Groceries",
    amount: "105.40",
    category: "EXPENSE",
    transaction_date: "2026-01-03",
  },
  {
    id: "demo-t-165",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2026-01-05",
  },
  {
    id: "demo-t-166",
    name: "Gas",
    amount: "55.20",
    category: "EXPENSE",
    transaction_date: "2026-01-08",
  },
  {
    id: "demo-t-167",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2026-01-10",
  },
  {
    id: "demo-t-168",
    name: "New Year Dinner",
    amount: "72.50",
    category: "EXPENSE",
    transaction_date: "2026-01-12",
  },
  {
    id: "demo-t-169",
    name: "Cash",
    amount: "20.00",
    category: "TIPS",
    transaction_date: "2026-01-14",
  },
  {
    id: "demo-t-170",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-01-15",
  },
  {
    id: "demo-t-171",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2026-01-15",
  },
  {
    id: "demo-t-172",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2026-01-16",
  },
  {
    id: "demo-t-173",
    name: "Groceries",
    amount: "88.90",
    category: "EXPENSE",
    transaction_date: "2026-01-18",
  },
  {
    id: "demo-t-174",
    name: "Electric",
    amount: "98.20",
    category: "BILL",
    transaction_date: "2026-01-20",
  },
  {
    id: "demo-t-175",
    name: "Amazon",
    amount: "156.99",
    category: "EXPENSE",
    transaction_date: "2026-01-22",
  },
  {
    id: "demo-t-176",
    name: "Pharmacy",
    amount: "22.00",
    category: "EXPENSE",
    transaction_date: "2026-01-25",
  },
  {
    id: "demo-t-177",
    name: "Freelance",
    amount: "500.00",
    category: "INCOME",
    transaction_date: "2026-01-26",
  },
  {
    id: "demo-t-178",
    name: "Clothing",
    amount: "120.00",
    category: "EXPENSE",
    transaction_date: "2026-01-24",
  },
  {
    id: "demo-t-179",
    name: "Dinner Out",
    amount: "54.30",
    category: "EXPENSE",
    transaction_date: "2026-01-30",
  },
  {
    id: "demo-t-180",
    name: "Savings Transfer",
    amount: "600.00",
    category: "SAVINGS",
    transaction_date: "2026-01-28",
  },
  // February 2026
  {
    id: "demo-t-181",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2026-02-01",
  },
  {
    id: "demo-t-182",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2026-02-01",
  },
  {
    id: "demo-t-183",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-02-01",
  },
  {
    id: "demo-t-184",
    name: "Groceries",
    amount: "95.60",
    category: "EXPENSE",
    transaction_date: "2026-02-04",
  },
  {
    id: "demo-t-185",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2026-02-05",
  },
  {
    id: "demo-t-186",
    name: "Valentine's Dinner",
    amount: "85.00",
    category: "EXPENSE",
    transaction_date: "2026-02-07",
  },
  {
    id: "demo-t-187",
    name: "Gas",
    amount: "48.75",
    category: "EXPENSE",
    transaction_date: "2026-02-09",
  },
  {
    id: "demo-t-188",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2026-02-10",
  },
  {
    id: "demo-t-189",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2026-02-12",
  },
  {
    id: "demo-t-190",
    name: "Gift",
    amount: "65.00",
    category: "EXPENSE",
    transaction_date: "2026-02-14",
  },
  {
    id: "demo-t-191",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-02-15",
  },
  {
    id: "demo-t-192",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2026-02-15",
  },
  {
    id: "demo-t-193",
    name: "Groceries",
    amount: "71.30",
    category: "EXPENSE",
    transaction_date: "2026-02-17",
  },
  {
    id: "demo-t-194",
    name: "Electric",
    amount: "92.40",
    category: "BILL",
    transaction_date: "2026-02-20",
  },
  {
    id: "demo-t-195",
    name: "Amazon",
    amount: "28.49",
    category: "EXPENSE",
    transaction_date: "2026-02-22",
  },
  {
    id: "demo-t-196",
    name: "Lunch",
    amount: "19.80",
    category: "EXPENSE",
    transaction_date: "2026-02-24",
  },
  {
    id: "demo-t-197",
    name: "Savings Transfer",
    amount: "400.00",
    category: "SAVINGS",
    transaction_date: "2026-02-25",
  },
  {
    id: "demo-t-198",
    name: "Dinner Out",
    amount: "39.50",
    category: "EXPENSE",
    transaction_date: "2026-02-26",
  },
  {
    id: "demo-t-199",
    name: "Pharmacy",
    amount: "12.30",
    category: "EXPENSE",
    transaction_date: "2026-02-27",
  },
  {
    id: "demo-t-200",
    name: "Medical",
    amount: "45.00",
    category: "EXPENSE",
    transaction_date: "2026-02-28",
  },
  // March 2026
  {
    id: "demo-t-201",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2026-03-01",
  },
  {
    id: "demo-t-202",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2026-03-01",
  },
  {
    id: "demo-t-203",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-03-01",
  },
  {
    id: "demo-t-204",
    name: "Groceries",
    amount: "92.15",
    category: "EXPENSE",
    transaction_date: "2026-03-03",
  },
  {
    id: "demo-t-205",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2026-03-05",
  },
  {
    id: "demo-t-206",
    name: "Dinner Out",
    amount: "45.80",
    category: "EXPENSE",
    transaction_date: "2026-03-07",
  },
  {
    id: "demo-t-207",
    name: "Gas",
    amount: "52.30",
    category: "EXPENSE",
    transaction_date: "2026-03-08",
  },
  {
    id: "demo-t-208",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2026-03-10",
  },
  {
    id: "demo-t-209",
    name: "Amazon",
    amount: "34.99",
    category: "EXPENSE",
    transaction_date: "2026-03-12",
  },
  {
    id: "demo-t-210",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2026-03-14",
  },
  {
    id: "demo-t-211",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-03-15",
  },
  {
    id: "demo-t-212",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2026-03-15",
  },
  {
    id: "demo-t-213",
    name: "Groceries",
    amount: "78.40",
    category: "EXPENSE",
    transaction_date: "2026-03-16",
  },
  {
    id: "demo-t-214",
    name: "Freelance",
    amount: "350.00",
    category: "INCOME",
    transaction_date: "2026-03-18",
  },
  {
    id: "demo-t-215",
    name: "Electric",
    amount: "85.00",
    category: "BILL",
    transaction_date: "2026-03-20",
  },
  {
    id: "demo-t-216",
    name: "Clothing",
    amount: "89.99",
    category: "EXPENSE",
    transaction_date: "2026-03-22",
  },
  {
    id: "demo-t-217",
    name: "Pharmacy",
    amount: "18.50",
    category: "EXPENSE",
    transaction_date: "2026-03-25",
  },
  {
    id: "demo-t-218",
    name: "Uber",
    amount: "16.50",
    category: "EXPENSE",
    transaction_date: "2026-03-27",
  },
  {
    id: "demo-t-219",
    name: "Dinner Out",
    amount: "62.40",
    category: "EXPENSE",
    transaction_date: "2026-03-30",
  },
  {
    id: "demo-t-220",
    name: "Savings Transfer",
    amount: "500.00",
    category: "SAVINGS",
    transaction_date: "2026-03-28",
  },
  // April 2026
  {
    id: "demo-t-221",
    name: "Salary",
    amount: "4500.00",
    category: "INCOME",
    transaction_date: "2026-04-01",
  },
  {
    id: "demo-t-222",
    name: "Rent",
    amount: "1200.00",
    category: "BILL",
    transaction_date: "2026-04-01",
  },
  {
    id: "demo-t-223",
    name: "Spotify",
    amount: "9.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-04-01",
  },
  {
    id: "demo-t-224",
    name: "Groceries",
    amount: "87.32",
    category: "EXPENSE",
    transaction_date: "2026-04-04",
  },
  {
    id: "demo-t-225",
    name: "Gym Membership",
    amount: "40.00",
    category: "SUBSCRIPTION",
    transaction_date: "2026-04-05",
  },
  {
    id: "demo-t-226",
    name: "Uber",
    amount: "14.50",
    category: "EXPENSE",
    transaction_date: "2026-04-08",
  },
  {
    id: "demo-t-227",
    name: "Internet",
    amount: "60.00",
    category: "BILL",
    transaction_date: "2026-04-10",
  },
  {
    id: "demo-t-228",
    name: "Cash",
    amount: "165.00",
    category: "TIPS",
    transaction_date: "2026-04-10",
  },
  {
    id: "demo-t-229",
    name: "Coffee",
    amount: "4.75",
    category: "EXPENSE",
    transaction_date: "2026-04-11",
  },
  {
    id: "demo-t-230",
    name: "Lunch",
    amount: "18.40",
    category: "EXPENSE",
    transaction_date: "2026-04-12",
  },
  {
    id: "demo-t-231",
    name: "Pharmacy",
    amount: "23.10",
    category: "EXPENSE",
    transaction_date: "2026-04-14",
  },
  {
    id: "demo-t-232",
    name: "Netflix",
    amount: "15.99",
    category: "SUBSCRIPTION",
    transaction_date: "2026-04-15",
  },
  {
    id: "demo-t-233",
    name: "Student Loan",
    amount: "250.00",
    category: "DEBT",
    transaction_date: "2026-04-15",
  },
  {
    id: "demo-t-234",
    name: "Groceries",
    amount: "64.50",
    category: "EXPENSE",
    transaction_date: "2026-04-16",
  },
  {
    id: "demo-t-235",
    name: "Electric",
    amount: "90.20",
    category: "BILL",
    transaction_date: "2026-04-20",
  },
  {
    id: "demo-t-236",
    name: "Amazon",
    amount: "39.99",
    category: "EXPENSE",
    transaction_date: "2026-04-21",
  },
  {
    id: "demo-t-237",
    name: "Dinner Out",
    amount: "55.60",
    category: "EXPENSE",
    transaction_date: "2026-04-22",
  },
  {
    id: "demo-t-238",
    name: "Freelance",
    amount: "425.00",
    category: "INCOME",
    transaction_date: "2026-04-24",
  },
  {
    id: "demo-t-239",
    name: "Clothing",
    amount: "68.00",
    category: "EXPENSE",
    transaction_date: "2026-04-25",
  },
  {
    id: "demo-t-240",
    name: "Savings Transfer",
    amount: "450.00",
    category: "SAVINGS",
    transaction_date: "2026-04-28",
  },
  // May 2025 — extra
  {
    id: "demo-t-241",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2025-05-10",
  },
  {
    id: "demo-t-242",
    name: "DoorDash",
    amount: "34.50",
    category: "EXPENSE",
    transaction_date: "2025-05-21",
  },
  {
    id: "demo-t-243",
    name: "Work Lunch Reimb.",
    amount: "45.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-05-23",
  },
  // June 2025 — extra
  {
    id: "demo-t-244",
    name: "Haircut",
    amount: "28.00",
    category: "EXPENSE",
    transaction_date: "2025-06-09",
  },
  {
    id: "demo-t-245",
    name: "Movie Tickets",
    amount: "32.00",
    category: "EXPENSE",
    transaction_date: "2025-06-20",
  },
  {
    id: "demo-t-246",
    name: "Travel Reimbursement",
    amount: "120.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-06-25",
  },
  // July 2025 — extra
  {
    id: "demo-t-247",
    name: "Parking",
    amount: "18.00",
    category: "EXPENSE",
    transaction_date: "2025-07-05",
  },
  {
    id: "demo-t-248",
    name: "Car Wash",
    amount: "22.00",
    category: "EXPENSE",
    transaction_date: "2025-07-19",
  },
  {
    id: "demo-t-249",
    name: "Medical Reimbursement",
    amount: "75.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-07-30",
  },
  // August 2025 — extra
  {
    id: "demo-t-250",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2025-08-08",
  },
  {
    id: "demo-t-251",
    name: "Online Course",
    amount: "49.00",
    category: "EXPENSE",
    transaction_date: "2025-08-18",
  },
  {
    id: "demo-t-252",
    name: "Expense Reimbursement",
    amount: "85.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-08-22",
  },
  // September 2025 — extra
  {
    id: "demo-t-253",
    name: "DoorDash",
    amount: "28.75",
    category: "EXPENSE",
    transaction_date: "2025-09-08",
  },
  {
    id: "demo-t-254",
    name: "Car Wash",
    amount: "22.00",
    category: "EXPENSE",
    transaction_date: "2025-09-18",
  },
  {
    id: "demo-t-255",
    name: "Parking Reimbursement",
    amount: "40.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-09-29",
  },
  // October 2025 — extra
  {
    id: "demo-t-256",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2025-10-09",
  },
  {
    id: "demo-t-257",
    name: "Disney+",
    amount: "13.99",
    category: "SUBSCRIPTION",
    transaction_date: "2025-10-14",
  },
  {
    id: "demo-t-258",
    name: "Conference Reimb.",
    amount: "150.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-10-20",
  },
  // November 2025 — extra
  {
    id: "demo-t-259",
    name: "Parking",
    amount: "24.00",
    category: "EXPENSE",
    transaction_date: "2025-11-09",
  },
  {
    id: "demo-t-260",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2025-11-19",
  },
  {
    id: "demo-t-261",
    name: "Travel Reimbursement",
    amount: "200.00",
    category: "REIMBURSEMENT",
    transaction_date: "2025-11-27",
  },
  // December 2025 — extra
  {
    id: "demo-t-262",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2025-12-09",
  },
  {
    id: "demo-t-263",
    name: "DoorDash",
    amount: "41.20",
    category: "EXPENSE",
    transaction_date: "2025-12-18",
  },
  {
    id: "demo-t-264",
    name: "Movie Tickets",
    amount: "45.00",
    category: "EXPENSE",
    transaction_date: "2025-12-24",
  },
  {
    id: "demo-t-265",
    name: "Holiday Bonus",
    amount: "500.00",
    category: "INCOME",
    transaction_date: "2025-12-23",
  },
  // January 2026 — extra
  {
    id: "demo-t-266",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2026-01-09",
  },
  {
    id: "demo-t-267",
    name: "DoorDash",
    amount: "29.40",
    category: "EXPENSE",
    transaction_date: "2026-01-20",
  },
  {
    id: "demo-t-268",
    name: "Medical Reimbursement",
    amount: "95.00",
    category: "REIMBURSEMENT",
    transaction_date: "2026-01-29",
  },
  // February 2026 — extra
  {
    id: "demo-t-269",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2026-02-08",
  },
  {
    id: "demo-t-270",
    name: "Online Course",
    amount: "39.00",
    category: "EXPENSE",
    transaction_date: "2026-02-18",
  },
  {
    id: "demo-t-271",
    name: "Expense Reimbursement",
    amount: "110.00",
    category: "REIMBURSEMENT",
    transaction_date: "2026-02-21",
  },
  // March 2026 — extra
  {
    id: "demo-t-272",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2026-03-09",
  },
  {
    id: "demo-t-273",
    name: "DoorDash",
    amount: "33.60",
    category: "EXPENSE",
    transaction_date: "2026-03-18",
  },
  {
    id: "demo-t-274",
    name: "Parking Reimbursement",
    amount: "55.00",
    category: "REIMBURSEMENT",
    transaction_date: "2026-03-24",
  },
  // April 2026 — extra
  {
    id: "demo-t-275",
    name: "Barber",
    amount: "25.00",
    category: "EXPENSE",
    transaction_date: "2026-04-07",
  },
  {
    id: "demo-t-276",
    name: "Travel Reimbursement",
    amount: "175.00",
    category: "REIMBURSEMENT",
    transaction_date: "2026-04-16",
  },
  {
    id: "demo-t-277",
    name: "DoorDash",
    amount: "27.80",
    category: "EXPENSE",
    transaction_date: "2026-04-17",
  },
  // Cash tips this month: one banked, the rest still cash on hand (demo for #23)
  {
    id: "demo-t-278",
    name: "Cash",
    amount: "150.00",
    category: "TIPS",
    transaction_date: "2026-04-05",
  },
  {
    id: "demo-t-279",
    name: "Cash",
    amount: "190.00",
    category: "TIPS",
    transaction_date: "2026-04-17",
  },
  {
    id: "demo-t-280",
    name: "Cash",
    amount: "145.00",
    category: "TIPS",
    transaction_date: "2026-04-22",
  },
  {
    id: "demo-t-281",
    name: "Cash",
    amount: "210.00",
    category: "TIPS",
    transaction_date: "2026-04-26",
  },
  // Settled charges for the demo credit card balance below (SEED_CREDIT_CARD_CHARGES)
  // - mirrors the real "settled" transaction allocateCreditCardPayment creates,
  // tagged so balance/spend math skips them (already counted via the payment).
  {
    id: "demo-t-cc-1",
    name: "Amazon",
    amount: "245.00",
    category: "EXPENSE",
    transaction_date: "2026-04-04",
    credit_card_charge_id: "demo-ccc-1",
  },
  {
    id: "demo-t-cc-2",
    name: "Whole Foods Market",
    amount: "165.00",
    category: "EXPENSE",
    transaction_date: "2026-04-12",
    credit_card_charge_id: "demo-ccc-2",
  },
  {
    id: "demo-t-cc-3",
    name: "Spotify Family (Annual)",
    amount: "90.00",
    category: "SUBSCRIPTION",
    transaction_date: "2026-04-20",
    credit_card_charge_id: "demo-ccc-3",
  },
];

const SEED_RECURRING = [
  { id: "demo-r-1", name: "Rent",           amount: "1200.00", day_of_month: 1,    category: "BILL"         },
  { id: "demo-r-2", name: "Spotify",        amount: "9.99",    day_of_month: 1,    category: "SUBSCRIPTION" },
  { id: "demo-r-3", name: "Gym Membership", amount: "40.00",   day_of_month: 5,    category: "SUBSCRIPTION" },
  { id: "demo-r-4", name: "Internet",       amount: "60.00",   day_of_month: 10,   category: "BILL"         },
  { id: "demo-r-5", name: "Netflix",        amount: "15.99",   day_of_month: 15,   category: "SUBSCRIPTION" },
  { id: "demo-r-6", name: "Electric",       amount: "88.00",   day_of_month: 20,   category: "BILL"         },
  { id: "demo-r-7", name: "Groceries",      amount: "400.00",  day_of_month: null, category: "EXPENSE", is_estimate: true },
  // Every other dated recurring item above already has a matching transaction
  // seeded for the current demo month (2026-04), so they're always "paid" by
  // DEMO_TODAY regardless of day_of_month - none of them can ever show
  // "upcoming". This one is deliberately due after DEMO_TODAY's day (28) with
  // no April transaction seeded for it, so the per-category Upcoming panel
  // has something real to show.
  { id: "demo-r-8", name: "Water Bill",     amount: "35.00",   day_of_month: 29,   category: "BILL"         },
];

const SEED_PAYCHECK_SCHEDULES = [
  {
    id: "demo-ps-1",
    name: "Northwind Traders",
    frequency: "BIWEEKLY",
    start_date: "2026-01-02",
    active: true,
  },
];

const SEED_PAYCHECKS = [
  {
    id: "demo-pc-1",
    schedule_id: "demo-ps-1",
    pay_date: "2026-01-02",
    amount: "1820.00",
  },
  {
    id: "demo-pc-2",
    schedule_id: "demo-ps-1",
    pay_date: "2026-01-16",
    amount: "1850.00",
  },
  {
    id: "demo-pc-3",
    schedule_id: "demo-ps-1",
    pay_date: "2026-01-30",
    amount: "1795.00",
  },
  {
    id: "demo-pc-4",
    schedule_id: "demo-ps-1",
    pay_date: "2026-02-13",
    amount: "1880.00",
  },
  {
    id: "demo-pc-5",
    schedule_id: "demo-ps-1",
    pay_date: "2026-02-27",
    amount: "1840.00",
  },
  {
    id: "demo-pc-6",
    schedule_id: "demo-ps-1",
    pay_date: "2026-03-13",
    amount: "1810.00",
  },
  {
    id: "demo-pc-7",
    schedule_id: "demo-ps-1",
    pay_date: "2026-03-27",
    amount: "1905.00",
  },
  {
    id: "demo-pc-8",
    schedule_id: "demo-ps-1",
    pay_date: "2026-04-10",
    amount: "1860.00",
  },
  {
    id: "demo-pc-9",
    schedule_id: "demo-ps-1",
    pay_date: "2026-04-24",
    amount: "1875.00",
  },
];

const SEED_BALANCE_ANCHOR = {
  id: "demo-ba-1",
  current_balance: "2850.00",
  as_of_date: "2026-04-01",
};

const SEED_TIP_DEPOSITS = [
  { id: "demo-td-1", amount: "200.00", deposit_date: "2026-02-14" },
  { id: "demo-td-2", amount: "250.00", deposit_date: "2026-03-20" },
  { id: "demo-td-3", amount: "200.00", deposit_date: "2026-04-15" },
];

const SEED_INSTALLMENTS = [
  {
    id: "demo-in-1",
    name: "Car Exhaust",
    total_amount: "600.00",
    period_months: 6,
    monthly_payment: computeMonthlyPayment("600.00", 6).toFixed(2),
    day_of_month: 15,
    category: "DEBT",
    payments_made: 1,
    last_applied_month: "2026-03",
    active: true,
  },
  {
    id: "demo-in-2",
    name: "Kitchen Remodel",
    total_amount: "4200.00",
    period_months: 24,
    monthly_payment: computeMonthlyPayment("4200.00", 24).toFixed(2),
    day_of_month: null,
    category: "DEBT",
    payments_made: 0,
    last_applied_month: null,
    active: true,
  },
  {
    id: "demo-in-3",
    name: "New Laptop",
    total_amount: "1500.00",
    period_months: null,
    monthly_payment: null,
    day_of_month: null,
    category: "DEBT",
    payments_made: 0,
    last_applied_month: null,
    active: true,
  },
];

// One demo card, partially paid off (#54) - total_amount bigger than what's
// been allocated to charges so far, so "left" > 0 and the progress bar reads
// as in-progress instead of empty or fully paid.
const SEED_CREDIT_CARD_PAYMENTS = [
  {
    id: "demo-ccp-1",
    name: "Credit Card Payment",
    total_amount: "780.00",
    payment_date: "2026-04-01",
    due_date: "2026-04-30",
    created_at: "2026-04-01T12:00:00.000Z",
  },
];

const SEED_CREDIT_CARD_CHARGES = [
  {
    id: "demo-ccc-1",
    name: "Amazon",
    total_amount: "245.00",
    category: "EXPENSE",
    charge_date: "2026-04-04",
    created_at: "2026-04-04T12:00:00.000Z",
  },
  {
    id: "demo-ccc-2",
    name: "Whole Foods Market",
    total_amount: "165.00",
    category: "EXPENSE",
    charge_date: "2026-04-12",
    created_at: "2026-04-12T12:00:00.000Z",
  },
  {
    id: "demo-ccc-3",
    name: "Spotify Family (Annual)",
    total_amount: "90.00",
    category: "SUBSCRIPTION",
    charge_date: "2026-04-20",
    created_at: "2026-04-20T12:00:00.000Z",
  },
];

const SEED_CREDIT_CARD_ALLOCATIONS = [
  { id: "demo-cca-1", charge_id: "demo-ccc-1", payment_id: "demo-ccp-1", amount_applied: "245.00", created_at: "2026-04-04T12:00:00.000Z" },
  { id: "demo-cca-2", charge_id: "demo-ccc-2", payment_id: "demo-ccp-1", amount_applied: "165.00", created_at: "2026-04-12T12:00:00.000Z" },
  { id: "demo-cca-3", charge_id: "demo-ccc-3", payment_id: "demo-ccp-1", amount_applied: "90.00", created_at: "2026-04-20T12:00:00.000Z" },
];

// Init
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
  if (!localStorage.getItem(PC_KEY)) {
    localStorage.setItem(PC_KEY, JSON.stringify(SEED_PAYCHECKS));
  }
  if (!localStorage.getItem(BA_KEY)) {
    localStorage.setItem(BA_KEY, JSON.stringify(SEED_BALANCE_ANCHOR));
  }
  if (!localStorage.getItem(TD_KEY)) {
    localStorage.setItem(TD_KEY, JSON.stringify(SEED_TIP_DEPOSITS));
  }
  if (!localStorage.getItem(IN_KEY)) {
    localStorage.setItem(IN_KEY, JSON.stringify(SEED_INSTALLMENTS));
  }
  if (!localStorage.getItem(CCP_KEY)) {
    localStorage.setItem(CCP_KEY, JSON.stringify(SEED_CREDIT_CARD_PAYMENTS));
  }
  if (!localStorage.getItem(CCC_KEY)) {
    localStorage.setItem(CCC_KEY, JSON.stringify(SEED_CREDIT_CARD_CHARGES));
  }
  if (!localStorage.getItem(CCA_KEY)) {
    localStorage.setItem(CCA_KEY, JSON.stringify(SEED_CREDIT_CARD_ALLOCATIONS));
  }
}

export function clearDemo() {
  localStorage.removeItem(TX_KEY);
  localStorage.removeItem(RP_KEY);
  localStorage.removeItem(PS_KEY);
  localStorage.removeItem(PC_KEY);
  localStorage.removeItem(BA_KEY);
  localStorage.removeItem(RES_KEY);
  localStorage.removeItem(TD_KEY);
  localStorage.removeItem(IN_KEY);
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(CCP_KEY);
  localStorage.removeItem(CCC_KEY);
  localStorage.removeItem(CCA_KEY);
  localStorage.removeItem("demo");
}

// Auto-apply recurring payments
const DEMO_TODAY = "2026-04-28";

function applyRecurringPayments() {
  const now = new Date(DEMO_TODAY + "T00:00:00");
  const today = now.getDate();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${year}-${month}`;

  const recurring = getAll(RP_KEY);
  const transactions = getAll(TX_KEY);

  let changed = false;

  let recurringChanged = false;

  recurring.forEach((rp) => {
    if (rp.is_estimate) return;
    if (rp.active === false) return;
    if (rp.day_of_month == null || rp.day_of_month > today) return;
    if (rp.last_applied_month === prefix) return;

    const alreadyExists = transactions.some(
      (t) =>
        t.transaction_date.startsWith(prefix) &&
        (t._recurring_id === rp.id ||
          t.recurring_payment_id === rp.id ||
          (t.name === rp.name && t.amount === rp.amount)),
    );
    if (!alreadyExists) {
      const maxDay = new Date(year, now.getMonth() + 1, 0).getDate();
      const day = String(Math.min(rp.day_of_month, maxDay)).padStart(2, "0");

      transactions.push({
        id: nextId(),
        name: rp.name,
        amount: rp.amount,
        category: rp.category,
        transaction_date: `${prefix}-${day}`,
        _recurring_id: rp.id,
        recurring_payment_id: rp.id,
      });
      changed = true;
    }

    rp.last_applied_month = prefix;
    recurringChanged = true;
  });

  if (changed) saveAll(TX_KEY, transactions);
  if (recurringChanged) saveAll(RP_KEY, recurring);
}

// Current month as "YYYY-MM", used to check if this month's payment already posted.
const demoCurrentMonth = () => DEMO_TODAY.slice(0, 7);

// Mirrors transaction_service.apply_installments. Stops posting once the term ends.
function applyInstallments() {
  const now = new Date(DEMO_TODAY + "T00:00:00");
  const today = now.getDate();
  const currentMonth = demoCurrentMonth();
  const maxDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const installments = getAll(IN_KEY);
  const transactions = getAll(TX_KEY);

  let changed = false;

  installments.forEach((inst) => {
    if (inst.active === false) return;
    if (inst.day_of_month == null || inst.period_months == null) return;
    if ((inst.payments_made ?? 0) >= inst.period_months) return; // paid off
    if (inst.last_applied_month === currentMonth) return;

    const day = Math.min(inst.day_of_month, maxDay);
    if (day > today) return;

    transactions.push({
      id: nextId(),
      name: inst.name,
      amount: inst.monthly_payment,
      category: inst.category,
      transaction_date: `${currentMonth}-${String(day).padStart(2, "0")}`,
      installment_id: inst.id,
    });
    inst.last_applied_month = currentMonth;
    inst.payments_made = (inst.payments_made ?? 0) + 1;
    changed = true;
  });

  if (changed) {
    saveAll(TX_KEY, transactions);
    saveAll(IN_KEY, installments);
  }
}

// Transactions
export const getTransactions = () => {
  applyRecurringPayments();
  applyInstallments();
  return respond(getAll(TX_KEY));
};

export const createTransaction = (data) => {
  const items = getAll(TX_KEY);
  const item = {
    id: nextId(),
    ...data,
    amount: String(parseFloat(data.amount).toFixed(2)),
  };
  saveAll(TX_KEY, [...items, item]);
  return respond(item);
};

export const updateTransaction = (id, data) => {
  const items = getAll(TX_KEY);
  let updated;
  const next = items.map((t) => {
    if (t.id !== id) return t;
    updated = {
      ...t,
      ...data,
      amount:
        data.amount != null
          ? String(parseFloat(data.amount).toFixed(2))
          : t.amount,
    };
    return updated;
  });
  saveAll(TX_KEY, next);
  return respond(updated);
};

export const deleteTransaction = (id) => {
  const transactions = getAll(TX_KEY);
  const target = transactions.find((t) => t.id === id);
  saveAll(
    TX_KEY,
    transactions.filter((t) => t.id !== id),
  );

  if (target?.paycheck_id) {
    saveAll(
      PC_KEY,
      getAll(PC_KEY).map((p) =>
        p.id === target.paycheck_id ? { ...p, amount: null } : p,
      ),
    );
  }

  return Promise.resolve({ data: null, status: 204 });
};

// Import
export const previewImport = async (file) => {
  const text = await file.text();
  const { headers, rows: rawRows } = parseCsvText(text);
  const detectedMapping = detectColumnMapping(headers);
  const rows = annotateImportRows(
    rawRows,
    detectedMapping,
    "MM/DD/YYYY",
    "negative_expense",
    getAll(TX_KEY),
  );

  return respond({ source_format: "csv", rows });
};

export const commitImport = async ({ rows, tip_deposit_rows }) => {
  const toCreate = rows.filter((r) => !r.skip);
  const created = [];
  for (const r of toCreate) {
    const res = await createTransaction({
      name: r.name,
      amount: r.amount,
      category: r.category,
      transaction_date: r.transaction_date,
    });
    created.push(res.data);
  }

  const createdDeposits = [];
  for (const d of tip_deposit_rows || []) {
    const res = await createTipDeposit({
      amount: d.amount,
      deposit_date: d.deposit_date,
    });
    createdDeposits.push(res.data);
  }

  return respond({
    created_count: created.length,
    transactions: created,
    tip_deposits_created: createdDeposits.length,
    tip_deposits: createdDeposits,
  });
};

export const aiCleanupNames = () =>
  Promise.reject({
    response: {
      status: 503,
      data: {
        detail: "AI cleanup needs a real account — not available in demo mode.",
      },
    },
  });

// Recurring payments
// INCOME and TIPS are excluded - they're handled by paychecks and cash tracking,
// not recurring payments. Mirrors the backend's category validator.
const RECURRING_BLOCKED_CATEGORIES = new Set(["INCOME", "TIPS"]);

function rejectBlockedCategory(category) {
  if (RECURRING_BLOCKED_CATEGORIES.has(category)) {
    return Promise.reject({
      response: {
        status: 422,
        data: {
          detail: `${category} is not a valid category for a recurring payment`,
        },
      },
    });
  }
  return null;
}

export const getRecurringPayments = () =>
  respond(getAll(RP_KEY).filter((r) => r.active !== false));

export const createRecurringPayment = (data) => {
  const rejected = rejectBlockedCategory(data.category);
  if (rejected) return rejected;

  const items = getAll(RP_KEY);
  const item = {
    id: nextId(),
    ...data,
    amount: String(parseFloat(data.amount).toFixed(2)),
    is_estimate: data.is_estimate ?? false,
    active: true,
    last_applied_month: null,
  };
  saveAll(RP_KEY, [...items, item]);
  return respond(item);
};

export const updateRecurringPayment = (id, data) => {
  if (data.category != null) {
    const rejected = rejectBlockedCategory(data.category);
    if (rejected) return rejected;
  }

  const items = getAll(RP_KEY);
  let updated;
  const next = items.map((r) => {
    if (r.id !== id) return r;
    updated = {
      ...r,
      ...data,
      amount:
        data.amount != null
          ? String(parseFloat(data.amount).toFixed(2))
          : r.amount,
    };
    return updated;
  });
  saveAll(RP_KEY, next);
  return respond(updated);
};

// Average of a recurring payment's recent amounts, for estimating a pending item.
function averageRecentRecurringAmounts(
  recurringPaymentId,
  allTransactions,
  limit = 3,
) {
  const amounts = allTransactions
    .filter((t) => t.recurring_payment_id === recurringPaymentId)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .slice(0, limit)
    .map((t) => parseFloat(t.amount));
  if (amounts.length === 0) return null;
  return amounts.reduce((a, b) => a + b, 0) / amounts.length;
}

// Mirrors transaction_service.get_upcoming_recurring_payments.
export const getUpcomingRecurringPayments = () => {
  applyRecurringPayments();

  const today = new Date(DEMO_TODAY + "T00:00:00");
  const prefix = demoCurrentMonth();
  const maxDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  const transactions = getAll(TX_KEY);

  const items = getAll(RP_KEY)
    .filter(
      (rp) =>
        rp.active !== false &&
        rp.day_of_month != null &&
        !RECURRING_BLOCKED_CATEGORIES.has(rp.category),
    )
    .map((rp) => {
      const day = Math.min(rp.day_of_month, maxDay);
      const dueDate = `${prefix}-${String(day).padStart(2, "0")}`;
      const linked = transactions.find(
        (t) =>
          t.recurring_payment_id === rp.id &&
          t.transaction_date.startsWith(prefix),
      );

      let status;
      if (linked) status = "paid";
      else if (rp.last_applied_month === prefix) status = "skipped";
      else if (dueDate <= toDateStr(today)) status = "pending";
      else status = "upcoming";

      return {
        id: rp.id,
        name: rp.name,
        category: rp.category,
        due_date: dueDate,
        status,
        is_estimate: !!rp.is_estimate,
        amount: rp.amount,
        actual_amount: linked ? linked.amount : null,
        estimated_amount:
          status === "pending"
            ? (averageRecentRecurringAmounts(rp.id, transactions)?.toFixed(2) ??
              null)
            : null,
      };
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  return respond(items);
};

function findPendingRecurringPayment(id) {
  const rp = getAll(RP_KEY).find((r) => r.id === id);
  if (!rp) {
    return {
      error: {
        response: {
          status: 404,
          data: { detail: "Recurring payment not found" },
        },
      },
    };
  }
  if (!rp.active || !rp.is_estimate || rp.day_of_month == null) {
    return {
      error: {
        response: {
          status: 400,
          data: { detail: "Recurring payment is not a pending bill" },
        },
      },
    };
  }

  const today = new Date(DEMO_TODAY + "T00:00:00");
  const prefix = demoCurrentMonth();
  const maxDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  const dueDate = `${prefix}-${String(Math.min(rp.day_of_month, maxDay)).padStart(2, "0")}`;

  if (rp.last_applied_month === prefix) {
    return {
      error: {
        response: {
          status: 400,
          data: { detail: "Already resolved for this month" },
        },
      },
    };
  }
  if (dueDate > toDateStr(today)) {
    return {
      error: { response: { status: 400, data: { detail: "Not due yet" } } },
    };
  }

  return { rp, dueDate, prefix };
}

export const confirmRecurringPayment = (id, data) => {
  const result = findPendingRecurringPayment(id);
  if (result.error) return Promise.reject(result.error);
  const { rp, dueDate, prefix } = result;

  const transaction = {
    id: nextId(),
    name: rp.name,
    amount: String(parseFloat(data.amount).toFixed(2)),
    category: rp.category,
    transaction_date: dueDate,
    recurring_payment_id: rp.id,
  };
  saveAll(TX_KEY, [...getAll(TX_KEY), transaction]);
  saveAll(
    RP_KEY,
    getAll(RP_KEY).map((r) =>
      r.id === id ? { ...r, last_applied_month: prefix } : r,
    ),
  );

  return respond(transaction);
};

export const skipRecurringPayment = (id) => {
  const result = findPendingRecurringPayment(id);
  if (result.error) return Promise.reject(result.error);
  const { prefix } = result;

  saveAll(
    RP_KEY,
    getAll(RP_KEY).map((r) =>
      r.id === id ? { ...r, last_applied_month: prefix } : r,
    ),
  );
  return Promise.resolve({ data: null, status: 204 });
};

export const deleteRecurringPayment = (id) => {
  saveAll(
    RP_KEY,
    getAll(RP_KEY).map((r) => (r.id === id ? { ...r, active: false } : r)),
  );
  return Promise.resolve({ data: null, status: 204 });
};

// Paychecks
// Mirrors app/services/paycheck_service.py.

const PAYCHECK_EXPENSE_CATEGORIES = new Set([
  "EXPENSE",
  "BILL",
  "SUBSCRIPTION",
  "SAVINGS",
  "DEBT",
]);
const PAYCHECK_INCOME_CATEGORIES = new Set(["INCOME", "REIMBURSEMENT", "TIPS"]);

// Excludes SAVINGS - moving money into savings isn't spending it.
const NON_SAVINGS_EXPENSE_CATEGORIES = new Set([
  "EXPENSE",
  "BILL",
  "SUBSCRIPTION",
  "DEBT",
]);
// Money that's actually arrived. Cash tips don't count until deposited (#131).
const MONEY_IN_CATEGORIES = new Set(["INCOME", "REIMBURSEMENT"]);
const SAVINGS_HISTORY_MONTHS = 3;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Adds months to a date, clamping the day if the target month is shorter
// (Jan 31 + 1 month -> Feb 28). Mirrors _add_months.
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

// Yields a schedule's pay dates going forward. SEMI_MONTHLY produces two dates
// 15 days apart each month.
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
  const lastDay = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth() + 1,
    0,
  ).getDate();
  const candidate = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    Math.min(dayOfMonth, lastDay),
  );
  if (candidate >= fromDate) return candidate;

  const nextMonth = addMonthsClamped(
    new Date(fromDate.getFullYear(), fromDate.getMonth(), 1),
    1,
  );
  const nextLastDay = new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    Math.min(dayOfMonth, nextLastDay),
  );
}

function backfillPaychecks(through) {
  const schedules = getAll(PS_KEY);
  const paychecks = getAll(PC_KEY);
  // Defaulting this to DEMO_TODAY itself meant backfill only ever filled in
  // paychecks up to today, never past it - the "next payday" SEED_PAYCHECKS'
  // own comment says backfill would add was never actually generated. A
  // month-out horizon comfortably covers the next occurrence for any of the
  // supported frequencies (weekly/biweekly/monthly/semi-monthly).
  const horizon = through ?? new Date(new Date(DEMO_TODAY + "T00:00:00").getTime() + 30 * 24 * 60 * 60 * 1000);
  let changed = false;

  schedules
    .filter((schedule) => schedule.active !== false)
    .forEach((schedule) => {
      const expected = generatePayDatesThrough(schedule, horizon);
      const existingDates = new Set(
        paychecks
          .filter((p) => p.schedule_id === schedule.id)
          .map((p) => p.pay_date),
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

export const getPaycheckSchedules = () =>
  respond(getAll(PS_KEY).filter((s) => s.active !== false));

export const createPaycheckSchedule = (data) => {
  const items = getAll(PS_KEY);
  const item = {
    id: nextId(),
    name: data.name,
    frequency: data.frequency,
    start_date: data.start_date,
    active: true,
  };
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

  saveAll(
    PC_KEY,
    getAll(PC_KEY).filter((p) => p.schedule_id !== id || p.amount != null),
  );

  if (data.name != null) {
    const scheduled = new Set(
      getAll(PC_KEY)
        .filter((p) => p.schedule_id === id)
        .map((p) => p.id),
    );
    saveAll(
      TX_KEY,
      getAll(TX_KEY).map((t) =>
        t.paycheck_id != null && scheduled.has(t.paycheck_id)
          ? { ...t, name: data.name }
          : t,
      ),
    );
  }

  return respond(updated);
};

export const deletePaycheckSchedule = (id) => {
  saveAll(
    PS_KEY,
    getAll(PS_KEY).map((s) => (s.id === id ? { ...s, active: false } : s)),
  );
  return Promise.resolve({ data: null, status: 204 });
};

export const getPaychecks = () => {
  const all = backfillPaychecks();
  const scheduleNames = Object.fromEntries(
    getAll(PS_KEY).map((s) => [s.id, s.name]),
  );

  // A guessed amount for display only - never counted in the real spendable-surplus math.
  const withEstimates = all.map((p) => {
    const schedule_name = scheduleNames[p.schedule_id] ?? null;
    if (p.amount != null)
      return { ...p, schedule_name, estimated_amount: null };
    const estimate = averageRecentAmounts(p.schedule_id, all);
    return {
      ...p,
      schedule_name,
      estimated_amount: estimate != null ? estimate.toFixed(2) : null,
    };
  });

  const sorted = withEstimates.sort((a, b) =>
    b.pay_date.localeCompare(a.pay_date),
  );
  const pending = sorted.filter(
    (p) => p.pay_date <= DEMO_TODAY && p.amount == null,
  );
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
      transactions[existingIdx] = {
        ...transactions[existingIdx],
        amount: updated.amount,
        transaction_date: updated.pay_date,
      };
    } else {
      const schedule = getAll(PS_KEY).find((s) => s.id === updated.schedule_id);
      transactions.push({
        id: nextId(),
        name: schedule?.name || "Paycheck",
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

function balanceDelta(t) {
  const amt = parseFloat(t.amount);
  // A settled credit card charge (#54) already had its cash counted once via
  // its payment's own transaction - counting it again here would double it.
  // An expense paid_with_cash never touched checking either, same reasoning
  // from the other direction - the cash tips that funded it were never
  // counted as income here (#131), so counting the expense side without the
  // income side would be the asymmetry #151 fixes.
  if (t.category === "TIPS" || t.credit_card_charge_id || t.paid_with_cash) return 0;
  return PAYCHECK_INCOME_CATEGORIES.has(t.category) ? amt : -amt;
}

function computeRunningBalance() {
  const raw = localStorage.getItem(BA_KEY);
  if (!raw) return null;
  const anchor = JSON.parse(raw);

  const net = getAll(TX_KEY)
    .filter(
      (t) =>
        t.transaction_date >= anchor.as_of_date &&
        t.transaction_date <= DEMO_TODAY,
    )
    .reduce((sum, t) => sum + balanceDelta(t), 0);

  const depositTotal = getAll(TD_KEY)
    .filter(
      (d) =>
        d.deposit_date >= anchor.as_of_date && d.deposit_date <= DEMO_TODAY,
    )
    .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  return parseFloat(anchor.current_balance) + net + depositTotal;
}

export const getRunningBalance = () => {
  const raw = localStorage.getItem(BA_KEY);
  if (!raw) {
    return Promise.reject({
      response: { status: 404, data: { detail: "No starting balance set" } },
    });
  }
  const anchor = JSON.parse(raw);
  return respond({
    balance: computeRunningBalance().toFixed(2),
    as_of_date: anchor.as_of_date,
  });
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

function committedItems(recurring, today, horizon) {
  let total = 0;
  const items = [];
  recurring.forEach((rp) => {
    if (rp.day_of_month == null) {
      total += parseFloat(rp.amount);
      items.push({
        name: rp.name,
        amount: parseFloat(rp.amount).toFixed(2),
        day_of_month: null,
        due_date: null,
        category: rp.category,
      });
    } else {
      const occurrence = nextOccurrence(rp.day_of_month, today);
      if (occurrence <= horizon) {
        total += parseFloat(rp.amount);
        items.push({
          name: rp.name,
          amount: parseFloat(rp.amount).toFixed(2),
          day_of_month: rp.day_of_month,
          due_date: toDateStr(occurrence),
          category: rp.category,
        });
      }
    }
  });
  items.sort(
    (a, b) =>
      (a.due_date == null) - (b.due_date == null) ||
      (a.due_date ?? "").localeCompare(b.due_date ?? ""),
  );
  return { total, items };
}

export const getSpendingReserve = () => {
  const raw = localStorage.getItem(RES_KEY);
  return respond({
    spending_reserve: raw ? JSON.parse(raw).spending_reserve : "0.00",
  });
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
    return Promise.reject({
      response: { status: 404, data: { detail: "No starting balance set" } },
    });
  }

  const schedules = getAll(PS_KEY).filter((s) => s.active !== false);
  if (schedules.length === 0) {
    return Promise.reject({
      response: {
        status: 404,
        data: { detail: "No active paycheck schedule found" },
      },
    });
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
  const nextPaydayStr = toDateStr(nextPayday);
  const backfilled = backfillPaychecks(nextPayday);
  const enteredNextPaycheck = backfilled.find(
    (p) =>
      p.schedule_id === nextSchedule?.id &&
      p.pay_date === nextPaydayStr &&
      p.amount != null,
  );
  const nextPaydayEstimate = enteredNextPaycheck
    ? parseFloat(enteredNextPaycheck.amount)
    : nextSchedule
      ? averageRecentAmounts(nextSchedule.id, backfilled)
      : null;

  const recurring = getAll(RP_KEY).filter(
    (rp) => rp.active !== false && PAYCHECK_EXPENSE_CATEGORIES.has(rp.category),
  );

  const { total: billsBeforeNextPayday, items: billsBreakdown } =
    committedItems(recurring, today, nextPayday);

  const spendableSurplus =
    runningBalance + (nextPaydayEstimate ?? 0) - billsBeforeNextPayday;
  const freeToAllocate = spendableSurplus - getSpendingReserveValue();

  return respond({
    next_payday: nextPaydayStr,
    spendable_surplus: spendableSurplus.toFixed(2),
    free_to_allocate: freeToAllocate.toFixed(2),
    bills_before_next_payday: billsBeforeNextPayday.toFixed(2),
    next_payday_estimate:
      nextPaydayEstimate != null ? nextPaydayEstimate.toFixed(2) : null,
    running_balance: runningBalance.toFixed(2),
    bills_breakdown: billsBreakdown,
  });
};

function computeWholeMonthIncome(schedules, monthStartStr, monthEndStr) {
  const actualIncome =
    getAll(TX_KEY)
      .filter(
        (t) =>
          MONEY_IN_CATEGORIES.has(t.category) &&
          t.transaction_date >= monthStartStr &&
          t.transaction_date < monthEndStr,
      )
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
    getAll(TD_KEY)
      .filter(
        (d) => d.deposit_date >= monthStartStr && d.deposit_date < monthEndStr,
      )
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  if (schedules.length === 0) return actualIncome;

  const allPaychecks = backfillPaychecks(new Date(monthEndStr + "T00:00:00"));
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const unfilled = allPaychecks.filter(
    (p) =>
      scheduleIds.has(p.schedule_id) &&
      p.pay_date >= monthStartStr &&
      p.pay_date < monthEndStr &&
      p.amount == null,
  );

  const projectedUnfilled = unfilled.reduce((sum, p) => {
    const estimate = averageRecentAmounts(p.schedule_id, allPaychecks);
    return sum + (estimate ?? 0);
  }, 0);

  return actualIncome + projectedUnfilled;
}

export const getEstimatedSavings = () => {
  const schedules = getAll(PS_KEY).filter((s) => s.active !== false);
  if (schedules.length === 0) {
    return Promise.reject({
      response: {
        status: 404,
        data: { detail: "No active paycheck schedule found" },
      },
    });
  }

  const today = new Date(DEMO_TODAY + "T00:00:00");
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = nextMonthStart(today);
  const monthStartStr = toDateStr(monthStart);
  const monthEndStr = toDateStr(monthEnd);

  const wholeMonthIncome = computeWholeMonthIncome(
    schedules,
    monthStartStr,
    monthEndStr,
  );
  if (wholeMonthIncome <= 0) {
    return Promise.reject({
      response: { status: 404, data: { detail: "No paycheck amounts yet" } },
    });
  }

  const historyStartStr = toDateStr(
    addMonthsClamped(monthStart, -SAVINGS_HISTORY_MONTHS),
  );

  const recurringNames = new Set(
    getAll(RP_KEY)
      .filter(
        (rp) =>
          rp.active !== false &&
          !rp.is_estimate &&
          NON_SAVINGS_EXPENSE_CATEGORIES.has(rp.category),
      )
      .map((rp) => rp.name),
  );

  const spendRows = getAll(TX_KEY).filter(
    (t) =>
      NON_SAVINGS_EXPENSE_CATEGORIES.has(t.category) &&
      !t._recurring_id &&
      !t.recurring_payment_id &&
      !t.credit_card_charge_id &&
      !t.paid_with_cash &&
      !recurringNames.has(t.name) &&
      t.transaction_date >= historyStartStr &&
      t.transaction_date < monthStartStr,
  );

  const totalsByMonth = {};
  spendRows.forEach((t) => {
    const key = t.transaction_date.slice(0, 7);
    totalsByMonth[key] = (totalsByMonth[key] ?? 0) + parseFloat(t.amount);
  });

  const expectedMonths = [];
  for (let n = 1; n <= SAVINGS_HISTORY_MONTHS; n++) {
    expectedMonths.push(
      toDateStr(addMonthsClamped(monthStart, -n)).slice(0, 7),
    );
  }
  if (!expectedMonths.every((m) => m in totalsByMonth)) {
    return Promise.reject({
      response: {
        status: 404,
        data: { detail: "Not enough spending history" },
      },
    });
  }

  const totalSpend = Object.values(totalsByMonth).reduce((a, b) => a + b, 0);
  const monthlyDiscretionaryAvg = totalSpend / SAVINGS_HISTORY_MONTHS;

  const savedSoFar = getAll(TX_KEY)
    .filter(
      (t) =>
        t.category === "SAVINGS" &&
        t.transaction_date >= monthStartStr &&
        t.transaction_date < monthEndStr,
    )
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  // A dated bill explicitly skipped this month (skipRecurringPayment sets
  // last_applied_month without posting a transaction) never materialized and
  // never will for this month - it shouldn't still eat room in the ceiling
  // (#133), same fix as the real backend.
  const currentMonthPrefix = demoCurrentMonth();
  const linkedThisMonth = new Set(
    getAll(TX_KEY)
      .filter(
        (t) =>
          t.recurring_payment_id &&
          t.transaction_date >= monthStartStr &&
          t.transaction_date < monthEndStr,
      )
      .map((t) => t.recurring_payment_id),
  );
  const wasSkipped = (rp) =>
    rp.last_applied_month === currentMonthPrefix &&
    !linkedThisMonth.has(rp.id);

  const committedRecurring = getAll(RP_KEY)
    .filter(
      (rp) =>
        rp.active !== false &&
        !(rp.is_estimate && rp.day_of_month == null) &&
        NON_SAVINGS_EXPENSE_CATEGORIES.has(rp.category) &&
        !wasSkipped(rp),
    )
    .reduce((sum, rp) => sum + parseFloat(rp.amount), 0);

  const todayStr = toDateStr(today);
  const discretionarySpentSoFar = getAll(TX_KEY)
    .filter(
      (t) =>
        NON_SAVINGS_EXPENSE_CATEGORIES.has(t.category) &&
        !t._recurring_id &&
        !t.recurring_payment_id &&
        !t.credit_card_charge_id &&
        !t.paid_with_cash &&
        t.transaction_date >= monthStartStr &&
        t.transaction_date <= todayStr,
    )
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  // Whatever's left of the historical average once actual spend is netted
  // out, floored at 0 - not a full remaining-days share of the average
  // stacked on top of actual spend unconditionally, which double-billed a
  // front-loaded month (#133), same fix as the real backend.
  const discretionaryProjectedRemaining = Math.max(
    monthlyDiscretionaryAvg - discretionarySpentSoFar,
    0,
  );

  const rawCeiling =
    wholeMonthIncome -
    committedRecurring -
    discretionarySpentSoFar -
    discretionaryProjectedRemaining;
  const estimatedSavings = Math.max(rawCeiling, 0);

  return respond({
    month_start: monthStartStr,
    month_end: monthEndStr,
    estimated_savings: estimatedSavings.toFixed(2),
    saved_so_far: savedSoFar.toFixed(2),
    whole_month_income: wholeMonthIncome.toFixed(2),
    committed_recurring: committedRecurring.toFixed(2),
    discretionary_spent_so_far: discretionarySpentSoFar.toFixed(2),
    discretionary_projected_remaining:
      discretionaryProjectedRemaining.toFixed(2),
  });
};

// Tip deposits
export const getTipDeposits = () =>
  respond(
    getAll(TD_KEY)
      .slice()
      .sort((a, b) => b.deposit_date.localeCompare(a.deposit_date)),
  );

export const createTipDeposit = (data) => {
  const items = getAll(TD_KEY);
  const item = {
    id: nextId(),
    amount: String(parseFloat(data.amount).toFixed(2)),
    deposit_date: data.deposit_date,
  };
  saveAll(TD_KEY, [...items, item]);
  return respond(item);
};

export const updateTipDeposit = (id, data) => {
  let updated;
  const next = getAll(TD_KEY).map((d) => {
    if (d.id !== id) return d;
    updated = {
      ...d,
      ...data,
      amount:
        data.amount != null
          ? String(parseFloat(data.amount).toFixed(2))
          : d.amount,
    };
    return updated;
  });
  saveAll(TD_KEY, next);
  return respond(updated);
};

export const deleteTipDeposit = (id) => {
  saveAll(
    TD_KEY,
    getAll(TD_KEY).filter((d) => d.id !== id),
  );
  return Promise.resolve({ data: null, status: 204 });
};

export const getCashOnHand = () => {
  const tipsEarned = getAll(TX_KEY)
    .filter((t) => t.category === "TIPS")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const tipsDeposited = getAll(TD_KEY).reduce(
    (s, d) => s + parseFloat(d.amount),
    0,
  );
  return respond({
    cash_on_hand: (tipsEarned - tipsDeposited).toFixed(2),
    tips_earned: tipsEarned.toFixed(2),
    tips_deposited: tipsDeposited.toFixed(2),
  });
};

// Installments

const NO_TERM_REASON = "Set a term for this installment to see insights";

export const getInstallments = () =>
  respond(getAll(IN_KEY).filter((i) => i.active !== false));

export const createInstallment = (data) => {
  const items = getAll(IN_KEY);
  const hasTerm = data.period_months != null && data.period_months !== "";
  const hasDay = data.day_of_month != null && data.day_of_month !== "";
  const item = {
    id: nextId(),
    name: data.name,
    total_amount: String(parseFloat(data.total_amount).toFixed(2)),
    period_months: hasTerm ? parseInt(data.period_months, 10) : null,
    monthly_payment: hasTerm
      ? computeMonthlyPayment(data.total_amount, data.period_months).toFixed(2)
      : null,
    day_of_month: hasDay ? parseInt(data.day_of_month, 10) : null,
    category: "DEBT", // always debt, not client-settable, mirrors the real backend
    payments_made: 0,
    last_applied_month: null,
    active: true,
  };
  saveAll(IN_KEY, [...items, item]);
  return respond(item);
};

export const updateInstallment = (id, data) => {
  let updated;
  const next = getAll(IN_KEY).map((i) => {
    if (i.id !== id) return i;
    updated = { ...i };
    if (data.name !== undefined) updated.name = data.name;
    if (data.total_amount != null)
      updated.total_amount = String(parseFloat(data.total_amount).toFixed(2));
    if ("period_months" in data) {
      updated.period_months =
        data.period_months != null && data.period_months !== ""
          ? parseInt(data.period_months, 10)
          : null;
    }
    if ("day_of_month" in data) {
      updated.day_of_month =
        data.day_of_month != null && data.day_of_month !== ""
          ? parseInt(data.day_of_month, 10)
          : null;
    }
    if (data.total_amount != null || "period_months" in data) {
      updated.monthly_payment = updated.period_months
        ? computeMonthlyPayment(
            updated.total_amount,
            updated.period_months,
          ).toFixed(2)
        : null;
    }
    return updated;
  });

  if (updated && updated.last_applied_month === demoCurrentMonth()) {
    const now = new Date(DEMO_TODAY + "T00:00:00");
    const maxDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const stillDue =
      updated.day_of_month != null &&
      updated.period_months != null &&
      Math.min(updated.day_of_month, maxDay) <= now.getDate();

    const transactions = getAll(TX_KEY);
    const idx = transactions.findIndex(
      (t) =>
        t.installment_id === id &&
        t.transaction_date.startsWith(demoCurrentMonth()),
    );

    if (!stillDue) {
      if (idx !== -1) transactions.splice(idx, 1);
      updated.last_applied_month = null;
      updated.payments_made = Math.max(0, (updated.payments_made ?? 0) - 1);
      saveAll(TX_KEY, transactions);
    } else if (idx !== -1) {
      transactions[idx] = {
        ...transactions[idx],
        name: updated.name,
        amount: updated.monthly_payment,
      };
      saveAll(TX_KEY, transactions);
    }
  }

  saveAll(IN_KEY, next);
  return respond(updated);
};

export const deleteInstallment = (id) => {
  saveAll(
    IN_KEY,
    getAll(IN_KEY).map((i) => (i.id === id ? { ...i, active: false } : i)),
  );
  return Promise.resolve({ data: null, status: 204 });
};

export const getInstallmentInsights = (id) => {
  const installment = getAll(IN_KEY).find((i) => i.id === id);
  if (!installment) {
    return Promise.reject({
      response: { status: 404, data: { detail: "Installment not found" } },
    });
  }

  if (installment.monthly_payment == null) {
    return respond({
      available: false,
      reason: NO_TERM_REASON,
      monthly_payment: null,
      available_cash: null,
      ratio: null,
      status: null,
    });
  }

  return getSpendableSurplus().then(
    (res) => {
      const { status, ratio } = computeGaugeStatus(
        installment.monthly_payment,
        res.data.free_to_allocate,
      );
      return respond({
        available: true,
        reason: null,
        monthly_payment: installment.monthly_payment,
        available_cash: res.data.free_to_allocate,
        ratio,
        status,
      });
    },
    (err) =>
      respond({
        available: false,
        reason: err.response?.data?.detail ?? "Not enough budget data yet",
        monthly_payment: installment.monthly_payment,
        available_cash: null,
        ratio: null,
        status: null,
      }),
  );
};

// Credit card payment allocation (#54) - mirrors app/services/credit_card_service.py.
// The anchor payment transaction keeps its full amount/category untouched;
// allocating breaks it down into real, categorized charge transactions
// without double-counting the cash movement (see cents/_balanceDelta below).

function ccCents(n) {
  return Math.round(n * 100) / 100;
}

function paidOnPayment(paymentId) {
  return ccCents(
    getAll(CCA_KEY)
      .filter((a) => a.payment_id === paymentId)
      .reduce((sum, a) => sum + parseFloat(a.amount_applied), 0),
  );
}

function paidOnCharge(chargeId) {
  return ccCents(
    getAll(CCA_KEY)
      .filter((a) => a.charge_id === chargeId)
      .reduce((sum, a) => sum + parseFloat(a.amount_applied), 0),
  );
}

function settledTransactionIdFor(chargeId) {
  const settled = getAll(TX_KEY).find((t) => t.credit_card_charge_id === chargeId);
  return settled ? settled.id : null;
}

function chargeSummary(charge) {
  const paid = paidOnCharge(charge.id);
  return {
    id: charge.id,
    name: charge.name,
    total_amount: charge.total_amount,
    amount_paid: paid.toFixed(2),
    category: charge.category,
    charge_date: charge.charge_date,
    settled: paid >= parseFloat(charge.total_amount),
    settled_transaction_id: settledTransactionIdFor(charge.id),
  };
}

function creditCardPaymentDetail(payment) {
  const chargeIds = [
    ...new Set(getAll(CCA_KEY).filter((a) => a.payment_id === payment.id).map((a) => a.charge_id)),
  ];
  const charges = getAll(CCC_KEY)
    .filter((c) => chargeIds.includes(c.id))
    .sort((a, b) => (a.charge_date + a.created_at).localeCompare(b.charge_date + b.created_at))
    .map(chargeSummary);

  const paid = paidOnPayment(payment.id);
  return {
    id: payment.id,
    name: payment.name,
    total_amount: payment.total_amount,
    payment_date: payment.payment_date,
    due_date: payment.due_date ?? null,
    paid: paid.toFixed(2),
    left: ccCents(parseFloat(payment.total_amount) - paid).toFixed(2),
    charges,
  };
}

export const getCreditCardPayments = () => {
  const payments = getAll(CCP_KEY)
    .slice()
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  return respond(payments.map(creditCardPaymentDetail));
};

// Plain balance, no linked transaction - contrast with
// createCreditCardPaymentFromTransaction below, which anchors the payment to
// a real, already-recorded transaction.
export const createCreditCardPayment = (totalAmount, paymentDate, dueDate) => {
  const payment = {
    id: nextId(),
    name: "Credit Card Payment",
    total_amount: String(parseFloat(totalAmount).toFixed(2)),
    payment_date: paymentDate,
    due_date: dueDate ?? null,
    created_at: new Date().toISOString(),
  };
  saveAll(CCP_KEY, [...getAll(CCP_KEY), payment]);
  return respond(creditCardPaymentDetail(payment));
};

export const createCreditCardPaymentFromTransaction = (transactionId, dueDate) => {
  const transaction = getAll(TX_KEY).find((t) => t.id === transactionId);
  if (!transaction) {
    return Promise.reject({ response: { status: 404, data: { detail: "Transaction not found" } } });
  }
  if (transaction.credit_card_payment_id) {
    return Promise.reject({ response: { status: 404, data: { detail: "Transaction is already a credit card payment" } } });
  }
  if (transaction.credit_card_charge_id) {
    return Promise.reject({ response: { status: 404, data: { detail: "Transaction is a settled credit card charge, not a payment" } } });
  }

  const payment = {
    id: nextId(),
    name: transaction.name,
    total_amount: String(parseFloat(transaction.amount).toFixed(2)),
    payment_date: transaction.transaction_date,
    due_date: dueDate ?? null,
    created_at: new Date().toISOString(),
  };
  saveAll(CCP_KEY, [...getAll(CCP_KEY), payment]);
  saveAll(
    TX_KEY,
    getAll(TX_KEY).map((t) => (t.id === transactionId ? { ...t, credit_card_payment_id: payment.id } : t)),
  );

  return respond(creditCardPaymentDetail(payment));
};

export const getCreditCardPayment = (paymentId) => {
  const payment = getAll(CCP_KEY).find((p) => p.id === paymentId);
  if (!payment) {
    return Promise.reject({ response: { status: 404, data: { detail: "Credit card payment not found" } } });
  }
  return respond(creditCardPaymentDetail(payment));
};

export const allocateCreditCardPayment = (paymentId, data) => {
  const payment = getAll(CCP_KEY).find((p) => p.id === paymentId);
  if (!payment) {
    return Promise.reject({ response: { status: 404, data: { detail: "Credit card payment not found" } } });
  }

  // A third allocate shape: reuse an already-recorded, unlinked transaction
  // as the charge, applied in full - it already IS the charge, no duplicate
  // transaction gets created the way a from-scratch charge's promotion does.
  if (data.transaction_id) {
    const transaction = getAll(TX_KEY).find((t) => t.id === data.transaction_id);
    if (!transaction) {
      return Promise.reject({ response: { status: 404, data: { detail: "Transaction not found" } } });
    }
    if (transaction.credit_card_payment_id || transaction.credit_card_charge_id) {
      return Promise.reject({ response: { status: 400, data: { detail: "Transaction is already linked to a credit card payment or charge" } } });
    }
    const amount = parseFloat(transaction.amount);
    const leftOnPayment = ccCents(parseFloat(payment.total_amount) - paidOnPayment(paymentId));
    if (amount > leftOnPayment) {
      return Promise.reject({ response: { status: 400, data: { detail: "Amount exceeds what's left on this payment" } } });
    }

    const charge = {
      id: nextId(),
      name: transaction.name,
      total_amount: transaction.amount,
      category: transaction.category,
      charge_date: transaction.transaction_date,
      created_at: new Date().toISOString(),
    };
    saveAll(CCC_KEY, [...getAll(CCC_KEY), charge]);
    saveAll(CCA_KEY, [...getAll(CCA_KEY), {
      id: nextId(),
      charge_id: charge.id,
      payment_id: paymentId,
      amount_applied: transaction.amount,
      created_at: new Date().toISOString(),
    }]);
    saveAll(
      TX_KEY,
      getAll(TX_KEY).map((t) => (t.id === transaction.id ? { ...t, credit_card_charge_id: charge.id } : t)),
    );

    return respond(creditCardPaymentDetail(payment));
  }

  // A new charge is always allocated in full against this payment (#147) -
  // no partial/rollover concept, so this is rejected outright rather than
  // accepted partially if there isn't enough left to cover it.
  const totalAmount = parseFloat(data.total_amount);
  const leftOnPayment = ccCents(parseFloat(payment.total_amount) - paidOnPayment(paymentId));
  if (totalAmount > leftOnPayment) {
    return Promise.reject({ response: { status: 400, data: { detail: "Amount exceeds what's left on this payment" } } });
  }

  const charge = {
    id: nextId(),
    name: data.name,
    total_amount: totalAmount.toFixed(2),
    category: data.category,
    charge_date: data.charge_date,
    created_at: new Date().toISOString(),
  };
  saveAll(CCC_KEY, [...getAll(CCC_KEY), charge]);

  saveAll(CCA_KEY, [...getAll(CCA_KEY), {
    id: nextId(),
    charge_id: charge.id,
    payment_id: paymentId,
    amount_applied: charge.total_amount,
    created_at: new Date().toISOString(),
  }]);

  // Always fully paid the moment it's created - a real, categorized
  // transaction, tagged so balance/spend-ceiling math (getEstimatedSavings,
  // _get_running_balance equivalents below) skips it: that cash already
  // left via the payment's own transaction.
  const settled = {
    id: nextId(),
    name: charge.name,
    amount: charge.total_amount,
    category: charge.category,
    transaction_date: charge.charge_date,
    credit_card_charge_id: charge.id,
  };
  saveAll(TX_KEY, [...getAll(TX_KEY), settled]);

  return respond(creditCardPaymentDetail(payment));
};

export const deleteCreditCardPayment = (paymentId) => {
  const payment = getAll(CCP_KEY).find((p) => p.id === paymentId);
  if (!payment) {
    return Promise.reject({ response: { status: 404, data: { detail: "Credit card payment not found" } } });
  }

  // Unlink the anchor transaction rather than deleting it - real money left
  // the account regardless of how it was categorized (#54 follow-up).
  saveAll(
    TX_KEY,
    getAll(TX_KEY).map((t) => (t.credit_card_payment_id === paymentId ? { ...t, credit_card_payment_id: null } : t)),
  );

  const allocations = getAll(CCA_KEY).filter((a) => a.payment_id === paymentId);
  const contributionByCharge = {};
  for (const a of allocations) {
    contributionByCharge[a.charge_id] = ccCents((contributionByCharge[a.charge_id] ?? 0) + parseFloat(a.amount_applied));
  }

  let charges = getAll(CCC_KEY);
  let transactions = getAll(TX_KEY);
  for (const [chargeId, contribution] of Object.entries(contributionByCharge)) {
    const charge = charges.find((c) => c.id === chargeId);
    if (!charge) continue;

    const paidNow = paidOnCharge(chargeId);
    const paidAfter = ccCents(paidNow - contribution);
    const total = parseFloat(charge.total_amount);

    if (paidNow >= total && paidAfter < total) {
      // Unlink rather than delete - real money already left the account,
      // same reasoning as the anchor transaction above.
      transactions = transactions.map((t) =>
        t.credit_card_charge_id === chargeId ? { ...t, credit_card_charge_id: null } : t,
      );
    }
    if (paidAfter <= 0) {
      charges = charges.filter((c) => c.id !== chargeId);
    }
  }
  saveAll(TX_KEY, transactions);
  saveAll(CCC_KEY, charges);
  saveAll(CCA_KEY, getAll(CCA_KEY).filter((a) => a.payment_id !== paymentId));
  saveAll(CCP_KEY, getAll(CCP_KEY).filter((p) => p.id !== paymentId));

  return respond(null);
};

// Removes just this payment's allocation(s) toward one charge, without
// touching the rest of the payment (#146) - the balance detail page's own
// edit mode, distinct from deleting the whole payment above.
export const removeChargeFromPayment = (paymentId, chargeId) => {
  const payment = getAll(CCP_KEY).find((p) => p.id === paymentId);
  if (!payment) {
    return Promise.reject({ response: { status: 404, data: { detail: "Credit card payment not found" } } });
  }
  const charge = getAll(CCC_KEY).find((c) => c.id === chargeId);
  if (!charge) {
    return Promise.reject({ response: { status: 404, data: { detail: "Charge not found" } } });
  }

  const matching = getAll(CCA_KEY).filter((a) => a.payment_id === paymentId && a.charge_id === chargeId);
  if (matching.length === 0) {
    return Promise.reject({ response: { status: 404, data: { detail: "Charge is not allocated to this payment" } } });
  }

  const paidNow = paidOnCharge(chargeId);
  const total = parseFloat(charge.total_amount);
  saveAll(CCA_KEY, getAll(CCA_KEY).filter((a) => !(a.payment_id === paymentId && a.charge_id === chargeId)));
  const paidAfter = paidOnCharge(chargeId);

  if (paidNow >= total && paidAfter < total) {
    saveAll(
      TX_KEY,
      getAll(TX_KEY).map((t) => (t.credit_card_charge_id === chargeId ? { ...t, credit_card_charge_id: null } : t)),
    );
  }
  if (paidAfter <= 0) {
    saveAll(CCC_KEY, getAll(CCC_KEY).filter((c) => c.id !== chargeId));
  }

  return respond(creditCardPaymentDetail(payment));
};
