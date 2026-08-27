import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../appStore";

describe("appStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: "home",
      contentMode: "live",
      active: null,
      detailTarget: null,
      smartFilter: "all",
      category: null,
      search: "",
    });
  });

  it("setSmartFilter resets category", () => {
    useAppStore.getState().setCategory("Sports");
    useAppStore.getState().setSmartFilter("favorites");
    expect(useAppStore.getState().smartFilter).toBe("favorites");
    expect(useAppStore.getState().category).toBeNull();
  });

  it("setCategory resets smartFilter", () => {
    useAppStore.getState().setSmartFilter("favorites");
    useAppStore.getState().setCategory("Movies");
    expect(useAppStore.getState().category).toBe("Movies");
    expect(useAppStore.getState().smartFilter).toBe("all");
  });

  it("enterContent sets browse without callback", () => {
    useAppStore.getState().enterContent("movie");
    const s = useAppStore.getState();
    expect(s.contentMode).toBe("movie");
    expect(s.screen).toBe("browse");
    expect(s.smartFilter).toBe("all");
  });

  it("goHome resets active/detail", () => {
    useAppStore.setState({ active: { id: "1", name: "A", url: "u", group: "G" } as any, detailTarget: { kind: "movie", channel: { id: "1", name: "A", url: "u", group: "G" } as any }, screen: "watch" } as any);
    useAppStore.getState().goHome();
    expect(useAppStore.getState().screen).toBe("home");
    expect(useAppStore.getState().active).toBeNull();
    expect(useAppStore.getState().detailTarget).toBeNull();
  });

  it("handleDisconnect resets to home/live", () => {
    useAppStore.setState({ screen: "browse", contentMode: "movie", search: "foo", category: "Cat", smartFilter: "favorites" } as any);
    useAppStore.getState().handleDisconnect();
    const s = useAppStore.getState();
    expect(s.screen).toBe("home");
    expect(s.contentMode).toBe("live");
    expect(s.search).toBe("");
    expect(s.category).toBeNull();
  });

  it("resetBrowseFilters clears filters", () => {
    useAppStore.setState({ smartFilter: "favorites", category: "Sports", search: "foo" } as any);
    useAppStore.getState().resetBrowseFilters();
    expect(useAppStore.getState().smartFilter).toBe("all");
    expect(useAppStore.getState().category).toBeNull();
    expect(useAppStore.getState().search).toBe("");
  });

  it("legacy wrappers still invoke callback", () => {
    let called = false;
    useAppStore.getState().enterContentLegacy("series", () => { called = true; });
    expect(called).toBe(true);
    expect(useAppStore.getState().contentMode).toBe("series");
  });
});
