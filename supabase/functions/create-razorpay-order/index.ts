import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.replace("Bearer ", "").trim()
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const {
      plan_id,
      amount_with_gst,
      job_posts_limit,
      cv_unlocks_limit,
      validity_days,
      cities_limit,
    } = await req.json()

    if (!plan_id || !amount_with_gst) {
      return new Response(
        JSON.stringify({ error: "Missing required package parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID") || Deno.env.get("VITE_RAZORPAY_KEY_ID") || ""
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || ""

    if (!keyId || !keySecret) {
      return new Response(
        JSON.stringify({
          success: false,
          is_test_mode: true,
          message: "Razorpay credentials not configured in edge function environment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const authBasic = btoa(`${keyId}:${keySecret}`)
    const amountInPaise = Math.round(Number(amount_with_gst) * 100)

    const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authBasic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: `sub_${plan_id}_${Date.now()}`.slice(0, 40),
        notes: {
          plan_id: String(plan_id),
          user_id: String(user.id),
          job_posts_limit: String(job_posts_limit || 0),
          cv_unlocks_limit: String(cv_unlocks_limit || 0),
          validity_days: String(validity_days || 30),
          cities_limit: String(cities_limit || 1),
        },
      }),
    })

    const orderData = await rzpResponse.json()

    if (!rzpResponse.ok || !orderData?.id) {
      return new Response(
        JSON.stringify({
          error: orderData?.error?.description || "Failed to create Razorpay order",
          details: orderData,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        key_id: keyId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
