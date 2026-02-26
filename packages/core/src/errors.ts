export enum ErrorCode {
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_API_KEY = 'MISSING_API_KEY',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  PLATFORM_AUTH_ERROR = 'PLATFORM_AUTH_ERROR',
  REPOSITORY_NOT_FOUND = 'REPOSITORY_NOT_FOUND',
  INVALID_URL = 'INVALID_URL',
  MODEL_LOAD_ERROR = 'MODEL_LOAD_ERROR',
  MODEL_NOT_LOADED = 'MODEL_NOT_LOADED',
  COMPONENT_NOT_FOUND = 'COMPONENT_NOT_FOUND',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  CONTEXT_TOO_LARGE = 'CONTEXT_TOO_LARGE',
  INVALID_INPUT = 'INVALID_INPUT',
  CHANGE_SIZE_EXCEEDED = 'CHANGE_SIZE_EXCEEDED',
  SAFETY_FILTERED = 'SAFETY_FILTERED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
type ErrorContext = Record<string, string | number | boolean | null | undefined>;
export class ErodeError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly context: ErrorContext;
  public readonly recoverable: boolean;
  constructor(
    message: string,
    code: ErrorCode,
    userMessage?: string,
    context: ErrorContext = {},
    recoverable = false
  ) {
    super(message);
    this.name = 'ErodeError';
    this.code = code;
    this.userMessage = userMessage ?? message;
    this.context = context;
    this.recoverable = recoverable;
    Error.captureStackTrace(this, ErodeError);
  }
  static fromError(
    error: unknown,
    code = ErrorCode.UNKNOWN_ERROR,
    userMessage?: string
  ): ErodeError {
    if (error instanceof ErodeError) {
      return error;
    }
    if (error instanceof Error) {
      return new ErodeError(error.message, code, userMessage, { originalError: error.name });
    }
    return new ErodeError(String(error), code, userMessage);
  }
}
export class ConfigurationError extends ErodeError {
  constructor(message: string, configKey?: string) {
    super(
      message,
      ErrorCode.INVALID_CONFIG,
      `Configuration issue: ${message}`,
      { configKey },
      false
    );
    this.name = 'ConfigurationError';
  }
}
export class ApiError extends ErodeError {
  public readonly statusCode?: number;
  public readonly isRateLimited: boolean;
  public readonly isTimeout: boolean;
  public readonly isAccelerationLimit: boolean;
  constructor(message: string, statusCode?: number, context: ErrorContext = {}) {
    const isRateLimited = statusCode === 429;
    const isTimeout = statusCode === 408 || message.toLowerCase().includes('timeout');
    const isAccelerationLimit =
      isRateLimited &&
      (message.includes('maximum usage increase rate') || message.includes('acceleration limit'));
    const code = isRateLimited
      ? ErrorCode.RATE_LIMITED
      : isTimeout
        ? ErrorCode.TIMEOUT
        : ErrorCode.API_ERROR;

    // Enhance user message for acceleration limits
    let userMessage = `API failure: ${message}`;
    if (isAccelerationLimit) {
      userMessage =
        'Rate limit: Your API usage is accelerating too fast. Wait 5-10 minutes before retrying, or split large changes into smaller batches. See: https://docs.claude.com/en/api/rate-limits';
    }

    super(
      message,
      code,
      userMessage,
      { ...context, statusCode, isAccelerationLimit },
      isRateLimited || isTimeout // Rate limit and timeout errors are recoverable
    );
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isRateLimited = isRateLimited;
    this.isTimeout = isTimeout;
    this.isAccelerationLimit = isAccelerationLimit;
  }
  static fromAnthropicError(error: unknown): ApiError {
    if (error instanceof Error) {
      // Anthropic SDK errors (APIError, RateLimitError, etc.) expose a .status property
      const statusCode =
        'status' in error && typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      return new ApiError(error.message, statusCode, {
        originalError: error.name,
        provider: 'anthropic',
      });
    }
    return new ApiError(String(error), undefined, { provider: 'anthropic' });
  }
  static fromGeminiError(error: unknown): ApiError {
    if (error instanceof Error) {
      // Extract status code from Gemini SDK errors
      const statusMatch = /(\d{3})/.exec(error.message);
      const statusCode = statusMatch?.[1] ? parseInt(statusMatch[1], 10) : undefined;
      return new ApiError(error.message, statusCode, {
        originalError: error.name,
        provider: 'gemini',
      });
    }
    return new ApiError(String(error), undefined, { provider: 'gemini' });
  }
  static fromOpenAIError(error: unknown): ApiError {
    if (error instanceof Error) {
      const statusCode =
        'status' in error && typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      return new ApiError(error.message, statusCode, {
        originalError: error.name,
        provider: 'openai',
      });
    }
    return new ApiError(String(error), undefined, { provider: 'openai' });
  }
}
type AdapterType = 'likec4';
export class AdapterError extends ErodeError {
  public readonly adapterType: AdapterType;
  public readonly suggestions?: string[];
  constructor(
    message: string,
    code: ErrorCode,
    adapterType: AdapterType,
    userMessage?: string,
    context: Record<string, string | number | boolean | null | undefined> = {},
    suggestions?: string[]
  ) {
    super(message, code, userMessage, { ...context, adapterType }, false);
    this.name = 'AdapterError';
    this.adapterType = adapterType;
    this.suggestions = suggestions;
  }
  static notLoaded(adapterType: AdapterType): AdapterError {
    return new AdapterError(
      'Model not loaded',
      ErrorCode.MODEL_NOT_LOADED,
      adapterType,
      'The model must be loaded before it can be queried. Call loadFromPath() first.'
    );
  }
  static fromAdapterError(
    error: unknown,
    adapterType: AdapterType,
    displayName: string
  ): AdapterError {
    if (error instanceof ErodeError) {
      return error as AdapterError;
    }
    if (error instanceof Error) {
      return new AdapterError(
        error.message,
        ErrorCode.MODEL_LOAD_ERROR,
        adapterType,
        `Could not load ${displayName} model: ${error.message}`,
        { originalError: error.name }
      );
    }
    return new AdapterError(
      String(error),
      ErrorCode.MODEL_LOAD_ERROR,
      adapterType,
      `Could not load ${displayName} model: ${String(error)}`
    );
  }
  static fromLikeC4Error(error: unknown): AdapterError {
    return AdapterError.fromAdapterError(error, 'likec4', 'LikeC4');
  }
}
