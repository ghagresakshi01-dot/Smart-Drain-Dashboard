import React, { useState } from "react";
import { 
  ShieldAlert, Activity, Cpu, Camera, Radio, Database, 
  Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, XCircle, 
  Search, Filter, ArrowRight, RefreshCw, Layers, MapPin, 
  CloudRain, TrendingUp, BarChart3, Bell, User, LogOut, ExternalLink,
  ChevronRight, RadioTower, Globe, Sun, Moon, Wifi
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { SYSTEM_STATS } from "./mock";
import { useDrains } from "./hooks/useDrains";
import { useAlerts } from "./hooks/useAlerts";
import { useTheme } from "./hooks/useTheme";
import { useEnvironment } from "./hooks/useEnvironment";
import { useEnvironmentalAlerts } from "./hooks/useEnvironmentalAlerts";
import {
  computeEnvironmentalImpact, computeDrainRisk,
  categoriseRainfall, categoriseTide,
  fmtMm, fmtCm, fmtLpm, fmtSeaLevel,
  riskBadgeClasses,
} from "./services/environmentService";
import { isFirebaseConfigured } from "./firebase/config";
import { LIVE_PROTOTYPE_DRAIN_IDS } from "./data/livePrototypeDrains";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend 
} from "recharts";

// Fix Leaflet marker icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Leaflet marker icons by status
const createCustomIcon = (status, isLive = false) => {
  let color = "#22c55e"; // green healthy
  if (status === "critical") color = "#ef4444"; // red
  if (status === "warning") color = "#f59e0b"; // amber
  if (status === "pending") color = "#3b82f6"; // blue = awaiting deployment
  const ring = isLive ? `box-shadow: 0 0 0 3px rgba(59,130,246,0.35), 0 0 12px ${color};` : `box-shadow: 0 0 10px ${color};`;
  return L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #ffffff; ${ring}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

// Small helpers for pending / null-safe rendering
const fmtValue = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);
const fmtHealth = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const statusBadgeClasses = (status) => {
  switch (status) {
    case 'critical':
      return 'bg-red-950 text-red-400 border border-red-500/30';
    case 'warning':
      return 'bg-amber-950 text-amber-400 border border-amber-500/30';
    case 'healthy':
      return 'bg-emerald-950 text-emerald-400 border border-emerald-500/30';
    case 'pending':
    default:
      return 'bg-blue-950 text-blue-400 border border-blue-500/30';
  }
};
const statusLabel = (drain) => {
  if (drain.status === 'pending' || drain.awaitingDeployment) return 'AWAITING';
  return (drain.status || 'unknown').toUpperCase();
};

const moduleStatusClasses = (status) => {
  switch (status) {
    case 'online':
    case 'connected':
      return 'bg-emerald-950 text-emerald-400';
    case 'degraded':
      return 'bg-amber-950 text-amber-400';
    case 'offline':
    case 'disconnected':
      return 'bg-red-950 text-red-400';
    case 'pending':
    default:
      return 'bg-blue-950 text-blue-400';
  }
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, drains, analytics, alerts
  const [selectedDrain, setSelectedDrain] = useState(null);
  const { theme, isLight, toggleTheme } = useTheme();

  // Live data via Firebase abstraction hooks (falls back to demo mock data
  // when Firebase env vars are not configured — see /src/firebase/config.js)
  const { drains: DRAINS, stats: liveStats } = useDrains();
  const { alerts: ALERTS } = useAlerts();

  // Authentic environmental data (Open-Meteo weather + tide APIs, polled
  // every 10 min) and contextual environmental alerts derived from real
  // weather + tide + Firebase telemetry.
  const environment = useEnvironment();
  const { environmentalAlerts } = useEnvironmentalAlerts({
    drains: DRAINS,
    weather: environment.weather,
    tide: environment.tide,
  });
  // Merge environmental alerts with Firebase/demo alerts (newest first)
  const combinedAlerts = [...environmentalAlerts, ...ALERTS];
  const envImpact = computeEnvironmentalImpact({
    weather: environment.weather,
    tide: environment.tide,
  });

  // Login form state
  const [employeeId, setEmployeeId] = useState("BMC-OPS-4091");
  const [password, setPassword] = useState("••••••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  // Filters state
  const [drainSearch, setDrainSearch] = useState("");
  const [drainFilter, setDrainFilter] = useState("all"); // all, healthy, warning, critical
  const [alertFilter, setAlertFilter] = useState("all"); // all, critical, warning, resolved

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthenticating(true);
    setTimeout(() => {
      setAuthenticating(false);
      setIsLoggedIn(true);
      toast.success("Authenticated & Initialized", {
        description: `Welcome back, Inspector ${employeeId}. Secure BMC session active.`
      });
    }, 1200);
  };

  // Reset scroll to top when switching primary tabs (helps mobile)
  const handleNavigate = (tab) => {
    setSelectedDrain(null);
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setSelectedDrain(null);
    toast.info("Session Terminated", { description: "Logged out from BMC Infrastructure Portal." });
  };

  if (!isLoggedIn) {
    return (
      <div className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#070b14] text-slate-100'} flex flex-col justify-between p-6 md:p-12 relative overflow-hidden font-mono transition-colors duration-300`}>
        <Toaster position="top-right" theme={theme} />
        
        {/* Subtle background tech rings / grid */}
        <div className={`absolute inset-0 ${isLight ? 'bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] opacity-40' : 'bg-[linear-gradient(to_right,#1f293d_1px,transparent_1px),linear-gradient(to_bottom,#1f293d_1px,transparent_1px)] opacity-20'} bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none`} />
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header branding */}
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center z-10">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500/20 border border-amber-500/40 p-2 rounded-lg text-amber-500">
              <span className="font-bold tracking-widest text-xs">#</span>
            </div>
            <div>
              <span className={`text-xs uppercase tracking-widest ${isLight ? 'text-blue-600' : 'text-blue-400'} font-semibold block`}>IoT Drainage Intelligence</span>
              <h1 className={`text-lg font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>SMART DRAIN AI</h1>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              data-testid="theme-toggle-btn"
              onClick={toggleTheme}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'}`}
              title="Toggle Theme"
            >
              {isLight ? <Moon size={14} /> : <Sun size={14} />}
              <span>{isLight ? 'Dark Mode' : 'Light Mode'}</span>
            </button>
            <div className={`hidden sm:flex items-center space-x-2 text-xs ${isLight ? 'text-slate-600 bg-white border-slate-300' : 'text-slate-400 border-slate-800 bg-slate-900/60'} px-3 py-1.5 rounded-md border`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>MUNICIPAL GRID v2.4</span>
            </div>
          </div>
        </div>

        {/* Main Split Screen */}
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center my-auto z-10 py-12">
          
          {/* Left Side Branding */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs tracking-wider uppercase">
              <span>Brihanmumbai Municipal Corporation</span>
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-none">
              BMC Infrastructure <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Portal</span>
            </h2>

            <p className="text-slate-300 text-base sm:text-lg max-w-xl font-sans leading-relaxed">
              Real-time monitoring and intelligent health assessment of urban drainage infrastructure across Greater Mumbai.
            </p>

            {/* System Status Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-2xl max-w-lg space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">SYS STATUS: OPERATIONAL</span>
                </div>
                <span className="text-[10px] text-slate-500">PROTOTYPE MODE</span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Telemetry connection verified. Active sensors: <strong className="text-white">847</strong> across Greater Mumbai region.
              </p>
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <span className="text-2xl font-bold text-white block">847</span>
                  <span className="text-[10px] text-slate-400 uppercase">Total Drains</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-amber-400 block">23</span>
                  <span className="text-[10px] text-slate-400 uppercase">Active Alerts</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-emerald-400 block">98.2%</span>
                  <span className="text-[10px] text-slate-400 uppercase">System Uptime</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side Login Card */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400" />
              
              <div className="mb-6 space-y-1">
                <h3 className="text-lg font-bold text-white tracking-wide">BMC Infrastructure Portal</h3>
                <p className="text-xs text-slate-400 font-sans">Authorized access only. Log in with civic credentials to view live telemetry.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 block">
                    Employee ID / BMC-UID
                  </label>
                  <input
                    data-testid="employee-id-input"
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 block">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      data-testid="password-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono pr-10"
                    />
                    <button
                      data-testid="toggle-password-btn"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  data-testid="authenticate-btn"
                  type="submit"
                  disabled={authenticating}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3.5 px-4 rounded-lg transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider text-xs"
                >
                  {authenticating ? (
                    <>
                      <RefreshCw className="animate-spin" size={16} />
                      <span>Authenticating Sensors...</span>
                    </>
                  ) : (
                    <span>Authenticate & Initialize</span>
                  )}
                </button>

                <div className="text-center pt-2">
                  <span className="text-[10px] text-red-400/80 tracking-widest uppercase">Secure Session Timeout in 4 hours</span>
                </div>
              </form>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 z-10 pt-6 border-t border-slate-900">
          <span>Brihanmumbai Municipal Corporation (BMC) © 2026</span>
          <span>IoT Disaster Management & Flood Control Wing</span>
        </div>
      </div>
    );
  }

  // Active Application Shell
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-mono selection:bg-blue-500 selection:text-white">
      <Toaster position="bottom-right" theme={theme} />

      {/* Top Navigation */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setSelectedDrain(null) || setActiveTab("dashboard")}>
              <div className="bg-blue-600/20 border border-blue-500/40 p-2 rounded-lg text-blue-400">
                <span className="font-bold tracking-widest text-xs">#</span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold block">BMC Platform</span>
                <span className="text-sm font-bold tracking-tight text-white">Smart Drain AI</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center space-x-1 pl-6 border-l border-slate-800">
              <button
                data-testid="nav-dashboard"
                onClick={() => { setSelectedDrain(null); setActiveTab("dashboard"); }}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'dashboard' && !selectedDrain ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
              >
                Dashboard
              </button>
              <button
                data-testid="nav-drains"
                onClick={() => { setSelectedDrain(null); setActiveTab("drains"); }}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'drains' && !selectedDrain ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
              >
                Drains
              </button>
              <button
                data-testid="nav-analytics"
                onClick={() => { setSelectedDrain(null); setActiveTab("analytics"); }}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'analytics' && !selectedDrain ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
              >
                Analytics
              </button>
              <button
                data-testid="nav-alerts"
                onClick={() => { setSelectedDrain(null); setActiveTab("alerts"); }}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'alerts' && !selectedDrain ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
              >
                Alerts
              </button>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden lg:flex items-center space-x-2 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 rounded-full text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{isFirebaseConfigured ? 'FIREBASE LIVE' : 'SYSTEM ONLINE'}</span>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-white block">BMC Infrastructure Portal</span>
              <span className="text-[10px] text-slate-400">Inspector {employeeId}</span>
            </div>

            <button
              data-testid="theme-toggle-shell-btn"
              onClick={toggleTheme}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg transition-colors border border-slate-700"
              title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <button
              data-testid="logout-btn"
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg transition-colors border border-slate-700"
              title="Terminate Session"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex justify-around bg-slate-950 border-t border-slate-800 py-2">
          <button data-testid="mobile-nav-dashboard" onClick={() => handleNavigate("dashboard")} className={`text-xs ${activeTab === 'dashboard' && !selectedDrain ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>Dashboard</button>
          <button data-testid="mobile-nav-drains" onClick={() => handleNavigate("drains")} className={`text-xs ${activeTab === 'drains' && !selectedDrain ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>Drains</button>
          <button data-testid="mobile-nav-analytics" onClick={() => handleNavigate("analytics")} className={`text-xs ${activeTab === 'analytics' && !selectedDrain ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>Analytics</button>
          <button data-testid="mobile-nav-alerts" onClick={() => handleNavigate("alerts")} className={`text-xs ${activeTab === 'alerts' && !selectedDrain ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>Alerts</button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* If a drain is selected, render Drain Detail Page */}
        {selectedDrain ? (
          <DrainDetailPage 
            drain={selectedDrain} 
            onBack={() => setSelectedDrain(null)}
            environment={environment}
            envImpact={envImpact}
          />
        ) : (
          <>
            {/* Dashboard View */}
            {activeTab === "dashboard" && (
              <DashboardView 
                drains={DRAINS}
                alerts={combinedAlerts}
                liveStats={liveStats}
                environment={environment}
                envImpact={envImpact}
                onSelectDrain={(d) => setSelectedDrain(d)} 
                onNavigate={(tab) => setActiveTab(tab)}
                isLight={isLight}
              />
            )}

            {/* Drains Table View */}
            {activeTab === "drains" && (
              <DrainsListView 
                drains={DRAINS}
                onSelectDrain={(d) => setSelectedDrain(d)} 
                searchQuery={drainSearch} 
                setSearchQuery={setDrainSearch}
                filter={drainFilter}
                setFilter={setDrainFilter}
                isLight={isLight}
              />
            )}

            {/* Analytics View */}
            {activeTab === "analytics" && (
              <AnalyticsView drains={DRAINS} liveStats={liveStats} environment={environment} isLight={isLight} />
            )}

            {/* Alerts View */}
            {activeTab === "alerts" && (
              <AlertsView 
                alerts={combinedAlerts}
                onSelectDrain={(drainId) => {
                  const found = DRAINS.find(d => d.id === drainId);
                  if (found) setSelectedDrain(found);
                }}
                filter={alertFilter}
                setFilter={setAlertFilter}
                isLight={isLight}
              />
            )}
          </>
        )}

      </main>

      {/* Bottom Status Bar */}
      <footer className={`${isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-950 border-slate-900 text-slate-400'} border-t py-3 text-xs mt-auto`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center space-x-6">
            <span className="flex items-center gap-1.5">
              <span className="text-slate-500">LAST SYNC</span>
              <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>{isFirebaseConfigured ? 'live' : SYSTEM_STATS.lastSync}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>{LIVE_PROTOTYPE_DRAIN_IDS.length} IoT NODES</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isFirebaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>{isFirebaseConfigured ? 'GATEWAY CONNECTED' : 'GATEWAY PROTOTYPE'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isFirebaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>{isFirebaseConfigured ? 'FIREBASE ONLINE' : 'AWAITING FIREBASE'}</strong>
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            PROTOTYPE REAL-TIME TELEMETRY STREAM • ESP32 MUNICIPAL MESH
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── ENVIRONMENTAL FLOOD IMPACT ─────────────────────────────────────
// Prototype indicator combining REAL Open-Meteo weather + tide data
// with the REAL Firebase drain telemetry for K-01/K-02/K-03. This is
// NOT an official BMC forecast — the UI labels it as such.

function EnvironmentalFloodImpact({ environment, envImpact, drains, isLight }) {
  const { weather, tide, weatherStale, tideStale, lastWeatherAt, lastTideAt } = environment;

  const surface = isLight ? 'bg-white border-slate-200 shadow-md' : 'bg-slate-900/80 border-slate-800';
  const innerSurface = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800';

  const liveDrains = drains.filter(d => d.isLive);

  return (
    <div className={`${surface} border rounded-xl p-6 backdrop-blur-md space-y-5`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'} flex items-center gap-2`}>
            <CloudRain size={18} className="text-cyan-400" />
            <span>Environmental Flood Impact</span>
            <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${isLight ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-slate-950 text-slate-400 border border-slate-800'}`}>
              AI Flood Impact — Prototype
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 font-sans">
            Prototype risk model combining Open-Meteo weather &amp; tide with live ESP32 telemetry. Not an official forecast.
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${riskBadgeClasses(envImpact.level)}`} data-testid="env-impact-level">
          Impact: {envImpact.level}
        </div>
      </div>

      {/* Weather + Tide + Impact grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EnvSourceCard
          title="Weather"
          data={weather}
          stale={weatherStale}
          lastAt={lastWeatherAt}
          unavailableMsg="WEATHER DATA UNAVAILABLE"
          isLight={isLight}
          surface={innerSurface}
          testId="env-weather-card"
          renderBody={(w) => (
            <div className="space-y-2 text-xs">
              <Row label="Condition" value={w.current.condition || '—'} />
              <Row label="Temperature" value={w.current.temperatureC !== null ? `${w.current.temperatureC.toFixed(1)} °C` : '—'} />
              <Row label="Rainfall" value={fmtMm(w.current.rainfallMm)} strong />
              <Row label="Forecast peak (6 h)" value={fmtMm(w.forecast.peakNext6hMm)} />
              {w.forecast.avgProbabilityNext6h !== null && (
                <Row label="Probability" value={`${w.forecast.avgProbabilityNext6h}%`} />
              )}
            </div>
          )}
        />

        <EnvSourceCard
          title="Tide / Sea Level"
          data={tide}
          stale={tideStale}
          lastAt={lastTideAt}
          unavailableMsg="TIDE DATA UNAVAILABLE"
          isLight={isLight}
          surface={innerSurface}
          testId="env-tide-card"
          renderBody={(t) => (
            <div className="space-y-2 text-xs">
              <Row label="Sea level (MSL)" value={fmtSeaLevel(t.current.seaLevelM)} strong />
              <Row label="Trend" value={(t.current.trend || 'unknown').toUpperCase()} />
              {t.next.high && (
                <Row label="Next high tide" value={`${fmtSeaLevel(t.next.high.seaLevelM)} · ${t.next.high.in}`} />
              )}
              {t.next.low && (
                <Row label="Next low tide" value={`${fmtSeaLevel(t.next.low.seaLevelM)} · ${t.next.low.in}`} />
              )}
            </div>
          )}
        />

        <div className={`${innerSurface} border rounded-lg p-4 space-y-2`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Prototype Risk Model</span>
            <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${isLight ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-blue-950/50 text-blue-300 border border-blue-500/30'}`}>Kurla</span>
          </div>
          <div className={`text-3xl font-black ${riskColorForLevel(envImpact.level)}`}>
            {envImpact.level.toUpperCase()}
          </div>
          <div className={`text-[11px] font-sans ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Derived from{' '}
            <strong>{weather ? 'live rainfall' : 'no rainfall data'}</strong> and{' '}
            <strong>{tide ? 'live tide' : 'no tide data'}</strong>. Score:{' '}
            <strong>{envImpact.score !== null ? envImpact.score : '—'}</strong>.
          </div>
          <div className={`text-[10px] italic ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
            Not scientifically validated · Prototype indicator only.
          </div>
          <div className={`flex flex-col text-[9px] pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'} space-y-0.5`}>
            <span className="text-slate-500">Sources: <strong className={isLight ? 'text-slate-700' : 'text-slate-300'}>{[weather && 'Open-Meteo', tide && (tide.source)].filter(Boolean).join(' · ') || '—'}</strong></span>
            <span className="text-slate-500">Updated: <strong className={isLight ? 'text-slate-700' : 'text-slate-300'}>{Math.max(lastWeatherAt || 0, lastTideAt || 0) ? relativeAgo(Math.max(lastWeatherAt || 0, lastTideAt || 0)) : '—'}</strong></span>
          </div>
        </div>
      </div>

      {/* Live drains × environmental cross-signal (K-01/02/03 only) */}
      {liveDrains.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-blue-700' : 'text-blue-300'} flex items-center gap-2`}>
              <RadioTower size={12} /> Live Nodes × Environment
            </h4>
            <span className="text-[10px] text-slate-500">Water level &amp; flow rate from Firebase · Rainfall &amp; tide from APIs</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {liveDrains.map(d => (
              <LiveNodeEnvCard
                key={d.id}
                drain={d}
                envImpact={envImpact}
                weather={weather}
                tide={tide}
                isLight={isLight}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveNodeEnvCard({ drain, envImpact, weather, tide, isLight }) {
  const risk = computeDrainRisk({ drain, envImpact });
  const surface = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800';
  const latestFetch = Math.max(weather?.fetchedAt || 0, tide?.fetchedAt || 0);
  return (
    <div className={`${surface} border rounded-lg p-3 space-y-2`} data-testid={`env-node-${drain.id}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{drain.id} — {drain.location.split(',')[0]}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${riskBadgeClasses(risk.level)}`}>
          Risk: {risk.level}
        </span>
      </div>
      {drain.awaitingDeployment ? (
        <div className="text-[10px] text-blue-400 pending-pulse">AWAITING SENSOR DEPLOYMENT</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <Row compact label="Water Level" value={fmtCm(drain.waterLevel)} />
          <Row compact label="Flow Rate" value={fmtLpm(drain.flowRate)} />
          <Row compact label="Rainfall" value={weather ? fmtMm(weather.current.rainfallMm) : '—'} />
          <Row compact label="Tide" value={tide ? (tide.current.trend || 'unknown').toUpperCase() : '—'} />
        </div>
      )}
      <div className={`flex justify-between items-center text-[9px] pt-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <span className="text-slate-500">Env Impact:</span>
        <span className={`font-bold ${riskColorForLevel(envImpact.level)}`}>{envImpact.level.toUpperCase()}</span>
      </div>
      <div className="flex justify-between items-center text-[9px] text-slate-500">
        <span>Sources: <strong className={isLight ? 'text-slate-700' : 'text-slate-400'}>Firebase · Open-Meteo{tide ? ` · ${tide.source}` : ''}</strong></span>
        <span>Updated: <strong className={isLight ? 'text-slate-700' : 'text-slate-400'}>{latestFetch ? relativeAgo(latestFetch) : '—'}</strong></span>
      </div>
    </div>
  );
}

function EnvSourceCard({ title, data, stale, lastAt, unavailableMsg, isLight, surface, testId, renderBody }) {
  const badge = data ? (stale ? { text: 'STALE', cls: 'bg-amber-950 text-amber-400 border border-amber-500/30' } : { text: 'LIVE', cls: 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' }) : { text: 'UNAVAILABLE', cls: 'bg-red-950 text-red-400 border border-red-500/30' };

  return (
    <div className={`${surface} border rounded-lg p-4 space-y-3`} data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{title}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${badge.cls}`}>{badge.text}</span>
      </div>
      {data ? renderBody(data) : (
        <div className="text-xs text-red-400 font-bold py-3">
          {unavailableMsg}
        </div>
      )}
      <div className={`flex flex-col text-[9px] pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'} space-y-0.5`}>
        <span className="text-slate-500">Source: <strong className={isLight ? 'text-slate-700' : 'text-slate-300'}>{data ? data.source : '—'}</strong></span>
        <span className="text-slate-500">Updated: <strong className={isLight ? 'text-slate-700' : 'text-slate-300'}>{lastAt ? relativeAgo(lastAt) : '—'}</strong></span>
      </div>
    </div>
  );
}

function Row({ label, value, strong = false, compact = false }) {
  return (
    <div className={`flex justify-between items-center ${compact ? '' : ''}`}>
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'text-cyan-400 font-bold' : 'text-slate-200 font-semibold'}>{value}</span>
    </div>
  );
}

function riskColorForLevel(level) {
  switch (level) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-amber-400';
    case 'moderate': return 'text-yellow-400';
    case 'low': return 'text-emerald-400';
    default: return 'text-slate-400';
  }
}

function relativeAgo(ts) {
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} h ago`;
}


// 1. DASHBOARD VIEW COMPONENT
function DashboardView({ drains, alerts, liveStats, environment, envImpact, onSelectDrain, onNavigate, isLight }) {
  const liveNodes = drains.filter(d => d.isLive);
  const liveOnline = liveNodes.filter(d => !d.awaitingDeployment).length;
  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Prototype Mode Banner */}
      <div className={`${isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-950/30 border-blue-500/30'} border rounded-xl px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${liveOnline > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 pending-pulse'}`}></span>
          <div>
            <div className={`text-xs font-bold tracking-wider uppercase ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
              Prototype Mode • {liveNodes.length} Live Sensor Nodes (Kurla, Mumbai)
            </div>
            <div className={`text-[11px] font-sans ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Nodes: {LIVE_PROTOTYPE_DRAIN_IDS.join(', ')} • {liveOnline}/{liveNodes.length} reporting live telemetry • Remaining drains shown as DEMO DATA.
            </div>
          </div>
        </div>
        <div className={`text-[10px] uppercase tracking-widest font-semibold ${isLight ? 'text-blue-700' : 'text-blue-400'} flex items-center gap-1`}>
          <Wifi size={12} />
          <span>{isFirebaseConfigured ? 'Firebase RTDB' : 'Awaiting Firebase'}</span>
        </div>
      </div>

      {/* Header */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'} pb-6`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold">DEMO + PROTOTYPE</span>
            <span className="text-xs text-slate-500">{new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} • IST</span>
          </div>
          <h2 className={`text-2xl sm:text-3xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'} tracking-tight`}>Municipal Drainage Overview</h2>
          <p className="text-slate-500 text-xs sm:text-sm">Real-time infrastructure health and drainage monitoring across Greater Mumbai.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            data-testid="view-all-drains-btn"
            onClick={() => onNavigate("drains")}
            className={`${isLight ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'} text-xs font-semibold px-4 py-2.5 rounded-lg border transition-colors flex items-center gap-2 shadow-sm`}
          >
            <span>Browse All Drains</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Top Health Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        <div data-testid="stat-total-drains" className={`${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-slate-900/80 border-slate-800'} border rounded-xl p-5 backdrop-blur-md flex flex-col justify-between`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Drains</span>
          <div className="flex items-baseline justify-between mt-3">
            <span className={`text-3xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{SYSTEM_STATS.monitoredDrains}</span>
            <span className="text-xs text-blue-600 font-semibold">Active Mesh</span>
          </div>
        </div>

        <div data-testid="stat-healthy-drains" className={`${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-slate-900/80 border-slate-800'} border rounded-xl p-5 backdrop-blur-md flex flex-col justify-between`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Healthy</span>
          <div className="flex items-baseline justify-between mt-3">
            <span className="text-3xl font-black text-emerald-600">{SYSTEM_STATS.healthyCount}</span>
            <span className="text-xs text-emerald-600">Normal Flow</span>
          </div>
        </div>

        <div data-testid="stat-warning-drains" className={`${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-slate-900/80 border-slate-800'} border rounded-xl p-5 backdrop-blur-md flex flex-col justify-between`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Warning</span>
          <div className="flex items-baseline justify-between mt-3">
            <span className="text-3xl font-black text-amber-600">{SYSTEM_STATS.warningCount}</span>
            <span className="text-xs text-amber-600">Elevated Level</span>
          </div>
        </div>

        <div data-testid="stat-critical-drains" className={`${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-slate-900/80 border-slate-800'} border rounded-xl p-5 backdrop-blur-md flex flex-col justify-between`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-red-600">Critical</span>
          <div className="flex items-baseline justify-between mt-3">
            <span className="text-3xl font-black text-red-600">{SYSTEM_STATS.criticalCount}</span>
            <span className="text-xs text-red-600">Blockage Risk</span>
          </div>
        </div>

        {/* Donut Card for Average Health */}
        <div data-testid="stat-avg-health" className={`${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-slate-900/80 border-slate-800'} border rounded-xl p-5 backdrop-blur-md flex items-center justify-between sm:col-span-2 lg:col-span-1`}>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Avg Drain Health</span>
            <span className="text-3xl font-black text-blue-600">82%</span>
            <span className="text-[10px] text-slate-500 block mt-1">Municipal Index</span>
          </div>
          <div className="w-16 h-16 relative flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className={isLight ? 'text-slate-200' : 'text-slate-800'} strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className="text-blue-600" strokeDasharray="82, 100" strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span className={`absolute text-[11px] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>82%</span>
          </div>
        </div>

      </div>



      {/* GIS MAP SECTION (Leaflet) */}
      <div className={`${isLight ? 'bg-white border-slate-300 shadow-xl' : 'bg-slate-900/80 border-slate-800 shadow-xl'} border rounded-xl p-6 backdrop-blur-md space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'} flex items-center gap-2`}>
              <MapPin size={18} className="text-blue-600" />
              <span>Real-Time Mumbai GIS Infrastructure Map</span>
            </h3>
            <p className="text-xs text-slate-500">OpenStreetMap integration covering Borivali, Malad, Andheri, Bandra, Dadar, Chembur & Colaba.</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Healthy</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Warning</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Critical</span>
          </div>
        </div>

        <div className={`w-full h-[450px] rounded-lg overflow-hidden border ${isLight ? 'border-slate-300' : 'border-slate-800'} relative z-0`}>
          <MapContainer 
            center={[19.0760, 72.8777]} 
            zoom={11} 
            style={{ width: "100%", height: "100%", background: isLight ? "#f1f5f9" : "#0b1329" }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={isLight ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
            />
            {drains.map((drain) => (
              <Marker 
                key={drain.id}
                position={[drain.latitude, drain.longitude]}
                icon={createCustomIcon(drain.status, drain.isLive)}
              >
                <Popup>
                  <div className="p-2 font-mono text-slate-900 min-w-[200px]">
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-sm font-bold">{drain.id}</strong>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${drain.status === 'critical' ? 'bg-red-100 text-red-800' : drain.status === 'warning' ? 'bg-amber-100 text-amber-800' : drain.status === 'pending' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {statusLabel(drain)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mb-2 font-semibold">{drain.location}, Mumbai</div>
                    {drain.awaitingDeployment ? (
                      <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 mb-1">
                        <strong>AWAITING SENSOR DEPLOYMENT</strong>
                        <div className="text-[10px] text-slate-600 mt-0.5">ESP32 node not yet reporting to Firebase.</div>
                      </div>
                    ) : (
                      <div className="text-xs space-y-1 border-t border-slate-200 pt-1.5">
                        <div>Health Score: <strong className={drain.healthScore !== null && drain.healthScore < 50 ? 'text-red-600' : 'text-slate-800'}>{fmtHealth(drain.healthScore)}</strong></div>
                        <div>Water Level: <strong>{fmtValue(drain.waterLevel, ' cm')}</strong></div>
                        <div>Flow Rate: <strong>{fmtValue(drain.flowRate, ' L/min')}</strong></div>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-1.5">Source: <strong>{drain.dataSource}</strong></div>
                    <button
                      onClick={() => onSelectDrain(drain)}
                      className="mt-3 w-full bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-3 rounded text-center transition-colors uppercase tracking-wider block"
                    >
                      Open Drain Detail
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Two Column Section: Critical Drains & Module Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Top Critical Drains (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert size={18} className="text-red-400" />
              <span>Top Critical & Warning Drains</span>
            </h3>
            <button 
              onClick={() => onNavigate("drains")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all ({drains.length}) →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">Drain ID</th>
                  <th className="pb-3 font-semibold">Location</th>
                  <th className="pb-3 font-semibold">Health</th>
                  <th className="pb-3 font-semibold">Water Level</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {drains.filter(d => d.status === 'critical' || d.status === 'warning').slice(0, 5).map((drain) => (
                  <tr key={drain.id} className="hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => onSelectDrain(drain)}>
                    <td className="py-3 font-bold text-white flex items-center gap-2">
                      <span>{drain.id}</span>
                      <span className="text-[9px] text-slate-500">[{drain.dataSource}]</span>
                    </td>
                    <td className="py-3 text-slate-300">{drain.location}</td>
                    <td className="py-3">
                      <span className={`font-bold ${drain.healthScore < 50 ? 'text-red-400' : 'text-amber-400'}`}>
                        {fmtHealth(drain.healthScore)}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300">{fmtValue(drain.waterLevel, ' cm')}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${statusBadgeClasses(drain.status)}`}>
                        {statusLabel(drain)}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button className="text-blue-400 hover:text-blue-300 font-semibold">Inspect →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Live Prototype Nodes sub-panel (K-01/02/03) */}
          <div className={`mt-4 pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-blue-700' : 'text-blue-400'} flex items-center gap-2`}>
                <RadioTower size={14} /> Live Prototype Nodes (Kurla)
              </h4>
              <span className="text-[10px] text-slate-500">{LIVE_PROTOTYPE_DRAIN_IDS.length} physical ESP32 nodes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {drains.filter(d => d.isLive).map((drain) => (
                <button
                  key={drain.id}
                  data-testid={`live-node-card-${drain.id}`}
                  onClick={() => onSelectDrain(drain)}
                  className={`text-left ${isLight ? 'bg-white border-slate-200 hover:border-blue-400' : 'bg-slate-950 border-slate-800 hover:border-blue-500/50'} border rounded-lg p-3 transition-colors`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{drain.id}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${statusBadgeClasses(drain.status)}`}>
                      {drain.awaitingDeployment ? 'AWAITING' : statusLabel(drain)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mb-1">{drain.location}</div>
                  {drain.awaitingDeployment ? (
                    <div className={`text-[10px] font-mono ${isLight ? 'text-blue-700' : 'text-blue-300'} pending-pulse`}>SENSOR DEPLOYMENT PENDING</div>
                  ) : (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Health: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{fmtHealth(drain.healthScore)}</strong></span>
                      <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>{fmtValue(drain.waterLevel, ' cm')}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Module Health & Weather (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Module Health Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu size={18} className="text-blue-400" />
              <span>Module Health & Sensors</span>
            </h3>

            <div className="space-y-3 pt-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 flex items-center gap-2"><Activity size={14} className="text-emerald-400" /> Water Level Sensor</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> ONLINE</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 flex items-center gap-2"><Activity size={14} className="text-emerald-400" /> Flow Sensor</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> ONLINE</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 flex items-center gap-2"><Cpu size={14} className="text-emerald-400" /> ESP32 Node</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> ONLINE</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 flex items-center gap-2"><Camera size={14} className="text-emerald-400" /> ESP32-CAM</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> ONLINE</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 flex items-center gap-2"><Radio size={14} className="text-emerald-400" /> Gateway Connection</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> CONNECTED</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-center text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">Sensors Online</span>
                <span className="text-white font-bold">{SYSTEM_STATS.sensorsOnline}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">ESP32 Nodes</span>
                <span className="text-white font-bold">{SYSTEM_STATS.esp32NodesOnline}</span>
              </div>
            </div>
          </div>

          {/* Weather & Rainfall Card — REAL Open-Meteo data */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4" data-testid="dashboard-weather-card">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CloudRain size={18} className="text-cyan-400" />
                <span>Monsoon &amp; Rainfall Status</span>
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${riskBadgeClasses(envImpact.level)}`}>
                Flood Impact: {envImpact.level}
              </span>
            </div>

            {environment.weather ? (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-400 uppercase text-[10px]">Condition</span>
                  <span className="text-white font-bold block">{environment.weather.current.condition}</span>
                  <span className="text-cyan-400 text-[10px]">
                    Temp: {environment.weather.current.temperatureC !== null ? `${environment.weather.current.temperatureC.toFixed(1)} °C` : '—'}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-slate-400 uppercase text-[10px]">Rainfall Rate</span>
                  <span className="text-white font-bold block">{fmtMm(environment.weather.current.rainfallMm)}</span>
                  <span className="text-slate-400 text-[10px]">Source: Open-Meteo · Kurla</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-red-400 font-bold py-4">WEATHER DATA UNAVAILABLE</div>
            )}
          </div>

        </div>

      </div>

      {/* Recent Alerts Panel */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Bell size={18} className="text-amber-400" />
            <span>Recent Real-Time Alerts Stream</span>
          </h3>
          <button 
            onClick={() => onNavigate("alerts")}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Manage All Alerts →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {alerts.slice(0, 3).map((alert) => (
            <div 
              key={alert.id}
              onClick={() => {
                if (!alert.drainId) return;
                const found = drains.find(d => d.id === alert.drainId);
                if (found) onSelectDrain(found);
              }}
              className={`bg-slate-950 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition-all space-y-3 ${alert.drainId ? 'cursor-pointer' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                  alert.severity === 'critical' ? 'bg-red-950 text-red-400 border border-red-500/30' :
                  alert.severity === 'warning' ? 'bg-amber-950 text-amber-400 border border-amber-500/30' :
                  'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {alert.severity}
                </span>
                <div className="flex items-center gap-2">
                  {alert.kind === 'environmental' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                      ENV
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">{alert.time}</span>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">{alert.title}</h4>
                <p className="text-xs text-slate-400 font-sans">{alert.drainId ? `${alert.drainId} — ${alert.location}` : alert.location}</p>
              </div>
              <div className="text-[11px] text-slate-300 font-sans border-t border-slate-900 pt-2">
                {alert.description}
              </div>
              {alert.sources && alert.sources.length > 0 && (
                <div className="text-[9px] text-slate-500">
                  Sources: {alert.sources.join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ENVIRONMENTAL FLOOD IMPACT SECTION (Open-Meteo weather + tide) */}
      <EnvironmentalFloodImpact
        environment={environment}
        envImpact={envImpact}
        drains={drains}
        isLight={isLight}
      />
    </div>
  );
}

// 2. DRAINS LIST VIEW COMPONENT
function DrainsListView({ drains, onSelectDrain, searchQuery, setSearchQuery, filter, setFilter }) {
  const filteredDrains = drains.filter(d => {
    const matchesSearch = d.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          d.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || d.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Municipal Drain Directory</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Comprehensive inventory of all IoT-monitored drainage conduits across Mumbai.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Showing <strong className="text-white">{filteredDrains.length}</strong> drains</span>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 backdrop-blur-md flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            data-testid="drain-search-input"
            type="text"
            placeholder="Search drain ID or location (e.g. Malad, D-031)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['all', 'healthy', 'warning', 'critical', 'pending'].map((f) => (
            <button
              key={f}
              data-testid={`filter-btn-${f}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                filter === f 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Drains Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <th className="p-4 font-semibold">Drain ID</th>
                <th className="p-4 font-semibold">Location</th>
                <th className="p-4 font-semibold">Health Score</th>
                <th className="p-4 font-semibold">Water Level</th>
                <th className="p-4 font-semibold">Flow Rate</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Last Update</th>
                <th className="p-4 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredDrains.map((drain) => (
                <tr 
                  key={drain.id}
                  data-testid={`drain-row-${drain.id}`}
                  onClick={() => onSelectDrain(drain)}
                  className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <td className="p-4 font-bold text-white">
                    <div className="flex items-center gap-2">
                      <span>{drain.id}</span>
                      <span className={`text-[9px] ${drain.isLive ? 'text-blue-400' : 'text-slate-500'}`}>[{drain.dataSource}]</span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-300">{drain.location}</td>
                  <td className="p-4">
                    <span className={`font-bold ${
                      drain.healthScore === null ? 'text-blue-400' :
                      drain.healthScore < 50 ? 'text-red-400' : drain.healthScore < 70 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {fmtHealth(drain.healthScore)}
                    </span>
                  </td>
                  <td className="p-4 text-slate-300">{fmtValue(drain.waterLevel, ' cm')}</td>
                  <td className="p-4 text-slate-300">{fmtValue(drain.flowRate, ' L/min')}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${statusBadgeClasses(drain.status)}`}>
                      {statusLabel(drain)}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400">{drain.lastUpdated}</td>
                  <td className="p-4 text-right">
                    <span className="text-blue-400 hover:text-blue-300 font-semibold inline-flex items-center gap-1">
                      <span>Inspect</span>
                      <ChevronRight size={14} />
                    </span>
                  </td>
                </tr>
              ))}
              {filteredDrains.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500">
                    No drainage nodes matched your search parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 3. DRAIN DETAIL VIEW COMPONENT
function DrainDetailPage({ drain, onBack, environment, envImpact }) {
  const pending = drain.awaitingDeployment;
  const isLiveNode = drain.isLive === true;
  const risk = isLiveNode ? computeDrainRisk({ drain, envImpact }) : null;
  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Top Header with Back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <button
            data-testid="back-to-dashboard-btn"
            onClick={onBack}
            className="text-xs text-blue-400 hover:text-blue-300 mb-2 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            ← Back to Overview / List
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-3xl font-extrabold text-white tracking-tight">{drain.id}</h2>
            <span className="text-slate-400 text-lg">({drain.location}, Mumbai)</span>
            <span className={`px-2.5 py-0.5 rounded text-xs uppercase font-bold tracking-wider ${statusBadgeClasses(drain.status)}`}>
              ● {statusLabel(drain)}
            </span>
            {drain.isLive && (
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-blue-950 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                <RadioTower size={10} /> LIVE PROTOTYPE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Latitude: {drain.latitude} • Longitude: {drain.longitude} • Source: <strong className="text-slate-200">{drain.dataSource}</strong></p>
        </div>

        <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 px-5 py-3 rounded-xl backdrop-blur-md">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Health Score</span>
            <span className={`text-3xl font-black ${
              drain.healthScore === null ? 'text-blue-400' :
              drain.healthScore < 50 ? 'text-red-400' : drain.healthScore < 70 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {fmtHealth(drain.healthScore)}
            </span>
          </div>
        </div>
      </div>

      {pending && (
        <div className="bg-blue-950/30 border border-blue-500/40 rounded-xl px-5 py-4 flex items-start gap-3">
          <RadioTower className="text-blue-400 mt-0.5 pending-pulse" size={20} />
          <div>
            <h4 className="text-sm font-bold text-blue-300 tracking-wide">AWAITING SENSOR DEPLOYMENT</h4>
            <p className="text-xs text-slate-300 font-sans mt-1">
              {drain.id} is a designated live prototype node. Once the ESP32 hardware
              is deployed at {drain.location} and connects to Firebase Realtime
              Database, this page will automatically populate with live water level,
              flow rate, module health and ESP32-CAM visual verification data.
            </p>
          </div>
        </div>
      )}

      {/* Environmental conditions section — only shown for LIVE K-* nodes.
          Data sources are labeled; APIs augment (never overwrite) Firebase
          sensor readings. */}
      {isLiveNode && environment && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4" data-testid={`drain-env-section-${drain.id}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CloudRain size={18} className="text-cyan-400" />
              <span>Environmental Conditions</span>
              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                AI Flood Impact — Prototype
              </span>
            </h3>
            {risk && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">Drain Risk:</span>
                <span className={`px-2 py-0.5 rounded uppercase font-bold tracking-wider ${riskBadgeClasses(risk.level)}`}>
                  {risk.level}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Rainfall</span>
              <span className="text-lg font-bold text-white block">
                {environment.weather ? fmtMm(environment.weather.current.rainfallMm) : '—'}
              </span>
              <span className="text-[9px] text-slate-500">Open-Meteo · Live</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Forecast (6h peak)</span>
              <span className="text-lg font-bold text-white block">
                {environment.weather ? fmtMm(environment.weather.forecast.peakNext6hMm) : '—'}
              </span>
              <span className="text-[9px] text-slate-500">Open-Meteo</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Tide Trend</span>
              <span className="text-lg font-bold text-white block">
                {environment.tide ? (environment.tide.current.trend || 'unknown').toUpperCase() : '—'}
              </span>
              <span className="text-[9px] text-slate-500">{environment.tide ? environment.tide.source : 'Marine'}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Sea Level</span>
              <span className="text-lg font-bold text-white block">
                {environment.tide ? fmtSeaLevel(environment.tide.current.seaLevelM) : '—'}
              </span>
              <span className="text-[9px] text-slate-500">MSL</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">Environmental Impact</span>
              <span className={`px-2 py-0.5 rounded uppercase font-bold tracking-wider text-[10px] ${riskBadgeClasses(envImpact.level)}`}>
                {envImpact.level}
              </span>
            </div>
            {environment.tide && environment.tide.next.high && (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Next High Tide</span>
                <span className="text-xs text-cyan-400 font-bold">
                  {environment.tide.next.high.in} · {fmtSeaLevel(environment.tide.next.high.seaLevelM)}
                </span>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-800">
            <span>Sources:</span>
            <span>Water level &amp; flow rate — <strong className="text-slate-300">Firebase (ESP32)</strong></span>
            <span>Weather — <strong className="text-slate-300">{environment.weather ? 'Open-Meteo' : 'unavailable'}</strong></span>
            <span>Tide — <strong className="text-slate-300">{environment.tide ? environment.tide.source : 'unavailable'}</strong></span>
            <span>Updated: <strong className="text-slate-300">{Math.max(environment.lastWeatherAt || 0, environment.lastTideAt || 0) ? relativeAgo(Math.max(environment.lastWeatherAt || 0, environment.lastTideAt || 0)) : '—'}</strong></span>
          </div>
        </div>
      )}


      {/* Grid: Sensor Data & ESP32-CAM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Sensor Telemetry & Health Breakdown (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Live Sensor Readings */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity size={18} className="text-blue-400" />
              <span>Real-Time Sensor Telemetry</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">Water Level</span>
                <span className="text-2xl font-bold text-white block">{fmtValue(drain.waterLevel, ' cm')}</span>
                <span className="text-[10px] text-cyan-400">Ultrasonic Node</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">Flow Rate</span>
                <span className="text-2xl font-bold text-white block">{fmtValue(drain.flowRate, ' L/min')}</span>
                <span className="text-[10px] text-emerald-400">Velocity Sensor</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">Node Status</span>
                <span className={`text-xl font-bold block ${drain.modules.esp32 === 'online' ? 'text-emerald-400' : drain.modules.esp32 === 'pending' ? 'text-blue-400' : 'text-red-400'}`}>
                  {(drain.modules.esp32 || 'unknown').toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400">Heartbeat {drain.modules.esp32 === 'online' ? 'OK' : '—'}</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">Last Update</span>
                <span className="text-xl font-bold text-slate-200 block">{drain.lastUpdated}</span>
                <span className="text-[10px] text-slate-400">Mesh Sync</span>
              </div>
            </div>
          </div>

          {/* Module Health Detailed */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu size={18} className="text-blue-400" />
              <span>Hardware Module Health</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Water Level Sensor</span>
                  <span className="text-sm font-bold text-white">Ultrasonic HC-SR04</span>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${moduleStatusClasses(drain.modules.waterLevelSensor)}`}>
                  ● {drain.modules.waterLevelSensor}
                </span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Flow Sensor</span>
                  <span className="text-sm font-bold text-white">Hall Effect YF-S201</span>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${moduleStatusClasses(drain.modules.flowSensor)}`}>
                  ● {drain.modules.flowSensor}
                </span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">ESP32 Node</span>
                  <span className="text-sm font-bold text-white">Microcontroller Core</span>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${moduleStatusClasses(drain.modules.esp32)}`}>
                  ● {drain.modules.esp32}
                </span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">ESP32-CAM</span>
                  <span className="text-sm font-bold text-white">Visual Verification Feed</span>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${moduleStatusClasses(drain.modules.esp32Cam)}`}>
                  ● {drain.modules.esp32Cam}
                </span>
              </div>
            </div>
          </div>

          {/* Health Score Contributing Breakdown */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-400" />
              <span>Health Score Contributing Factors</span>
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Water Level Headroom (40% weight)</span>
                  <span className="text-white font-bold">{drain.waterLevel === null ? '—' : `${Math.max(10, 100 - drain.waterLevel)}%`}</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: drain.waterLevel === null ? '0%' : `${Math.max(10, 100 - drain.waterLevel)}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Flow Condition & Velocity (30% weight)</span>
                  <span className="text-white font-bold">{drain.flowRate === null ? '—' : `${Math.min(100, Math.round(drain.flowRate * 22))}%`}</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-cyan-400 h-full rounded-full" style={{ width: drain.flowRate === null ? '0%' : `${Math.min(100, Math.round(drain.flowRate * 22))}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Sensor Module Health (15% weight)</span>
                  <span className="text-white font-bold">{pending ? '—' : drain.modules.flowSensor === 'degraded' ? '75%' : '100%'}</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: pending ? '0%' : drain.modules.flowSensor === 'degraded' ? '75%' : '100%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Gateway Communication Link (15% weight)</span>
                  <span className="text-white font-bold">{pending ? '—' : '100%'}</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: pending ? '0%' : '100%' }}></div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: ESP32-CAM & 30-Day Trend (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* ESP32-CAM Visual Verification */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera size={18} className="text-blue-400" />
                <span>ESP32-CAM Visual Verification</span>
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${drain.cameraStatus === 'READY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : drain.cameraStatus === 'PENDING' ? 'bg-blue-950 text-blue-400 border border-blue-500/30' : 'bg-amber-950 text-amber-400 border border-amber-500/30'}`}>
                ● {drain.cameraStatus}
              </span>
            </div>

            <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video group">
              {drain.cameraImage ? (
                <img 
                  src={drain.cameraImage} 
                  alt="ESP32-CAM Feed" 
                  className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Camera size={36} className="opacity-40 pending-pulse" />
                  <span className="text-[11px] uppercase tracking-widest text-blue-300">Camera feed pending</span>
                  <span className="text-[10px] text-slate-500">ESP32-CAM will begin capturing after deployment.</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end text-[11px]">
                <span className="bg-slate-900/90 px-2 py-1 rounded text-slate-300 border border-slate-800">
                  {drain.id} • {drain.cameraImage ? 'LIVE CONDUIT VIEW' : 'AWAITING FEED'}
                </span>
                <span className="bg-slate-900/90 px-2 py-1 rounded text-cyan-400 font-mono border border-slate-800">
                  Captured: {drain.capturedAt || '—'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Periodic still image capture transmitted via ESP32-CAM module to BMC municipal storage bucket.
            </p>
          </div>

          {/* 30-Day Health History Chart */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-400" />
              <span>30-Day Drain Health Trend</span>
            </h3>

            <div className="h-[250px] w-full pt-2">
              {drain.history30Days && drain.history30Days.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <LineChart data={drain.history30Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" stroke="#64748b" fontSize={10} />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "8px", fontSize: "12px", color: "#f8fafc" }}
                    />
                    <Line type="monotone" dataKey="health" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Health %" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <TrendingUp size={28} className="opacity-40 pending-pulse" />
                  <span className="text-[11px] uppercase tracking-widest text-blue-300">History accumulating</span>
                  <span className="text-[10px] text-slate-500">30-day trend appears once ESP32 begins reporting.</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Historical health degradation over 30 days based on ultrasonic water level and flow velocity metrics.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}

// 4. ANALYTICS VIEW COMPONENT
function AnalyticsView({ drains, liveStats, environment, isLight }) {
  const pieData = [
    { name: 'Healthy', value: liveStats?.healthy || SYSTEM_STATS.healthyCount, color: '#10b981' },
    { name: 'Warning', value: liveStats?.warning || SYSTEM_STATS.warningCount, color: '#f59e0b' },
    { name: 'Critical', value: liveStats?.critical || SYSTEM_STATS.criticalCount, color: '#ef4444' }
  ];

  // Real hourly rainfall from Open-Meteo (next 6h). Falls back to null when
  // the API is unavailable — the chart renders a friendly placeholder in that
  // case rather than showing invented values.
  const envRainfallData = environment?.weather?.forecast?.hourly?.precipitation
    ? environment.weather.forecast.hourly.precipitation.map((mm, i) => ({
        time: environment.weather.forecast.hourly.time[i]
          ? environment.weather.forecast.hourly.time[i].slice(11, 16)
          : `+${i}h`,
        mm: mm ?? 0,
      }))
    : null;

  const waterLevelTrendData = [
    { time: '00:00', avgWater: 28, avgFlow: 3.8 },
    { time: '04:00', avgWater: 32, avgFlow: 3.5 },
    { time: '08:00', avgWater: 45, avgFlow: 2.9 },
    { time: '12:00', avgWater: 58, avgFlow: 2.2 },
    { time: '16:00', avgWater: 52, avgFlow: 2.5 },
    { time: '20:00', avgWater: 40, avgFlow: 3.4 }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="border-b border-slate-800 pb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Municipal Drainage Analytics</h2>
        <p className="text-slate-400 text-xs sm:text-sm">Historical telemetry, health distributions, and regional flood risk trends.</p>
      </div>

      {/* Grid of Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Drain Health Distribution */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-400" />
            <span>Drain Health Distribution</span>
          </h3>
          <div className="h-[280px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "8px", fontSize: "12px", color: "#f8fafc" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Water Level Trend */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp size={18} className="text-cyan-400" />
            <span>Regional Water Level Trend (24h)</span>
          </h3>
          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <LineChart data={waterLevelTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "8px", fontSize: "12px", color: "#f8fafc" }} />
                <Line type="monotone" dataKey="avgWater" stroke="#06b6d4" strokeWidth={2} name="Avg Water Level (cm)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Flow Rate Trend */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Activity size={18} className="text-emerald-400" />
            <span>Flow Rate Velocity Trend (24h)</span>
          </h3>
          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <BarChart data={waterLevelTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "8px", fontSize: "12px", color: "#f8fafc" }} />
                <Bar dataKey="avgFlow" fill="#10b981" name="Avg Flow Rate (L/min)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Environmental Conditions Trend — REAL Open-Meteo hourly rainfall (next 6h) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-4" data-testid="env-rainfall-trend">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CloudRain size={18} className="text-amber-400" />
              <span>Environmental Conditions Trend</span>
              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                Live · Open-Meteo
              </span>
            </h3>
            <span className="text-[10px] text-slate-500">Next-6h hourly precipitation forecast</span>
          </div>
          <div className="h-[280px] w-full pt-4">
            {envRainfallData && envRainfallData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <LineChart data={envRainfallData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "8px", fontSize: "12px", color: "#f8fafc" }} />
                  <Line type="monotone" dataKey="mm" stroke="#f59e0b" strokeWidth={2} name="Rainfall (mm/hr)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                <CloudRain size={28} className="opacity-40" />
                <span className="text-[11px] uppercase tracking-widest text-red-400 font-bold">WEATHER DATA UNAVAILABLE</span>
                <span className="text-[10px] text-slate-500">Rainfall trend will appear once Open-Meteo responds.</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// 5. ALERTS VIEW COMPONENT
function AlertsView({ alerts, onSelectDrain, filter, setFilter }) {
  const filteredAlerts = alerts.filter(a => {
    if (filter === 'all') return true;
    return a.severity === filter;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Municipal Alert Management</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Real-time alerts generated by ESP32 sensor threshold exceedances.</p>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'critical', 'warning', 'resolved'].map((f) => (
            <button
              key={f}
              data-testid={`alert-filter-${f}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                filter === f 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredAlerts.map((alert) => (
          <div 
            key={alert.id}
            data-testid={`alert-card-${alert.id}`}
            onClick={() => { if (alert.drainId) onSelectDrain(alert.drainId); }}
            className={`bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-5 backdrop-blur-md ${alert.drainId ? 'cursor-pointer' : ''} transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
          >
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                  alert.severity === 'critical' ? 'bg-red-950 text-red-400 border border-red-500/30' :
                  alert.severity === 'warning' ? 'bg-amber-950 text-amber-400 border border-amber-500/30' :
                  'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {alert.severity}
                </span>
                {alert.kind === 'environmental' && (
                  <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                    ENV · Prototype
                  </span>
                )}
                <span className="text-xs font-bold text-white">{alert.drainId ? `${alert.drainId} — ` : ''}{alert.location}{alert.drainId ? ', Mumbai' : ''}</span>
                <span className="text-xs text-slate-500">{alert.time}</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">{alert.title}</h4>
                <p className="text-xs text-slate-400 font-sans mt-0.5">{alert.description}</p>
                {alert.sources && alert.sources.length > 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Sources: <strong className="text-slate-400">{alert.sources.join(' · ')}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              {alert.drainId ? (
                <span className="text-xs text-blue-400 font-semibold hover:underline flex items-center gap-1">
                  <span>Inspect Drain</span>
                  <ArrowRight size={14} />
                </span>
              ) : (
                <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1">
                  <span>City-wide Alert</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
