export type AppApiError = {
  error: string;
  code?: string;
  details?: string;
  fieldErrors?: Record<string, string[]>;
};
