import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Building2, Layers, MapPin, Calendar, CreditCard, Check, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react"
import { motion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import PageTransition from "@/components/PageTransition"
import SamplePaymentModal from "@/components/SamplePaymentModal"
import { SUBSCRIPTION_PLANS, getPlanById, isPlanActive, getPlanDisplayName, formatExpiry } from "@/lib/subscriptionPlans"

export default function Packages() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [selectedPlanId, setSelectedPlanId] = useState("quarterly")
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMode, setPaymentMode] = useState("gateway")
  const [utrRef, setUtrRef] = useState("")
  const [manualLoading, setManualLoading] = useState(false)
  const [manualSuccess, setManualSuccess] = useState("")
  const [manualError, setManualError] = useState("")

  const selectedPlan = getPlanById(selectedPlanId) || SUBSCRIPTION_PLANS[1]
  const planActive = isPlanActive(profile)
  const planName = getPlanDisplayName(profile?.active_plan)
  const expiryText = formatExpiry(profile?.plan_expires_at)
  const cvsRemaining = profile?.cv_unlocks_remaining ?? 0
  const cvsLimit = profile?.cv_unlocks_limit ?? 0
  const jobsUsed = profile?.job_posts_used ?? 0
  const jobsLimit = profile?.job_posts_limit ?? 0
  const citiesUsed = profile?.allowed_cities?.length ?? 0
  const citiesLimit = profile?.cities_limit ?? 0

  const handleOpenPayment = (planId) => {
    if (planId) {
      setSelectedPlanId(planId)
    }
    if (!user) {
      navigate("/login?redirect=/packages")
      return
    }
    setShowPaymentModal(true)
  }

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    setManualError("")
    setManualSuccess("")

    if (!user) {
      navigate("/login?redirect=/packages")
      return
    }

    if (!utrRef.trim()) {
      setManualError("Please enter a valid payment reference or UTR number.")
      return
    }

    try {
      setManualLoading(true)
      const txnId = utrRef.trim()
      const planKey = selectedPlan.key || selectedPlan.id

      try {
        await supabase.rpc("activate_subscription_plan", {
          p_payment_reference: txnId,
          p_plan_key: planKey,
        })
      } catch (_) {
        const expiresAt = new Date(Date.now() + selectedPlan.validityDays * 24 * 60 * 60 * 1000).toISOString()
        await supabase
          .from("profiles")
          .update({
            active_plan: planKey,
            job_posts_limit: selectedPlan.jobPostsLimit,
            job_posts_used: 0,
            cv_unlocks_limit: selectedPlan.cvUnlocksLimit,
            cv_unlocks_remaining: selectedPlan.cvUnlocksLimit,
            cities_limit: selectedPlan.citiesLimit,
            allowed_cities: [],
            plan_expires_at: expiresAt,
          })
          .eq("id", user.id)
      }

      try {
        await supabase.from("subscription_payments").insert({
          recruiter_id: user.id,
          recruiter_name: profile?.full_name || user.email?.split("@")[0] || "Recruiter",
          recruiter_email: user.email || "",
          plan_key: planKey,
          plan_name: selectedPlan.name,
          base_amount: selectedPlan.price,
          gst_amount: selectedPlan.gstAmount,
          total_amount: Math.round(selectedPlan.totalWithGst),
          payment_method: "MANUAL_UTR",
          transaction_id: txnId,
          status: "success",
        })
      } catch (_) {}

      try {
        const localSub = {
          active_plan: planKey,
          job_posts_limit: selectedPlan.jobPostsLimit,
          job_posts_used: 0,
          cv_unlocks_limit: selectedPlan.cvUnlocksLimit,
          cv_unlocks_remaining: selectedPlan.cvUnlocksLimit,
          cities_limit: selectedPlan.citiesLimit,
          allowed_cities: [],
          plan_expires_at: new Date(Date.now() + selectedPlan.validityDays * 24 * 60 * 60 * 1000).toISOString(),
          payment_reference: txnId,
        }
        localStorage.setItem(`jpc_recruiter_subscription_${user.id}`, JSON.stringify(localSub))
      } catch (_) {}

      await refreshProfile()
      setManualSuccess(`Subscription activated! Subscribed to ${selectedPlan.name} with ${selectedPlan.cvUnlocksLimit.toLocaleString("en-IN")} pooled CVs.`)
      setUtrRef("")
    } catch (err) {
      setManualError(err.message || "Failed to submit manual activation.")
    } finally {
      setManualLoading(false)
    }
  }

  return (
    <PageTransition className="space-y-12 sm:space-y-16 py-8 sm:py-12 max-w-6xl mx-auto px-4 sm:px-6">
      <section className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary uppercase tracking-wider shadow-sm">
          <Layers className="h-3.5 w-3.5" />
          <span>Recruiter Subscription Packages</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-extrabold tracking-tight leading-tight text-foreground">
          Transparent Hiring Packages with{" "}
          <span className="inline-block pb-1 leading-snug bg-gradient-to-r from-primary via-blue-800 to-brand-orange bg-clip-text text-transparent">
            Pooled CV Quotas
          </span>
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Unlock candidate CVs across all your job postings from a single shared quota. Candidates apply 100% free with zero deduction.
        </p>
      </section>

      {user && planActive && (
        <Card className="border-primary/30 bg-primary/5 shadow-sm max-w-3xl mx-auto">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-heading font-bold text-foreground">
                    Active Subscription: {planName}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Plan expires on {expiryText}
                  </CardDescription>
                </div>
              </div>
              <Badge className="bg-primary text-primary-foreground text-xs font-semibold py-1 px-3 self-start sm:self-auto">
                Current Plan
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-3 text-center border-t pt-3 text-xs">
              <div className="p-2 rounded-lg bg-card/60 border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Pooled CVs Left</span>
                <span className="text-base font-extrabold text-primary">{cvsRemaining} / {cvsLimit}</span>
              </div>
              <div className="p-2 rounded-lg bg-card/60 border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Job Posts</span>
                <span className="text-base font-extrabold text-foreground">{jobsUsed} / {jobsLimit}</span>
              </div>
              <div className="p-2 rounded-lg bg-card/60 border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Cities Allowed</span>
                <span className="text-base font-extrabold text-foreground">{citiesUsed} / {citiesLimit}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isSelected = selectedPlanId === plan.id
          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`relative flex flex-col justify-between p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-xl shadow-primary/10 ring-2 ring-primary/20 scale-[1.02]"
                  : "border-border hover:border-primary/40 bg-card hover:bg-muted/10 shadow-sm"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 right-4 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold uppercase tracking-wider shadow-md">
                  Most Popular
                </span>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-foreground">
                    {plan.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {plan.tagline}
                  </p>
                </div>

                <div className="border-t border-b py-3 space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-heading font-extrabold text-foreground">
                      {plan.priceFormatted}
                    </span>
                    <span className="text-xs text-muted-foreground font-semibold">
                      + 18% GST
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Total: ₹{Math.round(plan.totalWithGst).toLocaleString("en-IN")} incl. GST
                  </p>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span><strong>{plan.jobPostsLimit}</strong> Job Posts Allowed</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-primary text-sm">
                      <Layers className="h-4 w-4 shrink-0" />
                      <span>{plan.cvUnlocksLimit.toLocaleString("en-IN")} Pooled CVs</span>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-semibold bg-primary/10 text-primary border-primary/20">
                      Shared across all {plan.jobPostsLimit} jobs
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span><strong>{plan.validityText}</strong> Plan Validity</span>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span><strong>{plan.cityText}</strong> Allowed</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t">
                <Button
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  className="w-full text-xs font-semibold h-10 shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenPayment(plan.id)
                  }}
                >
                  Pay ₹{Math.round(plan.totalWithGst).toLocaleString("en-IN")} & Subscribe
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-card border rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <span className="text-xs uppercase font-extrabold tracking-wider text-primary">
              Order Summary & Checkout
            </span>
            <h3 className="text-xl font-heading font-extrabold text-foreground mt-0.5">
              {selectedPlan.name} • {selectedPlan.cvUnlocksLimit.toLocaleString("en-IN")} Pooled CVs • {selectedPlan.jobPostsLimit} Jobs
            </h3>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Total Amount Payable</span>
            <p className="text-2xl sm:text-3xl font-heading font-extrabold text-primary">
              ₹{Math.round(selectedPlan.totalWithGst).toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-muted/30 border flex justify-between items-center">
            <span className="text-muted-foreground">Base Plan:</span>
            <span className="font-semibold text-foreground">{selectedPlan.priceFormatted}</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border flex justify-between items-center">
            <span className="text-muted-foreground">18% GST:</span>
            <span className="font-semibold text-foreground">₹{selectedPlan.gstAmount.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex justify-between items-center font-bold text-primary">
            <span>Final Amount:</span>
            <span>₹{Math.round(selectedPlan.totalWithGst).toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex gap-4 border-b pb-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPaymentMode("gateway")}
              className={`pb-2 transition-colors border-b-2 ${
                paymentMode === "gateway" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Online Payment Gateway (Sample Demo)
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode("manual")}
              className={`pb-2 transition-colors border-b-2 ${
                paymentMode === "manual" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Direct / UTR Activation
            </button>
          </div>

          {paymentMode === "gateway" ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Instant Sample Payment (UPI, Cards, NetBanking)</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Click below to open the sample payment gateway and test one-click subscription activation.
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={() => handleOpenPayment(selectedPlan.id)}
                className="w-full sm:w-auto px-8 h-12 text-sm font-bold gap-2 shadow-lg shadow-primary/25"
              >
                <CreditCard className="h-4 w-4" />
                Pay ₹{Math.round(selectedPlan.totalWithGst).toLocaleString("en-IN")} & Subscribe
              </Button>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-3.5 pt-1">
              {manualError && (
                <Alert variant="destructive" className="py-2.5 text-xs">
                  <AlertDescription>{manualError}</AlertDescription>
                </Alert>
              )}
              {manualSuccess && (
                <Alert className="py-2.5 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertDescription className="font-semibold">{manualSuccess}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="utr-ref" className="text-xs font-semibold">Bank UTR / UPI Transaction Reference *</Label>
                  <Input
                    id="utr-ref"
                    value={utrRef}
                    onChange={(e) => setUtrRef(e.target.value)}
                    placeholder="e.g. UPI-9876543210 or NEFT UTR Number"
                    className="h-10 text-xs font-mono"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={manualLoading}
                    className="w-full h-10 text-xs font-semibold"
                  >
                    {manualLoading ? "Activating..." : "Activate via Reference"}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Transfer via UPI to <strong className="text-foreground">payments@jobportal.in</strong> and submit your UTR code.
              </p>
            </form>
          )}
        </div>
      </div>

      <section className="space-y-6 pt-4 border-t max-w-4xl mx-auto">
        <div className="text-center space-y-1">
          <h3 className="text-xl font-heading font-bold text-foreground">
            Frequently Asked Questions
          </h3>
          <p className="text-xs text-muted-foreground">
            Everything you need to know about recruiter subscription quotas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <Card className="p-4 space-y-2 bg-card/60">
            <h4 className="font-heading font-bold text-sm text-foreground">How do pooled CV unlocks work?</h4>
            <p className="text-muted-foreground leading-relaxed">
              Your CV unlock quota is shared across all the job listings created under your subscription. Unlocking an applicant on Job 1 or Job 2 deducts 1 CV from your single pooled balance.
            </p>
          </Card>

          <Card className="p-4 space-y-2 bg-card/60">
            <h4 className="font-heading font-bold text-sm text-foreground">Are candidate applications 100% free?</h4>
            <p className="text-muted-foreground leading-relaxed">
              Yes. Candidates submit unlimited applications with zero fees or deductions. Employers only deduct 1 CV from their pool when choosing to unlock a candidate&apos;s full resume.
            </p>
          </Card>

          <Card className="p-4 space-y-2 bg-card/60">
            <h4 className="font-heading font-bold text-sm text-foreground">What happens when my plan expires?</h4>
            <p className="text-muted-foreground leading-relaxed">
              Once a plan expires, your active job postings are paused and further CV unlocks are held until you renew or upgrade your package. Already unlocked candidate resumes remain accessible.
            </p>
          </Card>

          <Card className="p-4 space-y-2 bg-card/60">
            <h4 className="font-heading font-bold text-sm text-foreground">How does city restriction apply?</h4>
            <p className="text-muted-foreground leading-relaxed">
              Monthly, 3-Month, and 6-Month plans allow listings within 1 distinct city. The Yearly Package supports up to 5 distinct cities across India.
            </p>
          </Card>
        </div>
      </section>

      <SamplePaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        plan={selectedPlan}
      />
    </PageTransition>
  )
}
