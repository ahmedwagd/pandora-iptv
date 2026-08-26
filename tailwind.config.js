/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0d1511",
          dim: "#0d1511",
          lowest: "#08100c",
          low: "#151d19",
          container: "#19211d",
          high: "#242c27",
          highest: "#2e3732",
          variant: "#2e3732",
          bright: "#333b36",
        },
        signal: {
          DEFAULT: "#2ee6a8",
          deep: "#1c9a72",
          glow: "rgba(46,230,168,0.24)",
        },
        outline: {
          DEFAULT: "#85948b",
          variant: "#3b4a42",
        },
        onSurface: "#dce5dd",
        onSurfaceVariant: "#bacac0",
      },
      fontFamily: {
        display: ['Space Grotesk Variable', 'Space Grotesk', 'sans-serif'],
        body: ['Archivo Narrow', 'Archivo Variable', 'Archivo', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
      },
      spacing: {
        safe: "48px",
        gutter: "24px",
      },
    },
  },
  plugins: [],
}

