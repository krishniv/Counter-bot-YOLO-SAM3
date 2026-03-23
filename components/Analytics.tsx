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
        <div className="bg-[#000533] p-6 rounded-xl border border-[#000a66]">
          <h3 className="text-lg font-semibold text-[#e5e8ff] mb-6">Throughput Volume (Last 20 Scans)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000f99" />
                <XAxis dataKey="time" stroke="#6675ff" fontSize={12} tick={{fill: '#6675ff'}} />
                <YAxis stroke="#6675ff" fontSize={12} tick={{fill: '#6675ff'}} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#000424', borderColor: '#000a66', color: '#e5e8ff' }}
                    itemStyle={{ color: '#e5e8ff' }}
                />
                <Bar dataKey="count" fill="#3347ff" radius={[4, 4, 0, 0]} name="Total Items"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Defects */}
        <div className="bg-[#000533] p-6 rounded-xl border border-[#000a66]">
          <h3 className="text-lg font-semibold text-[#e5e8ff] mb-6">Defect Trends</h3>
          <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000f99" />
                <XAxis dataKey="time" stroke="#6675ff" fontSize={12} tick={{fill: '#6675ff'}} />
                <YAxis stroke="#6675ff" fontSize={12} tick={{fill: '#6675ff'}} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#000424', borderColor: '#000a66', color: '#e5e8ff' }}
                />
                <Line type="monotone" dataKey="defects" stroke="#6675ff" strokeWidth={2} name="Defects" dot={{fill: '#6675ff'}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Report Section */}
      <div className="bg-[#000533] rounded-xl border border-[#000a66] overflow-hidden">
        <div className="p-6 border-b border-[#000a66] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#e5e8ff] flex items-center gap-2">
              <Sparkles className="text-[#6675ff] w-5 h-5" />
              Production Summary
            </h2>
            <p className="text-sm text-[#99a3ff] mt-1">
              Generate a shift performance report from the backend system.
            </p>
          </div>
          <button 
            onClick={handleGenerateReport}
            disabled={loadingReport || logs.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-lg ${
                loadingReport || logs.length === 0
                ? 'bg-[#000533] text-[#99a3ff] cursor-not-allowed' 
                : 'bg-[#3347ff] hover:bg-[#0019ff] text-[#e5e8ff]'
            }`}
          >
            {loadingReport ? <Sparkles className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>}
            {loadingReport ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
        
        <div className="p-6 bg-[#000424]/50 min-h-[150px]">
          {report ? (
            <div className="prose prose-invert max-w-none">
                <div className="bg-[#3347ff]/10 border border-[#3347ff]/20 p-4 rounded-lg">
                    <p className="text-[#ccd1ff] leading-relaxed whitespace-pre-wrap font-mono text-sm">{report}</p>
                </div>
                <div className="mt-4 flex justify-end">
                    <button className="text-sm text-[#99a3ff] hover:text-[#e5e8ff] flex items-center gap-1">
                        <Download className="w-4 h-4" /> Export PDF
                    </button>
                </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-[#99a3ff] h-32 italic">
               {logs.length === 0 ? "Collect data in Operator View to enable reporting." : "No report generated yet."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;