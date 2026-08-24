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
  onDisconnect: () => void;
}

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
  onDisconnect,
}: FilterSidebarProps) {
  const smart = (f: SmartFilter, label: string) => (
    <button
      key={f}
      className={`smart-filter ${smartFilter === f ? "active" : ""}`}
      onClick={() => onSmartFilter(f)}
    >
      {label}
    </button>
  );

  return (
    <aside className="filter-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand-block">
          <span className="sidebar-brand">IPTV Player</span>
          <span className="sidebar-signal">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {categories.length} groups
          </span>
        </div>
        <div className="sidebar-actions">
          <button className="change-source" onClick={onHome}>
            Home
          </button>
          <button className="change-source" onClick={onDisconnect}>
            Exit
          </button>
        </div>
      </div>

      <div className="smart-filters">
        {smart("all", "All")}
        {showFavorites && smart("favorites", "Favorites")}
        {smart("continue", "Continue")}
      </div>

      <div className="filter-search">
        <input
          type="text"
          placeholder="Search titles…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search titles"
        />
      </div>

      <nav className="filter-categories">
        <div className="filter-categories-label">Categories</div>
        <button
          className={`filter-category ${category === null ? "active" : ""}`}
          onClick={() => onCategory(null)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className={`filter-category ${category === c ? "active" : ""}`}
            onClick={() => onCategory(c)}
          >
            {c}
          </button>
        ))}
      </nav>
    </aside>
  );
}
