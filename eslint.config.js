import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["build/**", ".react-router/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
);
