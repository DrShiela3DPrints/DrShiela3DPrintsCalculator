import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/DrShiela3DPrintsCalculator/", // <- must match your repo name
});
