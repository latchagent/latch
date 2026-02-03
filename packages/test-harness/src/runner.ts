/**
 * Test Scenario Runner
 *
 * Executes test scenarios against the Latch CLI.
 */

import { MCPClient, MCPResponse } from "./mcp-client.js";
import { TestScenario } from "./scenarios.js";
import * as fs from "fs";

export interface TestResult {
  scenario: TestScenario;
  passed: boolean;
  duration: number;
  response?: MCPResponse;
  error?: string;
  details: string[];
}

export interface RunnerOptions {
  latchCommand: string;
  latchArgs: string[];
  demoServerCommand: string;
  demoServerArgs: string[];
  cloudUrl: string;
  workspaceId: string;
  upstreamId: string;
  agentKey: string;
  invocationLogFile: string;
  verbose: boolean;
}

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string): void {
  console.log(message);
}

function logStep(step: string): void {
  console.log(`  ${colors.dim}→${colors.reset} ${step}`);
}

function logPass(scenario: string): void {
  console.log(`${colors.green}✓${colors.reset} ${scenario}`);
}

function logFail(scenario: string, reason: string): void {
  console.log(`${colors.red}✗${colors.reset} ${scenario}`);
  console.log(`  ${colors.red}${reason}${colors.reset}`);
}

export class ScenarioRunner {
  private options: RunnerOptions;
  private client: MCPClient | null = null;

  constructor(options: RunnerOptions) {
    this.options = options;
  }

  /**
   * Run a single scenario
   */
  async runScenario(scenario: TestScenario): Promise<TestResult> {
    const startTime = Date.now();
    const details: string[] = [];

    try {
      // Reset invocation log
      fs.writeFileSync(this.options.invocationLogFile, "[]");

      // Start Latch CLI with demo server
      logStep(`Starting Latch CLI...`);
      this.client = new MCPClient({
        command: this.options.latchCommand,
        args: [
          ...this.options.latchArgs,
          "--upstream-command",
          this.options.demoServerCommand,
          "--upstream-args",
          this.options.demoServerArgs.join(","),
          "--cloud-url",
          this.options.cloudUrl,
          "--workspace",
          this.options.workspaceId,
          "--upstream-id",
          this.options.upstreamId,
          "--agent-key",
          this.options.agentKey,
        ],
        timeout: 10000,
      });

      await this.client.start();

      if (this.options.verbose) {
        this.client.on("stderr", (line: string) => {
          process.stderr.write(`  ${colors.dim}[stderr] ${line}${colors.reset}`);
        });
      }

      // Wait for processes to stabilize
      await sleep(500);

      // Handle setup if needed
      if (scenario.setup) {
        logStep(`Running setup...`);
        // Setup would involve cloud API calls
        // For now, we note that these need cloud helpers
        details.push("Setup required (cloud helpers needed)");
      }

      // Send the request
      logStep(`Sending: ${scenario.request.method}`);
      const response = await this.client.request(
        scenario.request.method,
        scenario.request.params
      );

      details.push(`Response received in ${Date.now() - startTime}ms`);

      // Check invocations
      const invocations = this.getInvocations();
      const upstreamInvoked = invocations.length > 0;
      details.push(`Upstream invocations: ${invocations.length}`);

      // Validate expectations
      const validationErrors = this.validateExpectations(
        scenario,
        response,
        upstreamInvoked
      );

      if (validationErrors.length > 0) {
        return {
          scenario,
          passed: false,
          duration: Date.now() - startTime,
          response,
          error: validationErrors.join("; "),
          details,
        };
      }

      return {
        scenario,
        passed: true,
        duration: Date.now() - startTime,
        response,
        details,
      };
    } catch (error) {
      return {
        scenario,
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details,
      };
    } finally {
      // Clean up
      if (this.client) {
        await this.client.stop();
        this.client = null;
      }
    }
  }

  /**
   * Validate response against expectations
   */
  private validateExpectations(
    scenario: TestScenario,
    response: MCPResponse,
    upstreamInvoked: boolean
  ): string[] {
    const errors: string[] = [];
    const expect = scenario.expect;

    // Check success/error
    if (expect.success !== undefined) {
      const isSuccess = response.result !== undefined && !response.error;
      if (expect.success && !isSuccess) {
        errors.push(
          `Expected success but got error: ${response.error?.message || "unknown"}`
        );
      }
      if (!expect.success && isSuccess) {
        errors.push("Expected error but got success");
      }
    }

    // Check error code
    if (expect.errorCode !== undefined && response.error) {
      if (response.error.code !== expect.errorCode) {
        errors.push(
          `Expected error code ${expect.errorCode}, got ${response.error.code}`
        );
      }
    }

    // Check error data code
    if (expect.errorDataCode !== undefined && response.error?.data) {
      const dataCode = (response.error.data as { code?: string }).code;
      if (dataCode !== expect.errorDataCode) {
        errors.push(
          `Expected error.data.code "${expect.errorDataCode}", got "${dataCode}"`
        );
      }
    }

    // Check upstream invocation
    if (expect.upstreamInvoked !== undefined) {
      if (expect.upstreamInvoked && !upstreamInvoked) {
        errors.push("Expected upstream to be invoked but it was not");
      }
      if (!expect.upstreamInvoked && upstreamInvoked) {
        errors.push("Expected upstream NOT to be invoked but it was");
      }
    }

    return errors;
  }

  /**
   * Get invocations from the demo server log
   */
  private getInvocations(): Array<{ tool: string; args: unknown }> {
    try {
      const content = fs.readFileSync(this.options.invocationLogFile, "utf8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Run multiple scenarios
   */
  async runScenarios(scenarios: TestScenario[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    log("");
    log(`${colors.bright}Running ${scenarios.length} scenarios${colors.reset}`);
    log("");

    for (const scenario of scenarios) {
      log(`${colors.cyan}${scenario.id}${colors.reset}: ${scenario.name}`);

      const result = await this.runScenario(scenario);
      results.push(result);

      if (result.passed) {
        logPass(scenario.name);
      } else {
        logFail(scenario.name, result.error || "Unknown error");
      }

      log("");
    }

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    log(`${colors.bright}Summary${colors.reset}`);
    log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
    log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
    log(`  Total: ${results.length}`);

    return results;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
