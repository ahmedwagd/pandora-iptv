import { memo } from "react";

export type SmartFilter = "all" | "favorites" | "continue";

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
}

const SidebarHeader = memo(function SidebarHeader({
  groupsCount,
  onHome,
}: {
  groupsCount: number;
  onHome: () => void;
}) {
  return (
    <div className="sidebar-header">
      <div className="sidebar-brand-block">
        <span className="sidebar-brand">PandoraIPTV</span>
        <span className="sidebar-signal">
          <span className="signal-dot" aria-hidden>
            ●
          </span>{" "}
          {groupsCount} groups
        </span>
      </div>
      <div className="sidebar-actions">
        <button type="button" className="change-source" onClick={onHome}>
          Home
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
  const filters: Array<{ value: SmartFilter; label: string }> = [
    { value: "all", label: "All" },
    ...(showFavorites ? [{ value: "favorites" as SmartFilter, label: "Favorites" }] : []),
    { value: "continue", label: "Continue" },
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
  return (
    <div className="filter-search">
      <input
        type="text"
        placeholder="Search titles…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        aria-label="Search titles"
      />
    </div>
  );
});

const CategoryList = memo(function CategoryList({
  categories,
  category,
  onCategory,
}: {
  categories: string[];
  category: string | null;
  onCategory: (c: string | null) => void;
}) {
  return (
    <nav className="filter-categories" aria-label="Categories">
      <div className="filter-categories-label">Categories</div>
      <button
        type="button"
        className={`filter-category ${category === null ? "active" : ""}`}
        onClick={() => onCategory(null)}
        aria-pressed={category === null}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          className={`filter-category ${category === c ? "active" : ""}`}
          onClick={() => onCategory(c)}
          aria-pressed={category === c}
        >
          {c}
        </button>
      ))}
    </nav>
  );
});

export function FilterSidebar({
  smartFilter,
  onSmartFilter,
  showFavorites = true,
  categories,
  category,
  onCategory,
  search,
  onSearch,
  onHome,
}: FilterSidebarProps) {
  return (
    <aside className="filter-sidebar">
      <SidebarHeader groupsCount={categories.length} onHome={onHome} />
      <SmartFilterGroup smartFilter={smartFilter} onSmartFilter={onSmartFilter} showFavorites={showFavorites} />
      <SearchField search={search} onSearch={onSearch} />
      <CategoryList categories={categories} category={category} onCategory={onCategory} />
    </aside>
  );
}
