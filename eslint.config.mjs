import js from "@eslint/js";
import tseslint from 'typescript-eslint';

/** @type { import("eslint").Linter.Config[] } */
export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // files: [ "**/*.ts?" ],
        ignores: [ "**/static/workbox-*.js", "**/*.d.ts?" ]
    }
]