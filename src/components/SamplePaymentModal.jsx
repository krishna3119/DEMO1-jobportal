import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, CheckCircle2, ShieldCheck, QrCode, CreditCard, Building, ArrowRight, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function SamplePaymentModal({ isOpen, onClose, plan, onSuccess }) {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [paymentMethod, setPaymentMethod] = useState("upi")
  const [upiId, setUpiId] = useState(user?.email ? `${user.email.split("@")[0]}@upi` : "recruiter@okaxis")
  const [cardNumber, setCardNumber] = useState("4111 2222 3333 1111")
  const [cardExpiry, setCardExpiry] = useState("12/28")
  const [cardCvv, setCardCvv] = useState("888")
  const [selectedBank, setSelectedBank] = useState("HDFC Bank")

  const [processing, setProcessing] = useState(false)
  const [completedTxn, setCompletedTxn] = useState(null)
  const [errorMsg, setErrorMsg] = useState("")

  if (!isOpen || !plan) return null

  const totalAmount = Math.round(plan.totalWithGst)

  const generateTxnId = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let code = ""
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `TXN_SAMPLE_${code}`
  }

  const handlePay = async () => {
    setErrorMsg("")
    setProcessing(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const txnId = generateTxnId()
      const planKey = plan.key || plan.id

      try {
        await supabase.rpc("activate_subscription_plan", {
          p_payment_reference: txnId,
          p_plan_key: planKey,
        })
      } catch (_) {
        const expiresAt = new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000).toISOString()
        await supabase
          .from("profiles")
          .update({
            active_plan: planKey,
            job_posts_limit: plan.jobPostsLimit,
            job_posts_used: 0,
            cv_unlocks_limit: plan.cvUnlocksLimit,
            cv_unlocks_remaining: plan.cvUnlocksLimit,
            cities_limit: plan.citiesLimit,
            allowed_cities: [],
            plan_expires_at: expiresAt,
          })
          .eq("id", user?.id)
      }

      const paymentRecord = {
        recruiter_id: user?.id,
        recruiter_name: profile?.full_name || user?.email?.split("@")[0] || "Recruiter",
        recruiter_email: user?.email || "",
        plan_key: planKey,
        plan_name: plan.name,
        base_amount: plan.price,
        gst_amount: plan.gstAmount,
        total_amount: totalAmount,
        payment_method: paymentMethod.toUpperCase(),
        transaction_id: txnId,
        status: "success",
      }

      try {
        await supabase.from("subscription_payments").insert(paymentRecord)
      } catch (_) {}

      try {
        const localSub = {
          active_plan: planKey,
          job_posts_limit: plan.jobPostsLimit,
          job_posts_used: 0,
          cv_unlocks_limit: plan.cvUnlocksLimit,
          cv_unlocks_remaining: plan.cvUnlocksLimit,
          cities_limit: plan.citiesLimit,
          allowed_cities: [],
          plan_expires_at: new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000).toISOString(),
          payment_reference: txnId,
        }
        localStorage.setItem(`jpc_recruiter_subscription_${user?.id}`, JSON.stringify(localSub))
      } catch (_) {}

      await refreshProfile()

      setCompletedTxn({
        txnId,
        method: paymentMethod.toUpperCase(),
        amount: totalAmount,
        planName: plan.name,
        date: new Date().toLocaleString("en-IN"),
      })

      if (onSuccess) {
        onSuccess(paymentRecord)
      }
    } catch (err) {
      setErrorMsg(err.message || "Payment simulation failed. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleFinish = (targetRoute) => {
    onClose()
    setCompletedTxn(null)
    if (targetRoute) {
      navigate(targetRoute)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-card border rounded-2xl shadow-2xl overflow-hidden my-auto"
      >
        <div className="bg-gradient-to-r from-blue-700 via-primary to-brand-orange text-primary-foreground p-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-lg tracking-tight">
                Job Pe Charcha
              </span>
              <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider bg-white/20 text-white border-white/30">
                Sample / Test Mode
              </Badge>
            </div>
            {!completedTxn && (
              <button
                type="button"
                onClick={onClose}
                disabled={processing}
                className="text-white/80 hover:text-white rounded-full p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="flex items-end justify-between pt-1">
            <div>
              <p className="text-xs text-white/80">Subscribing to</p>
              <h3 className="text-base sm:text-lg font-heading font-bold">{plan.name}</h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-white/80 block">Total Payable</span>
              <span className="text-2xl font-heading font-extrabold">₹{totalAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <Alert variant="destructive" className="py-2.5 text-xs">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {completedTxn ? (
            <div className="text-center py-4 space-y-4">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>

              <div className="space-y-1">
                <h4 className="text-xl font-heading font-extrabold text-foreground">
                  Payment Successful!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Your subscription package has been activated immediately.
                </p>
              </div>

              <div className="p-4 rounded-xl border bg-muted/30 text-left space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="font-mono font-bold text-foreground">{completedTxn.txnId}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Package:</span>
                  <span className="font-semibold text-foreground">{completedTxn.planName}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <span className="font-bold text-primary">₹{completedTxn.amount.toLocaleString("en-IN")} (incl. 18% GST)</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Method:</span>
                  <span className="font-medium text-foreground">{completedTxn.method} (Sample Gateway)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className="bg-emerald-600/15 text-emerald-700 border border-emerald-600/30 text-[10px] font-bold">
                    PAID / ACTIVE
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  onClick={() => handleFinish("/jobs/new")}
                  className="w-full text-xs font-semibold h-10 shadow-sm"
                >
                  <ArrowRight className="h-4 w-4 mr-1.5" />
                  Post a Job Now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleFinish("/dashboard")}
                  className="w-full text-xs font-semibold h-10"
                >
                  Go to Dashboard
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex rounded-xl p-1 bg-muted/60 border text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("upi")}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "upi" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span>UPI / QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "card" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Debit / Credit Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("netbanking")}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "netbanking" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Building className="h-3.5 w-3.5" />
                  <span>NetBanking</span>
                </button>
              </div>

              {paymentMethod === "upi" && (
                <div className="space-y-3.5 p-3.5 rounded-xl border bg-muted/15">
                  <div className="space-y-1.5">
                    <Label htmlFor="upi-id" className="text-xs font-semibold">Virtual Payment Address (UPI ID)</Label>
                    <Input
                      id="upi-id"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="username@upi"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border">
                    <QrCode className="h-4 w-4 text-primary shrink-0" />
                    <span>Instant UPI auto-approval simulated across PhonePe, Google Pay, and Paytm.</span>
                  </div>
                </div>
              )}

              {paymentMethod === "card" && (
                <div className="space-y-3 p-3.5 rounded-xl border bg-muted/15 text-xs">
                  <div className="space-y-1.5">
                    <Label htmlFor="card-num" className="text-xs font-semibold">Card Number</Label>
                    <Input
                      id="card-num"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="card-exp" className="text-xs font-semibold">Valid Thru</Label>
                      <Input
                        id="card-exp"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-cvv" className="text-xs font-semibold">CVV</Label>
                      <Input
                        id="card-cvv"
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "netbanking" && (
                <div className="space-y-2 p-3.5 rounded-xl border bg-muted/15 text-xs">
                  <Label className="text-xs font-semibold">Select Bank</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank", "Bank of Baroda"].map((bank) => (
                      <button
                        key={bank}
                        type="button"
                        onClick={() => setSelectedBank(bank)}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          selectedBank === bank ? "border-primary bg-primary/10 text-primary font-bold shadow-sm" : "border-border hover:bg-muted/30 text-foreground"
                        }`}
                      >
                        {bank}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>256-Bit SSL Demo Gateway</span>
                  </span>
                  <span>No real money is charged</span>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={processing}
                    className="w-1/3 h-10 text-xs font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePay}
                    disabled={processing}
                    className="w-2/3 h-10 text-xs font-semibold gap-2 shadow-md shadow-primary/20"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Authorizing...</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        <span>Complete Sample Payment (₹{totalAmount.toLocaleString("en-IN")})</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
