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
  onLevel: (id: string) => void;
  onClass: (id: string) => void;
  onStream: (id: string) => void;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchSubmit();
      }}
    >
      <select className={cn(filterClass, "w-[min(100%,11rem)]")} value={levelId} onChange={(event) => onLevel(event.target.value)}>
        <option value="">All Levels</option>
        {levels.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <select
        className={cn(filterClass, "w-[min(100%,11rem)]")}
        value={classId}
        disabled={!levelId}
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
        className={cn(filterClass, "w-[min(100%,11rem)]")}
        value={streamId}
        disabled={!classId}
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
        className={cn(inputClass, "h-10 min-w-[200px] flex-1 rounded-full")}
        value={search}
        placeholder={searchPlaceholder}
        onChange={(event) => onSearch(event.target.value)}
      />
    </form>
  );
}
