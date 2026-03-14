import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: "#FAF6F0",
        parchment: "#FFFDF8",
        espresso: "#2C1810",
        walnut: "#5C4033",
        driftwood: "#8B7355",
        sandstone: "#B8A690",
        sage: "#C2DFD0",
        biscuit: "#D9CDBF",
        latte: "#E8DDD0",
        terracotta: "#C4785C",
        mahogany: "#1C1210",
        "cream-text": "#FAF0E4",
      },
      fontFamily: {
        cormorant: ["var(--font-cormorant)", "serif"],
        serif: ["var(--font-serif)", "serif"],
        caveat: ["var(--font-caveat)", "cursive"],
      },
      borderRadius: {
        card: "16px",
        button: "12px",
      },
      boxShadow: {
        DEFAULT: "none",
      },
      spacing: {},
    },
  },
};

export default config;
