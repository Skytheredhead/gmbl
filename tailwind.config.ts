import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        "glow-cyan": "0 34px 120px rgba(59,130,246,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
