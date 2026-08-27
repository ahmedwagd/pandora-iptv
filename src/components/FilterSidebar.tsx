import { memo } from "react";
import { useLang } from "../hooks/useLang";
import { strings } from "../i18n";
import type { SmartFilter } from "../types/filters";
export type { SmartFilter } from "../types/filters";

interface FilterSidebarProps {
  smartFilter: SmartFilter;
  onSmartFilter: (f: SmartFilter) => void;
  showFavorites?: boolean;
  categories: string[];
  category: string | null;
  onCategory: (c: string | null) => void;
  search: string;
  onSearch: (s: string) => void;
  onHome: () => void;
  isLocked?: (cat: string | null) => boolean;
  onToggleLock?: (cat: string) => void;
}

const SidebarHeader = memo(function SidebarHeader({
  groupsCount,
  onHome,
}: {
  groupsCount: number;
  onHome: () => void;
}) {
  const { lang } = useLang();
  const s = strings[lang];
  return (
    <div className="sidebar-header">
      <div className="sidebar-brand-block">
        <span className="sidebar-brand">PandoraIPTV</span>
        <span className="sidebar-signal">
          <span className="signal-dot" aria-hidden>
            ●
          </span>{" "}
          {groupsCount} {s.groups}
        </span>
      </div>
      <div className="sidebar-actions">
        <button type="button" className="change-source" onClick={onHome}>
          {s.home}
        </button>
      </div>
    </div>
  );
});

const SmartFilterGroup = memo(function SmartFilterGroup({
  smartFilter,
  onSmartFilter,
  showFavorites = true,
}: {
  smartFilter: SmartFilter;
  onSmartFilter: (f: SmartFilter) => void;
  showFavorites?: boolean;
}) {
  const s_local = strings[useLang().lang];
  const filters: Array<{ value: SmartFilter; label: string }> = [
    { value: "all", label: s_local.all },
    ...(showFavorites ? [{ value: "favorites" as SmartFilter, label: s_local.favorites }] : []),
    { value: "continue", label: s_local.continue },
  ];
  return (
    <div className="smart-filters" role="group" aria-label="Smart filters">
      {filters.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`smart-filter ${smartFilter === value ? "active" : ""}`}
          onClick={() => onSmartFilter(value)}
          aria-pressed={smartFilter === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
});

const SearchField = memo(function SearchField({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (s: string) => void;
}) {
  const { lang } = useLang();
  const s = strings[lang];
  return (
    <div className="filter-search">
      <input
        id="browse-search"
        type="text"
        placeholder={s.search}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        aria-label={s.searchAria}
      />
    </div>
  );
});

const CategoryList = memo(function CategoryList({
  categories,
  category,
  onCategory,
  isLocked,
  onToggleLock,
}: {
  categories: string[];
  category: string | null;
  onCategory: (c: string | null) => void;
  isLocked?: (cat: string | null) => boolean;
  onToggleLock?: (cat: string) => void;
}) {
  const { lang } = useLang();
  const s = strings[lang];
  return (
    <nav className="filter-categories" aria-label="Categories">
      <div className="filter-categories-label">{s.categories}</div>
      <button
        type="button"
        className={`filter-category ${category === null ? "active" : ""}`}
        onClick={() => onCategory(null)}
        aria-pressed={category === null}
      >
        {s.all}
      </button>
      {categories.map((c) => (
        <div key={c} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            className={`filter-category ${category === c ? "active" : ""} ${isLocked?.(c) ? "is-locked" : ""}`}
            onClick={() => onCategory(c)}
            aria-pressed={category === c}
            style={{ flex: 1 }}
          >
            {isLocked?.(c) ? "🔒 " : ""}
            {c}
          </button>
          {onToggleLock && (
            <button
              type="button"
              className="pc-btn"
              style={{ width: 22, height: 22, padding: 0, fontSize: 10 }}
              onClick={() => onToggleLock(c)}
              aria-label={isLocked?.(c) ? "Unlock" : "Lock"}
              title={isLocked?.(c) ? "Unlock category" : "Lock category"}
            >
              {isLocked?.(c) ? "🔓" : "🔒"}
            </button>
          )}
        </div>
      ))}
    </nav>
  );
});

export function FilterSidebar({ // i18n
  smartFilter,
  onSmartFilter,
  showFavorites = true,
  categories,
  category,
  onCategory,
  search,
  onSearch,
  onHome,
  isLocked,
  onToggleLock,
}: FilterSidebarProps) {
  return (
    <aside className="filter-sidebar">
      <SidebarHeader groupsCount={categories.length} onHome={onHome} />
      <SmartFilterGroup
        smartFilter={smartFilter}
        onSmartFilter={onSmartFilter}
        showFavorites={showFavorites}
      />
      <SearchField search={search} onSearch={onSearch} />
      <CategoryList
        categories={categories}
        category={category}
        onCategory={onCategory}
        isLocked={isLocked}
        onToggleLock={onToggleLock}
      />
    </aside>
  );
}
