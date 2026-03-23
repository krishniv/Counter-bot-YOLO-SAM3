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
          <div className="bg-[#000533] p-4 rounded-lg border border-[#000a66] flex items-center gap-4">
            <div className="p-3 bg-[#3347ff]/10 rounded-full text-[#6675ff]">
                <Box size={24} />
            </div>
            <div>
                <p className="text-sm text-[#99a3ff]">Session Total</p>
                <p className="text-2xl font-bold text-[#e5e8ff]">{sessionTotal}</p>
            </div>
          </div>
          
          <div className="bg-[#000533] p-4 rounded-lg border border-[#000a66] flex items-center gap-4">
            <div className="p-3 bg-[#3347ff]/10 rounded-full text-[#6675ff]">
                <Activity size={24} />
            </div>
            <div>
                <p className="text-sm text-[#99a3ff]">Throughput</p>
                <p className="text-2xl font-bold text-[#e5e8ff]">
                  {logs.length > 0 ? (sessionTotal / logs.length).toFixed(1) : 0} <span className="text-xs font-normal text-[#99a3ff]">avg/scan</span>
                </p>
            </div>
          </div>

          <div className="bg-[#000533] p-4 rounded-lg border border-[#000a66] flex items-center gap-4">
            <div className="p-3 bg-[#3347ff]/10 rounded-full text-[#6675ff]">
                <AlertTriangle size={24} />
            </div>
            <div>
                <p className="text-sm text-[#99a3ff]">Defects</p>
                <p className="text-2xl font-bold text-[#e5e8ff]">{sessionDefects}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Logs Column */}
      <div className="bg-[#000533] rounded-xl border border-[#000a66] overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-[#000a66] bg-[#000533]/50">
          <h2 className="text-lg font-semibold text-[#e5e8ff]">Recent Scans</h2>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {(() => {
                // Filter to show only logs with defects
                const defectLogs = logs.filter(log => log.defectCount > 0);
                return defectLogs.length === 0 ? (
                    <div className="text-center text-[#99a3ff] py-10">
                        <p>No defects detected</p>
                        <p className="text-xs mt-2 text-[#99a3ff]">Only scans with defects are shown here</p>
                    </div>
                ) : (
                    defectLogs.slice().reverse().map((log) => (
                        <div key={log.id} className="p-3 bg-[#000424]/50 rounded-lg border border-[#000a66]/50 hover:border-[#3347ff] transition-colors flex justify-between items-center">
                            <div className="flex items-center gap-3 flex-1">
                               {log.imageUrl && (
                                 <div 
                                   className="relative cursor-pointer group"
                                   onClick={() => setSelectedImage(log.imageUrl || null)}
                                 >
                                   <img 
                                     src={log.imageUrl} 
                                     alt="scan" 
                                     className="w-10 h-10 rounded bg-[#000533] object-cover transition-transform group-hover:scale-110" 
                                   />
                                   <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                     <ZoomIn className="w-4 h-4 text-[#e5e8ff]" />
                                   </div>
                                 </div>
                               )}
                               <div className="flex-1">
                                    <p className="text-sm font-medium text-[#ccd1ff]">
                                        Count: {log.totalCount}
                                    </p>
                                    <p className="text-xs text-[#99a3ff]">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </p>
                               </div>
                            </div>
                            <div className="text-xs px-2 py-1 rounded font-bold bg-[#3347ff]/20 text-[#6675ff]">
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
              className="absolute top-4 right-4 z-10 p-2 bg-[#000533]/90 hover:bg-[#000533] rounded-full text-[#e5e8ff] transition-colors"
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