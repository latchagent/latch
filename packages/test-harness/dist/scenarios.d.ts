/**
 * Test Scenarios for Latch
 *
 * Table-driven tests covering all major flows.
 */
export interface TestScenario {
    id: string;
    name: string;
    description: string;
    request: {
        method: string;
        params: unknown;
    };
    expect: {
        success?: boolean;
        errorCode?: number;
        errorDataCode?: string;
        upstreamInvoked?: boolean;
        createsApprovalRequest?: boolean;
        consumesToken?: boolean;
    };
    setup?: {
        approveFirst?: boolean;
        createLease?: {
            actionClass: string;
            durationMinutes: number;
        };
    };
    retryWith?: {
        useApprovalToken?: boolean;
        mutateArgs?: Record<string, unknown>;
        expiredToken?: boolean;
        reusedToken?: boolean;
    };
}
/**
 * Base test scenarios
 */
export declare const BASE_SCENARIOS: TestScenario[];
/**
 * Approval flow scenarios (require stateful cloud interaction)
 */
export declare const APPROVAL_FLOW_SCENARIOS: TestScenario[];
/**
 * Error handling scenarios
 */
export declare const ERROR_SCENARIOS: TestScenario[];
/**
 * All scenarios combined
 */
export declare const ALL_SCENARIOS: TestScenario[];
