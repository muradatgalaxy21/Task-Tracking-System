"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  
  // States
  const [isSignup, setIsSignup] = useState(false);
  const [step, setStep] = useState(0); // 0: Email, 1: Passcode
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Toggle between Login and Signup
  const toggleAuthMode = () => {
    setIsSignup(!isSignup);
    setStep(0);
    setError("");
    setSuccess(false);
    setPassword("");
  };

  // Step 1: Verify Email for Login
  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/user/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) throw new Error("Failed to verify email.");

      const { exists } = await response.json();

      if (exists) {
        setStep(1);
      } else {
        setError("This email is not registered. Would you like to create an account?");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Final Step: Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter your passcode.");
      return;
    }

    try {
      setLoading(true);

      const result = await signIn("credentials", {
        email: email.trim(),
        password: password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid passcode. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  };

  // Signup Logic
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
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
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create account.");
      }

      setSuccess(true);
      // Automatically log in or redirect to login step
      setTimeout(() => {
        setIsSignup(false);
        setStep(1);
        setSuccess(false);
      }, 2000);
      
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full font-sans">
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
        </div>
        <div className="relative z-10 text-center mt-auto mb-20 px-10">
          <h2 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">Turn your ideas into reality.</h2>
          <p className="text-lg text-white/90 font-medium drop-shadow-md">Keep track of your projects and manage tasks efficiently.</p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white transition-all duration-500">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="AI and Beyond Logo" width={80} height={80} className="object-contain" />
          </div>
          
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {isSignup ? "Create an Account" : "Login to your Account"}
            </h1>
            <p className="text-gray-500 italic">see whats going on with your tasks</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm animate-in fade-in zoom-in duration-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium animate-in fade-in zoom-in duration-300">
              Success! Redirecting to login step...
            </div>
          )}

          <div className="relative overflow-hidden">
            <form 
              onSubmit={isSignup ? handleSignup : (step === 0 ? handleNextStep : handleLogin)} 
              className="space-y-5"
            >
              {/* Email Input - Always shown in Step 0 or Signup */}
              <div className={`transition-all duration-500 ${(step === 1 && !isSignup) ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mail@abc.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800 bg-gray-50/50"
                  required
                  disabled={loading || (step === 1 && !isSignup)}
                />
              </div>

              {/* Passcode Input - Shown in Signup or Step 1 of Login */}
              {(isSignup || step === 1) && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-semibold text-gray-700">Passcode (8-digits)</label>
                    {!isSignup && (
                      <button 
                        type="button" 
                        onClick={() => setStep(0)} 
                        className="text-xs text-[#7b2c51] hover:underline flex items-center gap-1"
                      >
                        <ArrowLeft size={12} /> Change Email
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••••"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800 bg-gray-50/50"
                    required
                    minLength={8}
                    autoFocus
                  />
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading || success}
                className="w-full py-3.5 rounded-xl bg-[#7b2c51] text-white font-bold hover:bg-[#622a44] active:scale-[0.98] transition-all shadow-lg shadow-[#7b2c51]/20 flex items-center justify-center mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  isSignup ? "Create Account" : (step === 0 ? "Continue" : "Login")
                )}
              </button>
            </form>
          </div>

          <p className="text-center mt-10 text-gray-600 text-sm">
            {isSignup ? "Already have an account?" : "Not Registered Yet?"}{" "}
            <button 
              onClick={toggleAuthMode}
              className="text-[#7b2c51] font-bold hover:underline ml-1"
            >
              {isSignup ? "Log in" : "Create an account"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
