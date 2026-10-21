// Vite compiles .astro imports to server factories in the render tests. Plain TypeScript
// (including ESLint's project service) does not load Astro's language-server virtual modules.
declare module "*.astro" {
  const component: Parameters<import("astro/container").experimental_AstroContainer["renderToString"]>[0];
  export default component;
}
