import { describe, expect, it } from "vitest";
import { describeError, isUserRejection, shortAddress } from "../errors";

describe("shortAddress", () => {
  it("formats long addresses correctly", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });

  it("handles short addresses", () => {
    expect(shortAddress("0x123")).toBe("0x123");
  });
});

describe("isUserRejection", () => {
  it("detects wallet rejections", () => {
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
    expect(isUserRejection(new Error("user rejected transaction"))).toBe(true);
    expect(isUserRejection({ code: 4001, message: "User denied" })).toBe(true);
    expect(isUserRejection(new Error("Gas limit exceeded"))).toBe(false);
  });
});

describe("describeError", () => {
  it("translates user rejection", () => {
    expect(describeError(new Error("User rejected the request."))).toBe(
      "Transaction cancelled in wallet."
    );
  });

  it("translates BadParty", () => {
    const err = { data: { errorName: "BadParty", args: [] } };
    expect(describeError(err)).toBe("Cannot create a tab entry with yourself or the zero address.");
  });

  it("translates ZeroAmount", () => {
    const err = { data: { errorName: "ZeroAmount", args: [] } };
    expect(describeError(err)).toBe("Amount must be greater than zero.");
  });

  it("translates NoteTooLong", () => {
    const err = { data: { errorName: "NoteTooLong", args: [145n, 140n] } };
    expect(describeError(err)).toBe("Note is 145 bytes; limit is 140 bytes.");
  });

  it("translates NoSuchProposal", () => {
    const err = { data: { errorName: "NoSuchProposal", args: [99n] } };
    expect(describeError(err)).toBe("Entry proposal not found.");
  });

  it("translates NotCounterparty", () => {
    const err = { data: { errorName: "NotCounterparty", args: [1n, "0x123"] } };
    expect(describeError(err)).toBe("Only the counterparty can confirm or reject this entry.");
  });

  it("translates NotProposer", () => {
    const err = { data: { errorName: "NotProposer", args: [1n, "0x123"] } };
    expect(describeError(err)).toBe("Only the proposer can withdraw this entry.");
  });

  it("translates NotPending", () => {
    const err = { data: { errorName: "NotPending", args: [1n, 1] } };
    expect(describeError(err)).toBe("This entry proposal has already been decided.");
  });

  it("translates NothingOwed", () => {
    const err = { data: { errorName: "NothingOwed", args: ["0xAlice", "0xBob"] } };
    expect(describeError(err)).toBe("No balance is owed to this counterparty.");
  });

  it("translates BadPayment overpayment", () => {
    const err = {
      data: {
        errorName: "BadPayment",
        args: [1000000000000000000n, 2000000000000000000n],
      },
    };
    expect(describeError(err)).toBe(
      "Payment of 2 BOT exceeds the balance owed (1 BOT)."
    );
  });

  it("translates ForgiveTooMuch", () => {
    const err = {
      data: {
        errorName: "ForgiveTooMuch",
        args: [1000000000000000000n, 3000000000000000000n],
      },
    };
    expect(describeError(err)).toBe(
      "Cannot forgive 3 BOT; only 1 BOT is owed."
    );
  });

  it("translates NothingToWithdraw", () => {
    const err = { data: { errorName: "NothingToWithdraw", args: [] } };
    expect(describeError(err)).toBe("No settled funds waiting to be collected.");
  });

  it("translates TransferFailed", () => {
    const err = { data: { errorName: "TransferFailed", args: [] } };
    expect(describeError(err)).toBe("BOT transfer failed.");
  });
});
