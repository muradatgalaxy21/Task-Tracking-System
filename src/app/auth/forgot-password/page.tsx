"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) throw new Error("Request failed.");

      // Show the confirmation message regardless of whether the email exists,
      // so we do not leak which addresses are registered.
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

        {submitted ? (
          <div>
            <h1 className="text-[18px] font-bold text-gray-900 mb-2">Check your email</h1>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              If an account exists for{" "}
              <span className="font-medium text-gray-700">{email}</span>, a reset link has
              been sent. The link expires in 15 minutes.
            </p>
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-sm text-[#7b2c51] font-medium hover:underline"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="text-[18px] font-bold text-gray-900 mb-1.5">Reset your password</h1>
              <p className="text-sm text-gray-400 leading-relaxed">
                Enter your email address and we will send you a reset link.
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
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold hover:bg-[#621f3e] active:scale-[0.98] transition-all flex items-center justify-center shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
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
        )}
      </div>
    </div>
  );
}
