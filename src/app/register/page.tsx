"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Send,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  validateRegisterRequest,
  type RegisterFieldErrors,
} from "@/lib/auth-validation";

const DEFAULT_FORM = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  phone: "",
  role: "USER",
};

function hasFieldErrors(errors: RegisterFieldErrors) {
  return Boolean(
    errors.name ||
      errors.email ||
      errors.password ||
      errors.confirmPassword ||
      errors.phone ||
      errors.role
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function updateField(field: keyof typeof DEFAULT_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateRegisterRequest(form);
    setFieldErrors(validation.errors);

    if (hasFieldErrors(validation.errors) || !validation.success) {
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.errors) {
          setFieldErrors(data.errors);
        }
        setError(data.error || "Impossible d'envoyer la demande.");
        return;
      }

      setSuccess(
        data.message ||
          "Votre demande a ete envoyee. Veuillez attendre l'accord de l'administrateur."
      );
      setForm(DEFAULT_FORM);
      setFieldErrors({});
    } catch {
      setError("Erreur reseau. Veuillez reessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <BrandLogo variant="stacked" showTagline markClassName="h-16 w-16" />
          <p className="text-sm text-muted-foreground mt-3 text-center">
            Demandez un acces a la plateforme.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Creer un compte</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Votre compte devra etre valide par un administrateur.
              </p>
            </div>
            <Link
              href="/login"
              className="btn-secondary shrink-0 rounded-lg px-3 py-2 text-xs"
            >
              Connexion
            </Link>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="name" className="text-sm font-medium text-muted-foreground">
                  Nom complet
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="input-base"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "name-error" : undefined}
                />
                {fieldErrors.name && (
                  <p id="name-error" className="text-xs text-rose-400">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                  Adresse email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="nom@exemple.com"
                  className="input-base"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                />
                {fieldErrors.email && (
                  <p id="register-email-error" className="text-xs text-rose-400">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    className="input-base pr-10"
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="register-password-error" className="text-xs text-rose-400">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Confirmation mot de passe
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(event) =>
                      updateField("confirmPassword", event.target.value)
                    }
                    className="input-base pr-10"
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={
                      fieldErrors.confirmPassword ? "confirm-password-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={
                      showConfirmPassword
                        ? "Masquer la confirmation"
                        : "Afficher la confirmation"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p id="confirm-password-error" className="text-xs text-rose-400">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phone" className="text-sm font-medium text-muted-foreground">
                  Telephone optionnel
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="input-base"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                />
                {fieldErrors.phone && (
                  <p id="phone-error" className="text-xs text-rose-400">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="role" className="text-sm font-medium text-muted-foreground">
                  Role demande
                </label>
                <select
                  id="role"
                  value={form.role}
                  onChange={(event) => updateField("role", event.target.value)}
                  className="input-base"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.role)}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                {fieldErrors.role && (
                  <p className="text-xs text-rose-400">{fieldErrors.role}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full gap-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Envoyer la demande
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
