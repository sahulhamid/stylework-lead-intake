import { Link, Route, Routes } from "react-router";
import { LeadListPage } from "./pages/LeadListPage";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Routes>
        <Route path="/" element={<LeadListPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/" className="mt-2 inline-block text-sm text-blue-700 hover:underline">
        Back to leads
      </Link>
    </main>
  );
}
