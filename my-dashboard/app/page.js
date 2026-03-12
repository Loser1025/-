'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { 
  Trophy, Users, Target, Calendar, RefreshCw, 
  TrendingUp, Award, ChevronRight, AlertCircle,
  LayoutDashboard, List, Search, Filter, ArrowUpRight
} from 'lucide-react';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'details'
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sheets');
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError("データの取得に失敗しました。設定（環境変数や共有設定）を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const completionRate = useMemo(() => {
    if (!data || !data.totalTarget) return 0;
    return ((data.totalCount / data.totalTarget) * 100).toFixed(1);
  }, [data]);

  const filteredPlayers = useMemo(() => {
    if (!data?.allPlayers) return [];
    if (!searchQuery) return data.allPlayers;
    const q = searchQuery.toLowerCase();
    return data.allPlayers.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.unit.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-800">{error}</h2>
        <button 
          onClick={fetchData}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-12">
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">受任進捗 Analytics</h1>
              <p className="text-xs text-slate-500 font-medium">REALTIME DASHBOARD</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
                activeTab === 'overview' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              概要
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
                activeTab === 'details' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              受任数詳細
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400 font-medium uppercase">Last Update</p>
              <p className="text-sm font-semibold text-slate-700">{lastUpdated || "--:--"}</p>
            </div>
            <button 
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '更新中...' : 'データを更新'}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {/* KPI Cards (Always visible or just for Overview? Let's keep them for Overview) */}
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <KpiCard 
                title="全体受任数" 
                value={data?.totalCount} 
                unit="件" 
                icon={<Award className="w-5 h-5 text-blue-600" />}
                color="blue"
              />
              <KpiCard 
                title="進捗達成率" 
                value={completionRate} 
                unit="%" 
                icon={<Target className="w-5 h-5 text-emerald-600" />}
                color="emerald"
                progress={completionRate}
              />
              <KpiCard 
                title="今日までに必要な本数" 
                value={data?.totalTarget} 
                unit="件" 
                icon={<Users className="w-5 h-5 text-purple-600" />}
                color="purple"
              />
              <KpiCard 
                title="反響数" 
                value={data?.inquiryCount || "0"} 
                unit="件" 
                icon={<TrendingUp className="w-5 h-5 text-orange-600" />}
                color="orange"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2 text-slate-800">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    個人ランキング
                  </h3>
                  <span className="text-xs font-bold text-slate-400 uppercase">Top 10</span>
                </div>
                <div className="divide-y divide-slate-50 min-h-[300px] max-h-[600px] overflow-y-auto custom-scrollbar">
                  {loading ? (
                    <div className="p-12 text-center text-slate-400 text-sm">読み込み中...</div>
                  ) : data?.ranking?.map((player, i) => (
                    <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition cursor-default">
                      <div className="flex items-center gap-4">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          i === 0 ? 'bg-yellow-100 text-yellow-700' : 
                          i === 1 ? 'bg-slate-100 text-slate-700' : 
                          i === 2 ? 'bg-orange-100 text-orange-700' : 'text-slate-400'
                        }`}>
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-bold text-slate-700">{player.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{player.unit}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-900">{player.count} <span className="text-[10px] font-normal text-slate-400">件</span></p>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setActiveTab('details')}
                  className="w-full py-4 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition border-t border-slate-100 flex items-center justify-center gap-1"
                >
                  全ランキングを見る <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-8 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  ユニット別進捗状況
                </h3>
                <div className="h-[500px] w-full">
                  {loading ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">読み込み中...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.units} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          width={80}
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                        />
                        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                        <Bar dataKey="actual" name="実績" radius={[0, 6, 6, 0]} barSize={24}>
                          {data?.units.map((entry, index) => {
                            const ratio = entry.actual / (entry.target || 1);
                            let color = "#3b82f6"; 
                            if (ratio >= 1.0) color = "#10b981"; 
                            else if (ratio < 0.8) color = "#f59e0b"; 
                            return <Cell key={`cell-${index}`} fill={color} />;
                          })}
                        </Bar>
                        <Bar dataKey="target" name="目標" fill="#f1f5f9" radius={[0, 6, 6, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'details' && (
          <div className="space-y-8">
            {/* Individual Table with Search */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="font-bold flex items-center gap-2 text-slate-800">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  個人別受任数一覧
                </h3>
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="名前やユニットで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>
              <div className="overflow-x-auto max-h-[800px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">ランク</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">名前</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ユニット</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">受任数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPlayers.length > 0 ? filteredPlayers.map((player, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition group">
                        <td className="px-6 py-4">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                            i === 0 ? 'bg-yellow-100 text-yellow-700' : 
                            i === 1 ? 'bg-slate-100 text-slate-700' : 
                            i === 2 ? 'bg-orange-100 text-orange-700' : 'text-slate-400'
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-700 group-hover:text-blue-600 transition">{player.name}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">
                            {player.unit}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-black text-slate-900 text-lg">{player.count}</span>
                            <span className="text-[10px] font-bold text-slate-400">件</span>
                            {player.count > 10 && <ArrowUpRight className="w-3 h-3 text-emerald-500 ml-1" />}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center text-slate-400">
                          該当するデータが見つかりませんでした
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unit Stats Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-bold flex items-center gap-2 text-slate-800">
                  <Users className="w-5 h-5 text-blue-600" />
                  ユニット別受任状況
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ユニット名</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">実績</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">必要数</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">達成率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data?.units.map((unit, i) => {
                      const ratio = (unit.actual / (unit.target || 1)) * 100;
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 font-bold text-slate-700">{unit.name}</td>
                          <td className="px-6 py-4 text-right font-black text-slate-900">{unit.actual.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">件</span></td>
                          <td className="px-6 py-4 text-right font-medium text-slate-500">{unit.target?.toLocaleString() || "---"} <span className="text-[10px] font-normal text-slate-400">件</span></td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${ratio >= 100 ? 'bg-emerald-500' : ratio >= 80 ? 'bg-blue-500' : 'bg-orange-500'}`}
                                  style={{ width: `${Math.min(ratio, 100)}%` }}
                                />
                              </div>
                              <span className={`text-sm font-bold ${ratio >= 100 ? 'text-emerald-600' : ratio >= 80 ? 'text-blue-600' : 'text-orange-600'}`}>
                                {ratio.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const KpiCard = ({ title, value, unit, icon, color, progress }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 rounded-2xl ${colors[color]}`}>
          {icon}
        </div>
        {progress && (
          <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-full text-slate-500">
            GOAL FOCUS
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500 mb-1">{title}</p>
        <div className="flex items-baseline gap-1">
          <h2 className="text-3xl font-black text-slate-900">
            {value?.toLocaleString() || "---"}
          </h2>
          <span className="text-sm font-bold text-slate-400">{unit}</span>
        </div>
      </div>
      {progress && (
        <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-emerald-500 h-full transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(parseFloat(progress), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
