"use client";

import { filterClass, inputClass } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";

export type PlacementChoice = { id: string; name: string };

export function SchoolPlacementFilterBar({
  levels,
  classes,
  streams,
  levelId,
  classId,
  streamId,
  search,
  searchPlaceholder,
  pendingLevelId = null,
  pendingClassId = null,
  pendingStreamId = null,
  paging = false,
  onLevel,
  onClass,
  onStream,
  onSearch,
  onSearchSubmit,
}: {
  levels: PlacementChoice[];
  classes: PlacementChoice[];
  streams: PlacementChoice[];
  levelId: string;
  classId: string;
  streamId: string;
  search: string;
  searchPlaceholder: string;
  pendingLevelId?: string | null;
  pendingClassId?: string | null;
  pendingStreamId?: string | null;
  paging?: boolean;
  onLevel: (id: string) => void;
  onClass: (id: string) => void;
  onStream: (id: string) => void;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
}) {
  const control = "h-10 w-[9.75rem] shrink-0 sm:w-[11rem]";
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchSubmit();
      }}
    >
      <select
        className={cn(filterClass, control, pendingLevelId != null && paging ? "ring-1 ring-navy/20" : null)}
        value={levelId}
        aria-busy={pendingLevelId != null && paging}
        onChange={(event) => onLevel(event.target.value)}
      >
        <option value="">All Levels</option>
        {levels.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <select
        className={cn(filterClass, control, pendingClassId != null && paging ? "ring-1 ring-navy/20" : null)}
        value={classId}
        disabled={!levelId}
        aria-busy={pendingClassId != null && paging}
        onChange={(event) => onClass(event.target.value)}
      >
        <option value="">All Classes</option>
        {classes.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <select
        className={cn(filterClass, control, pendingStreamId != null && paging ? "ring-1 ring-navy/20" : null)}
        value={streamId}
        disabled={!classId}
        aria-busy={pendingStreamId != null && paging}
        onChange={(event) => onStream(event.target.value)}
      >
        <option value="">All Streams</option>
        {streams.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <input
        className={cn(inputClass, "h-10 min-w-[12rem] flex-1 rounded-full")}
        value={search}
        placeholder={searchPlaceholder}
        onChange={(event) => onSearch(event.target.value)}
      />
    </form>
  );
}
