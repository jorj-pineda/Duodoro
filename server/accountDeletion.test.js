import { describe, expect, it, vi } from "vitest";
import { deleteAccountData } from "./accountDeletion.js";

function fakeSupabase({ waitlistError = null, authError = null } = {}) {
  const eq = vi.fn().mockResolvedValue({ error: waitlistError });
  const remove = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: remove }));
  const deleteUser = vi.fn().mockResolvedValue({ error: authError });
  return {
    client: { from, auth: { admin: { deleteUser } } },
    deleteUser,
    eq,
    from,
    remove,
  };
}

describe("deleteAccountData", () => {
  it("removes a legacy waitlist address before hard-deleting auth", async () => {
    const fake = fakeSupabase();

    await deleteAccountData(fake.client, {
      userId: "user-1",
      email: "Owner@Example.com",
    });

    expect(fake.from).toHaveBeenCalledWith("waitlist");
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.eq).toHaveBeenCalledWith("email", "owner@example.com");
    expect(fake.deleteUser).toHaveBeenCalledWith("user-1", false);
    expect(fake.eq.mock.invocationCallOrder[0]).toBeLessThan(
      fake.deleteUser.mock.invocationCallOrder[0],
    );
  });

  it("does not leave a known waitlist address behind when cleanup fails", async () => {
    const fake = fakeSupabase({
      waitlistError: { message: "database unavailable" },
    });

    await expect(
      deleteAccountData(fake.client, {
        userId: "user-1",
        email: "owner@example.com",
      }),
    ).rejects.toThrow("Could not remove waitlist data");
    expect(fake.deleteUser).not.toHaveBeenCalled();
  });

  it("surfaces an Auth deletion failure", async () => {
    const fake = fakeSupabase({ authError: { message: "user owns an object" } });

    await expect(
      deleteAccountData(fake.client, { userId: "user-1", email: null }),
    ).rejects.toThrow("Could not delete auth account");
  });

  it("refuses to run without a verified user and service client", async () => {
    await expect(
      deleteAccountData(null, { userId: "user-1", email: null }),
    ).rejects.toThrow("unavailable");
    await expect(
      deleteAccountData({}, { userId: null, email: null }),
    ).rejects.toThrow("unavailable");
  });
});
