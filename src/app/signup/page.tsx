"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and passcode.");
      return;
    }

    if (password.length < 8) {
      setError("Passcode must be at least 8 characters.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create account");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Left side - Visuals */}
      <div className="hidden lg:flex w-1/2 bg-[#faebd7] relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Image 
            src="/images/skeleton.png" 
            alt="Skeleton working" 
            fill 
            className="object-cover" 
            sizes="50vw"
            priority
          />
          {/* Gradient Overlay for text visibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
        </div>
        <div className="relative z-10 text-center mt-auto mb-20 px-10">
          <h2 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">Turn your ideas into reality.</h2>
          <p className="text-lg text-white/90 font-medium drop-shadow-md">Start your journey and manage tasks efficiently.</p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="AI and Beyond Logo" width={60} height={60} className="object-contain" />
          </div>
          
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Create an Account</h1>
            <p className="text-gray-500">see whats going on with your tasks</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              Account created successfully! Please check your email for confirmation. Redirecting to login...
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@abc.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#7b2c51] focus:border-[#7b2c51] outline-none transition-all text-gray-800"
                required
                disabled={loading || success}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passcode (8-digit)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#7b2c51] focus:border-[#7b2c51] outline-none transition-all text-gray-800"
                required
                minLength={8}
                disabled={loading || success}
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-3.5 rounded-xl bg-[#7b2c51] text-white font-semibold hover:bg-[#622a44] transition-colors flex items-center justify-center mt-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign Up"}
            </button>
          </form>

          <p className="text-center mt-10 text-gray-600">
            Already Registered? <Link href="/login" className="text-[#7b2c51] font-semibold hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
