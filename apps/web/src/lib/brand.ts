// Central project name — imported from the repo-root brand.config.json.
// Rename the project there and everything (including this) follows.
import brand from '@brand';

export const BRAND = brand as {
  key: string;
  displayName: string;
  tagline?: string;
  domain: string | null;
};
