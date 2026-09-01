import { describe, it, expect } from "vitest";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import type { GenLayerTransaction } from "genlayer-js/types";
import { describeTransactionOutcome } from "./genlayer-client";

/**
 * Regression coverage for the single most severe finding in this project's
 * strict-review pass: the frontend used to determine transaction success
 * from `statusName` alone, which reports a green checkmark on a
 * transaction that reached consensus but reverted on-chain
 * (statusName: ACCEPTED, txExecutionResultName: "FINISHED_WITH_ERROR" is a
 * real, confirmed combination on this exact chain -- a gl.vm.UserError
 * revert still reaches ACCEPTED consensus). This file exists so that
 * regression can never silently return without a test failing.
 */

function tx(overrides: Partial<GenLayerTransaction>): GenLayerTransaction {
  return {
    hash: "0xabc",
    statusName: TransactionStatus.ACCEPTED,
    ...overrides,
  } as GenLayerTransaction;
}

describe("describeTransactionOutcome", () => {
  it("reports success only for ACCEPTED + FINISHED_WITH_RETURN", () => {
    const outcome = describeTransactionOutcome(
      tx({ statusName: TransactionStatus.ACCEPTED, txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN })
    );
    expect(outcome.succeeded).toBe(true);
    expect(outcome.reason).toBeNull();
  });

  it("reports success for FINALIZED + FINISHED_WITH_RETURN", () => {
    const outcome = describeTransactionOutcome(
      tx({ statusName: TransactionStatus.FINALIZED, txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN })
    );
    expect(outcome.succeeded).toBe(true);
  });

  it("does NOT report success when consensus was reached but execution reverted", () => {
    // The exact real-world combination that broke the old statusName-only
    // check: ACCEPTED consensus on an outcome that was itself an error.
    const outcome = describeTransactionOutcome(
      tx({ statusName: TransactionStatus.ACCEPTED, txExecutionResultName: ExecutionResult.FINISHED_WITH_ERROR })
    );
    expect(outcome.succeeded).toBe(false);
    expect(outcome.reason).toMatch(/reverted/i);
  });

  it("does NOT report success when txExecutionResultName is missing entirely", () => {
    const outcome = describeTransactionOutcome(
      tx({ statusName: TransactionStatus.ACCEPTED, txExecutionResultName: undefined })
    );
    expect(outcome.succeeded).toBe(false);
  });

  it("does NOT report success for a NOT_VOTED execution result", () => {
    const outcome = describeTransactionOutcome(
      tx({ statusName: TransactionStatus.ACCEPTED, txExecutionResultName: ExecutionResult.NOT_VOTED })
    );
    expect(outcome.succeeded).toBe(false);
  });

  it("does NOT report success for a non-terminal-success status regardless of execution result", () => {
    const outcome = describeTransactionOutcome(
      tx({ statusName: TransactionStatus.UNDETERMINED, txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN })
    );
    expect(outcome.succeeded).toBe(false);
  });

  it("does NOT report success when statusName itself is missing", () => {
    const outcome = describeTransactionOutcome(
      tx({ statusName: undefined, txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN })
    );
    expect(outcome.succeeded).toBe(false);
  });
});
