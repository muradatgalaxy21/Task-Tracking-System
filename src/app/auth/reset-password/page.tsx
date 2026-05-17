"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";

// Separated into its own component because useSearchParams() requires a Suspense boundary.
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Verify the token before showing the form so the user does not waste effort
  // filling in a password only to learn their link has already expired.
  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => setTokenValid(data.valid === true))
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Passcode must be at least 8 digits.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passcodes do not match.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to reset password.");
      }

      setSuccess(true);
      // Redirect to sign-in after a brief moment so the user reads the confirmation.
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!token || !tokenValid) {
    return (
      <div>
        <h1 className="text-[18px] font-bold text-gray-900 mb-2">Link expired or invalid</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          This password reset link is no longer valid. Reset links expire after 15 minutes
          and can only be used once.
        </p>
        <Link
          href="/auth/forgot-password"
          className="block w-full py-2.5 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold text-center hover:bg-[#621f3e] active:scale-[0.98] transition-all shadow-sm"
        >
          Request a new link
        </Link>
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mt-4 transition-colors"
        >
          <ArrowLeft size={11} />
          Back to sign in
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div>
        <h1 className="text-[18px] font-bold text-gray-900 mb-2">Password updated</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          Your password has been reset. Redirecting you to sign in...
        </p>
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-sm text-[#7b2c51] font-medium hover:underline"
        >
          <ArrowLeft size={14} />
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="text-[18px] font-bold text-gray-900 mb-1.5">Set a new password</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Enter your new numeric passcode. It must be at least 8 digits.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm leading-snug">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
            New Passcode
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="Numeric passcode"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50"
            required
            minLength={8}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
            Confirm New Passcode
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="Repeat your passcode"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50"
            required
            minLength={8}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold hover:bg-[#621f3e] active:scale-[0.98] transition-all flex items-center justify-center shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset Password"}
        </button>
      </form>

      <Link
        href="/login"
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mt-5 transition-colors"
      >
        <ArrowLeft size={11} />
        Back to sign in
      </Link>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-[340px] bg-white rounded-xl shadow-sm border border-gray-100 px-8 py-10">
        <div className="flex items-center gap-2.5 mb-8">
          <Image
            src="/images/logo.png"
            alt="AI and Beyond"
            width={28}
            height={28}
            className="object-contain"
          />
          <span className="text-sm font-semibold text-gray-900 tracking-tight">
            AI and Beyond
          </span>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
