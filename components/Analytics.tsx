import React, { useState } from 'react';
import { CountLog } from '../types';
import { generateShiftReport } from '../services/visionService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { FileText, Sparkles, Download } from 'lucide-react';

interface AnalyticsProps {
  logs: CountLog[];
}

const Analytics: React.FC<AnalyticsProps> = ({ logs }) => {
  const [report, setReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Prepare chart data
  const chartData = logs.map((log, index) => ({
    time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    count: log.totalCount,
    defects: log.defectCount,
    index: index
  })).slice(-20); // Last 20 data points

  const handleGenerateReport = async () => {
    setLoadingReport(true);
    const summary = await generateShiftReport(logs);
    setReport(summary);
    setLoadingReport(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Counts */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-6">Throughput Volume (Last 20 Scans)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tick={{fill: '#94a3b8'}} />
                <YAxis stroke="#94a3b8" fontSize={12} tick={{fill: '#94a3b8'}} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Items"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Defects */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-6">Defect Trends</h3>
          <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tick={{fill: '#94a3b8'}} />
                <YAxis stroke="#94a3b8" fontSize={12} tick={{fill: '#94a3b8'}} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc' }}
                />
                <Line type="monotone" dataKey="defects" stroke="#ef4444" strokeWidth={2} name="Defects" dot={{fill: '#ef4444'}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Report Section */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="text-blue-400 w-5 h-5" />
              Production Summary
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Generate a shift performance report from the backend system.
            </p>
          </div>
          <button 
            onClick={handleGenerateReport}
            disabled={loadingReport || logs.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-lg ${
                loadingReport || logs.length === 0
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {loadingReport ? <Sparkles className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>}
            {loadingReport ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
        
        <div className="p-6 bg-slate-900/50 min-h-[150px]">
          {report ? (
            <div className="prose prose-invert max-w-none">
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap font-mono text-sm">{report}</p>
                </div>
                <div className="mt-4 flex justify-end">
                    <button className="text-sm text-slate-400 hover:text-white flex items-center gap-1">
                        <Download className="w-4 h-4" /> Export PDF
                    </button>
                </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 h-32 italic">
               {logs.length === 0 ? "Collect data in Operator View to enable reporting." : "No report generated yet."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;