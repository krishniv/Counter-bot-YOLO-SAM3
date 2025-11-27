import React from 'react';
import LiveMonitor from './LiveMonitor';
import { CountLog } from '../types';
import { Activity, Box, AlertTriangle } from 'lucide-react';

interface DashboardProps {
  logs: CountLog[];
  onNewLog: (log: CountLog) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ logs, onNewLog }) => {
  // Calculate quick stats from logs
  const sessionTotal = logs.reduce((acc, curr) => acc + curr.totalCount, 0);
  const sessionDefects = logs.reduce((acc, curr) => acc + curr.defectCount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Feed Column */}
      <div className="lg:col-span-2 space-y-6">
        <LiveMonitor onNewLog={onNewLog} />
        
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
            {logs.length === 0 ? (
                <div className="text-center text-slate-500 py-10">No data collected yet.</div>
            ) : (
                logs.slice().reverse().map((log) => (
                    <div key={log.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors flex justify-between items-center">
                        <div className="flex items-center gap-3">
                           {log.imageUrl && <img src={log.imageUrl} alt="scan" className="w-10 h-10 rounded bg-slate-800 object-cover" />}
                           <div>
                                <p className="text-sm font-medium text-slate-200">
                                    Count: {log.totalCount}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </p>
                           </div>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded font-bold ${log.defectCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                            {log.defectCount > 0 ? `${log.defectCount} DEFECT` : 'OK'}
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;