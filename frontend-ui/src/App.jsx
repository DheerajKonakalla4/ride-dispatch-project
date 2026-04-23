import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Activity,
  Users,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronRight,
  Clock,
  Zap,
  Globe
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Fix for leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const createDriverIcon = (status) => new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div class="w-8 h-8 rounded-full border-2 ${status === 'available' ? 'border-emerald-500 bg-emerald-500/20' : 'border-rose-500 bg-rose-500/20'} flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-125">
    <div class="w-3 h-3 rounded-full ${status === 'available' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse"></div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const userIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div class="w-10 h-10 rounded-full border-4 border-indigo-500 bg-indigo-500/30 flex items-center justify-center shadow-indigo-500/50 shadow-2xl">
    <div class="w-4 h-4 rounded-full bg-indigo-400"></div>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});


function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function App() {
  const [drivers, setDrivers] = useState([]);
  const [userLoc, setUserLoc] = useState({ lat: 28.6139, lng: 77.2090 });
  const [activeRide, setActiveRide] = useState(null);
  const [logs, setLogs] = useState([
    { id: 1, text: "System initialized. Cloud connection stable.", time: new Date().toLocaleTimeString(), type: 'system' },
    { id: 2, text: "Ready for dispatch requests...", time: new Date().toLocaleTimeString(), type: 'system' }
  ]);
  const [isSearching, setIsSearching] = useState(false);
  const [inputLat, setInputLat] = useState('28.6139');
  const [inputLng, setInputLng] = useState('77.2090');
  const scrollRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Distance calculation
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(2);
  };

  const sortedDriversByDistance = useMemo(() => {
    return [...drivers]
      .map(d => ({ ...d, distance: parseFloat(getDistance(userLoc.lat, userLoc.lng, d.lat, d.lng)) }))
      .sort((a, b) => a.distance - b.distance);
  }, [drivers, userLoc]);

  const addLog = (text, type = 'info') => {
    setLogs(prev => [...prev, { id: Date.now(), text, time: new Date().toLocaleTimeString(), type }]);
  };

  const fetchDrivers = async () => {
    console.log("Button clicked");
    setIsSearching(true);
    addLog(`Broadcasting dispatch request to Cloud... [${inputLat}, ${inputLng}]`, 'search');

    try {
      const response = await fetch("https://pvmpz4oexb.execute-api.us-east-1.amazonaws.com/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_lat: parseFloat(inputLat),
          user_lon: parseFloat(inputLng),
        }),
      });

      if (!response.ok) throw new Error('Cloud synchronization failed');

      const res = await response.json();
      console.log("RAW RESPONSE:", res);

      // 🔥 IMPORTANT FIX
      const data = res.body ? JSON.parse(res.body) : res;
      console.log("PARSED DATA:", data);

      // ✅ FIX 3 — Ensure Drivers Always Have Safe Structure
      setDrivers(
        Array.isArray(data.nearest_drivers)
          ? data.nearest_drivers.map(d => ({
            driver_id: d.driver_id || d.id || "Unknown",
            latitude: Number(d.latitude || d.lat) || null,
            longitude: Number(d.longitude || d.lng) || null,
            distance_km: Number(d.distance_km || d.distance) || 0,
            name: `Driver ${d.driver_id || d.id || "Unknown"}`,
            car: d.car || "Standard Class",
            status: d.status || 'available'
          }))
          : []
      );

      setUserLoc({ lat: parseFloat(inputLat), lng: parseFloat(inputLng) });
      addLog("Cloud telemetry synchronized successfully.", 'success');
    } catch (error) {
      console.error("ERROR:", error);
      addLog(`Error: ${error.message}`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAssign = async (driverId) => {
    const driver = drivers.find(d => d.driver_id === driverId);
    addLog(`Initiating assignment for driver ${driverId}...`, 'system');

    try {
      const response = await fetch("https://pvmpz4oexb.execute-api.us-east-1.amazonaws.com/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assign_driver_id: driverId,
        }),
      });

      if (!response.ok) throw new Error('Assignment failed at Edge');

      setDrivers(prev => prev.map(d => d.driver_id === driverId ? { ...d, status: 'busy' } : d));
      setActiveRide(driver);

      addLog(`Driver ${driverId} status updated to BUSY in DynamoDB.`, 'assign');
      addLog(`RIDE STARTED: Driver ${driverId} is en route.`, 'success');
    } catch (error) {
      addLog(`Assignment Error: ${error.message}`, 'error');
    }
  };

  return (
    <div className="flex h-screen w-full bg-dark-900 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-20 lg:w-24 bg-dark-950 border-r border-white/5 flex flex-col items-center py-8 gap-10">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <Navigation className="text-white w-7 h-7" />
        </div>
        <nav className="flex flex-col gap-6 flex-1">
          {[Activity, MapPin, Users, Globe].map((Icon, i) => (
            <div key={i} className={cn(
              "p-3 rounded-xl cursor-not-allowed transition-all duration-200",
              i === 1 ? "bg-white/5 text-indigo-400" : "text-slate-500 hover:text-slate-300"
            )}>
              <Icon className="w-6 h-6" />
            </div>
          ))}
        </nav>
        <div className="p-3 text-slate-500">
          <Clock className="w-6 h-6" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Active Ride Attraction Overlay */}
        <AnimatePresence>
          {activeRide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 z-[5000] flex items-center justify-center pointer-events-none"
            >
              <div className="bg-emerald-500/10 backdrop-blur-3xl w-full h-full absolute inset-0 mix-blend-overlay"></div>
              <div className="glass-panel p-10 rounded-[2.5rem] flex flex-col items-center gap-6 pointer-events-auto border-emerald-500/30 border-2">
                <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/50 animate-pulse">
                  <Navigation className="text-white w-12 h-12" />
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-black text-white italic tracking-tighter">RIDE STARTED</h2>
                  <p className="text-emerald-400 font-bold uppercase tracking-widest text-sm mt-2">Driver {activeRide.name || activeRide.driver_id} is en route</p>
                </div>
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => setActiveRide(null)}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-dark-950 py-4 rounded-2xl font-black uppercase tracking-tighter transition-all active:scale-95 shadow-xl shadow-emerald-500/30"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Header */}
        <header className="h-20 border-b border-white/5 bg-dark-950/50 backdrop-blur-md px-8 flex items-center justify-between z-20">
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Real-Time Ride Dispatch System
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Cloud-Native Event-Driven Architecture
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" /> Live
            </div>
            <div className="px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium">
              Connected to AWS Global
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Map Section */}
          <div className="flex-[2] relative">
            <MapContainer
              center={[userLoc.lat, userLoc.lng]}
              zoom={14}
              className="h-full w-full grayscale-[0.5] invert-[0.9] hue-rotate-[180deg]"
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; CARTO'
              />
              <MapUpdater center={[userLoc.lat, userLoc.lng]} />

              {/* User Marker */}
              <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon}>
                <Popup>Your Location</Popup>
              </Marker>

              {/* 🔥 FIX 1 — Protect Map (CRITICAL) */}
              {Array.isArray(drivers) && drivers
                .filter(driver => driver.latitude && driver.longitude)
                .map((driver, index) => (
                  <Marker
                    key={`${driver.driver_id}_${index}`}
                    position={[driver.latitude, driver.longitude]}
                    icon={createDriverIcon(driver.status)}
                  >
                    <Popup className="custom-popup">
                      <div className="p-1 min-w-[120px]">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            driver.status === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                          )}></div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {driver.status}
                          </p>
                        </div>
                        <p className="font-bold text-sm tracking-tight text-white mb-1">
                          {(driver.name || driver.driver_id || "Driver").toUpperCase()}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                          <p className="text-[10px] text-slate-500 font-bold">{driver.car}</p>
                          <p className="text-[10px] text-indigo-400 font-black">{driver.distance_km?.toFixed(1)} KM</p>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>

            {/* Float Request Panel */}
            <div className="absolute top-6 left-6 z-[1000] w-80">
              <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-400" /> Dispatch Request
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">Latitude</label>
                      <input
                        value={inputLat}
                        onChange={(e) => setInputLat(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase">Longitude</label>
                      <input
                        value={inputLng}
                        onChange={(e) => setInputLng(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                  <button
                    onClick={fetchDrivers}
                    disabled={isSearching}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isSearching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Find Nearby Drivers'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: List + Feed */}
          <div className="flex-1 min-w-[380px] bg-dark-950 border-l border-white/5 flex flex-col">
            {/* Driver List Section */}
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">Nearby Fleet</h2>
                <span className="text-xs font-bold text-indigo-400 px-2 py-1 bg-indigo-400/10 rounded-lg">
                  {drivers.filter(d => d.status === 'available').length} Available
                </span>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                <AnimatePresence mode="popLayout">
                  {/* ✅ FIX 4 — Add Safe Rendering & Loading State */}
                  {isSearching && (
                    <div className="p-8 text-center glass-card rounded-2xl text-indigo-400 animate-pulse">
                      <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm font-bold uppercase tracking-tighter">🔄 Finding drivers...</p>
                    </div>
                  )}

                  {!isSearching && drivers.length === 0 && (
                    <div className="p-8 text-center glass-card rounded-2xl text-slate-500">
                      <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">🚫 No drivers available nearby</p>
                      <p className="text-[10px] mt-1 text-slate-600 italic">Sync with Cloud to fetch telemetry</p>
                    </div>
                  )}

                  {!isSearching && drivers.length > 0 && drivers.map((driver, index) => (
                    <motion.div
                      key={`${driver.driver_id}_${index}`}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "glass-card p-4 rounded-2xl relative overflow-hidden group",
                        index < 3 && driver.status === 'available' ? "ring-1 ring-indigo-500/50" : ""
                      )}
                    >
                      {index < 3 && driver.status === 'available' && (
                        <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-500 text-[10px] font-bold text-white rounded-bl-xl uppercase">
                          Hot Pick
                        </div>
                      )}
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center",
                          driver.status === 'available' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>
                          <Users className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* ✅ FIX 2 — Protect Driver Data */}
                          <h4 className="font-bold text-sm truncate">{(driver.name || driver.driver_id || "Driver").toUpperCase()}</h4>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1 font-medium text-slate-300">
                              <Navigation className="w-3 h-3" /> {driver.distance_km?.toFixed(2)} km
                            </span>
                            <span>•</span>
                            <span className="truncate">{driver.car}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAssign(driver.driver_id)}
                          disabled={driver.status !== 'available'}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                            driver.status === 'available'
                              ? "bg-white/10 hover:bg-white/20 text-white"
                              : "bg-rose-500/10 text-rose-500 cursor-not-allowed border border-rose-500/20"
                          )}
                        >
                          {driver.status === 'available' ? 'Assign' : 'Busy'}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Activity Feed Section */}
            <div className="h-[35%] bg-dark-900/50 border-t border-white/5 flex flex-col p-6 overflow-hidden">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> RT-Telemetry Logs
              </h3>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto custom-scrollbar space-y-3 font-mono text-[11px]"
              >
                {logs.map(log => (
                  <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-right-2 duration-300">
                    <span className="text-slate-600 shrink-0">[{log.time}]</span>
                    <span className={cn(
                      "flex-1",
                      log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'system' ? 'text-indigo-400' :
                          log.type === 'assign' ? 'text-amber-400' :
                            'text-slate-400'
                    )}>
                      {log.type === 'success' && <CheckCircle2 className="inline w-3 h-3 mr-1" />}
                      {log.type === 'search' && <Search className="inline w-3 h-3 mr-1 animate-pulse" />}
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
