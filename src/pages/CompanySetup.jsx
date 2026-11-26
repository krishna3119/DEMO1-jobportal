import { useState, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Building2, Globe, MapPin, ArrowRight, Shield, UploadCloud, X } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import PageTransition from "@/components/PageTransition"

export default function CompanySetup() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [website, setWebsite] = useState("")
  const [location, setLocation] = useState("")
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [loading, setLoading] = useState(false)

  if (profile?.role === "admin") {
    return (
      <PageTransition className="max-w-xl mx-auto py-12 text-center space-y-4">
        <Card className="p-8 shadow-sm space-y-4 border">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Platform Administration
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Admins manage the platform from the Admin Panel
          </p>
          <div className="pt-2">
            <Link to="/admin">
              <Button className="h-9 px-6 font-semibold">
                Go to Admin Panel
              </Button>
            </Link>
          </div>
        </Card>
      </PageTransition>
    )
  }

  const handleFileSelect = (file) => {
    setErrorMsg("")
    if (!file) return

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!validTypes.includes(file.type)) {
      setErrorMsg("Please select a valid image file (PNG, JPG, or WEBP).")
      return
    }

    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      setErrorMsg("Logo image size must be 2MB or less.")
      return
    }

    if (logoPreview) {
      URL.revokeObjectURL(logoPreview)
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleRemoveLogo = () => {
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview)
    }
    setLogoFile(null)
    setLogoPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg("")

    if (!name.trim()) {
      setErrorMsg("Company name is required.")
      return
    }
    if (!location.trim()) {
      setErrorMsg("Company location / headquarters is required.")
      return
    }

    setLoading(true)
    try {
      let uploadedLogoUrl = null

      if (logoFile) {
        const fileExt = logoFile.name.split(".").pop()?.toLowerCase() || "png"
        const cleanExt = ["png", "jpg", "jpeg", "webp"].includes(fileExt) ? fileExt : "png"
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${cleanExt}`
        const filePath = `${profile?.id || "company"}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from("company-logos")
          .upload(filePath, logoFile, {
            cacheControl: "3600",
            upsert: true,
          })

        if (uploadError) {
          throw new Error("Failed to upload company logo: " + uploadError.message)
        }

        const { data: publicUrlData } = supabase.storage
          .from("company-logos")
          .getPublicUrl(filePath)

        uploadedLogoUrl = publicUrlData?.publicUrl || null
      }

      const { error } = await supabase.rpc("setup_company", {
        company_name: name.trim(),
        company_desc: description.trim(),
        company_website: website.trim(),
        company_location: location.trim(),
        company_logo_url: uploadedLogoUrl,
      })

      if (error) throw error

      navigate("/jobs/new", { replace: true })
    } catch (err) {
      setErrorMsg(err.message || "Failed to create company profile.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageTransition className="max-w-xl mx-auto py-6 sm:py-10">
      <Card className="shadow-lg border bg-card">
        <CardHeader className="space-y-1.5 pb-4">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
            <Building2 className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-heading font-extrabold tracking-tight">
            Register Your Company
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Set up your employer profile. You will automatically become an administrator of this company account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMsg && (
            <Alert variant="destructive" className="text-xs py-2.5">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="comp-name" className="text-xs font-semibold">Company Name *</Label>
              <Input
                id="comp-name"
                placeholder="e.g. Acme Corporation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="comp-location" className="text-xs font-semibold">Headquarters / Location *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="comp-location"
                  placeholder="e.g. Bengaluru, India or Remote"
                  className="pl-9 h-10 text-sm"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="comp-website" className="text-xs font-semibold">Website (Optional)</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="comp-website"
                  type="url"
                  placeholder="https://example.com"
                  className="pl-9 h-10 text-sm"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Company Logo (Optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />

              {logoPreview ? (
                <div className="flex items-center gap-4 p-3 rounded-xl border bg-muted/20">
                  <div className="relative h-16 w-16 rounded-xl border bg-card p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    <img
                      src={logoPreview}
                      alt="Company Logo Preview"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-medium text-foreground truncate">
                      {logoFile?.name || "company-logo"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {logoFile ? `${(logoFile.size / 1024).toFixed(1)} KB` : "Logo ready"}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-2.5 font-medium"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                      >
                        Change Logo
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleRemoveLogo}
                        disabled={loading}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 bg-muted/10 hover:bg-muted/20"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <UploadCloud className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">
                        Click to upload or drag & drop logo
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        PNG, JPG, or WEBP (Max 2MB)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="comp-desc" className="text-xs font-semibold">Company Overview</Label>
              <Textarea
                id="comp-desc"
                placeholder="Briefly describe what your company does, your engineering culture, and mission..."
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs leading-relaxed"
              />
            </div>

            <Button type="submit" className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20 gap-2" disabled={loading}>
              <span>{loading ? "Registering..." : "Save Company & Continue to Post Job"}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageTransition>
  )
}
