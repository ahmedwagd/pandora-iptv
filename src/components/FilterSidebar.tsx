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
  const smart = (f: SmartFilter) => (
    <button
      key={f}
      className={`smart-filter ${smartFilter === f ? "active" : ""}`}
      onClick={() => onSmartFilter(f)}
    >
      {f === "all" ? "All" : f === "favorites" ? "Favorites" : "Continue watching"}
    </button>
  );

  return (
    <aside className="filter-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-brand">IPTV Player</span>
        <div className="sidebar-actions">
          <button className="change-source" onClick={onHome}>
            Home
          </button>
          <button className="change-source" onClick={onDisconnect}>
            Change source
          </button>
        </div>
      </div>

      <div className="smart-filters">
        {smart("all")}
        {showFavorites && smart("favorites")}
        {smart("continue")}
      </div>

      <div className="filter-search">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <nav className="filter-categories">
        <button
          className={`filter-category ${category === null ? "active" : ""}`}
          onClick={() => onCategory(null)}
        >
          All categories
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
