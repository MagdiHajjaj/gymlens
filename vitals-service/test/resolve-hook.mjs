/**
 * Module customization hook: redirect @smartspectra/node-sdk to the mock.
 * Registered via `module.register()` from test/setup-mock.mjs.
 */
export async function resolve(specifier, context, next) {
  if (specifier === '@smartspectra/node-sdk') {
    return {
      url: new URL('./mock-sdk.js', import.meta.url).href,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}
