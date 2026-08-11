export const helpSupportDemoContent = {
  user: {
    name: "Arun Kumar",
  },
  header: {
    searchPlaceholder: "Search for articles...",
  },
  stats: [
    { value: "1", label: "Read" },
    { value: "0", label: "Likes" },
    { value: "0", label: "Comments" },
    { value: "4", label: "Solved solo" },
  ],
  categories: [
    {
      id: "dcr",
      name: "DCR & Reporting",
      count: 2,
      description: "Daily call reports, doctor lists and MSL changes",
    },
    {
      id: "expenses",
      name: "Expense Claims",
      count: 1,
      description: "Claims, receipts and approval tracking",
    },
    {
      id: "orders",
      name: "Orders & Samples",
      count: 2,
      description: "POB, stockists and sample stock",
    },
    {
      id: "attendance",
      name: "Attendance & Leave",
      count: 1,
      description: "Geo check-in, regularisation and leave applications",
    },
    {
      id: "app",
      name: "App & Login",
      count: 2,
      description: "OTP, sync and troubleshooting",
    },
  ],
  articles: [
    {
      id: "article-1",
      title: "How to submit a daily call report (DCR)",
      category: "DCR & Reporting",
      summary: "Complete daily visits, add remarks, and submit the report before the day closes.",
      body:
        "Open Planner, select the completed doctor visit, capture call notes, add products discussed, and submit the DCR. If the doctor list is not visible, run Sync once and reopen the planner.",
      updatedAt: "Updated yesterday",
    },
    {
      id: "article-2",
      title: "Submitting an expense claim with receipts",
      category: "Expense Claims",
      summary: "Attach receipts, verify claim totals, and send the claim for approval.",
      body:
        "Create the claim from Expense Claims, select the expense type, attach readable receipt photos, and check that all mandatory fields are complete before submission.",
      updatedAt: "Updated 2 days ago",
    },
    {
      id: "article-3",
      title: "Marking attendance and geo check-in",
      category: "App & Login",
      summary: "Resolve common location and attendance check-in issues.",
      body:
        "Keep location permission enabled, wait for GPS accuracy to settle, and tap Sync if HQ mapping was recently updated. If the app still blocks check-in, raise a ticket with a screenshot.",
      updatedAt: "Updated this week",
    },
    {
      id: "article-4",
      title: "Booking a personal order (POB) during a call",
      category: "Orders & Samples",
      summary: "Create and confirm orders during doctor or stockist calls.",
      body:
        "Select the call, open Orders, add products and quantities, confirm stockist details, and submit. Orders remain editable until the sync is completed.",
      updatedAt: "Updated this week",
    },
    {
      id: "article-5",
      title: "Requesting and tracking product samples",
      category: "Orders & Samples",
      summary: "Track sample requests, available stock, and issued quantities.",
      body:
        "Use the Samples section to request stock, check available inventory, and confirm issue quantities. Pending sample requests are visible under Orders & Samples.",
      updatedAt: "Updated last week",
    },
    {
      id: "article-6",
      title: "Applying for leave from the app",
      category: "Attendance & Leave",
      summary: "Submit leave, regularisation, and manager approval requests.",
      body:
        "Open Attendance & Leave, choose the leave type, select dates, add a clear reason, and submit. Approval status appears after manager action.",
      updatedAt: "Updated today",
    },
  ],
  trending: [
    {
      id: "article-6",
      views: "388 views",
    },
    {
      id: "article-1",
      views: "812 views",
    },
    {
      id: "article-2",
      views: "704 views",
    },
    {
      id: "article-3",
      views: "655 views",
    },
    {
      id: "article-4",
      views: "590 views",
    },
    {
      id: "article-5",
      views: "433 views",
    },
  ],
  recentlyViewed: [
    {
      articleId: "article-1",
    },
    {
      articleId: "article-3",
    },
  ],
  tickets: [
    {
      id: "HD-1042",
      status: "Replied",
      title: "Expense claim stuck in Draft",
      category: "Expense Claims",
      updatedAt: "Yesterday",
      customer: "Arun Kumar",
      assignedTo: "Priya",
      firstResponse: "Passed",
      resolution: "Pending",
      description:
        "Claim total is ready but the submit button stays disabled after attaching receipt images.",
      conversation: [
        {
          id: "msg-1042-1",
          author: "You",
          role: "Field team",
          time: "Mon 4:12 PM",
          tone: "user",
          message:
            "My fuel expense claim for last week still shows Draft even after I submitted it. Claim EXP-00231.",
        },
        {
          id: "msg-1042-2",
          author: "Priya",
          role: "Support",
          time: "Mon 5:03 PM",
          tone: "support",
          message:
            "Thanks Arun. EXP-00231 was returned because the odometer photo was missing. I have moved it back to you - please attach the photo and resubmit.",
        },
        {
          id: "msg-1042-3",
          author: "Priya",
          role: "Support",
          time: "Tue 9:20 AM",
          tone: "support",
          message: "Following up - once you resubmit, approval should go through the same day.",
        },
      ],
    },
    {
      id: "HD-1037",
      status: "Open",
      title: "Cannot mark attendance outside HQ",
      category: "App & Login",
      updatedAt: "2 days ago",
      customer: "Arun Kumar",
      assignedTo: "IT Helpdesk",
      firstResponse: "Failed",
      resolution: "Failed",
      description:
        "Geo check-in shows current location but the app still says outside assigned HQ.",
      conversation: [
        {
          id: "msg-1037-1",
          author: "You",
          role: "Field team",
          time: "Sat 10:44 AM",
          tone: "user",
          message:
            "Attendance is blocked even when I am at the assigned HQ. GPS permission is already enabled.",
        },
        {
          id: "msg-1037-2",
          author: "IT Helpdesk",
          role: "Support",
          time: "Sat 11:30 AM",
          tone: "support",
          message:
            "We can see a stale HQ mapping on your route. Please keep location on and try Sync once before check-in.",
        },
      ],
    },
    {
      id: "HD-1028",
      status: "Resolved",
      title: "DCR doctor list was not syncing",
      category: "DCR & Reporting",
      updatedAt: "Last week",
      customer: "Arun Kumar",
      assignedTo: "DCR Support",
      firstResponse: "Passed",
      resolution: "Passed",
      description:
        "Doctor list appeared after clearing local cache and running a fresh sync.",
      conversation: [
        {
          id: "msg-1028-1",
          author: "You",
          role: "Field team",
          time: "Aug 1, 6:10 PM",
          tone: "user",
          message: "My assigned doctors are not visible after the morning sync.",
        },
        {
          id: "msg-1028-2",
          author: "DCR Support",
          role: "Support",
          time: "Aug 2, 9:10 AM",
          tone: "support",
          message: "The cache refresh fixed this account. Closing the ticket as resolved.",
        },
      ],
    },
  ],
  ticketForm: {
    categoryLabel: "Category",
    subjectLabel: "Subject",
    subjectPlaceholder: "Short summary of the issue",
    descriptionLabel: "Description",
    descriptionPlaceholder: "What happened? What did you expect?",
    submitLabel: "Submit ticket",
  },
};
