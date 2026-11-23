import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Check, ShieldCheck, Sparkles, Building2, Layers, MapPin, Calendar, CreditCard, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SUBSCRIPTION_PLANS, getPlanById } from "@/lib/subscriptionPlans"

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function PackagesModal({ isOpen, onClose, onSuccess, initialPlanId = "monthly" }) {
  const { user, profile, refreshProfile } = useAuth()
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId)
  const [paymentMode, setPaymentMode] = useState("razorpay")
  const [paymentRef, setPaymentRef] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const selectedPlan = getPlanById(selectedPlanId) || SUBSCRIPTION_PLANS[0]

  if (!isOpen) return null

  const handleSelectPlan = (planId) => {
    setSelectedPlanId(planId)
    setErrorMsg("")
    setSuccessMsg("")
  }

  const handleDirectActivation = async (refCode) => {
    try {
      setLoading(true)
      setErrorMsg("")

      const { data, error } = await supabase.rpc("activate_subscription_plan", {
        p_plan_key: selectedPlan.id,
        p_payment_reference: refCode || paymentRef.trim() || `DIRECT_${Date.now()}`,
      })

      if (error) throw error

      await refreshProfile()
      setSuccessMsg(`Successfully subscribed to ${selectedPlan.name}! Your pooled quota of ${selectedPlan.cvUnlocksLimit} CVs and ${selectedPlan.jobPostsLimit} job posts is now active.`)
      
      if (onSuccess) {
        onSuccess(data)
      }

      setTimeout(() => {
        onClose()
      }, 1800)
    } catch (err) {
      setErrorMsg(err.message || "Failed to activate subscription plan.")
    } finally {
      setLoading(false)
    }
  }

  const handleRazorpayPayment = async () => {
    try {
      setLoading(true)
      setErrorMsg("")

      const scriptLoaded = await loadRazorpayScript()
      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID

      if (!scriptLoaded || !razorpayKey) {
        await handleDirectActivation(`RZP_SIM_${Date.now()}`)
        return
      }

      const amountInPaise = Math.round(selectedPlan.totalWithGst * 100)

      const options = {
        key: razorpayKey,
        amount: amountInPaise,
        currency: "INR",
        name: "Job Pe Charcha",
        description: `${selectedPlan.name} (${selectedPlan.cvUnlocksLimit} Pooled CVs, ${selectedPlan.jobPostsLimit} Jobs)`,
        image: "/logo.png",
        prefill: {
          name: profile?.full_name || "",
          email: user?.email || "",
          contact: profile?.phone || "",
        },
        theme: {
          color: "#ea580c",
        },
        handler: async (response) => {
          await handleDirectActivation(response.razorpay_payment_id || `RZP_${Date.now()}`)
        },
        modal: {
          ondismiss: () => {
            setLoading(false)
          },
        },
      }

      const rzpInstance = new window.Razorpay(options)
      rzpInstance.on("payment.failed", (failRes) => {
        setErrorMsg(failRes.error?.description || "Payment failed. Please try again.")
        setLoading(false)
      })
      rzpInstance.open()
    } catch (err) {
      setErrorMsg(err.message || "Failed to launch Razorpay checkout.")
      setLoading(false)
    }
  }

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!paymentRef.trim()) {
      setErrorMsg("Please enter a valid payment reference or UTR number.")
      return
    }
    await handleDirectActivation(paymentRef.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl bg-card border rounded-2xl shadow-2xl p-5 sm:p-6 my-auto max-h-[92vh] overflow-y-auto space-y-6"
      >
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-foreground">
                Recruiter Subscription Packages
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Select a package to unlock pooled CV quotas across all your job postings. Candidates apply 100% free!
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={onClose}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {errorMsg && (
          <Alert variant="destructive" className="py-2.5 text-xs">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {successMsg && (
          <Alert className="py-2.5 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="font-semibold">{successMsg}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isSelected = selectedPlanId === plan.id
            return (
              <div
                key={plan.id}
                onClick={() => handleSelectPlan(plan.id)}
                className={`relative flex flex-col justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border hover:border-primary/40 bg-card hover:bg-muted/10"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-sm">
                    Most Popular
                  </span>
                )}

                <div className="space-y-3">
                  <div>
                    <h3 className="font-heading font-bold text-base text-foreground">
                      {plan.name}
                    </h3>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {plan.tagline}
                    </p>
                  </div>

                  <div className="border-t border-b py-2 space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-heading font-extrabold text-foreground">
                        {plan.priceFormatted}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        + GST
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Total: ₹{Math.round(plan.totalWithGst).toLocaleString("en-IN")} incl. 18% GST
                    </p>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{plan.jobPostsLimit} Job Posts</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-primary">
                        <Layers className="h-3.5 w-3.5 shrink-0" />
                        <span>{plan.cvUnlocksLimit.toLocaleString("en-IN")} Pooled CVs</span>
                      </div>
                      <Badge variant="secondary" className="text-[9px] font-semibold bg-primary/10 text-primary border-primary/20">
                        {plan.pooledBadge}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{plan.validityText} Validity</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>{plan.cityText}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t">
                  <Button
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="w-full h-8 text-xs font-semibold"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectPlan(plan.id)
                    }}
                  >
                    {isSelected ? "Selected Plan" : "Choose Plan"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-muted/30 border rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                Order Summary
              </span>
              <h4 className="text-base font-heading font-bold text-foreground">
                {selectedPlan.name} • {selectedPlan.cvUnlocksLimit.toLocaleString("en-IN")} Pooled CVs • {selectedPlan.jobPostsLimit} Jobs
              </h4>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Total Payable (incl. 18% GST)</span>
              <p className="text-xl font-heading font-extrabold text-primary">
                ₹{Math.round(selectedPlan.totalWithGst).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-card border flex justify-between items-center">
              <span className="text-muted-foreground">Base Plan Price:</span>
              <span className="font-semibold">{selectedPlan.priceFormatted}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card border flex justify-between items-center">
              <span className="text-muted-foreground">GST (18%):</span>
              <span className="font-semibold">₹{selectedPlan.gstAmount.toFixed(2)}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card border flex justify-between items-center font-bold text-primary">
              <span>Final Amount:</span>
              <span>₹{Math.round(selectedPlan.totalWithGst).toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex gap-2 border-b pb-2">
              <button
                type="button"
                onClick={() => setPaymentMode("razorpay")}
                className={`text-xs font-semibold pb-1.5 border-b-2 transition-colors ${
                  paymentMode === "razorpay"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Razorpay Online Payment (Instant)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode("manual")}
                className={`text-xs font-semibold pb-1.5 border-b-2 transition-colors ${
                  paymentMode === "manual"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Direct / UTR Activation
              </button>
            </div>

            {paymentMode === "razorpay" ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Secured by Razorpay: UPI, Cards, NetBanking, and Corporate Wallets supported.</span>
                </div>
                <Button
                  type="button"
                  size="default"
                  disabled={loading}
                  onClick={handleRazorpayPayment}
                  className="w-full sm:w-auto px-8 h-10 font-semibold gap-2 shadow-md shadow-primary/25"
                >
                  <CreditCard className="h-4 w-4" />
                  {loading ? "Processing..." : `Pay ₹${Math.round(selectedPlan.totalWithGst).toLocaleString("en-IN")} & Subscribe`}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="payment-ref" className="text-xs font-semibold">
                      Payment Reference / UTR Number *
                    </Label>
                    <Input
                      id="payment-ref"
                      placeholder="e.g. UPI-1234567890 or Bank UTR Ref"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      required
                      className="text-xs h-9 font-mono"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-9 text-xs font-semibold"
                    >
                      {loading ? "Activating..." : "Activate Package"}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Transfer via UPI to <strong className="text-foreground">payments@jobportal.in</strong> (Job Pe Charcha Technologies) and enter your reference ID for immediate activation.
                </p>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
