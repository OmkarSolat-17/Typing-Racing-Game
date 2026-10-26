/** Type surface for the build-time env the app is allowed to read (see `.env.example`). */
interface ImportMetaEnv {
  readonly VITE_BUILD_LABEL?: string;
  readonly VITE_ALLOWED_EMBED_ORIGINS?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
