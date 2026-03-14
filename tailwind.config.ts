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
        navy: "#1C2B3A",
        cream: "#F5F0EA",
        charcoal: "#2B2B2B",
        steel: "#7B8D9A",
        mist: "#B3B3B3",
        sage: "#C2DFD0",
        tan: "#D2C2AF",
        silver: "#D4D4D4",
        coral: "#D4917A",
      },
      fontFamily: {
        playfair: ["var(--font-playfair)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
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
