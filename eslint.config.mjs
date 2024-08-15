// import js from "@eslint/js";
import tseslint from 'typescript-eslint';

/** @type { import("eslint").Linter.Config[] } */
export default [
    // js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: [ '**/*.ts'],
    },
    { // https://github.com/eslint/eslint/discussions/18304#discussioncomment-9069706
        ignores: [ "**/*.js", "**/*.d.ts", "**/grammar.ts" ]
    }
]