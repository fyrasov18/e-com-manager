"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  validateLoginCredentials,
  type LoginFieldErrors,
} from "@/lib/auth-validation";

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
const RATE_LIMIT_MESSAGE = "Trop de tentatives. Réessayez plus tard.";

function getSafeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function hasFieldErrors(errors: LoginFieldErrors) {
  return Boolean(errors.email || errors.password);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  useEffect(() => {
    const authError = searchParams.get("error");
    if (authError === "CredentialsSignin") {
      setError(INVALID_CREDENTIALS_MESSAGE);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validation = validateLoginCredentials(email, password);
    setFieldErrors(validation.errors);

    if (hasFieldErrors(validation.errors) || !validation.success) {
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validation.data.email,
          password: validation.data.password,
          callbackUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setError(RATE_LIMIT_MESSAGE);
        return;
      }

      if (!response.ok) {
        if (data.errors) {
          setFieldErrors(data.errors);
          setError("");
          return;
        }

        setError(data.error || INVALID_CREDENTIALS_MESSAGE);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Erreur de connexion. Veuillez reessayer.");
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

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <BrandLogo variant="stacked" showTagline markClassName="h-16 w-16" />
          <p className="text-sm text-muted-foreground mt-3 text-center">
            Connectez-vous pour acceder a votre tableau de bord
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/20">
          <h2 className="text-xl font-semibold mb-6">Connexion</h2>

          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm mb-5">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="admin@exemple.com"
                className="input-base w-full"
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <p id="email-error" className="text-xs text-rose-400">
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="********"
                  className="input-base w-full pr-10"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-xs text-rose-400">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Se connecter
                </>
              )}
            </button>
          </form>

          <div className="mt-4 border-t border-border pt-4">
            <Link
              href="/register"
              className="btn-secondary w-full flex items-center justify-center gap-2 rounded-lg"
            >
              <UserPlus className="h-4 w-4" />
              Creer un compte
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          E-com Manager (c) {new Date().getFullYear()} - Acces restreint
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
