import { extractStatusCode } from './utils/error-utils.js';

export enum ErrorCode {
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',
  AUTH_KEY_MISSING = 'AUTH_KEY_MISSING',
  IO_FILE_NOT_FOUND = 'IO_FILE_NOT_FOUND',
  IO_DIR_NOT_FOUND = 'IO_DIR_NOT_FOUND',
  IO_PERMISSION_DENIED = 'IO_PERMISSION_DENIED',
  IO_CLONE_FAILED = 'IO_CLONE_FAILED',
  NET_ERROR = 'NET_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  AUTH_PLATFORM_FAILURE = 'AUTH_PLATFORM_FAILURE',
  PLATFORM_REPO_NOT_FOUND = 'PLATFORM_REPO_NOT_FOUND',
  PLATFORM_INVALID_URL = 'PLATFORM_INVALID_URL',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  MODEL_NOT_INITIALIZED = 'MODEL_NOT_INITIALIZED',
  MODEL_COMPONENT_MISSING = 'MODEL_COMPONENT_MISSING',
  PROVIDER_INVALID_RESPONSE = 'PROVIDER_INVALID_RESPONSE',
  PROVIDER_CONTEXT_OVERFLOW = 'PROVIDER_CONTEXT_OVERFLOW',
  INPUT_INVALID = 'INPUT_INVALID',
  INPUT_CHANGE_TOO_LARGE = 'INPUT_CHANGE_TOO_LARGE',
  PROVIDER_SAFETY_BLOCK = 'PROVIDER_SAFETY_BLOCK',
  INTERNAL_UNKNOWN = 'INTERNAL_UNKNOWN',
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
    code = ErrorCode.INTERNAL_UNKNOWN,
    userMessage?: string
  ): ErodeError {
    if (error instanceof ErodeError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const context = error instanceof Error ? { originalError: error.name } : {};
    return new ErodeError(message, code, userMessage, context);
  }
}
export class ConfigurationError extends ErodeError {
  constructor(message: string, configKey?: string) {
    super(
      message,
      ErrorCode.CONFIG_INVALID,
      `Configuration issue: ${message}`,
      { configKey },
      false
    );
    this.name = 'ConfigurationError';
  }
}
interface HttpErrorClassification {
  isRateLimited: boolean;
  isTimeout: boolean;
  isAccelerationLimit: boolean;
}

function classifyHttpError(
  statusCode: number | undefined,
  message: string
): HttpErrorClassification {
  const isRateLimited = statusCode === 429;
  const isTimeout = statusCode === 408 || /\btimeout\b/i.test(message);
  const isAccelerationLimit =
    isRateLimited && /maximum usage increase rate|acceleration limit/i.test(message);
  return { isRateLimited, isTimeout, isAccelerationLimit };
}

export class ApiError extends ErodeError {
  public readonly statusCode?: number;
  public readonly isRateLimited: boolean;
  public readonly isTimeout: boolean;
  public readonly isAccelerationLimit: boolean;
  constructor(message: string, statusCode?: number, context: ErrorContext = {}) {
    const classification = classifyHttpError(statusCode, message);
    const code = classification.isRateLimited
      ? ErrorCode.PROVIDER_RATE_LIMITED
      : classification.isTimeout
        ? ErrorCode.PROVIDER_TIMEOUT
        : ErrorCode.PROVIDER_ERROR;

    const userMessage = classification.isAccelerationLimit
      ? 'Rate limit: Your API usage is accelerating too fast. Wait 5-10 minutes before retrying, or split large changes into smaller batches. See: https://docs.claude.com/en/api/rate-limits'
      : `Provider request failed: ${message}`;

    super(
      message,
      code,
      userMessage,
      { ...context, statusCode, isAccelerationLimit: classification.isAccelerationLimit },
      classification.isRateLimited || classification.isTimeout
    );
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isRateLimited = classification.isRateLimited;
    this.isTimeout = classification.isTimeout;
    this.isAccelerationLimit = classification.isAccelerationLimit;
  }

  private static fromProviderError(
    error: unknown,
    provider: string,
    statusExtractor: (err: Error) => number | undefined
  ): ApiError {
    if (error instanceof Error) {
      return new ApiError(error.message, statusExtractor(error), {
        originalError: error.name,
        provider,
      });
    }
    return new ApiError(String(error), undefined, { provider });
  }

  static fromAnthropicError(error: unknown): ApiError {
    return ApiError.fromProviderError(error, 'anthropic', extractStatusCode);
  }

  static fromGeminiError(error: unknown): ApiError {
    return ApiError.fromProviderError(error, 'gemini', (err) => {
      const statusMatch = /(\d{3})/.exec(err.message);
      return statusMatch?.[1] ? parseInt(statusMatch[1], 10) : undefined;
    });
  }

  static fromOpenAIError(error: unknown): ApiError {
    return ApiError.fromProviderError(error, 'openai', extractStatusCode);
  }
}
type AdapterType = 'likec4' | 'structurizr';
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
      ErrorCode.MODEL_NOT_INITIALIZED,
      adapterType,
      'The model must be loaded before it can be queried. Call loadFromPath() first.'
    );
  }
  static fromAdapterError(
    error: unknown,
    adapterType: AdapterType,
    displayName: string
  ): AdapterError {
    if (error instanceof AdapterError) {
      return error;
    }
    if (error instanceof Error) {
      return new AdapterError(
        error.message,
        ErrorCode.MODEL_LOAD_FAILED,
        adapterType,
        `Could not load ${displayName} model: ${error.message}`,
        { originalError: error.name }
      );
    }
    return new AdapterError(
      String(error),
      ErrorCode.MODEL_LOAD_FAILED,
      adapterType,
      `Could not load ${displayName} model: ${String(error)}`
    );
  }
  static fromLikeC4Error(error: unknown): AdapterError {
    return AdapterError.fromAdapterError(error, 'likec4', 'LikeC4');
  }
  static fromStructurizrError(error: unknown): AdapterError {
    return AdapterError.fromAdapterError(error, 'structurizr', 'Structurizr');
  }
}
