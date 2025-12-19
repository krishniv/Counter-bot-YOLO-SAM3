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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Navbar */}
        <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-900/50">
                  <span className="font-bold text-lg">Q</span>
              </div>
              <h1 className="font-bold text-xl tracking-tight text-white">QualityVision<span className="text-blue-500">AI</span></h1>
            </div>
            
            <nav className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700">
              <button 
                  onClick={() => setActiveTab(Tab.OPERATOR)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === Tab.OPERATOR ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                  <LayoutDashboard className="w-4 h-4" />
                  Operator
              </button>
              <button 
                  onClick={() => setActiveTab(Tab.MANAGER)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === Tab.MANAGER ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                  <PieChart className="w-4 h-4" />
                  Manager
              </button>
            </nav>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  System Operational
              </div>
              <Settings className="w-5 h-5 text-slate-400 cursor-pointer hover:text-white" />
              <div className="flex items-center">
                <UserButton 
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8",
                      userButtonPopoverCard: "bg-slate-900 border-slate-800",
                      userButtonPopoverActionButton: "text-slate-300 hover:bg-slate-800",
                      userButtonPopoverActionButtonText: "text-slate-300",
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
                      <h2 className="text-2xl font-bold text-white">Operator Dashboard</h2>
                      <p className="text-slate-400">Real-time conveyor monitoring and visual inspection.</p>
                  </div>
                  <Dashboard logs={logs} onNewLog={handleNewLog} onResetSession={handleResetSession} />
              </div>
          ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="mb-6">
                      <h2 className="text-2xl font-bold text-white">Production Analytics</h2>
                      <p className="text-slate-400">Shift performance reports and defect analysis.</p>
                  </div>
                  <Analytics logs={logs} />
              </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-800 py-6 bg-slate-900 mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500">
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