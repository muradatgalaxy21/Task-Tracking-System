"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ArrowRight } from "lucide-react";

export default function OnboardingPage() {
  const { update } = useSession();
  const router = useRouter();
  
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !dob) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/user/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          full_name: fullName.trim(), 
          dob: dob 
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save profile.");
      }

      // Update the NextAuth session so the client-side state is fresh
      await update({ full_name: fullName.trim() });
      
      // Redirect to the dashboard
      router.push("/dashboard");
      router.refresh();
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faebd7] p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[#7b2c51]/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-[#7b2c51]/10 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md bg-white border border-gray-100 rounded-3xl shadow-2xl p-10 relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="flex justify-center mb-8">
          <Image src="/images/logo.png" alt="AI and Beyond Logo" width={60} height={60} className="object-contain" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-800">Complete Your Profile</h1>
          <p className="text-sm text-gray-500 mt-2 italic">
            Just a few more details to get you started with AI & Beyond
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="fullName" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="dob" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">
              Date of Birth
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !fullName.trim() || !dob}
            className="w-full flex items-center justify-center gap-2 bg-[#7b2c51] hover:bg-[#622a44] text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-lg shadow-[#7b2c51]/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Saving Profile...</span>
              </>
            ) : (
              <>
                <span>Enter Dashboard</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
