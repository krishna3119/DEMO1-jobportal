import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { 
  Layers, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowLeft, 
  AlertCircle, 
  Building2, 
  MapPin, 
  Calendar, 
  CreditCard, 
  Clock 
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedCounter } from "@/components/ui/animated-counter"
import PageTransition from "@/components/PageTransition"
import { SUBSCRIPTION_PLANS, isPlanActive, getPlanDisplayName, formatExpiry } from "@/lib/subscriptionPlans"

export default function RecruiterCredits() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [selectedPlanId, setSelectedPlanId] = useState("monthly")

  const planActive = isPlanActive(profile)
  const planName = getPlanDisplayName(profile?.active_plan)
  const expiryText = formatExpiry(profile?.plan_expires_at)
  const cvsRemaining = profile?.cv_unlocks_remaining ?? 0
  const cvsLimit = profile?.cv_unlocks_limit ?? 0
  const jobsUsed = profile?.job_posts_used ?? 0
  const jobsLimit = profile?.job_posts_limit ?? 0
  const allowedCities = profile?.allowed_cities || []
  const citiesUsed = allowedCities.length
  const citiesLimit = profile?.cities_limit ?? 0

  const loadData = useCallback(async () => {
    if (!user?.id) return
    try {
      setLoading(true)
      const { data: transData, error: transErr } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30)

      if (transErr) throw transErr
      setTransactions(transData || [])
    } catch (err) {
      setErrorMsg(err.message || "Failed to load subscription activity.")
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpenSubscribe = (planId) => {
    setSelectedPlanId(planId)
    navigate("/packages", { state: { selectedPlanId: planId } })
  }

  return (
    <PageTransition className="max-w-6xl mx-auto py-6 sm:py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium mb-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-foreground">
                Recruiter Subscription Packages
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Manage your hiring quota with pooled CV unlocks across all job postings.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleOpenSubscribe(profile?.active_plan || "monthly")}
            className="h-9 text-xs font-semibold shadow-sm"
          >
            Upgrade / Buy Package
          </Button>
        </div>
      </div>

      {errorMsg && (
        <Alert variant="destructive" className="text-xs py-2.5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 text-xs py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      <Card className="border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={planActive ? "default" : "destructive"} className="text-[10px] uppercase font-bold tracking-wider">
                  {planActive ? "Active Subscription" : "No Active Package"}
                </Badge>
                <span className="text-xs font-semibold text-muted-foreground font-mono">
                  {expiryText}
                </span>
              </div>
              <CardTitle className="text-2xl font-heading font-extrabold text-foreground">
                {planName}
              </CardTitle>
              <CardDescription className="text-xs max-w-xl">
                All candidates apply 100% free. Any CV unlocked across any of your job postings deducts 1 CV from your single pooled quota.
              </CardDescription>
            </div>

            <Button
              onClick={() => handleOpenSubscribe("monthly")}
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10"
            >
              Change Package
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl bg-card border shadow-xs space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Job Posts Quota</span>
                <Building2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="text-2xl font-heading font-extrabold text-foreground">
                <AnimatedCounter value={jobsUsed} /> / {jobsLimit}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {Math.max(0, jobsLimit - jobsUsed)} postings remaining under current plan
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-card border shadow-xs space-y-1">
              <div className="flex items-center justify-between text-primary text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Pooled CVs Remaining</span>
                <Layers className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="text-2xl font-heading font-extrabold text-primary">
                <AnimatedCounter value={cvsRemaining} /> / {cvsLimit}
              </div>
              <Badge variant="secondary" className="text-[9px] font-semibold bg-primary/10 text-primary border-primary/20">
                Pooled across all job posts
              </Badge>
            </div>

            <div className="p-3.5 rounded-xl bg-card border shadow-xs space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]">City Limit</span>
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="text-2xl font-heading font-extrabold text-foreground">
                <AnimatedCounter value={citiesUsed} /> / {citiesLimit}
              </div>
              <p className="text-[11px] text-muted-foreground truncate" title={allowedCities.join(", ") || "None"}>
                {allowedCities.length > 0 ? `Used: ${allowedCities.join(", ")}` : "Post in any eligible city"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-foreground">
            Available Subscription Packages
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Choose a tier tailored to your hiring requirements. Prices listed below exclude GST (18% applied at checkout).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isCurrent = profile?.active_plan === plan.id && planActive
            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col justify-between transition-all border-2 ${
                  isCurrent
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border hover:border-primary/50 shadow-xs hover:shadow-md"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-sm">
                    Most Popular
                  </span>
                )}

                <CardHeader className="space-y-2 pb-3">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-heading font-bold text-foreground">
                      {plan.name}
                    </CardTitle>
                    <CardDescription className="text-xs line-clamp-2">
                      {plan.tagline}
                    </CardDescription>
                  </div>

                  <div className="border-t border-b py-2 space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-heading font-extrabold text-foreground">
                        {plan.priceFormatted}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        + GST
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <div className="flex justify-between">
                        <span>GST (18%):</span>
                        <span>₹{plan.gstAmount.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-foreground">
                        <span>Total:</span>
                        <span>₹{Math.round(plan.totalWithGst).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs pt-0">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{plan.jobPostsLimit} Job Posts Allowed</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-primary">
                      <Layers className="h-4 w-4 shrink-0" />
                      <span>{plan.cvUnlocksLimit.toLocaleString("en-IN")} Total Pooled CVs</span>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-semibold bg-primary/10 text-primary border-primary/20">
                      {plan.pooledBadge}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{plan.validityText} Validity</span>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{plan.cityText}</span>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t">
                  <Button
                    onClick={() => handleOpenSubscribe(plan.id)}
                    className="w-full text-xs h-9 font-semibold gap-1.5"
                    variant={isCurrent ? "outline" : "default"}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    {isCurrent ? "Renew Package" : "Select & Pay Online"}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-heading font-bold">Subscription & CV Unlock Audit History</CardTitle>
          <CardDescription className="text-xs">
            Immutable log of package activations, renewals, and CV unlocks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-xl text-xs text-muted-foreground">
              No transactions recorded yet for this account.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Transaction Type</th>
                    <th className="py-2.5 px-3">Units</th>
                    <th className="py-2.5 px-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {transactions.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={entry.amount > 0 ? "default" : "secondary"}
                          className="text-[9px] uppercase font-mono"
                        >
                          {(entry.transaction_type || "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className={`py-2.5 px-3 font-bold font-mono ${entry.amount > 0 ? "text-emerald-600" : "text-primary"}`}>
                        {entry.amount > 0 ? `+${entry.amount} CVs` : `${entry.amount} CV`}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {entry.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  )
}
