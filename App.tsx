import React, { useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import AuthWrapper from './components/AuthWrapper';
import { Tab, CountLog } from './types';
import { LayoutDashboard, PieChart, Info, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.OPERATOR);
  const [logs, setLogs] = useState<CountLog[]>([]);

  // Function to add new logs from the live monitor
  const handleNewLog = (log: CountLog) => {
    setLogs(prev => [...prev, log]);
  };

  // Function to reset session - clear all logs
  const handleResetSession = () => {
    setLogs([]);
  };

  return (
    <AuthWrapper>
      <div className="min-h-screen bg-[#000424] text-[#e5e8ff] flex flex-col">
        {/* Navbar */}
        <header className="sticky top-0 z-50 bg-[#000424]/80 backdrop-blur-md border-b border-[#000a66]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#3347ff] rounded flex items-center justify-center shadow-lg shadow-[#0019ff]/50">
                  <span className="font-bold text-lg text-[#e5e8ff]">Q</span>
              </div>
              <h1 className="font-bold text-xl tracking-tight text-[#e5e8ff]">QualityVision<span className="text-[#6675ff]">AI</span></h1>
            </div>
            
            <nav className="flex items-center gap-1 bg-[#000533]/50 p-1 rounded-lg border border-[#000a66]">
              <button 
                  onClick={() => setActiveTab(Tab.OPERATOR)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === Tab.OPERATOR ? 'bg-[#000f99] text-[#e5e8ff] shadow' : 'text-[#99a3ff] hover:text-[#ccd1ff]'}`}
              >
                  <LayoutDashboard className="w-4 h-4" />
                  Operator
              </button>
              <button 
                  onClick={() => setActiveTab(Tab.MANAGER)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === Tab.MANAGER ? 'bg-[#000f99] text-[#e5e8ff] shadow' : 'text-[#99a3ff] hover:text-[#ccd1ff]'}`}
              >
                  <PieChart className="w-4 h-4" />
                  Manager
              </button>
            </nav>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#000533] border border-[#000a66] text-xs text-[#99a3ff]">
                  <span className="w-2 h-2 rounded-full bg-[#3347ff] animate-pulse"></span>
                  System Operational
              </div>
              <Settings className="w-5 h-5 text-[#99a3ff] cursor-pointer hover:text-[#e5e8ff]" />
              <div className="flex items-center">
                <UserButton 
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8",
                      userButtonPopoverCard: "bg-[#000424] border-[#000a66]",
                      userButtonPopoverActionButton: "text-[#ccd1ff] hover:bg-[#000533]",
                      userButtonPopoverActionButtonText: "text-[#ccd1ff]",
                      userButtonPopoverFooter: "hidden"
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === Tab.OPERATOR ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="mb-6">
                      <h2 className="text-2xl font-bold text-[#e5e8ff]">Operator Dashboard</h2>
                      <p className="text-[#99a3ff]">Real-time conveyor monitoring and visual inspection.</p>
                  </div>
                  <Dashboard logs={logs} onNewLog={handleNewLog} onResetSession={handleResetSession} />
              </div>
          ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="mb-6">
                      <h2 className="text-2xl font-bold text-[#e5e8ff]">Production Analytics</h2>
                      <p className="text-[#99a3ff]">Shift performance reports and defect analysis.</p>
                  </div>
                  <Analytics logs={logs} />
              </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-[#000a66] py-6 bg-[#000424] mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-xs text-[#99a3ff]">
              <p>© 2024 QualityVision AI Systems. All rights reserved.</p>
              <div className="flex gap-4 mt-2 sm:mt-0">
                  <span className="flex items-center gap-1"><Info className="w-3 h-3"/> v1.0.5</span>
                  <span>Powered by YOLO11 & FastAPI</span>
              </div>
          </div>
        </footer>
      </div>
    </AuthWrapper>
  );
};

export default App;