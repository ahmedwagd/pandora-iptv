import { describe, it, expect, vi, beforeEach } from "vitest";
import { TauriHlsLoader } from "../hlsTauriLoader";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

function okResponse(body: string | ArrayBuffer, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Forbidden",
    text: async () => (typeof body === "string" ? body : ""),
    arrayBuffer: async () =>
      typeof body === "string" ? new TextEncoder().encode(body).buffer as ArrayBuffer : body,
  };
}

function context(url: string, responseType = "text") {
  return { url, responseType };
}

function makeCallbacks() {
  return {
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onTimeout: vi.fn(),
    onAbort: vi.fn(),
  };
}

describe("TauriHlsLoader", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("loads text (manifest) and calls onSuccess with string data", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockResolvedValue(okResponse("#EXTM3U\n#EXTINF:5,\ntest.ts\n") as Response);

    loader.load(context("http://server/live/x.m3u8") as never, {} as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled());

    expect(mockFetch).toHaveBeenCalledWith(
      "http://server/live/x.m3u8",
      expect.objectContaining({ method: "GET" })
    );
    const [response] = callbacks.onSuccess.mock.calls[0];
    expect(response.url).toBe("http://server/live/x.m3u8");
    expect(response.data).toContain("#EXTM3U");
  });

  it("loads arraybuffer (segment) and calls onSuccess with ArrayBuffer", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    mockFetch.mockResolvedValue(okResponse(buf) as Response);

    loader.load(context("http://server/live/x.ts", "arraybuffer") as never, {} as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled());

    const [response] = callbacks.onSuccess.mock.calls[0];
    expect(response.data).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(response.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("sends Range header when hls requests a byte range", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockResolvedValue(okResponse("partial") as Response);

    loader.load(
      { url: "http://server/live/x.ts", responseType: "arraybuffer", rangeStart: 100, rangeEnd: 200 } as never,
      {} as never,
      callbacks as never
    );
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled());

    expect(mockFetch).toHaveBeenCalledWith(
      "http://server/live/x.ts",
      expect.objectContaining({ headers: expect.objectContaining({ Range: "bytes=100-199" }) })
    );
  });

  it("calls onError on non-2xx", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockResolvedValue(okResponse("denied", 403) as Response);

    loader.load(context("http://server/live/x.m3u8") as never, {} as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());

    const [err] = callbacks.onError.mock.calls[0];
    expect(err.code).toBe(403);
  });

  it("calls onAbort when aborted", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockImplementation(
      () => new Promise((_resolve, reject) => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })))
    );

    loader.load(context("http://server/live/x.m3u8") as never, {} as never, callbacks as never);
    loader.abort();
    await vi.waitFor(() => expect(callbacks.onAbort).toHaveBeenCalled());
  });

  it("does not call back after destroy", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockResolvedValue(okResponse("#EXTM3U") as Response);

    loader.load(context("http://server/live/x.m3u8") as never, {} as never, callbacks as never);
    loader.destroy();
    await new Promise((r) => setTimeout(r, 10));
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("corrects frequancy.stream typo before fetch", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockResolvedValue(okResponse("#EXTM3U") as Response);

    loader.load(context("http://linear-899.frequancy.stream/live/x.m3u8") as never, {} as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("frequency.stream"),
      expect.anything()
    );
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining("frequancy.stream"), expect.anything());
  });

  it("follows 302 redirect via location header", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    const redirectHeaders = { get: (k: string) => (k.toLowerCase() === "location" ? "http://server/redirected.m3u8" : null) };
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 302, statusText: "Found", headers: redirectHeaders } as unknown as Response)
      .mockResolvedValueOnce(okResponse("#EXTM3U redirected") as Response);

    loader.load(context("http://server/live/x.m3u8") as never, {} as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(2, "http://server/redirected.m3u8", expect.anything());
  });

  it("calls onTimeout when fetch exceeds config timeout", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves

    loader.load(context("http://server/live/x.m3u8") as never, { timeout: 15 } as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onTimeout).toHaveBeenCalled(), { timeout: 100 });
  });

  it("aborting after success is no-op (no resource id invalid)", async () => {
    const loader = new TauriHlsLoader();
    const callbacks = makeCallbacks();
    mockFetch.mockResolvedValue(okResponse("#EXTM3U") as Response);

    loader.load(context("http://server/live/x.m3u8") as never, {} as never, callbacks as never);
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalled());
    // Abort after settled should not throw and should not trigger onAbort/onError
    expect(() => loader.abort()).not.toThrow();
    expect(callbacks.onAbort).not.toHaveBeenCalled();
  });
});