/**
 * Self-Loop Verification Engine MVP
 *
 * Executes a sequence of browser-based test cases, retries on failure,
 * and produces a structured verification report.
 *
 * Flow:
 *   Dev Agent writes code → build test cases → execute (browser) →
 *   pass? → done / fail? → analyze → auto-fix? → retry
 *
 * Exit conditions:
 *   1. All tests pass
 *   2. Max retries reached
 *   3. Engine determines issue is not auto-fixable
 */

import { executeAction, extractTextDom } from './browser-automation.js';
import { config } from '../config.js';

export interface VerificationConfig {
  maxRetries: number;
  screenshotOnFail: boolean;
  timeout: number;
  baseUrl: string;
  cdpPort?: number;
}

export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'assert' | 'screenshot' | 'extractDom' | 'scrollTo';
  target?: string;
  value?: string;
  timeout?: number;
}

export interface TestCase {
  id: string;
  name: string;
  steps: TestStep[];
  expected: string;
}

interface StepResult {
  step: TestStep;
  success: boolean;
  data?: any;
  error?: string;
  durationMs: number;
}

interface CaseResult {
  testCase: TestCase;
  passed: boolean;
  stepResults: StepResult[];
  screenshot?: string;
  error?: string;
}

export interface VerificationResult {
  passed: boolean;
  totalCases: number;
  passedCases: number;
  failedCases: CaseResult[];
  allResults: CaseResult[];
  screenshots: string[];
  retryCount: number;
  conclusion: string;
  canAutoFix: boolean;
  fixSuggestions?: string[];
  durationMs: number;
}

async function executeStep(step: TestStep, port: number): Promise<StepResult> {
  const start = Date.now();
  try {
    let result: any;

    switch (step.action) {
      case 'navigate':
        result = await executeAction({ action: 'navigate', target: step.target, params: { waitMs: step.timeout || 1500 } }, port);
        break;
      case 'click':
        result = await executeAction({ action: 'click', target: step.target }, port);
        break;
      case 'type':
        result = await executeAction({ action: 'type', target: step.value, params: { selector: step.target } }, port);
        break;
      case 'wait':
        result = await executeAction({ action: 'waitFor', target: step.target, params: { timeout: step.timeout || 5000 } }, port);
        break;
      case 'assert': {
        if (!step.target || !step.value) throw new Error('assert requires target (selector) and value (expected text)');
        result = await executeAction({ action: 'assertText', target: step.target, params: { expected: step.value } }, port);
        if (!result.data?.passed) {
          return { step, success: false, data: result.data, durationMs: Date.now() - start, error: result.data?.message };
        }
        break;
      }
      case 'screenshot':
        result = await executeAction({ action: 'screenshot' }, port);
        break;
      case 'extractDom':
        result = await executeAction({ action: 'extractDom', params: { filter: step.value || 'interactive' } }, port);
        break;
      case 'scrollTo':
        result = await executeAction({ action: 'scrollTo', target: step.target }, port);
        break;
      default:
        throw new Error(`Unknown step action: ${step.action}`);
    }

    return {
      step,
      success: result.success !== false,
      data: result.data || result,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { step, success: false, error: err.message, durationMs: Date.now() - start };
  }
}

async function executeTestCase(
  tc: TestCase,
  conf: VerificationConfig,
  port: number,
): Promise<CaseResult> {
  const stepResults: StepResult[] = [];

  for (const step of tc.steps) {
    const sr = await executeStep(step, port);
    stepResults.push(sr);
    if (!sr.success) {
      let screenshot: string | undefined;
      if (conf.screenshotOnFail) {
        try {
          const ssResult = await executeAction({ action: 'screenshot' }, port);
          screenshot = ssResult.data?.base64;
        } catch { /* best effort */ }
      }
      return { testCase: tc, passed: false, stepResults, screenshot, error: sr.error };
    }
  }

  return { testCase: tc, passed: true, stepResults };
}

function analyzeFailures(failedCases: CaseResult[]): {
  canAutoFix: boolean;
  reason: string;
  suggestions: string[];
} {
  const errors = failedCases.map(fc => fc.error || 'unknown error');
  const suggestions: string[] = [];

  const elementNotFound = errors.some(e => e.includes('not found') || e.includes('not visible'));
  const timeout = errors.some(e => e.includes('Timeout') || e.includes('timeout'));
  const assertionFailed = errors.some(e => e.includes('Expected') || e.includes('does not match'));

  if (elementNotFound) {
    suggestions.push('Check if the target element selector is correct and the element exists in the DOM');
    suggestions.push('Ensure the page has fully loaded before interacting');
  }
  if (timeout) {
    suggestions.push('Increase timeout values or add explicit wait steps');
    suggestions.push('Check if the target page is responding');
  }
  if (assertionFailed) {
    suggestions.push('Verify the expected values match the actual page content');
    suggestions.push('Check for dynamic content that may change between runs');
  }

  const canAutoFix = !assertionFailed && (elementNotFound || timeout);
  const reason = canAutoFix
    ? 'Issues may be timing-related and could resolve with retries'
    : `${failedCases.length} case(s) failed with assertion errors that require code changes`;

  return { canAutoFix, reason, suggestions };
}

export async function selfLoopVerify(
  verifyConfig: VerificationConfig,
  testCases: TestCase[],
): Promise<VerificationResult> {
  const port = verifyConfig.cdpPort || config.cdpPort;
  const start = Date.now();
  let retryCount = 0;

  while (retryCount <= verifyConfig.maxRetries) {
    const allResults: CaseResult[] = [];
    const failedCases: CaseResult[] = [];
    const screenshots: string[] = [];

    for (const tc of testCases) {
      const result = await executeTestCase(tc, verifyConfig, port);
      allResults.push(result);
      if (!result.passed) {
        failedCases.push(result);
        if (result.screenshot) screenshots.push(result.screenshot);
      }
    }

    if (failedCases.length === 0) {
      return {
        passed: true,
        totalCases: testCases.length,
        passedCases: testCases.length,
        failedCases: [],
        allResults,
        screenshots,
        retryCount,
        conclusion: `All ${testCases.length} test case(s) passed`,
        canAutoFix: false,
        durationMs: Date.now() - start,
      };
    }

    const analysis = analyzeFailures(failedCases);

    if (!analysis.canAutoFix || retryCount >= verifyConfig.maxRetries) {
      return {
        passed: false,
        totalCases: testCases.length,
        passedCases: testCases.length - failedCases.length,
        failedCases,
        allResults,
        screenshots,
        retryCount,
        conclusion: retryCount >= verifyConfig.maxRetries
          ? `After ${verifyConfig.maxRetries} retries, ${failedCases.length} case(s) still failing. Manual intervention needed.`
          : analysis.reason,
        canAutoFix: analysis.canAutoFix,
        fixSuggestions: analysis.suggestions,
        durationMs: Date.now() - start,
      };
    }

    retryCount++;
    await new Promise(r => setTimeout(r, 1000));
  }

  return {
    passed: false,
    totalCases: testCases.length,
    passedCases: 0,
    failedCases: [],
    allResults: [],
    screenshots: [],
    retryCount,
    conclusion: 'Unexpected exit from verification loop',
    canAutoFix: false,
    durationMs: Date.now() - start,
  };
}
