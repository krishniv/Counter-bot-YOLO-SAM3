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
        <div className="min-h-screen bg-[#000424] text-[#e5e8ff] flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 bg-[#3347ff] rounded flex items-center justify-center shadow-lg shadow-[#0019ff]/50">
                  <span className="font-bold text-2xl text-[#e5e8ff]">Q</span>
                </div>
                <h1 className="font-bold text-3xl tracking-tight text-[#e5e8ff]">
                  QualityVision<span className="text-[#6675ff]">AI</span>
                </h1>
              </div>
              <p className="text-[#99a3ff]">Sign in to access the quality monitoring system</p>
            </div>

            {/* Auth Container */}
            <div className="bg-[#000424]/80 backdrop-blur-md border border-[#000a66] rounded-xl p-6 shadow-2xl">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <LayoutDashboard className="w-5 h-5 text-[#6675ff]" />
                  <h2 className="text-xl font-semibold text-[#e5e8ff]">Authentication</h2>
                </div>
                <SignIn 
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: "mx-auto",
                      card: "bg-transparent shadow-none",
                      headerTitle: "text-[#e5e8ff]",
                      headerSubtitle: "text-[#99a3ff]",
                      socialButtonsBlockButton: "bg-[#000533] border-[#000a66] text-[#e5e8ff] hover:bg-[#000533]",
                      formButtonPrimary: "bg-[#3347ff] hover:bg-[#0019ff] text-[#e5e8ff]",
                      formFieldInput: "bg-[#000533] border-[#000a66] text-[#e5e8ff]",
                      formFieldLabel: "text-[#ccd1ff]",
                      footerActionLink: "text-[#6675ff] hover:text-[#99a3ff]",
                      identityPreviewText: "text-[#ccd1ff]",
                      identityPreviewEditButton: "text-[#6675ff] hover:text-[#99a3ff]",
                      formResendCodeLink: "text-[#6675ff] hover:text-[#99a3ff]",
                      otpCodeFieldInput: "bg-[#000533] border-[#000a66] text-[#e5e8ff]",
                      alertText: "text-[#ccd1ff]",
                    },
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-6 text-xs text-[#99a3ff]">
              <p>© 2024 QualityVision AI Systems. All rights reserved.</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default AuthWrapper;

