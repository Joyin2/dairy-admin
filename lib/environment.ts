/**
 * Environment Detection Utility for Admin Dashboard (Next.js)
 * 
 * Determines whether the app is running in production, development, or staging.
 * Production-level notifications should ONLY be triggered in the production environment.
 */

export type AppEnvironment = 'production' | 'development' | 'staging';

/**
 * Get the current app environment.
 * Checks NEXT_PUBLIC_APP_ENV first, then falls back to NODE_ENV.
 */
export function getAppEnvironment(): AppEnvironment {
  const envVar = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development';
  
  if (envVar === 'production') return 'production';
  if (envVar === 'staging') return 'staging';
  return 'development';
}

/**
 * Returns true ONLY if running in the production environment.
 * Use this to gate push notification triggers and production-only features.
 */
export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === 'production';
}

/**
 * Returns true if running in any non-production environment.
 */
export function isDevelopmentEnvironment(): boolean {
  return !isProductionEnvironment();
}

/**
 * Log a warning when a production-only action is skipped in dev/staging.
 */
export function logProductionOnlySkip(action: string): void {
  if (!isProductionEnvironment()) {
    console.log(`[ENV:${getAppEnvironment()}] Skipping production-only action: ${action}`);
  }
}
