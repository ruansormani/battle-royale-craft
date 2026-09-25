import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "behavior_pack/scripts/main.js",
  external: ["@minecraft/server", "@minecraft/server-ui"],
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
