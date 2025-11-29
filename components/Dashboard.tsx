import React, { useState } from 'react';
import LiveMonitor from './LiveMonitor';
import { CountLog } from '../types';
import { Activity, Box, AlertTriangle, X, ZoomIn } from 'lucide-react';

interface DashboardProps {
  logs: CountLog[];
  onNewLog: (log: CountLog) => void;
  onResetSession?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ logs, onNewLog, onResetSession }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Calculate quick stats from logs
  const sessionTotal = logs.reduce((acc, curr) => acc + curr.totalCount, 0);
  const sessionDefects = logs.reduce((acc, curr) => acc + curr.defectCount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Feed Column */}
      <div className="lg:col-span-2 space-y-6">
        <LiveMonitor onNewLog={onNewLog} onResetSession={onResetSession} />
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
                <Box size={24} />
            </div>
            <div>
                <p className="text-sm text-slate-400">Session Total</p>
                <p className="text-2xl font-bold text-white">{sessionTotal}</p>
            </div>
          </div>
          
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-full text-green-400">
                <Activity size={24} />
            </div>
            <div>
                <p className="text-sm text-slate-400">Throughput</p>
                <p className="text-2xl font-bold text-white">
                  {logs.length > 0 ? (sessionTotal / logs.length).toFixed(1) : 0} <span className="text-xs font-normal text-slate-500">avg/scan</span>
                </p>
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center gap-4">
            <div className="p-3 bg-yellow-500/10 rounded-full text-yellow-400">
                <AlertTriangle size={24} />
            </div>
            <div>
                <p className="text-sm text-slate-400">Defects</p>
                <p className="text-2xl font-bold text-white">{sessionDefects}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Logs Column */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <h2 className="text-lg font-semibold text-white">Recent Scans</h2>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {(() => {
                // Filter to show only logs with defects
                const defectLogs = logs.filter(log => log.defectCount > 0);
                return defectLogs.length === 0 ? (
                    <div className="text-center text-slate-500 py-10">
                        <p>No defects detected</p>
                        <p className="text-xs mt-2 text-slate-600">Only scans with defects are shown here</p>
                    </div>
                ) : (
                    defectLogs.slice().reverse().map((log) => (
                        <div key={log.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors flex justify-between items-center">
                            <div className="flex items-center gap-3 flex-1">
                               {log.imageUrl && (
                                 <div 
                                   className="relative cursor-pointer group"
                                   onClick={() => setSelectedImage(log.imageUrl || null)}
                                 >
                                   <img 
                                     src={log.imageUrl} 
                                     alt="scan" 
                                     className="w-10 h-10 rounded bg-slate-800 object-cover transition-transform group-hover:scale-110" 
                                   />
                                   <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                     <ZoomIn className="w-4 h-4 text-white" />
                                   </div>
                                 </div>
                               )}
                               <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-200">
                                        Count: {log.totalCount}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </p>
                               </div>
                            </div>
                            <div className="text-xs px-2 py-1 rounded font-bold bg-red-500/20 text-red-400">
                                {log.defectCount} DEFECT{log.defectCount > 1 ? 'S' : ''}
                            </div>
                        </div>
                    ))
                );
            })()}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-800/90 hover:bg-slate-700 rounded-full text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={selectedImage} 
              alt="Defect detail" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;