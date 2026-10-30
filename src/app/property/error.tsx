"use client";
export default function PropertyPageError({ error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-10 flex items-center justify-center">
      <div className="bg-white/80 backdrop-blur rounded-3xl p-8 shadow-xl max-w-lg text-center border border-white/40">
        <h2 className="text-xl font-bold text-rose-600 mb-2">Property Dashboard Error</h2>
        <p className="text-slate-600 mb-4">{error?.message || "Failed to load property data."}</p>
        <a href="/property" className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-xl">Reload</a>
      </div>
    </div>
  );
}
