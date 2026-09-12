"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Search, Settings, Sun, UserRound } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { SEARCH_INDEX } from "@/lib/config/navigation";
import { cn } from "@/lib/cn";
import { isOwnerRole } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/types";

function initials(name: string) {
  const cleaned = name
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((part) => !["Maj", "Gen", "Mst"].includes(part) && part.length > 1);
  if (cleaned.length >= 2) {
    return `${cleaned[0][0]}${cleaned[cleaned.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function profileCaption(user: AuthUser) {
  if (isOwnerRole(user.roleCode)) return "Owner / Group Administrator";
  return user.roleName;
}

function profileImage(user: AuthUser) {
  if (user.avatarUrl) return user.avatarUrl;
  if (isOwnerRole(user.roleCode)) return "/images/owner-avatar.jpg";
  return null;
}

function MenuLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 14"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M3.5 2.75h9M3.5 7h9M3.5 11.25h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function closeIfOutside(
  event: React.FocusEvent<HTMLDivElement>,
  onClose: () => void,
) {
  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
    onClose();
  }
}

export function Header({
  user,
  onMenuClick,
  onToggleSidebar,
  sidebarCollapsed = false,
  notifications,
}: {
  user: AuthUser;
  onMenuClick: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  notifications: { id: string; title: string; body: string; href: string | null; createdAt: string }[];
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const avatar = profileImage(user);
  const caption = profileCaption(user);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEARCH_INDEX.slice(0, 6);
    return SEARCH_INDEX.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-white/60 bg-white/70 px-4 backdrop-blur-xl lg:px-7">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/80 bg-white/90 text-navy shadow-[0_1px_2px_rgba(15,35,64,0.04)] lg:hidden"
        aria-label="Open navigation"
      >
        <span className="sr-only">Open menu</span>
        <MenuLines className="h-3.5 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        className="hidden h-10 w-10 items-center justify-center rounded-[12px] border border-white/80 bg-white/90 text-navy shadow-[0_1px_2px_rgba(15,35,64,0.04)] transition duration-200 hover:bg-white lg:inline-flex"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!sidebarCollapsed}
      >
        <MenuLines className="h-3.5 w-4" />
      </button>

      <div
        className="relative min-w-0 flex-1"
        onBlurCapture={(event) => closeIfOutside(event, () => setSearchOpen(false))}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search modules, reports, users..."
          className="h-11 w-full rounded-full border border-white/80 bg-[#eef3fb] pl-10 pr-16 text-sm text-navy outline-none transition placeholder:text-slate-400 focus:border-[#c5d4ea] focus:bg-white focus:ring-4 focus:ring-[#5b82c4]/10"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center rounded-md border border-black/8 bg-white/80 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 sm:inline-flex">
          ⌘ K
        </kbd>
        {searchOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No matching modules or pages.</p>
            ) : (
              results.map((item) => (
                <Link
                  key={`${item.group}-${item.href}`}
                  href={item.href}
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                  }}
                  className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span className="text-navy">{item.label}</span>
                  <span className="text-xs text-slate-400">{item.group}</span>
                </Link>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <div
          className="relative"
          onBlurCapture={(event) => closeIfOutside(event, () => setAlertsOpen(false))}
        >
          <button
            type="button"
            onClick={() => setAlertsOpen((value) => !value)}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-navy"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" strokeWidth={1.75} />
            {notifications.length > 0 ? (
              <span className="absolute right-[11px] top-[11px] h-2 w-2 rounded-full bg-[#e11d48] ring-2 ring-white" />
            ) : null}
          </button>
          {alertsOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] w-[320px] overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
              <div className="border-b border-black/5 px-4 py-3 text-sm font-semibold text-navy">
                Notifications
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No new notifications.</p>
              ) : (
                notifications.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href ?? "#"}
                    className="block border-b border-black/4 px-4 py-3 last:border-0 hover:bg-slate-50"
                    onClick={() => setAlertsOpen(false)}
                  >
                    <p className="text-sm font-medium text-navy">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.body}</p>
                  </Link>
                ))
              )}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-navy"
          aria-label="Appearance"
        >
          <Sun className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <div
          className="relative"
          onBlurCapture={(event) => closeIfOutside(event, () => setProfileOpen(false))}
        >
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition hover:bg-white/70"
          >
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-10 w-10 rounded-full object-cover ring-1 ring-black/5"
              />
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e8eef6] text-sm font-semibold text-navy">
                {initials(user.name)}
              </span>
            )}
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold leading-5 text-navy">{user.name}</span>
              <span className="block text-xs text-slate-500">{caption}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" strokeWidth={1.8} />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-2xl border border-black/6 bg-white py-1 shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
              <Link
                href="/owner/settings"
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm text-navy hover:bg-slate-50",
                  !isOwnerRole(user.roleCode) && "pointer-events-none opacity-40",
                )}
                onClick={() => setProfileOpen(false)}
              >
                <UserRound className="h-4 w-4" />
                Profile
              </Link>
              <Link
                href={isOwnerRole(user.roleCode) ? "/owner/settings" : "#"}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-navy hover:bg-slate-50"
                onClick={() => setProfileOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Account settings
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-[#b42318] hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
