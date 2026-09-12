import { APP_MOTTO } from "@/lib/config/app";

export function PageFooter() {
  return (
    <footer className="relative mt-auto px-4 pb-6 pt-8 lg:px-7">
      <div className="relative flex flex-col gap-2 border-t border-black/5 pt-5 text-[12px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} RM Holdings Ltd. All rights reserved.</p>
        <p>{APP_MOTTO}</p>
      </div>
    </footer>
  );
}
