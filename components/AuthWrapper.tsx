import React from 'react';
import { SignedIn, SignedOut, SignIn, SignUp } from '@clerk/clerk-react';
import { LayoutDashboard } from 'lucide-react';

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  return (
    <>
      <SignedIn>
        {children}
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-900/50">
                  <span className="font-bold text-2xl">Q</span>
                </div>
                <h1 className="font-bold text-3xl tracking-tight text-white">
                  QualityVision<span className="text-blue-500">AI</span>
                </h1>
              </div>
              <p className="text-slate-400">Sign in to access the quality monitoring system</p>
            </div>

            {/* Auth Container */}
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl p-6 shadow-2xl">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <LayoutDashboard className="w-5 h-5 text-blue-500" />
                  <h2 className="text-xl font-semibold text-white">Authentication</h2>
                </div>
                <SignIn 
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: "mx-auto",
                      card: "bg-transparent shadow-none",
                      headerTitle: "text-white",
                      headerSubtitle: "text-slate-400",
                      socialButtonsBlockButton: "bg-slate-800 border-slate-700 text-white hover:bg-slate-700",
                      formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white",
                      formFieldInput: "bg-slate-800 border-slate-700 text-white",
                      formFieldLabel: "text-slate-300",
                      footerActionLink: "text-blue-500 hover:text-blue-400",
                      identityPreviewText: "text-slate-300",
                      identityPreviewEditButton: "text-blue-500 hover:text-blue-400",
                      formResendCodeLink: "text-blue-500 hover:text-blue-400",
                      otpCodeFieldInput: "bg-slate-800 border-slate-700 text-white",
                      alertText: "text-slate-300",
                    },
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-6 text-xs text-slate-500">
              <p>© 2024 QualityVision AI Systems. All rights reserved.</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default AuthWrapper;
