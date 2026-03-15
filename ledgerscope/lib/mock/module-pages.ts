export type ModulePageConfig = {
  title: string;
  description: string;
  actions: { label: string; variant?: "primary" | "secondary" }[];
  sections: {
    title: string;
    description: string;
    rows: string[];
  }[];
};

export const modulePageMock: Record<string, ModulePageConfig> = {
  transactions: {
    title: "Transactions",
    description: "Search, review, and classify recent account activity.",
    actions: [
      { label: "Sync Now", variant: "primary" },
      { label: "Bulk Review", variant: "secondary" },
    ],
    sections: [
      {
        title: "Review queue",
        description: "Transactions requiring purpose/category confirmation.",
        rows: ["12 uncertain purpose items", "4 split candidates", "2 suspicious follow-ups"],
      },
      {
        title: "Recent activity",
        description: "Latest imported transactions.",
        rows: ["Whole Foods -$124.33", "Stripe payout +$1,420.00", "Shell -$52.10"],
      },
    ],
  },
  budgets: {
    title: "Budgets",
    description: "Track monthly category limits and spend pacing.",
    actions: [
      { label: "Add Budget", variant: "primary" },
      { label: "Threshold Rules", variant: "secondary" },
    ],
    sections: [
      {
        title: "High utilization",
        description: "Categories nearing threshold.",
        rows: ["Dining 89% used", "Travel 82% used", "Shopping 76% used"],
      },
      {
        title: "Monthly overview",
        description: "Budget totals and variance.",
        rows: ["Planned $9,000", "Actual $6,125", "Projected $8,420"],
      },
    ],
  },
  insights: {
    title: "Insights",
    description: "Spending behavior and savings opportunities.",
    actions: [
      { label: "Generate Insights", variant: "primary" },
      { label: "View Trends", variant: "secondary" },
    ],
    sections: [
      {
        title: "Top trends",
        description: "Month-over-month category changes.",
        rows: ["Dining up 14%", "Fuel down 6%", "Groceries up 8%"],
      },
      {
        title: "Savings opportunities",
        description: "Automated suggestions.",
        rows: ["Reduce delivery frequency: save ~$60/mo", "Trim duplicate subscriptions: save ~$18/mo"],
      },
    ],
  },
  income: {
    title: "Income",
    description: "Payroll signals, classifications, and forecasts.",
    actions: [
      { label: "Confirm Employer", variant: "primary" },
      { label: "Run Detection", variant: "secondary" },
    ],
    sections: [
      {
        title: "Paycheck timeline",
        description: "Recent and upcoming payroll events.",
        rows: ["Mar 13 expected $2,350", "Feb 27 received $2,341", "Feb 13 received $2,347"],
      },
      {
        title: "Income sources",
        description: "Classified credits.",
        rows: ["Salary/Payroll 72%", "Business income 21%", "Refund/Reimbursement 7%"],
      },
    ],
  },
  business: {
    title: "Personal vs Business",
    description: "Review and split mixed-purpose transactions.",
    actions: [
      { label: "Create Split Rule", variant: "primary" },
      { label: "Review Uncertain", variant: "secondary" },
    ],
    sections: [
      {
        title: "Uncertain queue",
        description: "Transactions awaiting purpose confirmation.",
        rows: ["9 items marked uncertain", "3 recent split suggestions", "2 rule conflicts to review"],
      },
      {
        title: "Monthly split totals",
        description: "Current month allocation.",
        rows: ["Personal spend $4,870", "Business spend $1,255", "Split transactions 18"],
      },
    ],
  },  watchlist: {
    title: "Watchlist",
    description: "Track suspicious-charge patterns and repeat alerts.",
    actions: [
      { label: "New Watch Rule", variant: "primary" },
      { label: "Manage Rules", variant: "secondary" },
    ],
    sections: [
      {
        title: "Active rules",
        description: "Merchant and amount matching rules.",
        rows: ["ACME*ONLINE ±$5", "Merchant fuzz match: QK Delivery", "Gas station duplicate checker"],
      },
      {
        title: "Recent matches",
        description: "Matches awaiting user review.",
        rows: ["Potential repeat charge: ACME*ONLINE", "Similar amount at flagged merchant"],
      },
    ],
  },
  exports: {
    title: "Exports",
    description: "Generate reconciled summary and itemized reports.",
    actions: [
      { label: "Create Export", variant: "primary" },
      { label: "Export History", variant: "secondary" },
    ],
    sections: [
      {
        title: "Available modes",
        description: "Output and grouping options.",
        rows: ["Summary + itemized", "Business-only monthly", "Merchant grouped CSV"],
      },
      {
        title: "Recent runs",
        description: "Latest export jobs.",
        rows: ["Mar 7 PDF complete", "Mar 6 XLSX complete", "Mar 5 CSV complete"],
      },
    ],
  },
  settings: {
    title: "Settings",
    description: "Manage account preferences and integrations.",
    actions: [
      { label: "Save Changes", variant: "primary" },
      { label: "Reset", variant: "secondary" },
    ],
    sections: [
      {
        title: "Profile & notifications",
        description: "User settings summary.",
        rows: ["Email alerts: enabled", "Weekly recap: enabled", "Timezone: Asia/Bangkok"],
      },
      {
        title: "Integrations",
        description: "Connected service status.",
        rows: ["Plaid: mock mode", "Email provider: mock", "Redis queue: pending setup"],
      },
    ],
  },
};


