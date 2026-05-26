import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { IntakePage } from "@/pages/IntakePage";
import { RunPage } from "@/pages/RunPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/intake" replace />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route path="/runs/:runId" element={<RunPage />} />
        <Route path="*" element={<Navigate to="/intake" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
