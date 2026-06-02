import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2e5c8a",
          dark: "#1f4060",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
