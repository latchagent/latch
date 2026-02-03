/**
 * Test Scenario Runner
 *
 * Executes test scenarios against the Latch CLI.
 */
import { MCPResponse } from "./mcp-client.js";
import { TestScenario } from "./scenarios.js";
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
export declare class ScenarioRunner {
    private options;
    private client;
    constructor(options: RunnerOptions);
    /**
     * Run a single scenario
     */
    runScenario(scenario: TestScenario): Promise<TestResult>;
    /**
     * Validate response against expectations
     */
    private validateExpectations;
    /**
     * Get invocations from the demo server log
     */
    private getInvocations;
    /**
     * Run multiple scenarios
     */
    runScenarios(scenarios: TestScenario[]): Promise<TestResult[]>;
}
