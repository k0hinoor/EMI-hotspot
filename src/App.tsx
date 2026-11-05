import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LiveScan } from './pages/LiveScan'
import { HeatmapPage } from './pages/Heatmap'
import { SignalAnalysis } from './pages/SignalAnalysis'
import { DataLog } from './pages/DataLog'
import { Reports } from './pages/Reports'
import { Calibration } from './pages/Calibration'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LiveScan />} />
        <Route path="/heatmap" element={<HeatmapPage />} />
        <Route path="/analysis" element={<SignalAnalysis />} />
        <Route path="/data-log" element={<DataLog />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/calibration" element={<Calibration />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<LiveScan />} />
      </Routes>
    </AppShell>
  )
}
