/**
 * Import this (via --import or direct import) to swap the real
 * @smartspectra/node-sdk for the mock in the current process.
 */
import { register } from 'node:module';

register(new URL('./resolve-hook.mjs', import.meta.url));
