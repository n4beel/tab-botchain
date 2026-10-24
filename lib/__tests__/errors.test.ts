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
    expect(describeError(err)).toBe("Choose someone other than yourself.");
  });

  it("translates ZeroAmount", () => {
    const err = { data: { errorName: "ZeroAmount", args: [] } };
    expect(describeError(err)).toBe("An entry needs an amount.");
  });

  it("translates NoteTooLong", () => {
    const err = { data: { errorName: "NoteTooLong", args: [145n, 140n] } };
    expect(describeError(err)).toBe("Notes run to 140 bytes; yours is 145.");
  });

  it("translates NoSuchProposal", () => {
    const err = { data: { errorName: "NoSuchProposal", args: [99n] } };
    expect(describeError(err)).toBe("Entry proposal not found.");
  });

  it("translates NotCounterparty", () => {
    const err = { data: { errorName: "NotCounterparty", args: [1n, "0x1234567890abcdef1234567890abcdef12345678"] } };
    expect(describeError(err)).toBe("Only 0x1234…5678 can answer this entry.");
  });

  it("translates NotProposer", () => {
    const err = { data: { errorName: "NotProposer", args: [1n, "0x123"] } };
    expect(describeError(err)).toBe("Only the proposer can withdraw this entry.");
  });

  it("translates NotPending", () => {
    const err = { data: { errorName: "NotPending", args: [1n, 1] } };
    expect(describeError(err)).toBe("This entry has already been confirmed.");
  });

  it("translates NothingOwed", () => {
    const err = { data: { errorName: "NothingOwed", args: ["0xAlice", "0xBob"] } };
    expect(describeError(err)).toBe("There's nothing owed in that direction.");
  });

  it("translates BadPayment overpayment", () => {
    const err = {
      data: {
        errorName: "BadPayment",
        args: [1000000000000000000n, 2000000000000000000n],
      },
    };
    expect(describeError(err)).toBe(
      "You owe 1 BOT; you tried to pay 2 BOT."
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
      "They only owe 1 BOT. You can forgive up to that."
    );
  });

  it("translates NothingToWithdraw", () => {
    const err = { data: { errorName: "NothingToWithdraw", args: [] } };
    expect(describeError(err)).toBe("Nothing to collect.");
  });

  it("translates TransferFailed", () => {
    const err = { data: { errorName: "TransferFailed", args: [] } };
    expect(describeError(err)).toBe("BOT transfer failed.");
  });
});
