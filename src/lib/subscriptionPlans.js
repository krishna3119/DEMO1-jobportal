export const SUBSCRIPTION_PLANS = [
  {
    id: "monthly",
    key: "monthly",
    name: "Monthly Package",
    tagline: "Ideal for urgent single-role or small-team hiring needs",
    price: 2499,
    priceFormatted: "₹2,499",
    gstAmount: 449.82,
    gstPercent: 18,
    totalWithGst: 2948.82,
    totalFormatted: "₹2,949",
    jobPostsLimit: 3,
    cvUnlocksLimit: 300,
    validityDays: 30,
    validityText: "30 Days",
    citiesLimit: 1,
    cityText: "1 City",
    pooledBadge: "Pooled across all jobs",
    popular: false,
    color: "blue",
  },
  {
    id: "quarterly",
    key: "quarterly",
    name: "3-Month Package",
    tagline: "Great for growing companies with consistent hiring pipelines",
    price: 7499,
    priceFormatted: "₹7,499",
    gstAmount: 1349.82,
    gstPercent: 18,
    totalWithGst: 8848.82,
    totalFormatted: "₹8,849",
    jobPostsLimit: 5,
    cvUnlocksLimit: 1000,
    validityDays: 90,
    validityText: "90 Days",
    citiesLimit: 1,
    cityText: "1 City",
    pooledBadge: "Pooled across all jobs",
    popular: true,
    color: "amber",
  },
  {
    id: "half_yearly",
    key: "half_yearly",
    name: "6-Month Package",
    tagline: "High volume candidate sourcing with 365 days validity",
    price: 19999,
    priceFormatted: "₹19,999",
    gstAmount: 3599.82,
    gstPercent: 18,
    totalWithGst: 23598.82,
    totalFormatted: "₹23,599",
    jobPostsLimit: 7,
    cvUnlocksLimit: 2000,
    validityDays: 365,
    validityText: "365 Days",
    citiesLimit: 1,
    cityText: "1 City",
    pooledBadge: "Pooled across all jobs",
    popular: false,
    color: "indigo",
  },
  {
    id: "yearly",
    key: "yearly",
    name: "Yearly Package",
    tagline: "Enterprise recruitment powerhouse across multiple cities",
    price: 100000,
    priceFormatted: "₹1,00,000",
    gstAmount: 18000,
    gstPercent: 18,
    totalWithGst: 118000,
    totalFormatted: "₹1,18,000",
    jobPostsLimit: 20,
    cvUnlocksLimit: 50000,
    validityDays: 365,
    validityText: "365 Days",
    citiesLimit: 5,
    cityText: "Up to 5 Cities",
    pooledBadge: "Pooled across all jobs",
    popular: false,
    color: "emerald",
  },
]

export function getPlanById(planId) {
  if (!planId) return null
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId.toLowerCase().trim()) || null
}

export function isPlanActive(profile) {
  if (!profile) return false
  if (!profile.active_plan || profile.active_plan === "none") return false
  if (!profile.plan_expires_at) return false
  return new Date(profile.plan_expires_at).getTime() > Date.now()
}

export function formatExpiry(dateStr) {
  if (!dateStr) return "No active plan"
  const d = new Date(dateStr)
  if (d.getTime() <= Date.now()) return "Expired"
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (${daysLeft}d left)`
}

export function getPlanDisplayName(planId) {
  const plan = getPlanById(planId)
  return plan ? plan.name : "No Active Plan"
}
